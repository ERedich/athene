import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult, QueryResultRow } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql, type SiteAccessClient } from "./siteAccess.js";

export type WorkgroupRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  employeeIds: string[];
  leaderEmployeeIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type WorkgroupBody = {
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  employeeIds: string[];
  leaderEmployeeIds: string[];
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function normalizeEmployeeIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const normalized = value.map((entry) => (typeof entry === "string" ? entry.trim() : ""));
  if (normalized.some((id) => !isUuid(id))) return null;
  return [...new Set(normalized)];
}

function assertLeadersAreMembers(leaderEmployeeIds: string[], employeeIds: string[]): void {
  const memberSet = new Set(employeeIds);
  for (const leaderId of leaderEmployeeIds) {
    if (!memberSet.has(leaderId)) {
      throw new Error("leader_not_member");
    }
  }
}

function parseBody(body: unknown): WorkgroupBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const employeeIds = normalizeEmployeeIds(o.employeeIds);
  const leaderEmployeeIds = normalizeEmployeeIds(o.leaderEmployeeIds);
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  if (!key || !name || !isUuid(siteId) || !employeeIds || !leaderEmployeeIds) return null;
  return { key, name, siteId, isActive, employeeIds, leaderEmployeeIds };
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

async function assertMembersAccessSite(
  client: SiteAccessClient,
  employeeIds: string[],
  siteId: string,
): Promise<void> {
  for (const employeeId of employeeIds) {
    const { rowCount } = await client.query(
      `
      SELECT 1
      FROM "employee" e
      WHERE e."id" = $1::uuid
        AND e."siteId" = $2::uuid
      `,
      [employeeId, siteId],
    );
    if ((rowCount ?? 0) === 0) {
      throw new Error("member_site_mismatch");
    }
  }
}

async function setWorkgroupMembers(
  client: SiteAccessClient,
  workgroupId: string,
  employeeIds: string[],
  leaderEmployeeIds: string[],
): Promise<void> {
  const leaderSet = new Set(leaderEmployeeIds);
  await client.query(`DELETE FROM "workgroupUser" WHERE "workgroupId" = $1::uuid`, [workgroupId]);
  if (employeeIds.length === 0) return;
  const placeholders = employeeIds
    .map((_, idx) => `($1::uuid, $${idx + 2}::uuid, $${employeeIds.length + 2 + idx}::boolean)`)
    .join(", ");
  await client.query(
    `
    INSERT INTO "workgroupUser" ("workgroupId", "employeeId", "isLeader")
    VALUES ${placeholders}
    ON CONFLICT ("workgroupId", "employeeId") DO NOTHING
    `,
    [workgroupId, ...employeeIds, ...employeeIds.map((id) => leaderSet.has(id))],
  );
}

const selectWorkgroupsSql = `
  SELECT
    w."id",
    w."key",
    w."name",
    w."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    w."isActive",
    COALESCE(
      array_agg(DISTINCT wu."employeeId"::text) FILTER (WHERE wu."employeeId" IS NOT NULL),
      ARRAY[]::text[]
    ) AS "employeeIds",
    COALESCE(
      array_agg(DISTINCT wu."employeeId"::text) FILTER (WHERE wu."isLeader" = true),
      ARRAY[]::text[]
    ) AS "leaderEmployeeIds",
    w."createdAt",
    w."updatedAt",
    COALESCE(created_by."loginName", w."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", w."updatedBy"::text) AS "updatedBy"
  FROM "workgroup" w
  JOIN "site" s ON s."id" = w."siteId"
  LEFT JOIN "workgroupUser" wu ON wu."workgroupId" = w."id"
  LEFT JOIN "users" created_by ON created_by."id" = w."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = w."updatedBy"
`;

async function fetchWorkgroupById(
  client: SiteAccessClient,
  id: string,
): Promise<WorkgroupRow | null> {
  const { rows } = await client.query<WorkgroupRow>(
    `
    ${selectWorkgroupsSql}
    WHERE w."id" = $1::uuid
    GROUP BY w."id", s."id", created_by."id", updated_by."id"
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
  try {
    const { rows } = await pool.query<WorkgroupRow>(
      `
      ${selectWorkgroupsSql}
      WHERE ${siteAccessSql('w."siteId"', "$1")}
      GROUP BY w."id", s."id", created_by."id", updated_by."id"
      ORDER BY w."key" ASC
      `,
      [userId],
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
  const { key, name, siteId, isActive, employeeIds, leaderEmployeeIds } = parsed;
  try {
    assertLeadersAreMembers(leaderEmployeeIds, employeeIds);
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertMembersAccessSite(client, employeeIds, effectiveSiteId);
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "workgroup" ("key", "name", "siteId", "isActive")
        VALUES ($1, $2, $3::uuid, $4)
        RETURNING "id"
        `,
        [key, name, effectiveSiteId, isActive],
      );
      const workgroupId = inserted.rows[0]?.id;
      if (!workgroupId) return null;
      await setWorkgroupMembers(client, workgroupId, employeeIds, leaderEmployeeIds);
      return await fetchWorkgroupById(client, workgroupId);
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
    if (message === "member_site_mismatch") {
      res.status(409).json({ error: "member_site_mismatch" });
      return;
    }
    if (message === "leader_not_member") {
      res.status(409).json({ error: "leader_not_member" });
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
  const { key, name, siteId, isActive, employeeIds, leaderEmployeeIds } = parsed;
  try {
    assertLeadersAreMembers(leaderEmployeeIds, employeeIds);
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string; siteId: string }>(
        `
        SELECT w."id", w."siteId"::text AS "siteId"
        FROM "workgroup" w
        WHERE w."id" = $1::uuid
          AND ${siteAccessSql('w."siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (existing.rowCount === 0) {
        return null;
      }
      const storedSiteId = existing.rows[0]!.siteId;
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : storedSiteId;
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertMembersAccessSite(client, employeeIds, effectiveSiteId);
      await client.query(
        `
        UPDATE "workgroup"
        SET "key" = $1, "name" = $2, "siteId" = $3::uuid, "isActive" = $4
        WHERE "id" = $5::uuid
        `,
        [key, name, effectiveSiteId, isActive, id],
      );
      await setWorkgroupMembers(client, id, employeeIds, leaderEmployeeIds);
      return await fetchWorkgroupById(client, id);
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
    if (message === "member_site_mismatch") {
      res.status(409).json({ error: "member_site_mismatch" });
      return;
    }
    if (message === "leader_not_member") {
      res.status(409).json({ error: "leader_not_member" });
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
      const result: QueryResult<QueryResultRow> = await client.query(
        `
        DELETE FROM "workgroup"
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

export const workgroupsRouter = router;
