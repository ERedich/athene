import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult, QueryResultRow } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

export type WorkOrderTypeRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type PgClient = {
  query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>>;
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_WORK_ORDER_TYPES: ReadonlyArray<{ key: string; name: string; sortOrder: number }> = [
  { key: "plannedRepair", name: "Geplante Instandsetzung", sortOrder: 10 },
  { key: "breakdown", name: "Störung", sortOrder: 20 },
  { key: "maintenance", name: "Wartung", sortOrder: 30 },
  { key: "inspection", name: "Inspektion", sortOrder: 40 },
];

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function parseBody(
  body: unknown,
): { key: string; name: string; siteId: string; isActive: boolean; sortOrder: number } | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  const sortOrderRaw = o.sortOrder;
  const sortOrder =
    typeof sortOrderRaw === "number" && Number.isFinite(sortOrderRaw)
      ? Math.trunc(sortOrderRaw)
      : typeof sortOrderRaw === "string" &&
          sortOrderRaw.trim() !== "" &&
          Number.isFinite(Number(sortOrderRaw))
        ? Math.trunc(Number(sortOrderRaw))
        : 0;
  if (!key || !name || !isUuid(siteId) || key.length > 100) return null;
  return { key, name, siteId, isActive, sortOrder };
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

/** Seed default order types for a site (idempotent). */
export async function ensureDefaultWorkOrderTypes(
  client: PgClient,
  siteId: string,
  actorUserId: string,
): Promise<void> {
  for (const item of DEFAULT_WORK_ORDER_TYPES) {
    await client.query(
      `
      INSERT INTO "workOrderType" ("key", "name", "siteId", "isActive", "sortOrder", "createdBy", "updatedBy")
      VALUES ($1, $2, $3::uuid, true, $4, $5::uuid, $5::uuid)
      ON CONFLICT ("siteId", "key") DO NOTHING
      `,
      [item.key, item.name, siteId, item.sortOrder, actorUserId],
    );
  }
}

/** Ensures key exists as an active workOrderType on the site. */
export async function assertWorkOrderTypeForSite(
  client: PgClient,
  siteId: string,
  orderType: string,
): Promise<void> {
  const key = orderType.trim();
  if (!key) throw new Error("invalid_order_type");
  const { rows } = await client.query<{ id: string }>(
    `
    SELECT "id"
    FROM "workOrderType"
    WHERE "siteId" = $1::uuid
      AND "key" = $2
      AND "isActive" = true
    LIMIT 1
    `,
    [siteId, key],
  );
  if (!rows[0]) throw new Error("invalid_order_type");
}

const selectSql = `
  SELECT
    t."id",
    t."key",
    t."name",
    t."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    t."isActive",
    t."sortOrder",
    t."createdAt",
    t."updatedAt",
    COALESCE(created_by."loginName", t."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", t."updatedBy"::text) AS "updatedBy"
  FROM "workOrderType" t
  JOIN "site" s ON s."id" = t."siteId"
  LEFT JOIN "users" created_by ON created_by."id" = t."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = t."updatedBy"
`;

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<WorkOrderTypeRow>(
      `
      ${selectSql}
      WHERE ${siteAccessSql('t."siteId"', "$1")}
      ORDER BY t."sortOrder" ASC, t."key" ASC
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
  const { key, name, siteId, isActive, sortOrder } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "workOrderType" ("key", "name", "siteId", "isActive", "sortOrder")
        VALUES ($1, $2, $3::uuid, $4, $5)
        RETURNING "id"
        `,
        [key, name, effectiveSiteId, isActive, sortOrder],
      );
      const id = inserted.rows[0]?.id;
      if (!id) return null;
      const { rows } = await client.query<WorkOrderTypeRow>(
        `
        ${selectSql}
        WHERE t."id" = $1::uuid
        `,
        [id],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "user_not_found" || msg === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (msg === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
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
  const { key, name, siteId, isActive, sortOrder } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "workOrderType"
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
      await client.query(
        `
        UPDATE "workOrderType"
        SET "key" = $1, "name" = $2, "siteId" = $3::uuid, "isActive" = $4, "sortOrder" = $5
        WHERE "id" = $6::uuid
        `,
        [key, name, effectiveSiteId, isActive, sortOrder, id],
      );
      const { rows } = await client.query<WorkOrderTypeRow>(
        `
        ${selectSql}
        WHERE t."id" = $1::uuid
        `,
        [id],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "user_not_found" || msg === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (msg === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
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
        DELETE FROM "workOrderType"
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

export const workOrderTypesRouter = router;
