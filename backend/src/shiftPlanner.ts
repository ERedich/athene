import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { PoolClient, QueryResult } from "pg";

import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";
import {
  calendarDayKey,
  DEFAULT_PLANNING_TIME_ZONE,
  effectivePlannedEnd,
  intervalsOverlap,
} from "./workOrderScheduling.js";

export type ShiftAssignmentRow = {
  id: string;
  employeeId: string;
  employeeKey: string;
  employeeName: string;
  shiftId: string;
  assignmentDate: string;
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && dateRe.test(value);
}

function parseDate(value: unknown): string | null {
  if (!isIsoDate(value)) return null;
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return value;
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekdayKeyForDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return WEEKDAY_KEYS[d.getDay()]!;
}

function isAssignmentDateBeforeToday(assignmentDate: string): boolean {
  const todayKey = calendarDayKey(new Date(), DEFAULT_PLANNING_TIME_ZONE);
  return assignmentDate < todayKey;
}

type ShiftSegmentKind = "full" | "evening" | "morning";

function parseSegmentKind(value: unknown): ShiftSegmentKind | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === "full" || value === "evening" || value === "morning") return value;
  return null;
}

function normalizeTimeToHm(value: string): string {
  const parts = value.split(":");
  return `${parts[0]}:${parts[1]}`;
}

function timeToMinutes(time: string): number {
  if (time === "24:00") return 24 * 60;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function assignmentDateForBlock(blockDate: string, segmentKind: ShiftSegmentKind | null): string {
  if (segmentKind === "morning") return addDaysIso(blockDate, -1);
  return blockDate;
}

function computeShiftWindowBounds(
  blockDate: string,
  startTime: string,
  endTime: string,
  segmentKind: ShiftSegmentKind | null,
): { startDate: string; startTimeHm: string; endDate: string; endTimeHm: string } {
  const start = normalizeTimeToHm(startTime);
  const end = normalizeTimeToHm(endTime);

  if (segmentKind === "evening") {
    return {
      startDate: blockDate,
      startTimeHm: start,
      endDate: addDaysIso(blockDate, 1),
      endTimeHm: "00:00",
    };
  }
  if (segmentKind === "morning") {
    return {
      startDate: blockDate,
      startTimeHm: "00:00",
      endDate: blockDate,
      endTimeHm: end,
    };
  }
  if (timeToMinutes(end) <= timeToMinutes(start)) {
    return {
      startDate: blockDate,
      startTimeHm: start,
      endDate: addDaysIso(blockDate, 1),
      endTimeHm: end,
    };
  }
  return {
    startDate: blockDate,
    startTimeHm: start,
    endDate: blockDate,
    endTimeHm: end,
  };
}

async function resolveShiftWindowTimestamps(
  startDate: string,
  startTimeHm: string,
  endDate: string,
  endTimeHm: string,
): Promise<{ start: string; end: string }> {
  const { rows } = await pool.query<{ start: string; end: string }>(
    `
    SELECT
      (($1::date + $2::time) AT TIME ZONE $5)::timestamptz::text AS start,
      (($3::date + $4::time) AT TIME ZONE $5)::timestamptz::text AS end
    `,
    [startDate, `${startTimeHm}:00`, endDate, `${endTimeHm}:00`, DEFAULT_PLANNING_TIME_ZONE],
  );
  const row = rows[0];
  if (!row) throw new Error("shift_window_failed");
  return { start: row.start, end: row.end };
}

function parseAssignmentBody(body: unknown): {
  employeeId: string;
  shiftId: string;
  assignmentDate: string;
} | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const employeeId = typeof o.employeeId === "string" ? o.employeeId.trim() : "";
  const shiftId = typeof o.shiftId === "string" ? o.shiftId.trim() : "";
  const assignmentDate = parseDate(o.assignmentDate);
  if (!isUuid(employeeId) || !isUuid(shiftId) || !assignmentDate) return null;
  return { employeeId, shiftId, assignmentDate };
}

function parseRolloutBody(body: unknown): {
  employeeId: string;
  shiftId: string;
  fromDate: string;
  toDate: string;
} | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const employeeId = typeof o.employeeId === "string" ? o.employeeId.trim() : "";
  const shiftId = typeof o.shiftId === "string" ? o.shiftId.trim() : "";
  const fromDate = parseDate(o.fromDate);
  const toDate = parseDate(o.toDate);
  if (!isUuid(employeeId) || !isUuid(shiftId) || !fromDate || !toDate) return null;
  return { employeeId, shiftId, fromDate, toDate };
}

function enumerateShiftAssignmentDates(
  fromDate: string,
  toDate: string,
  weekdays: string[],
): string[] {
  const dates: string[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    if (weekdays.includes(weekdayKeyForDate(cursor))) {
      dates.push(cursor);
    }
    cursor = addDaysIso(cursor, 1);
  }
  return dates;
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

const selectAssignmentColumns = `
  esa."id",
  esa."employeeId",
  e."key" AS "employeeKey",
  e."name" AS "employeeName",
  esa."shiftId",
  to_char(esa."assignmentDate", 'YYYY-MM-DD') AS "assignmentDate"
`;

async function validateAssignment(
  client: PoolClient,
  userId: string,
  employeeId: string,
  shiftId: string,
  assignmentDate: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (isAssignmentDateBeforeToday(assignmentDate)) {
    return { ok: false, status: 400, error: "assignment_date_in_past" };
  }

  const employeeResult = await client.query<{
    id: string;
    siteId: string;
    isActive: boolean;
    isShiftPlanning: boolean;
  }>(
    `
    SELECT "id", "siteId"::text AS "siteId", "isActive", "isShiftPlanning"
    FROM "employee"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    `,
    [employeeId, userId],
  );
  if (employeeResult.rowCount === 0) {
    return { ok: false, status: 404, error: "employee_not_found" };
  }
  const employee = employeeResult.rows[0]!;
  if (!employee.isActive) {
    return { ok: false, status: 400, error: "employee_inactive" };
  }
  if (!employee.isShiftPlanning) {
    return { ok: false, status: 400, error: "employee_not_shift_planning" };
  }

  const shiftResult = await client.query<{ id: string; siteId: string; isActive: boolean; weekdays: string[] }>(
    `
    SELECT "id", "siteId"::text AS "siteId", "isActive", "weekdays"
    FROM "shift"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    `,
    [shiftId, userId],
  );
  if (shiftResult.rowCount === 0) {
    return { ok: false, status: 404, error: "shift_not_found" };
  }
  const shift = shiftResult.rows[0]!;
  if (!shift.isActive) {
    return { ok: false, status: 400, error: "shift_inactive" };
  }
  if (employee.siteId !== shift.siteId) {
    return { ok: false, status: 400, error: "site_mismatch" };
  }

  const weekdayKey = weekdayKeyForDate(assignmentDate);
  if (!shift.weekdays.includes(weekdayKey)) {
    return { ok: false, status: 400, error: "shift_not_on_date" };
  }

  return { ok: true };
}

function handleAssignmentError(res: Response, err: unknown) {
  const msg = (err as Error).message;
  if (msg === "missing_session_user" || msg === "user_not_found") {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (msg === "site_access_denied") {
    res.status(403).json({ error: "site_access_denied" });
    return;
  }
  if (msg === "employee_not_found" || msg === "shift_not_found") {
    res.status(404).json({ error: msg });
    return;
  }
  if (
    msg === "employee_inactive" ||
    msg === "employee_not_shift_planning" ||
    msg === "shift_inactive" ||
    msg === "site_mismatch" ||
    msg === "shift_not_on_date" ||
    msg === "assignment_date_in_past" ||
    msg === "invalid_date_range"
  ) {
    res.status(400).json({ error: msg });
    return;
  }
  sendPgError(res, err);
}

router.get("/shift-kpis", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const shiftId = typeof req.query.shiftId === "string" ? req.query.shiftId.trim() : "";
  const blockDate = parseDate(req.query.date);
  const segmentKind = parseSegmentKind(req.query.segmentKind);

  if (!isUuid(shiftId) || !blockDate) {
    res.status(400).json({ error: "invalid_query" });
    return;
  }
  if (req.query.segmentKind !== undefined && req.query.segmentKind !== "" && segmentKind === null) {
    res.status(400).json({ error: "invalid_segment_kind" });
    return;
  }

  try {
    const shiftResult = await pool.query<{
      id: string;
      siteId: string;
      startTime: string;
      endTime: string;
    }>(
      `
      SELECT
        "id",
        "siteId"::text AS "siteId",
        to_char("startTime", 'HH24:MI') AS "startTime",
        to_char("endTime", 'HH24:MI') AS "endTime"
      FROM "shift"
      WHERE "id" = $1::uuid
        AND ${siteAccessSql('"siteId"', "$2")}
        AND "isActive" = true
      `,
      [shiftId, userId],
    );
    if (shiftResult.rowCount === 0) {
      res.status(404).json({ error: "shift_not_found" });
      return;
    }
    const shift = shiftResult.rows[0]!;

    const windowBounds = computeShiftWindowBounds(
      blockDate,
      shift.startTime,
      shift.endTime,
      segmentKind,
    );
    const window = await resolveShiftWindowTimestamps(
      windowBounds.startDate,
      windowBounds.startTimeHm,
      windowBounds.endDate,
      windowBounds.endTimeHm,
    );

    const assignmentDate = assignmentDateForBlock(blockDate, segmentKind);
    const shiftStart = new Date(window.start);
    const shiftEnd = new Date(window.end);

    const workOrdersResult = await pool.query<{
      id: string;
      orderNumber: number;
      name: string;
      plannedStart: string;
      plannedEnd: string | null;
      plannedDurationMinutes: number | null;
      workgroupId: string | null;
      workgroupKey: string | null;
      workgroupName: string | null;
      status: string;
    }>(
      `
      SELECT
        w."id",
        w."orderNumber",
        w."name",
        w."plannedStart"::text AS "plannedStart",
        w."plannedEnd"::text AS "plannedEnd",
        w."plannedDurationMinutes",
        w."workgroupId"::text AS "workgroupId",
        wg."key" AS "workgroupKey",
        wg."name" AS "workgroupName",
        w."status"
      FROM "workOrder" w
      LEFT JOIN "workgroup" wg ON wg."id" = w."workgroupId"
      WHERE w."siteId" = $1::uuid
        AND ${siteAccessSql('w."siteId"', "$2")}
        AND w."status" <> 'cancelled'
        AND w."plannedStart" < $3::timestamptz
        AND (
          CASE
            WHEN w."plannedEnd" IS NOT NULL AND w."plannedEnd" >= w."plannedStart"
            THEN w."plannedEnd"
            ELSE w."plannedStart"
          END
        ) >= $4::timestamptz
      ORDER BY w."plannedStart" ASC, w."orderNumber" ASC
      `,
      [shift.siteId, userId, window.end, window.start],
    );

    const workOrders = workOrdersResult.rows.filter((order) =>
      intervalsOverlap(
        shiftStart,
        shiftEnd,
        new Date(order.plannedStart),
        effectivePlannedEnd(order.plannedStart, order.plannedEnd),
      ),
    );

    const totalPlannedDurationMinutes = workOrders.reduce(
      (sum, order) => sum + (order.plannedDurationMinutes ?? 0),
      0,
    );

    const requestedById = new Map<
      string,
      { id: string; key: string; name: string; orderCount: number }
    >();
    for (const order of workOrders) {
      if (!order.workgroupId || !order.workgroupKey || !order.workgroupName) continue;
      const existing = requestedById.get(order.workgroupId);
      if (existing) {
        existing.orderCount += 1;
      } else {
        requestedById.set(order.workgroupId, {
          id: order.workgroupId,
          key: order.workgroupKey,
          name: order.workgroupName,
          orderCount: 1,
        });
      }
    }
    const requestedWorkgroups = [...requestedById.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const availableResult = await pool.query<{
      id: string;
      key: string;
      name: string;
      employeeCount: number;
    }>(
      `
      SELECT
        wg."id"::text AS id,
        wg."key" AS key,
        wg."name" AS name,
        COUNT(DISTINCT esa."employeeId")::int AS "employeeCount"
      FROM "employeeShiftAssignment" esa
      JOIN "employee" e ON e."id" = esa."employeeId"
      JOIN "workgroupUser" wu ON wu."employeeId" = e."id"
      JOIN "workgroup" wg ON wg."id" = wu."workgroupId"
      WHERE esa."shiftId" = $1::uuid
        AND esa."assignmentDate" = $2::date
        AND e."isActive" = true
        AND ${siteAccessSql('e."siteId"', "$3")}
      GROUP BY wg."id", wg."key", wg."name"
      ORDER BY wg."name" ASC
      `,
      [shiftId, assignmentDate, userId],
    );

    const withoutWorkgroupResult = await pool.query<{ count: number }>(
      `
      SELECT COUNT(DISTINCT esa."employeeId")::int AS count
      FROM "employeeShiftAssignment" esa
      JOIN "employee" e ON e."id" = esa."employeeId"
      WHERE esa."shiftId" = $1::uuid
        AND esa."assignmentDate" = $2::date
        AND e."isActive" = true
        AND ${siteAccessSql('e."siteId"', "$3")}
        AND NOT EXISTS (
          SELECT 1 FROM "workgroupUser" wu WHERE wu."employeeId" = e."id"
        )
      `,
      [shiftId, assignmentDate, userId],
    );

    res.json({
      window,
      workOrders,
      totalPlannedDurationMinutes,
      requestedWorkgroups,
      availableWorkgroups: availableResult.rows,
      employeesWithoutWorkgroupCount: withoutWorkgroupResult.rows[0]?.count ?? 0,
    });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/assignments", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const weekStart = parseDate(req.query.weekStart);
  if (!weekStart) {
    res.status(400).json({ error: "invalid_week_start" });
    return;
  }
  const weekEnd = addDaysIso(weekStart, 6);

  try {
    const { rows } = await pool.query<ShiftAssignmentRow>(
      `
      SELECT ${selectAssignmentColumns}
      FROM "employeeShiftAssignment" esa
      JOIN "employee" e ON e."id" = esa."employeeId"
      JOIN "shift" sh ON sh."id" = esa."shiftId"
      WHERE ${siteAccessSql('e."siteId"', "$1")}
        AND e."isActive" = true
        AND e."isShiftPlanning" = true
        AND sh."isActive" = true
        AND esa."assignmentDate" >= $2::date
        AND esa."assignmentDate" <= $3::date
      ORDER BY esa."assignmentDate" ASC, e."name" ASC
      `,
      [userId, weekStart, weekEnd],
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/assignments/rollout", async (req: Request, res: Response) => {
  const parsed = parseRolloutBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { employeeId, shiftId, fromDate, toDate } = parsed;

  if (fromDate > toDate) {
    res.status(400).json({ error: "invalid_date_range" });
    return;
  }
  if (isAssignmentDateBeforeToday(fromDate) || isAssignmentDateBeforeToday(toDate)) {
    res.status(400).json({ error: "assignment_date_in_past" });
    return;
  }

  try {
    const meta = auditMeta(req);
    const result = await withAuditContext(meta, async (client) => {
      const shiftResult = await client.query<{ weekdays: string[] }>(
        `
        SELECT "weekdays"
        FROM "shift"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
          AND "isActive" = true
        `,
        [shiftId, meta.userId],
      );
      if (shiftResult.rowCount === 0) {
        throw new Error("shift_not_found");
      }
      const weekdays = shiftResult.rows[0]!.weekdays;
      const dates = enumerateShiftAssignmentDates(fromDate, toDate, weekdays);

      const employeeSite = await client.query<{ siteId: string }>(
        `SELECT "siteId"::text AS "siteId" FROM "employee" WHERE "id" = $1::uuid`,
        [employeeId],
      );
      if (employeeSite.rowCount === 0) {
        throw new Error("employee_not_found");
      }
      await assertSiteAccess(client, meta.userId, employeeSite.rows[0]!.siteId);

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const assignedDates: string[] = [];

      for (const assignmentDate of dates) {
        const validation = await validateAssignment(
          client,
          meta.userId,
          employeeId,
          shiftId,
          assignmentDate,
        );
        if (!validation.ok) {
          if (validation.error === "assignment_date_in_past") continue;
          throw new Error(validation.error);
        }

        const existing = await client.query<{ shiftId: string }>(
          `
          SELECT "shiftId"::text AS "shiftId"
          FROM "employeeShiftAssignment"
          WHERE "employeeId" = $1::uuid
            AND "assignmentDate" = $2::date
          `,
          [employeeId, assignmentDate],
        );
        const existingShiftId = existing.rows[0]?.shiftId;
        if (existingShiftId) {
          if (existingShiftId === shiftId) {
            updated += 1;
            assignedDates.push(assignmentDate);
          } else {
            skipped += 1;
          }
          continue;
        }

        await client.query(
          `
          INSERT INTO "employeeShiftAssignment" ("employeeId", "shiftId", "assignmentDate")
          VALUES ($1::uuid, $2::uuid, $3::date)
          `,
          [employeeId, shiftId, assignmentDate],
        );
        created += 1;
        assignedDates.push(assignmentDate);
      }

      return { created, updated, skipped, dates: assignedDates };
    });

    res.status(201).json(result);
  } catch (err) {
    handleAssignmentError(res, err);
  }
});

router.post("/assignments", async (req: Request, res: Response) => {
  const parsed = parseAssignmentBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { employeeId, shiftId, assignmentDate } = parsed;

  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const validation = await validateAssignment(client, meta.userId, employeeId, shiftId, assignmentDate);
      if (!validation.ok) {
        throw new Error(validation.error);
      }

      const employeeSite = await client.query<{ siteId: string }>(
        `SELECT "siteId"::text AS "siteId" FROM "employee" WHERE "id" = $1::uuid`,
        [employeeId],
      );
      await assertSiteAccess(client, meta.userId, employeeSite.rows[0]!.siteId);

      const { rows } = await client.query<ShiftAssignmentRow>(
        `
        WITH upserted AS (
          INSERT INTO "employeeShiftAssignment" ("employeeId", "shiftId", "assignmentDate")
          VALUES ($1::uuid, $2::uuid, $3::date)
          ON CONFLICT ("employeeId", "shiftId", "assignmentDate")
          DO UPDATE SET "shiftId" = EXCLUDED."shiftId"
          RETURNING *
        )
        SELECT
          u."id",
          u."employeeId",
          e."key" AS "employeeKey",
          e."name" AS "employeeName",
          u."shiftId",
          to_char(u."assignmentDate", 'YYYY-MM-DD') AS "assignmentDate"
        FROM upserted u
        JOIN "employee" e ON e."id" = u."employeeId"
        `,
        [employeeId, shiftId, assignmentDate],
      );
      return rows[0];
    });

    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    handleAssignmentError(res, err);
  }
});

router.delete("/assignments/:id", async (req: Request, res: Response) => {
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
        DELETE FROM "employeeShiftAssignment" esa
        USING "employee" e
        WHERE esa."id" = $1::uuid
          AND e."id" = esa."employeeId"
          AND ${siteAccessSql('e."siteId"', "$2")}
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

export const shiftPlannerRouter = router;
