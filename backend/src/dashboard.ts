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
type OrderTypeCount = { orderType: string; count: number };

const ORDER_TYPE_ORDER = ["maintenance", "repair", "breakdown"] as const;

/** Matches resolveScheduleAdherence tolerance (~3 minutes). */
const DELAY_TOLERANCE_HOURS = 0.05;

export type DashboardMetricsResponse = {
  openActive: { total: number; byStatus: StatusCount[] };
  completedLast7Days: { total: number; byDay: DayCount[] };
  myOrders: { total: number; byStatus: StatusCount[]; employeeLinked: boolean };
  transactionsLast7Days: { total: number; byDay: DayCount[] };
  ordersByType: { total: number; byType: OrderTypeCount[] };
  delayedOrders: { total: number };
  avgDelayHours: { hours: number | null };
  topAssetByOrders: {
    assetId: string | null;
    assetKey: string | null;
    assetName: string | null;
    count: number;
  };
  transactionsLast24h: { total: number };
  transactionsLastMonth: { total: number };
};

function sendPgError(res: Response, err: unknown) {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

/** Previous calendar month in UTC [start, end). */
function lastCalendarMonthRangeUtc(): { start: string; end: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start: start.toISOString(), end: end.toISOString() };
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

function sortOrderTypeCounts(rows: OrderTypeCount[]): OrderTypeCount[] {
  const order = new Map(ORDER_TYPE_ORDER.map((t, i) => [t, i]));
  return [...rows].sort(
    (a, b) =>
      (order.get(a.orderType as (typeof ORDER_TYPE_ORDER)[number]) ?? 99) -
      (order.get(b.orderType as (typeof ORDER_TYPE_ORDER)[number]) ?? 99),
  );
}

function zeroFillOrderTypes(rows: OrderTypeCount[]): OrderTypeCount[] {
  const map = new Map(rows.map((r) => [r.orderType, r.count]));
  return ORDER_TYPE_ORDER.map((orderType) => ({
    orderType,
    count: map.get(orderType) ?? 0,
  }));
}

/** CTE: work orders with resolved actual end (ended, else done) for delay KPIs. */
function workOrdersWithScheduleEndCte(siteFilter: string): string {
  return `
    wo_schedule AS (
      SELECT
        w."id",
        w."plannedEnd",
        COALESCE(
          (
            SELECT h."occurredAt"
            FROM "workOrderStatusHistory" h
            WHERE h."workOrderId" = w."id"
              AND h."status" = 'ended'
            ORDER BY h."occurredAt" ASC
            LIMIT 1
          ),
          (
            SELECT h."occurredAt"
            FROM "workOrderStatusHistory" h
            WHERE h."workOrderId" = w."id"
              AND h."status" = 'done'
            ORDER BY h."occurredAt" ASC
            LIMIT 1
          )
        ) AS "actualEndAt"
      FROM "workOrder" w
      WHERE ${siteFilter}
        AND w."status" != 'cancelled'
        AND w."plannedEnd" IS NOT NULL
    )
  `;
}

router.get("/metrics", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const dateKeys = last7UtcDateKeys();
  const rangeStart = `${dateKeys[0]}T00:00:00.000Z`;
  const lastMonth = lastCalendarMonthRangeUtc();

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
              EXISTS (
                SELECT 1 FROM "workOrderResponsibleEmployee" r
                WHERE r."workOrderId" = w."id"
                  AND r."employeeId" = $2::uuid
              )
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

    const ordersByTypePromise = pool.query<{ orderType: string; count: number }>(
      `
      SELECT w."orderType", COUNT(*)::int AS "count"
      FROM "workOrder" w
      WHERE ${siteFilter}
        AND w."status" != 'cancelled'
      GROUP BY w."orderType"
      `,
      [userId],
    );

    const scheduleCte = workOrdersWithScheduleEndCte(siteFilter);

    const delayedOrdersPromise = pool.query<{ count: number }>(
      `
      WITH ${scheduleCte}
      SELECT COUNT(*)::int AS "count"
      FROM wo_schedule s
      WHERE EXTRACT(EPOCH FROM (COALESCE(s."actualEndAt", now()) - s."plannedEnd")) / 3600.0
        > ${DELAY_TOLERANCE_HOURS}
      `,
      [userId],
    );

    const avgDelayPromise = pool.query<{ hours: number | null }>(
      `
      WITH ${scheduleCte}
      SELECT AVG(
        EXTRACT(EPOCH FROM (COALESCE(s."actualEndAt", now()) - s."plannedEnd")) / 3600.0
      )::float8 AS "hours"
      FROM wo_schedule s
      WHERE EXTRACT(EPOCH FROM (COALESCE(s."actualEndAt", now()) - s."plannedEnd")) / 3600.0
        > ${DELAY_TOLERANCE_HOURS}
      `,
      [userId],
    );

    const topAssetPromise = pool.query<{
      id: string;
      key: string;
      name: string;
      count: number;
    }>(
      `
      SELECT a."id", a."key", a."name", COUNT(*)::int AS "count"
      FROM "workOrder" w
      JOIN "asset" a ON a."id" = w."assetId"
      WHERE ${siteFilter}
        AND w."status" != 'cancelled'
      GROUP BY a."id", a."key", a."name"
      ORDER BY "count" DESC, a."key" ASC
      LIMIT 1
      `,
      [userId],
    );

    const transactions24hPromise = pool.query<{ count: number }>(
      `
      SELECT COUNT(*)::int AS "count"
      FROM "transaction" t
      WHERE ${siteAccessSql('t."siteId"', "$1")}
        AND t."bookedAt" >= now() - interval '24 hours'
      `,
      [userId],
    );

    const transactionsLastMonthPromise = pool.query<{ count: number }>(
      `
      SELECT COUNT(*)::int AS "count"
      FROM "transaction" t
      WHERE ${siteAccessSql('t."siteId"', "$1")}
        AND t."bookedAt" >= $2::timestamptz
        AND t."bookedAt" < $3::timestamptz
      `,
      [userId, lastMonth.start, lastMonth.end],
    );

    const [
      openActiveRes,
      completedTotalRes,
      completedByDayRes,
      myOrdersRes,
      transactionsTotalRes,
      transactionsByDayRes,
      ordersByTypeRes,
      delayedOrdersRes,
      avgDelayRes,
      topAssetRes,
      transactions24hRes,
      transactionsLastMonthRes,
    ] = await Promise.all([
      openActivePromise,
      completedTotalPromise,
      completedByDayPromise,
      myOrdersPromise,
      transactionsTotalPromise,
      transactionsByDayPromise,
      ordersByTypePromise,
      delayedOrdersPromise,
      avgDelayPromise,
      topAssetPromise,
      transactions24hPromise,
      transactionsLastMonthPromise,
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

    const byType = zeroFillOrderTypes(
      sortOrderTypeCounts(
        ordersByTypeRes.rows.map((r) => ({ orderType: r.orderType, count: r.count })),
      ),
    );

    const topRow = topAssetRes.rows[0];

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
      ordersByType: {
        total: byType.reduce((sum, r) => sum + r.count, 0),
        byType,
      },
      delayedOrders: {
        total: delayedOrdersRes.rows[0]?.count ?? 0,
      },
      avgDelayHours: {
        hours: avgDelayRes.rows[0]?.hours ?? null,
      },
      topAssetByOrders: {
        assetId: topRow?.id ?? null,
        assetKey: topRow?.key ?? null,
        assetName: topRow?.name ?? null,
        count: topRow?.count ?? 0,
      },
      transactionsLast24h: {
        total: transactions24hRes.rows[0]?.count ?? 0,
      },
      transactionsLastMonth: {
        total: transactionsLastMonthRes.rows[0]?.count ?? 0,
      },
    };

    res.json(payload);
  } catch (err) {
    sendPgError(res, err);
  }
});

export type DashboardAuditFeedItem = {
  id: string;
  occurredAt: string;
  actorLogin: string | null;
  kind: "work_order_status" | "transaction_created";
  workOrderId: string | null;
  orderNumber: number | null;
  status: string | null;
  transactionType: string | null;
  quantity: string | null;
};

function parseLimitParam(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

router.get("/audit-feed", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const limit = parseLimitParam(req.query.limit, 50, 100);

  try {
    const siteFilterWo = siteAccessSql(`(a."newData"->>'siteId')::uuid`, "$1");
    const siteFilterTx = siteAccessSql(`(a."newData"->>'siteId')::uuid`, "$1");

    const { rows } = await pool.query<DashboardAuditFeedItem>(
      `
      (
        SELECT
          a."id"::text AS "id",
          a."changedAt" AS "occurredAt",
          u."loginName" AS "actorLogin",
          'work_order_status'::text AS "kind",
          a."recordId" AS "workOrderId",
          NULLIF(a."newData"->>'orderNumber', '')::int AS "orderNumber",
          NULLIF(a."newData"->>'status', '') AS "status",
          NULL::text AS "transactionType",
          NULL::text AS "quantity"
        FROM "auditLog" a
        LEFT JOIN "users" u ON u."id" = a."changedBy"
        WHERE a."tableName" = 'workOrder'
          AND a."operation" = 'UPDATE'
          AND a."changedFields" IS NOT NULL
          AND 'status' = ANY(a."changedFields")
          AND a."newData"->>'siteId' IS NOT NULL
          AND ${siteFilterWo}
      )
      UNION ALL
      (
        SELECT
          a."id"::text AS "id",
          a."changedAt" AS "occurredAt",
          u."loginName" AS "actorLogin",
          'transaction_created'::text AS "kind",
          NULLIF(a."newData"->>'workOrderId', '') AS "workOrderId",
          w."orderNumber" AS "orderNumber",
          NULL::text AS "status",
          NULLIF(a."newData"->>'type', '') AS "transactionType",
          NULLIF(a."newData"->>'quantity', '') AS "quantity"
        FROM "auditLog" a
        LEFT JOIN "users" u ON u."id" = a."changedBy"
        LEFT JOIN "workOrder" w ON w."id" = NULLIF(a."newData"->>'workOrderId', '')::uuid
        WHERE a."tableName" = 'transaction'
          AND a."operation" = 'INSERT'
          AND a."newData"->>'siteId' IS NOT NULL
          AND ${siteFilterTx}
      )
      ORDER BY "occurredAt" DESC
      LIMIT $2
      `,
      [userId, limit],
    );

    res.json({ items: rows });
  } catch (err) {
    sendPgError(res, err);
  }
});

export const dashboardRouter = router;
