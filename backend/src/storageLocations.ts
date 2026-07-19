import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult } from "pg";

import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql, type SiteAccessClient } from "./siteAccess.js";

export type StorageLocationRow = {
  id: string;
  key: string;
  warehouseId: string;
  warehouseKey: string;
  warehouseName: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  maxLoadKg: string;
  heightMm: number;
  widthMm: number;
  depthMm: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type StorageLocationBody = {
  key: string;
  warehouseId: string;
  maxLoadKg: number;
  heightMm: number;
  widthMm: number;
  depthMm: number;
  isActive: boolean;
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function parseNonNegativeNumber(value: unknown, defaultWhenMissing = 0): number | null {
  if (value === undefined || value === null || value === "") return defaultWhenMissing;
  const n =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseNonNegativeInt(value: unknown, defaultWhenMissing = 0): number | null {
  const n = parseNonNegativeNumber(value, defaultWhenMissing);
  if (n === null) return null;
  if (!Number.isInteger(n)) return null;
  return n;
}

function parseBody(body: unknown): StorageLocationBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const warehouseId = typeof o.warehouseId === "string" ? o.warehouseId.trim() : "";
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  const maxLoadKg = parseNonNegativeNumber(o.maxLoadKg);
  const heightMm = parseNonNegativeInt(o.heightMm);
  const widthMm = parseNonNegativeInt(o.widthMm);
  const depthMm = parseNonNegativeInt(o.depthMm);
  if (
    !key ||
    !isUuid(warehouseId) ||
    maxLoadKg === null ||
    heightMm === null ||
    widthMm === null ||
    depthMm === null
  ) {
    return null;
  }
  return { key, warehouseId, maxLoadKg, heightMm, widthMm, depthMm, isActive };
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

async function assertWarehouseAccess(
  client: SiteAccessClient,
  userId: string,
  warehouseId: string,
): Promise<string> {
  const { rows } = await client.query<{ siteId: string }>(
    `
    SELECT wh."siteId"::text AS "siteId"
    FROM "warehouse" wh
    WHERE wh."id" = $1::uuid
      AND ${siteAccessSql('wh."siteId"', "$2")}
    `,
    [warehouseId, userId],
  );
  const siteId = rows[0]?.siteId;
  if (!siteId) throw new Error("warehouse_not_found");
  await assertSiteAccess(client, userId, siteId);
  return siteId;
}

const selectStorageLocationsSql = `
  SELECT
    sl."id",
    sl."key",
    sl."warehouseId",
    wh."key" AS "warehouseKey",
    wh."name" AS "warehouseName",
    wh."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    sl."maxLoadKg"::text AS "maxLoadKg",
    sl."heightMm",
    sl."widthMm",
    sl."depthMm",
    sl."isActive",
    sl."createdAt",
    sl."updatedAt",
    COALESCE(created_by."loginName", sl."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", sl."updatedBy"::text) AS "updatedBy"
  FROM "storageLocation" sl
  JOIN "warehouse" wh ON wh."id" = sl."warehouseId"
  JOIN "site" s ON s."id" = wh."siteId"
  LEFT JOIN "users" created_by ON created_by."id" = sl."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = sl."updatedBy"
`;

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const warehouseIdRaw =
    typeof req.query.warehouseId === "string" ? req.query.warehouseId.trim() : "";
  if (warehouseIdRaw && !isUuid(warehouseIdRaw)) {
    res.status(400).json({ error: "invalid_warehouse_id" });
    return;
  }
  try {
    const params: unknown[] = [userId];
    let filterSql = `WHERE ${siteAccessSql('wh."siteId"', "$1")}`;
    if (warehouseIdRaw) {
      params.push(warehouseIdRaw);
      filterSql += ` AND sl."warehouseId" = $2::uuid`;
    }
    const { rows } = await pool.query<StorageLocationRow>(
      `
      ${selectStorageLocationsSql}
      ${filterSql}
      ORDER BY wh."key" ASC, sl."key" ASC
      `,
      params,
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<StorageLocationRow>(
      `
      ${selectStorageLocationsSql}
      WHERE sl."id" = $1::uuid
        AND ${siteAccessSql('wh."siteId"', "$2")}
      `,
      [id, userId],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
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
  const { key, warehouseId, maxLoadKg, heightMm, widthMm, depthMm, isActive } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      await assertWarehouseAccess(client, meta.userId, warehouseId);
      const { rows } = await client.query<StorageLocationRow>(
        `
        WITH inserted AS (
          INSERT INTO "storageLocation" (
            "key", "warehouseId", "maxLoadKg", "heightMm", "widthMm", "depthMm", "isActive"
          )
          VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)
          RETURNING *
        )
        SELECT
          i."id",
          i."key",
          i."warehouseId",
          wh."key" AS "warehouseKey",
          wh."name" AS "warehouseName",
          wh."siteId",
          s."key" AS "siteKey",
          s."name" AS "siteName",
          s."colorHex" AS "siteColorHex",
          i."maxLoadKg"::text AS "maxLoadKg",
          i."heightMm",
          i."widthMm",
          i."depthMm",
          i."isActive",
          i."createdAt",
          i."updatedAt",
          COALESCE(created_by."loginName", i."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", i."updatedBy"::text) AS "updatedBy"
        FROM inserted i
        JOIN "warehouse" wh ON wh."id" = i."warehouseId"
        JOIN "site" s ON s."id" = wh."siteId"
        LEFT JOIN "users" created_by ON created_by."id" = i."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = i."updatedBy"
        `,
        [key, warehouseId, maxLoadKg, heightMm, widthMm, depthMm, isActive],
      );
      return rows[0];
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user" || message === "user_not_found") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (message === "warehouse_not_found") {
      res.status(409).json({ error: "warehouse_not_found" });
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
  const { key, warehouseId, maxLoadKg, heightMm, widthMm, depthMm, isActive } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string; warehouseId: string }>(
        `
        SELECT sl."id", sl."warehouseId"::text AS "warehouseId"
        FROM "storageLocation" sl
        JOIN "warehouse" wh ON wh."id" = sl."warehouseId"
        WHERE sl."id" = $1::uuid
          AND ${siteAccessSql('wh."siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (existing.rowCount === 0) return null;
      await assertWarehouseAccess(client, meta.userId, warehouseId);
      const { rows } = await client.query<StorageLocationRow>(
        `
        WITH updated AS (
          UPDATE "storageLocation"
          SET
            "key" = $1,
            "warehouseId" = $2::uuid,
            "maxLoadKg" = $3,
            "heightMm" = $4,
            "widthMm" = $5,
            "depthMm" = $6,
            "isActive" = $7
          WHERE "id" = $8::uuid
          RETURNING *
        )
        SELECT
          u."id",
          u."key",
          u."warehouseId",
          wh."key" AS "warehouseKey",
          wh."name" AS "warehouseName",
          wh."siteId",
          s."key" AS "siteKey",
          s."name" AS "siteName",
          s."colorHex" AS "siteColorHex",
          u."maxLoadKg"::text AS "maxLoadKg",
          u."heightMm",
          u."widthMm",
          u."depthMm",
          u."isActive",
          u."createdAt",
          u."updatedAt",
          COALESCE(created_by."loginName", u."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", u."updatedBy"::text) AS "updatedBy"
        FROM updated u
        JOIN "warehouse" wh ON wh."id" = u."warehouseId"
        JOIN "site" s ON s."id" = wh."siteId"
        LEFT JOIN "users" created_by ON created_by."id" = u."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = u."updatedBy"
        `,
        [key, warehouseId, maxLoadKg, heightMm, widthMm, depthMm, isActive, id],
      );
      return rows[0];
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user" || message === "user_not_found") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (message === "warehouse_not_found") {
      res.status(409).json({ error: "warehouse_not_found" });
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
        DELETE FROM "storageLocation" sl
        USING "warehouse" wh
        WHERE sl."id" = $1::uuid
          AND wh."id" = sl."warehouseId"
          AND ${siteAccessSql('wh."siteId"', "$2")}
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

export const storageLocationsRouter = router;
