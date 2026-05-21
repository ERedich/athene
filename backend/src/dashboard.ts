import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";

const router = Router();

const ACTIVE_STATUSES = [
  "open",
  "assigned",
  "started",
  "paused",
  "continued",
  "ended",
] as const;

const STATUS_ORDER = [
  "open",
  "assigned",
  "started",
  "paused",
  "continued",
  "ended",
  "done",
  "cancelled",
] as const;

type StatusCount = { status: string; count: number };
type DayCount = { date: string; count: number };

export type DashboardMetricsResponse = {
  openActive: { total: number; byStatus: StatusCount[] };
  completedLast7Days: { total: number; byDay: DayCount[] };
  myOrders: { total: number; byStatus: StatusCount[]; employeeLinked: boolean };
  transactionsLast7Days: { total: number; byDay: DayCount[] };
};

function sendPgError(res: Response, err: unknown) {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

/** Last 7 calendar days in UTC (today − 6 … today), ISO date keys. */
function last7UtcDateKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function zeroFillByDay(rows: { date: string; count: number }[], dateKeys: string[]): DayCount[] {
  const map = new Map(rows.map((r) => [r.date, r.count]));
  return dateKeys.map((date) => ({ date, count: map.get(date) ?? 0 }));
}

function sortStatusCounts(rows: StatusCount[]): StatusCount[] {
  const order = new Map(STATUS_ORDER.map((s, i) => [s, i]));
  return [...rows].sort((a, b) => (order.get(a.status as (typeof STATUS_ORDER)[number]) ?? 99) - (order.get(b.status as (typeof STATUS_ORDER)[number]) ?? 99));
}

function sumCounts(rows: StatusCount[]): number {
  return rows.reduce((sum, r) => sum + r.count, 0);
}

router.get("/metrics", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const dateKeys = last7UtcDateKeys();
  const rangeStart = `${dateKeys[0]}T00:00:00.000Z`;

  try {
    const { rows: userRows } = await pool.query<{ employeeId: string | null }>(
      `SELECT "employeeId" FROM "users" WHERE "id" = $1::uuid LIMIT 1`,
      [userId],
    );
    const sessionEmployeeId = userRows[0]?.employeeId ?? null;
    const employeeLinked = sessionEmployeeId != null;

    const siteFilter = siteAccessSql('w."siteId"', "$1");

    const activeStatusList = ACTIVE_STATUSES.map((s) => `'${s}'`).join(", ");

    const openActivePromise = pool.query<{ status: string; count: number }>(
      `
      SELECT w."status", COUNT(*)::int AS "count"
      FROM "workOrder" w
      WHERE ${siteFilter}
        AND w."status" IN (${activeStatusList})
      GROUP BY w."status"
      `,
      [userId],
    );

    const completedTotalPromise = pool.query<{ count: number }>(
      `
      SELECT COUNT(DISTINCT h."workOrderId")::int AS "count"
      FROM "workOrderStatusHistory" h
      JOIN "workOrder" w ON w."id" = h."workOrderId"
      WHERE ${siteFilter}
        AND h."status" = 'done'
        AND h."occurredAt" >= $2::timestamptz
      `,
      [userId, rangeStart],
    );

    const completedByDayPromise = pool.query<{ date: string; count: number }>(
      `
      SELECT
        to_char((h."occurredAt" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS "date",
        COUNT(DISTINCT h."workOrderId")::int AS "count"
      FROM "workOrderStatusHistory" h
      JOIN "workOrder" w ON w."id" = h."workOrderId"
      WHERE ${siteFilter}
        AND h."status" = 'done'
        AND h."occurredAt" >= $2::timestamptz
      GROUP BY (h."occurredAt" AT TIME ZONE 'UTC')::date
      ORDER BY "date" ASC
      `,
      [userId, rangeStart],
    );

    const myOrdersPromise = employeeLinked
      ? pool.query<{ status: string; count: number }>(
          `
          SELECT w."status", COUNT(*)::int AS "count"
          FROM "workOrder" w
          WHERE ${siteFilter}
            AND (
              w."responsibleEmployeeId" = $2::uuid
              OR EXISTS (
                SELECT 1 FROM "workOrderEmployeeAssignment" a
                WHERE a."workOrderId" = w."id"
                  AND a."employeeId" = $2::uuid
              )
            )
          GROUP BY w."status"
          `,
          [userId, sessionEmployeeId],
        )
      : Promise.resolve({ rows: [] as { status: string; count: number }[] });

    const transactionsTotalPromise = pool.query<{ count: number }>(
      `
      SELECT COUNT(*)::int AS "count"
      FROM "transaction" t
      WHERE ${siteAccessSql('t."siteId"', "$1")}
        AND t."bookedAt" >= $2::timestamptz
      `,
      [userId, rangeStart],
    );

    const transactionsByDayPromise = pool.query<{ date: string; count: number }>(
      `
      SELECT
        to_char((t."bookedAt" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS "date",
        COUNT(*)::int AS "count"
      FROM "transaction" t
      WHERE ${siteAccessSql('t."siteId"', "$1")}
        AND t."bookedAt" >= $2::timestamptz
      GROUP BY (t."bookedAt" AT TIME ZONE 'UTC')::date
      ORDER BY "date" ASC
      `,
      [userId, rangeStart],
    );

    const [
      openActiveRes,
      completedTotalRes,
      completedByDayRes,
      myOrdersRes,
      transactionsTotalRes,
      transactionsByDayRes,
    ] = await Promise.all([
      openActivePromise,
      completedTotalPromise,
      completedByDayPromise,
      myOrdersPromise,
      transactionsTotalPromise,
      transactionsByDayPromise,
    ]);

    const openByStatus = sortStatusCounts(
      openActiveRes.rows.map((r) => ({ status: r.status, count: r.count })),
    );

    const completedByDay = zeroFillByDay(
      completedByDayRes.rows.map((r) => ({ date: r.date, count: r.count })),
      dateKeys,
    );

    const myByStatus = sortStatusCounts(
      myOrdersRes.rows.map((r) => ({ status: r.status, count: r.count })),
    );

    const transactionsByDay = zeroFillByDay(
      transactionsByDayRes.rows.map((r) => ({ date: r.date, count: r.count })),
      dateKeys,
    );

    const payload: DashboardMetricsResponse = {
      openActive: {
        total: sumCounts(openByStatus),
        byStatus: openByStatus,
      },
      completedLast7Days: {
        total: completedTotalRes.rows[0]?.count ?? 0,
        byDay: completedByDay,
      },
      myOrders: {
        total: employeeLinked ? sumCounts(myByStatus) : 0,
        byStatus: myByStatus,
        employeeLinked,
      },
      transactionsLast7Days: {
        total: transactionsTotalRes.rows[0]?.count ?? 0,
        byDay: transactionsByDay,
      },
    };

    res.json(payload);
  } catch (err) {
    sendPgError(res, err);
  }
});

export const dashboardRouter = router;
