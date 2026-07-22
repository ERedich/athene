import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql, type SiteAccessClient } from "./siteAccess.js";

export type RemedyRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  causeIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type RemedyBody = {
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  causeIds: string[];
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function normalizeIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const normalized = value.map((entry) => (typeof entry === "string" ? entry.trim() : ""));
  if (normalized.some((id) => !isUuid(id))) return null;
  return [...new Set(normalized)];
}

function parseBody(body: unknown): RemedyBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  const causeIds = normalizeIds(o.causeIds);
  if (!key || !name || !isUuid(siteId) || !causeIds || key.length > 100) return null;
  return { key, name, siteId, isActive, causeIds };
}

function sendPgError(res: Response, err: unknown) {
  const e = err as { code?: string; detail?: string; message?: string };
  if (e.code === "23505") {
    res.status(409).json({ error: "duplicate_key", message: e.detail ?? e.message });
    return;
  }
  if (e.code === "23503") {
    res.status(409).json({ error: "foreign_key_violation", message: e.detail ?? e.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

function auditMeta(req: Request) {
  const userId = req.session.userId;
  if (!userId) {
    throw new Error("missing_session_user");
  }
  return {
    userId,
    requestId: randomUUID(),
    reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
    source: "api",
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? "",
  };
}

async function assertCausesSameSite(
  client: SiteAccessClient,
  causeIds: string[],
  siteId: string,
): Promise<void> {
  if (causeIds.length === 0) return;
  const { rows } = await client.query<{ id: string }>(
    `
    SELECT c."id"
    FROM "cause" c
    WHERE c."id" = ANY($1::uuid[])
      AND c."siteId" = $2::uuid
    `,
    [causeIds, siteId],
  );
  if (rows.length !== causeIds.length) {
    throw new Error("cause_site_mismatch");
  }
}

async function setRemedyCauses(
  client: SiteAccessClient,
  remedyId: string,
  causeIds: string[],
): Promise<void> {
  await client.query(`DELETE FROM "causeRemedy" WHERE "remedyId" = $1::uuid`, [remedyId]);
  if (causeIds.length === 0) return;
  const placeholders = causeIds.map((_, idx) => `($${idx + 2}::uuid, $1::uuid)`).join(", ");
  await client.query(
    `
    INSERT INTO "causeRemedy" ("causeId", "remedyId")
    VALUES ${placeholders}
    ON CONFLICT ("causeId", "remedyId") DO NOTHING
    `,
    [remedyId, ...causeIds],
  );
}

const selectRemediesSql = `
  SELECT
    r."id",
    r."key",
    r."name",
    r."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    r."isActive",
    COALESCE(
      array_agg(DISTINCT cr."causeId"::text) FILTER (WHERE cr."causeId" IS NOT NULL),
      ARRAY[]::text[]
    ) AS "causeIds",
    r."createdAt",
    r."updatedAt",
    COALESCE(created_by."loginName", r."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", r."updatedBy"::text) AS "updatedBy"
  FROM "remedy" r
  JOIN "site" s ON s."id" = r."siteId"
  LEFT JOIN "causeRemedy" cr ON cr."remedyId" = r."id"
  LEFT JOIN "users" created_by ON created_by."id" = r."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = r."updatedBy"
`;

async function fetchRemedyById(client: SiteAccessClient, id: string): Promise<RemedyRow | null> {
  const { rows } = await client.query<RemedyRow>(
    `
    ${selectRemediesSql}
    WHERE r."id" = $1::uuid
    GROUP BY r."id", s."id", created_by."id", updated_by."id"
    `,
    [id],
  );
  return rows[0] ?? null;
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const siteIdRaw = typeof req.query.siteId === "string" ? req.query.siteId.trim() : "";
  const causeIdRaw = typeof req.query.causeId === "string" ? req.query.causeId.trim() : "";
  const activeOnly = req.query.activeOnly === "1" || req.query.activeOnly === "true";
  const filters: string[] = [siteAccessSql('r."siteId"', "$1")];
  const params: unknown[] = [userId];
  if (isUuid(siteIdRaw)) {
    params.push(siteIdRaw);
    filters.push(`r."siteId" = $${params.length}::uuid`);
  }
  if (isUuid(causeIdRaw)) {
    params.push(causeIdRaw);
    filters.push(
      `EXISTS (SELECT 1 FROM "causeRemedy" crx WHERE crx."remedyId" = r."id" AND crx."causeId" = $${params.length}::uuid)`,
    );
  }
  if (activeOnly) {
    filters.push(`r."isActive" = true`);
  }
  try {
    const { rows } = await pool.query<RemedyRow>(
      `
      ${selectRemediesSql}
      WHERE ${filters.join(" AND ")}
      GROUP BY r."id", s."id", created_by."id", updated_by."id"
      ORDER BY r."key" ASC
      `,
      params,
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = parseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { key, name, siteId, isActive, causeIds } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertCausesSameSite(client, causeIds, effectiveSiteId);
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "remedy" ("key", "name", "siteId", "isActive")
        VALUES ($1, $2, $3::uuid, $4)
        RETURNING "id"
        `,
        [key, name, effectiveSiteId, isActive],
      );
      const remedyId = inserted.rows[0]?.id;
      if (!remedyId) return null;
      await setRemedyCauses(client, remedyId, causeIds);
      return await fetchRemedyById(client, remedyId);
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "user_not_found" || message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (message === "cause_site_mismatch") {
      res.status(400).json({ error: "cause_site_mismatch" });
      return;
    }
    sendPgError(res, err);
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = parseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { key, name, siteId, isActive, causeIds } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "remedy"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (existing.rowCount === 0) return null;
      const storedSiteId = existing.rows[0]!.siteId;
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : storedSiteId;
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertCausesSameSite(client, causeIds, effectiveSiteId);
      await client.query(
        `
        UPDATE "remedy"
        SET "key" = $1, "name" = $2, "siteId" = $3::uuid, "isActive" = $4
        WHERE "id" = $5::uuid
        `,
        [key, name, effectiveSiteId, isActive, id],
      );
      await setRemedyCauses(client, id, causeIds);
      return await fetchRemedyById(client, id);
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "user_not_found" || message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (message === "cause_site_mismatch") {
      res.status(400).json({ error: "cause_site_mismatch" });
      return;
    }
    sendPgError(res, err);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const deleted = await withAuditContext(meta, async (client) => {
      const result: QueryResult = await client.query(
        `
        DELETE FROM "remedy"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      return result.rowCount ?? 0;
    });
    if (deleted === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

export const remediesRouter = router;
