import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql, type SiteAccessClient } from "./siteAccess.js";

export type CauseRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  problemIds: string[];
  remedyIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type CauseBody = {
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  problemIds: string[];
  remedyIds: string[];
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

function parseBody(body: unknown): CauseBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  const problemIds = normalizeIds(o.problemIds);
  const remedyIds = normalizeIds(o.remedyIds);
  if (!key || !name || !isUuid(siteId) || !problemIds || !remedyIds || key.length > 100) return null;
  return { key, name, siteId, isActive, problemIds, remedyIds };
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

async function assertProblemsSameSite(
  client: SiteAccessClient,
  problemIds: string[],
  siteId: string,
): Promise<void> {
  if (problemIds.length === 0) return;
  const { rows } = await client.query<{ id: string }>(
    `
    SELECT p."id"
    FROM "problem" p
    WHERE p."id" = ANY($1::uuid[])
      AND p."siteId" = $2::uuid
    `,
    [problemIds, siteId],
  );
  if (rows.length !== problemIds.length) {
    throw new Error("problem_site_mismatch");
  }
}

async function assertRemediesSameSite(
  client: SiteAccessClient,
  remedyIds: string[],
  siteId: string,
): Promise<void> {
  if (remedyIds.length === 0) return;
  const { rows } = await client.query<{ id: string }>(
    `
    SELECT r."id"
    FROM "remedy" r
    WHERE r."id" = ANY($1::uuid[])
      AND r."siteId" = $2::uuid
    `,
    [remedyIds, siteId],
  );
  if (rows.length !== remedyIds.length) {
    throw new Error("remedy_site_mismatch");
  }
}

async function setCauseProblems(
  client: SiteAccessClient,
  causeId: string,
  problemIds: string[],
): Promise<void> {
  await client.query(`DELETE FROM "problemCause" WHERE "causeId" = $1::uuid`, [causeId]);
  if (problemIds.length === 0) return;
  const placeholders = problemIds.map((_, idx) => `($${idx + 2}::uuid, $1::uuid)`).join(", ");
  await client.query(
    `
    INSERT INTO "problemCause" ("problemId", "causeId")
    VALUES ${placeholders}
    ON CONFLICT ("problemId", "causeId") DO NOTHING
    `,
    [causeId, ...problemIds],
  );
}

async function setCauseRemedies(
  client: SiteAccessClient,
  causeId: string,
  remedyIds: string[],
): Promise<void> {
  await client.query(`DELETE FROM "causeRemedy" WHERE "causeId" = $1::uuid`, [causeId]);
  if (remedyIds.length === 0) return;
  const placeholders = remedyIds.map((_, idx) => `($1::uuid, $${idx + 2}::uuid)`).join(", ");
  await client.query(
    `
    INSERT INTO "causeRemedy" ("causeId", "remedyId")
    VALUES ${placeholders}
    ON CONFLICT ("causeId", "remedyId") DO NOTHING
    `,
    [causeId, ...remedyIds],
  );
}

const selectCausesSql = `
  SELECT
    c."id",
    c."key",
    c."name",
    c."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    c."isActive",
    COALESCE(
      array_agg(DISTINCT pc."problemId"::text) FILTER (WHERE pc."problemId" IS NOT NULL),
      ARRAY[]::text[]
    ) AS "problemIds",
    COALESCE(
      array_agg(DISTINCT cr."remedyId"::text) FILTER (WHERE cr."remedyId" IS NOT NULL),
      ARRAY[]::text[]
    ) AS "remedyIds",
    c."createdAt",
    c."updatedAt",
    COALESCE(created_by."loginName", c."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", c."updatedBy"::text) AS "updatedBy"
  FROM "cause" c
  JOIN "site" s ON s."id" = c."siteId"
  LEFT JOIN "problemCause" pc ON pc."causeId" = c."id"
  LEFT JOIN "causeRemedy" cr ON cr."causeId" = c."id"
  LEFT JOIN "users" created_by ON created_by."id" = c."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = c."updatedBy"
`;

async function fetchCauseById(client: SiteAccessClient, id: string): Promise<CauseRow | null> {
  const { rows } = await client.query<CauseRow>(
    `
    ${selectCausesSql}
    WHERE c."id" = $1::uuid
    GROUP BY c."id", s."id", created_by."id", updated_by."id"
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
  const problemIdRaw = typeof req.query.problemId === "string" ? req.query.problemId.trim() : "";
  const activeOnly = req.query.activeOnly === "1" || req.query.activeOnly === "true";
  const filters: string[] = [siteAccessSql('c."siteId"', "$1")];
  const params: unknown[] = [userId];
  if (isUuid(siteIdRaw)) {
    params.push(siteIdRaw);
    filters.push(`c."siteId" = $${params.length}::uuid`);
  }
  if (isUuid(problemIdRaw)) {
    params.push(problemIdRaw);
    filters.push(
      `EXISTS (SELECT 1 FROM "problemCause" pcx WHERE pcx."causeId" = c."id" AND pcx."problemId" = $${params.length}::uuid)`,
    );
  }
  if (activeOnly) {
    filters.push(`c."isActive" = true`);
  }
  try {
    const { rows } = await pool.query<CauseRow>(
      `
      ${selectCausesSql}
      WHERE ${filters.join(" AND ")}
      GROUP BY c."id", s."id", created_by."id", updated_by."id"
      ORDER BY c."key" ASC
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
  const { key, name, siteId, isActive, problemIds, remedyIds } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertProblemsSameSite(client, problemIds, effectiveSiteId);
      await assertRemediesSameSite(client, remedyIds, effectiveSiteId);
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "cause" ("key", "name", "siteId", "isActive")
        VALUES ($1, $2, $3::uuid, $4)
        RETURNING "id"
        `,
        [key, name, effectiveSiteId, isActive],
      );
      const causeId = inserted.rows[0]?.id;
      if (!causeId) return null;
      await setCauseProblems(client, causeId, problemIds);
      await setCauseRemedies(client, causeId, remedyIds);
      return await fetchCauseById(client, causeId);
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
    if (message === "problem_site_mismatch" || message === "remedy_site_mismatch") {
      res.status(400).json({ error: message });
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
  const { key, name, siteId, isActive, problemIds, remedyIds } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "cause"
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
      await assertProblemsSameSite(client, problemIds, effectiveSiteId);
      await assertRemediesSameSite(client, remedyIds, effectiveSiteId);
      await client.query(
        `
        UPDATE "cause"
        SET "key" = $1, "name" = $2, "siteId" = $3::uuid, "isActive" = $4
        WHERE "id" = $5::uuid
        `,
        [key, name, effectiveSiteId, isActive, id],
      );
      await setCauseProblems(client, id, problemIds);
      await setCauseRemedies(client, id, remedyIds);
      return await fetchCauseById(client, id);
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
    if (message === "problem_site_mismatch" || message === "remedy_site_mismatch") {
      res.status(400).json({ error: message });
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
        DELETE FROM "cause"
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

export const causesRouter = router;
