import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { PoolClient, QueryResult } from "pg";

import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";
import { buildTransactionListExtraFilters } from "./transactionListQuery.js";

export type TransactionRow = {
  id: string;
  transactionNumber: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  type: string;
  bookedAt: string;
  quantity: string;
  workOrderId: string | null;
  workOrderOrderNumber: string | null;
  remark: string | null;
  employeeId: string | null;
  employeeKey: string | null;
  employeeName: string | null;
  sparePartId: string | null;
  sparePartKey: string | null;
  sparePartName: string | null;
  warehouseId: string | null;
  warehouseKey: string | null;
  warehouseName: string | null;
  storageLocationId: string | null;
  storageLocationKey: string | null;
  assetId: string | null;
  assetKey: string | null;
  assetName: string | null;
  costCenterId: string | null;
  costCenterKey: string | null;
  costCenterName: string | null;
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const allowedTypes = new Set(["IN", "EX", "RM", "RT", "IV"]);
const creatableTypes = new Set(["RM"]);

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function parseIntParam(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function parsePositiveQuantity(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10_000) / 10_000;
}

function sendPgError(res: Response, err: unknown) {
  const e = err as { code?: string; detail?: string; message?: string };
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

const transactionSelectSql = `
  SELECT
    t."id",
    t."transactionNumber"::text AS "transactionNumber",
    t."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    t."type",
    t."bookedAt",
    t."quantity"::text AS "quantity",
    t."workOrderId",
    w."orderNumber"::text AS "workOrderOrderNumber",
    t."remark",
    t."employeeId",
    e."key" AS "employeeKey",
    e."name" AS "employeeName",
    t."sparePartId",
    sp."key" AS "sparePartKey",
    sp."name" AS "sparePartName",
    t."warehouseId",
    wh."key" AS "warehouseKey",
    wh."name" AS "warehouseName",
    t."storageLocationId",
    sl."key" AS "storageLocationKey",
    t."assetId",
    a."key" AS "assetKey",
    a."name" AS "assetName",
    t."costCenterId",
    cc."key" AS "costCenterKey",
    cc."name" AS "costCenterName"
  FROM "transaction" t
  JOIN "site" s ON s."id" = t."siteId"
  LEFT JOIN "workOrder" w ON w."id" = t."workOrderId"
  LEFT JOIN "employee" e ON e."id" = t."employeeId"
  LEFT JOIN "sparePart" sp ON sp."id" = t."sparePartId"
  LEFT JOIN "warehouse" wh ON wh."id" = t."warehouseId"
  LEFT JOIN "storageLocation" sl ON sl."id" = t."storageLocationId"
  LEFT JOIN "asset" a ON a."id" = t."assetId"
  LEFT JOIN "costCenter" cc ON cc."id" = t."costCenterId"
`;

type StockLineLock = {
  id: string;
  quantity: string;
  warehouseId: string;
  siteId: string;
};

async function lockStockLine(
  client: PoolClient,
  sparePartId: string,
  storageLocationId: string,
): Promise<StockLineLock | null> {
  const { rows } = await client.query<StockLineLock>(
    `
    SELECT
      sc."id",
      sc."quantity"::text AS "quantity",
      sc."warehouseId",
      wh."siteId"
    FROM "stockControl" sc
    JOIN "warehouse" wh ON wh."id" = sc."warehouseId"
    WHERE sc."sparePartId" = $1::uuid
      AND sc."storageLocationId" = $2::uuid
    FOR UPDATE OF sc
    `,
    [sparePartId, storageLocationId],
  );
  return rows[0] ?? null;
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const q = req.query;
  const page = parseIntParam(q.page, 1, 10_000);
  const limit = parseIntParam(q.limit, 50, 200);
  const offset = (page - 1) * limit;

  const typeRaw = typeof q.type === "string" ? q.type.trim().toUpperCase() : "";
  const type = typeRaw && allowedTypes.has(typeRaw) ? typeRaw : "";

  const siteIdRaw = typeof q.siteId === "string" ? q.siteId.trim() : "";
  if (siteIdRaw && !isUuid(siteIdRaw)) {
    res.status(400).json({ error: "invalid_site_id" });
    return;
  }
  const workOrderIdRaw = typeof q.workOrderId === "string" ? q.workOrderId.trim() : "";
  if (workOrderIdRaw && !isUuid(workOrderIdRaw)) {
    res.status(400).json({ error: "invalid_work_order_id" });
    return;
  }

  const from = typeof q.from === "string" ? q.from.trim() : "";
  const to = typeof q.to === "string" ? q.to.trim() : "";

  const conditions: string[] = [];
  const params: unknown[] = [userId];
  let i = 2;

  if (type) {
    conditions.push(`t."type" = $${i++}`);
    params.push(type);
  }
  if (siteIdRaw) {
    conditions.push(`t."siteId" = $${i++}::uuid`);
    params.push(siteIdRaw);
  }
  if (workOrderIdRaw) {
    conditions.push(`t."workOrderId" = $${i++}::uuid`);
    params.push(workOrderIdRaw);
  }
  const sparePartIdRaw = typeof q.sparePartId === "string" ? q.sparePartId.trim() : "";
  if (sparePartIdRaw) {
    if (!isUuid(sparePartIdRaw)) {
      res.status(400).json({ error: "invalid_spare_part_id" });
      return;
    }
    conditions.push(`t."sparePartId" = $${i++}::uuid`);
    params.push(sparePartIdRaw);
  }
  if (from) {
    conditions.push(`t."bookedAt" >= $${i++}::timestamptz`);
    params.push(from);
  }
  if (to) {
    conditions.push(`t."bookedAt" <= $${i++}::timestamptz`);
    params.push(to);
  }

  const extra = await buildTransactionListExtraFilters(q, userId, pool, i);
  if (!extra.ok) {
    res.status(extra.status).json({ error: extra.error });
    return;
  }
  for (const c of extra.conditions) {
    conditions.push(c);
  }
  params.push(...extra.params);
  i += extra.params.length;

  const filterSql = conditions.length ? ` AND ${conditions.join(" AND ")}` : "";

  try {
    const countSql = `
      SELECT count(*)::bigint AS c
      FROM "transaction" t
      JOIN "site" s ON s."id" = t."siteId"
      LEFT JOIN "workOrder" w ON w."id" = t."workOrderId"
      WHERE ${siteAccessSql('t."siteId"', "$1")}
      ${filterSql}
    `;
    const countRes = await pool.query<{ c: string }>(countSql, params);
    const total = Number(countRes.rows[0]?.c ?? 0);

    const listSql = `
      ${transactionSelectSql}
      WHERE ${siteAccessSql('t."siteId"', "$1")}
      ${filterSql}
      ORDER BY t."bookedAt" DESC, t."transactionNumber" DESC
      LIMIT $${i++} OFFSET $${i++}
    `;
    const listParams = [...params, limit, offset];
    const { rows } = await pool.query<TransactionRow>(listSql, listParams);

    res.json({ rows, total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const body = req.body ?? {};
  const typeRaw = typeof body.type === "string" ? body.type.trim().toUpperCase() : "";
  if (!creatableTypes.has(typeRaw)) {
    res.status(400).json({ error: "unsupported_transaction_type" });
    return;
  }

  const sparePartId = typeof body.sparePartId === "string" ? body.sparePartId.trim() : "";
  const storageLocationId =
    typeof body.storageLocationId === "string" ? body.storageLocationId.trim() : "";
  if (!isUuid(sparePartId) || !isUuid(storageLocationId)) {
    res.status(400).json({ error: "invalid_material_refs" });
    return;
  }

  const quantity = parsePositiveQuantity(body.quantity);
  if (quantity === null) {
    res.status(400).json({ error: "invalid_quantity" });
    return;
  }

  const workOrderIdRaw =
    typeof body.workOrderId === "string" && body.workOrderId.trim()
      ? body.workOrderId.trim()
      : null;
  if (workOrderIdRaw && !isUuid(workOrderIdRaw)) {
    res.status(400).json({ error: "invalid_work_order_id" });
    return;
  }

  const assetIdRaw =
    typeof body.assetId === "string" && body.assetId.trim() ? body.assetId.trim() : null;
  if (assetIdRaw && !isUuid(assetIdRaw)) {
    res.status(400).json({ error: "invalid_asset_id" });
    return;
  }

  const costCenterIdRaw =
    typeof body.costCenterId === "string" ? body.costCenterId.trim() : "";
  if (!isUuid(costCenterIdRaw)) {
    res.status(400).json({ error: "cost_center_required" });
    return;
  }

  let remark: string | null = null;
  if (typeof body.remark === "string") {
    const trimmed = body.remark.trim();
    if (trimmed.length > 2000) {
      res.status(400).json({ error: "remark_too_long" });
      return;
    }
    remark = trimmed.length ? trimmed : null;
  }

  try {
    const meta = auditMeta(req);
    const created = await withAuditContext(meta, async (client) => {
      const sparePartRes = await client.query<{ id: string; siteId: string }>(
        `
        SELECT sp."id", sp."siteId"
        FROM "sparePart" sp
        WHERE sp."id" = $1::uuid
          AND ${siteAccessSql('sp."siteId"', "$2")}
        LIMIT 1
        `,
        [sparePartId, meta.userId],
      );
      const sparePart = sparePartRes.rows[0];
      if (!sparePart) {
        return { kind: "spare_part_not_found" as const };
      }

      const stock = await lockStockLine(client, sparePartId, storageLocationId);
      if (!stock) {
        return { kind: "stock_line_not_found" as const };
      }
      if (stock.siteId !== sparePart.siteId) {
        return { kind: "site_mismatch" as const };
      }

      const available = Number(stock.quantity);
      if (!Number.isFinite(available) || available < quantity) {
        return {
          kind: "insufficient_stock" as const,
          available: Number.isFinite(available) ? available : 0,
          requested: quantity,
        };
      }

      const ccRes = await client.query<{ id: string; siteId: string }>(
        `
        SELECT c."id", c."siteId"
        FROM "costCenter" c
        WHERE c."id" = $1::uuid
          AND c."siteId" = $2::uuid
          AND ${siteAccessSql('c."siteId"', "$3")}
        LIMIT 1
        `,
        [costCenterIdRaw, sparePart.siteId, meta.userId],
      );
      if (!ccRes.rows[0]) {
        return { kind: "cost_center_not_found" as const };
      }

      if (assetIdRaw) {
        const assetRes = await client.query<{ id: string; siteId: string }>(
          `
          SELECT a."id", a."siteId"
          FROM "asset" a
          WHERE a."id" = $1::uuid
            AND a."siteId" = $2::uuid
            AND ${siteAccessSql('a."siteId"', "$3")}
          LIMIT 1
          `,
          [assetIdRaw, sparePart.siteId, meta.userId],
        );
        if (!assetRes.rows[0]) {
          return { kind: "asset_not_found" as const };
        }
      }

      if (workOrderIdRaw) {
        const woRes = await client.query<{
          id: string;
          siteId: string;
          assetId: string;
          costCenterId: string;
        }>(
          `
          SELECT w."id", w."siteId", w."assetId", w."costCenterId"
          FROM "workOrder" w
          WHERE w."id" = $1::uuid
            AND w."siteId" = $2::uuid
            AND ${siteAccessSql('w."siteId"', "$3")}
          LIMIT 1
          `,
          [workOrderIdRaw, sparePart.siteId, meta.userId],
        );
        const wo = woRes.rows[0];
        if (!wo) {
          return { kind: "work_order_not_found" as const };
        }
        if (assetIdRaw && wo.assetId !== assetIdRaw) {
          return { kind: "work_order_asset_mismatch" as const };
        }
      }

      const empRes = await client.query<{ employeeId: string | null }>(
        `SELECT "employeeId" FROM "users" WHERE "id" = $1::uuid LIMIT 1`,
        [meta.userId],
      );
      const sessionEmployeeId = empRes.rows[0]?.employeeId ?? null;

      await client.query(
        `
        UPDATE "stockControl"
        SET "quantity" = "quantity" - $1::numeric
        WHERE "id" = $2::uuid
        `,
        [quantity, stock.id],
      );

      const insertRes = await client.query<{ id: string }>(
        `
        INSERT INTO "transaction" (
          "siteId",
          "type",
          "quantity",
          "workOrderId",
          "remark",
          "employeeId",
          "sparePartId",
          "warehouseId",
          "storageLocationId",
          "assetId",
          "costCenterId"
        )
        VALUES (
          $1::uuid,
          'RM',
          $2::numeric,
          $3::uuid,
          $4,
          $5::uuid,
          $6::uuid,
          $7::uuid,
          $8::uuid,
          $9::uuid,
          $10::uuid
        )
        RETURNING "id"
        `,
        [
          sparePart.siteId,
          quantity,
          workOrderIdRaw,
          remark,
          sessionEmployeeId,
          sparePartId,
          stock.warehouseId,
          storageLocationId,
          assetIdRaw,
          costCenterIdRaw,
        ],
      );

      const rowRes = await client.query<TransactionRow>(
        `
        ${transactionSelectSql}
        WHERE t."id" = $1::uuid
        LIMIT 1
        `,
        [insertRes.rows[0]!.id],
      );
      return { kind: "ok" as const, row: rowRes.rows[0]! };
    });

    if (created.kind === "spare_part_not_found") {
      res.status(404).json({ error: "spare_part_not_found" });
      return;
    }
    if (created.kind === "stock_line_not_found") {
      res.status(404).json({ error: "stock_line_not_found" });
      return;
    }
    if (created.kind === "site_mismatch") {
      res.status(400).json({ error: "site_mismatch" });
      return;
    }
    if (created.kind === "cost_center_not_found") {
      res.status(404).json({ error: "cost_center_not_found" });
      return;
    }
    if (created.kind === "asset_not_found") {
      res.status(404).json({ error: "asset_not_found" });
      return;
    }
    if (created.kind === "work_order_not_found") {
      res.status(404).json({ error: "work_order_not_found" });
      return;
    }
    if (created.kind === "work_order_asset_mismatch") {
      res.status(400).json({ error: "work_order_asset_mismatch" });
      return;
    }
    if (created.kind === "insufficient_stock") {
      res.status(409).json({
        error: "insufficient_stock",
        available: created.available,
        requested: created.requested,
      });
      return;
    }

    res.status(201).json(created.row);
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
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
    const result = await withAuditContext(meta, async (client) => {
      const txRes = await client.query<{
        id: string;
        type: string;
        quantity: string;
        sparePartId: string | null;
        storageLocationId: string | null;
      }>(
        `
        SELECT
          t."id",
          t."type",
          t."quantity"::text AS "quantity",
          t."sparePartId",
          t."storageLocationId"
        FROM "transaction" t
        WHERE t."id" = $1::uuid
          AND ${siteAccessSql('t."siteId"', "$2")}
        FOR UPDATE OF t
        `,
        [id, meta.userId],
      );
      const tx = txRes.rows[0];
      if (!tx) {
        return { kind: "not_found" as const };
      }

      if (tx.type === "RM") {
        if (!tx.sparePartId || !tx.storageLocationId) {
          return { kind: "stock_line_missing" as const };
        }
        const stock = await lockStockLine(client, tx.sparePartId, tx.storageLocationId);
        if (!stock) {
          return { kind: "stock_line_missing" as const };
        }
        const qty = Number(tx.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          return { kind: "invalid_quantity" as const };
        }
        await client.query(
          `
          UPDATE "stockControl"
          SET "quantity" = "quantity" + $1::numeric
          WHERE "id" = $2::uuid
          `,
          [qty, stock.id],
        );
      }

      const deleted: QueryResult = await client.query(
        `
        DELETE FROM "transaction"
        WHERE "id" = $1::uuid
        `,
        [id],
      );
      return { kind: "ok" as const, deleted: deleted.rowCount ?? 0 };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (result.kind === "stock_line_missing") {
      res.status(409).json({ error: "stock_line_missing" });
      return;
    }
    if (result.kind === "invalid_quantity") {
      res.status(409).json({ error: "invalid_quantity" });
      return;
    }
    if (result.deleted === 0) {
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

export const transactionsRouter = router;
