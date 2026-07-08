import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { PoolClient, QueryResult } from "pg";

import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

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
    msg === "shift_not_on_date"
  ) {
    res.status(400).json({ error: msg });
    return;
  }
  sendPgError(res, err);
}

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
          ON CONFLICT ("employeeId", "assignmentDate")
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
