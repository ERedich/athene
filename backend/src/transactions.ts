import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult } from "pg";

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
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const allowedTypes = new Set(["IN", "EX", "RM", "RT", "IV"]);

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function parseIntParam(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
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
        t."remark"
      FROM "transaction" t
      JOIN "site" s ON s."id" = t."siteId"
      LEFT JOIN "workOrder" w ON w."id" = t."workOrderId"
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
        DELETE FROM "transaction"
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

export const transactionsRouter = router;
