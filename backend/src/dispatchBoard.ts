import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function parseIso(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type DispatchBoardTechnician = {
  employeeId: string;
  employeeKey: string;
  employeeName: string;
  workgroupId: string | null;
  workgroupKey: string | null;
  workgroupName: string | null;
  plannedMinutes: number;
  workOrders: Array<{
    id: string;
    orderNumber: number;
    name: string;
    status: string;
    plannedStart: string;
    plannedEnd: string;
    plannedDurationMinutes: number | null;
    customerId: string | null;
    customerName: string | null;
  }>;
};

type DispatchBoardUnassigned = {
  id: string;
  orderNumber: number;
  name: string;
  status: string;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationMinutes: number | null;
  workgroupId: string | null;
  customerId: string | null;
  customerName: string | null;
};

/**
 * GET /api/dispatch-board?from=&to=&workgroupId=&siteId=
 * Technicians with assigned WOs overlapping the window + unassigned open/assigned WOs.
 */
router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const from = parseIso(req.query.from);
  const to = parseIso(req.query.to);
  if (!from || !to) {
    res.status(400).json({ error: "invalid_range" });
    return;
  }
  const workgroupId =
    typeof req.query.workgroupId === "string" && isUuid(req.query.workgroupId)
      ? req.query.workgroupId
      : null;
  const siteId =
    typeof req.query.siteId === "string" && isUuid(req.query.siteId) ? req.query.siteId : null;

  try {
    const params: unknown[] = [userId, from, to];
    let pi = 4;
    const extra: string[] = [];
    if (workgroupId) {
      params.push(workgroupId);
      extra.push(`AND w."workgroupId" = $${pi++}::uuid`);
    }
    if (siteId) {
      params.push(siteId);
      extra.push(`AND w."siteId" = $${pi++}::uuid`);
    }
    const extraSql = extra.join("\n      ");

    const assigned = await pool.query<{
      employeeId: string;
      employeeKey: string;
      employeeName: string;
      workgroupId: string | null;
      workgroupKey: string | null;
      workgroupName: string | null;
      workOrderId: string;
      orderNumber: number;
      name: string;
      status: string;
      plannedStart: string;
      plannedEnd: string;
      plannedDurationMinutes: number | null;
      customerId: string | null;
      customerName: string | null;
    }>(
      `
      SELECT
        e."id"::text AS "employeeId",
        e."key" AS "employeeKey",
        e."name" AS "employeeName",
        w."workgroupId"::text AS "workgroupId",
        wg."key" AS "workgroupKey",
        wg."name" AS "workgroupName",
        w."id"::text AS "workOrderId",
        w."orderNumber",
        w."name",
        w."status",
        w."plannedStart"::text AS "plannedStart",
        w."plannedEnd"::text AS "plannedEnd",
        w."plannedDurationMinutes",
        w."customerId"::text AS "customerId",
        cust."name" AS "customerName"
      FROM "workOrderEmployeeAssignment" a
      JOIN "employee" e ON e."id" = a."employeeId"
      JOIN "workOrder" w ON w."id" = a."workOrderId"
      LEFT JOIN "workgroup" wg ON wg."id" = w."workgroupId"
      LEFT JOIN "customer" cust ON cust."id" = w."customerId"
      WHERE ${siteAccessSql('w."siteId"', "$1")}
        AND w."status" NOT IN ('ended', 'done', 'cancelled')
        AND w."plannedStart" < $3::timestamptz
        AND w."plannedEnd" > $2::timestamptz
        ${extraSql}
      ORDER BY e."key" ASC, w."plannedStart" ASC
      `,
      params,
    );

    const techMap = new Map<string, DispatchBoardTechnician>();
    for (const row of assigned.rows) {
      let tech = techMap.get(row.employeeId);
      if (!tech) {
        tech = {
          employeeId: row.employeeId,
          employeeKey: row.employeeKey,
          employeeName: row.employeeName,
          workgroupId: row.workgroupId,
          workgroupKey: row.workgroupKey,
          workgroupName: row.workgroupName,
          plannedMinutes: 0,
          workOrders: [],
        };
        techMap.set(row.employeeId, tech);
      }
      const mins =
        row.plannedDurationMinutes ??
        Math.max(
          0,
          Math.round(
            (new Date(row.plannedEnd).getTime() - new Date(row.plannedStart).getTime()) / 60_000,
          ),
        );
      tech.plannedMinutes += mins;
      tech.workOrders.push({
        id: row.workOrderId,
        orderNumber: row.orderNumber,
        name: row.name,
        status: row.status,
        plannedStart: row.plannedStart,
        plannedEnd: row.plannedEnd,
        plannedDurationMinutes: row.plannedDurationMinutes,
        customerId: row.customerId,
        customerName: row.customerName,
      });
    }

    const unassigned = await pool.query<DispatchBoardUnassigned>(
      `
      SELECT
        w."id"::text AS "id",
        w."orderNumber",
        w."name",
        w."status",
        w."plannedStart"::text AS "plannedStart",
        w."plannedEnd"::text AS "plannedEnd",
        w."plannedDurationMinutes",
        w."workgroupId"::text AS "workgroupId",
        w."customerId"::text AS "customerId",
        cust."name" AS "customerName"
      FROM "workOrder" w
      LEFT JOIN "customer" cust ON cust."id" = w."customerId"
      WHERE ${siteAccessSql('w."siteId"', "$1")}
        AND w."status" IN ('open', 'assigned')
        AND w."plannedStart" < $3::timestamptz
        AND w."plannedEnd" > $2::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM "workOrderEmployeeAssignment" a
          WHERE a."workOrderId" = w."id"
        )
        ${extraSql}
      ORDER BY w."plannedStart" ASC
      `,
      params,
    );

    res.json({
      from,
      to,
      technicians: [...techMap.values()],
      unassigned: unassigned.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export const dispatchBoardRouter = router;
