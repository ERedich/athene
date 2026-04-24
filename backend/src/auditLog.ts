import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";

export type AuditLogRow = {
  id: string;
  tableName: string;
  recordId: string;
  operation: string;
  changedAt: string;
  changedBy: string | null;
  changedByLogin: string | null;
  requestId: string | null;
  oldData: unknown;
  newData: unknown;
  changedFields: string[] | null;
  reason: string | null;
  source: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

const router = Router();

const allowedOps = new Set(["INSERT", "UPDATE", "DELETE"]);

function parseIntParam(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

router.get("/", async (req: Request, res: Response) => {
  const q = req.query;
  const page = parseIntParam(q.page, 1, 10_000);
  const limit = parseIntParam(q.limit, 50, 200);
  const offset = (page - 1) * limit;

  const tableName = typeof q.tableName === "string" ? q.tableName.trim() : "";
  const recordId = typeof q.recordId === "string" ? q.recordId.trim() : "";
  const operation = typeof q.operation === "string" ? q.operation.trim().toUpperCase() : "";
  const changedBy = typeof q.changedBy === "string" ? q.changedBy.trim() : "";
  const from = typeof q.from === "string" ? q.from.trim() : "";
  const to = typeof q.to === "string" ? q.to.trim() : "";

  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (tableName) {
    conditions.push(`a."tableName" = $${i++}`);
    params.push(tableName);
  }
  if (recordId) {
    conditions.push(`a."recordId" = $${i++}`);
    params.push(recordId);
  }
  if (operation && allowedOps.has(operation)) {
    conditions.push(`a."operation" = $${i++}`);
    params.push(operation);
  }
  if (changedBy) {
    conditions.push(`a."changedBy" = $${i++}::uuid`);
    params.push(changedBy);
  }
  if (from) {
    conditions.push(`a."changedAt" >= $${i++}::timestamptz`);
    params.push(from);
  }
  if (to) {
    conditions.push(`a."changedAt" <= $${i++}::timestamptz`);
    params.push(to);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const countSql = `
      SELECT count(*)::bigint AS c
      FROM "auditLog" a
      ${whereSql}
    `;
    const countRes = await pool.query<{ c: string }>(countSql, params);
    const total = Number(countRes.rows[0]?.c ?? 0);

    const listSql = `
      SELECT
        a."id",
        a."tableName",
        a."recordId",
        a."operation",
        a."changedAt",
        a."changedBy",
        u."loginName" AS "changedByLogin",
        a."requestId",
        a."oldData",
        a."newData",
        a."changedFields",
        a."reason",
        a."source",
        a."ipAddress",
        a."userAgent"
      FROM "auditLog" a
      LEFT JOIN "users" u ON u."id" = a."changedBy"
      ${whereSql}
      ORDER BY a."changedAt" DESC
      LIMIT $${i++} OFFSET $${i++}
    `;
    params.push(limit, offset);
    const { rows } = await pool.query<AuditLogRow>(listSql, params);
    res.json({ rows, total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export const auditLogRouter = router;
