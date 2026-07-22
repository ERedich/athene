import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult, QueryResultRow } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { assertClassificationForSiteAndScope } from "./classificationAssert.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql, type SiteAccessClient } from "./siteAccess.js";

export type ProblemRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  isActive: boolean;
  causeIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type ProblemBody = {
  key: string;
  name: string;
  siteId: string;
  classificationId: string | null;
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

function parseBody(body: unknown): ProblemBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  const causeIds = normalizeIds(o.causeIds);
  let classificationId: string | null = null;
  if (o.classificationId !== undefined && o.classificationId !== null && o.classificationId !== "") {
    if (typeof o.classificationId !== "string" || !isUuid(o.classificationId.trim())) return null;
    classificationId = o.classificationId.trim();
  }
  if (!key || !name || !isUuid(siteId) || !causeIds || key.length > 100) return null;
  return { key, name, siteId, classificationId, isActive, causeIds };
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

async function setProblemCauses(
  client: SiteAccessClient,
  problemId: string,
  causeIds: string[],
): Promise<void> {
  await client.query(`DELETE FROM "problemCause" WHERE "problemId" = $1::uuid`, [problemId]);
  if (causeIds.length === 0) return;
  const placeholders = causeIds.map((_, idx) => `($1::uuid, $${idx + 2}::uuid)`).join(", ");
  await client.query(
    `
    INSERT INTO "problemCause" ("problemId", "causeId")
    VALUES ${placeholders}
    ON CONFLICT ("problemId", "causeId") DO NOTHING
    `,
    [problemId, ...causeIds],
  );
}

const selectProblemsSql = `
  SELECT
    p."id",
    p."key",
    p."name",
    p."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    p."classificationId"::text AS "classificationId",
    cl."key" AS "classificationKey",
    cl."name" AS "classificationName",
    p."isActive",
    COALESCE(
      array_agg(DISTINCT pc."causeId"::text) FILTER (WHERE pc."causeId" IS NOT NULL),
      ARRAY[]::text[]
    ) AS "causeIds",
    p."createdAt",
    p."updatedAt",
    COALESCE(created_by."loginName", p."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", p."updatedBy"::text) AS "updatedBy"
  FROM "problem" p
  JOIN "site" s ON s."id" = p."siteId"
  LEFT JOIN "classification" cl ON cl."id" = p."classificationId"
  LEFT JOIN "problemCause" pc ON pc."problemId" = p."id"
  LEFT JOIN "users" created_by ON created_by."id" = p."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = p."updatedBy"
`;

async function fetchProblemById(client: SiteAccessClient, id: string): Promise<ProblemRow | null> {
  const { rows } = await client.query<ProblemRow>(
    `
    ${selectProblemsSql}
    WHERE p."id" = $1::uuid
    GROUP BY p."id", s."id", cl."id", created_by."id", updated_by."id"
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
  const classificationIdRaw =
    typeof req.query.classificationId === "string" ? req.query.classificationId.trim() : "";
  const activeOnly = req.query.activeOnly === "1" || req.query.activeOnly === "true";
  const filters: string[] = [siteAccessSql('p."siteId"', "$1")];
  const params: unknown[] = [userId];
  if (isUuid(siteIdRaw)) {
    params.push(siteIdRaw);
    filters.push(`p."siteId" = $${params.length}::uuid`);
  }
  if (isUuid(classificationIdRaw)) {
    params.push(classificationIdRaw);
    filters.push(`p."classificationId" = $${params.length}::uuid`);
  }
  if (activeOnly) {
    filters.push(`p."isActive" = true`);
  }
  try {
    const { rows } = await pool.query<ProblemRow>(
      `
      ${selectProblemsSql}
      WHERE ${filters.join(" AND ")}
      GROUP BY p."id", s."id", cl."id", created_by."id", updated_by."id"
      ORDER BY p."key" ASC
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
  const { key, name, siteId, classificationId, isActive, causeIds } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertClassificationForSiteAndScope(
        client,
        meta.userId,
        effectiveSiteId,
        classificationId,
        "asset",
      );
      await assertCausesSameSite(client, causeIds, effectiveSiteId);
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "problem" ("key", "name", "siteId", "classificationId", "isActive")
        VALUES ($1, $2, $3::uuid, $4::uuid, $5)
        RETURNING "id"
        `,
        [key, name, effectiveSiteId, classificationId, isActive],
      );
      const problemId = inserted.rows[0]?.id;
      if (!problemId) return null;
      await setProblemCauses(client, problemId, causeIds);
      return await fetchProblemById(client, problemId);
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
    if (message === "invalid_classification") {
      res.status(400).json({ error: "invalid_classification" });
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
  const { key, name, siteId, classificationId, isActive, causeIds } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "problem"
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
      await assertClassificationForSiteAndScope(
        client,
        meta.userId,
        effectiveSiteId,
        classificationId,
        "asset",
      );
      await assertCausesSameSite(client, causeIds, effectiveSiteId);
      await client.query(
        `
        UPDATE "problem"
        SET "key" = $1, "name" = $2, "siteId" = $3::uuid, "classificationId" = $4::uuid, "isActive" = $5
        WHERE "id" = $6::uuid
        `,
        [key, name, effectiveSiteId, classificationId, isActive, id],
      );
      await setProblemCauses(client, id, causeIds);
      return await fetchProblemById(client, id);
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
    if (message === "invalid_classification") {
      res.status(400).json({ error: "invalid_classification" });
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
        DELETE FROM "problem"
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

export const problemsRouter = router;
