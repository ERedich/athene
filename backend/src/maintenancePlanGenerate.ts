import { randomUUID } from "node:crypto";

import { withAuditContext } from "./auditContext.js";
import { getGenerateWoFromMpTime } from "./appParameters.js";
import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";
import {
  calendarDayKey,
  DEFAULT_PLANNING_TIME_ZONE,
  isBeforeLocalToday,
  startOfCalendarDay,
} from "./workOrderScheduling.js";
import { createWorkOrderRecord } from "./workOrderCreate.js";
import { getWorkOrderRowForRealtime } from "./workOrders.js";
import { broadcastWorkOrderCreated } from "./workOrderRealtime.js";
import { reindexWorkOrder, scheduleReindex } from "./assistant/embedding/index.js";

export type MaintenanceIntervalUnit = "day" | "week" | "month" | "year";

export type MaintenancePlanGenerateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  siteId: string;
  assetId: string;
  costCenterId: string;
  workgroupId: string;
  classificationId: string | null;
  inspectionRoundId: string | null;
  plannedDurationMinutes: number | null;
  orderType: string;
  intervalUnit: MaintenanceIntervalUnit;
  intervalValue: number;
  nextDueAt: string;
  leadTimeDays: number;
  status: string;
  ignoreOpenWorkOrders: boolean;
  updatedBy: string;
  responsibleEmployeeIds: string[];
};

export type GeneratePlanResult =
  | { planId: string; status: "created"; workOrderId: string; orderNumber?: number }
  | { planId: string; status: "skipped"; reason: string };

const OPEN_WO_STATUSES = `('open', 'assigned', 'started', 'paused', 'continued')`;

export function addInterval(
  from: Date,
  unit: MaintenanceIntervalUnit,
  value: number,
): Date {
  const next = new Date(from.getTime());
  switch (unit) {
    case "day":
      next.setUTCDate(next.getUTCDate() + value);
      break;
    case "week":
      next.setUTCDate(next.getUTCDate() + value * 7);
      break;
    case "month":
      next.setUTCMonth(next.getUTCMonth() + value);
      break;
    case "year":
      next.setUTCFullYear(next.getUTCFullYear() + value);
      break;
  }
  return next;
}

/** Anchor date (YYYY-MM-DD) → nextDueAt at start of that calendar day (Europe/Berlin key as UTC midnight). */
export function nextDueAtFromAnchorDate(anchorDate: string, now = new Date()): Date {
  const raw = new Date(`${anchorDate}T00:00:00.000Z`);
  if (Number.isNaN(raw.getTime())) {
    throw new Error("invalid_anchor_date");
  }
  let due = startOfCalendarDay(raw, DEFAULT_PLANNING_TIME_ZONE);
  const todayKey = calendarDayKey(now, DEFAULT_PLANNING_TIME_ZONE);
  // If anchor day is in the past, caller should advance with interval — keep as-is here.
  void todayKey;
  return due;
}

export function computeInitialNextDueAt(
  anchorDate: string,
  intervalUnit: MaintenanceIntervalUnit,
  intervalValue: number,
  now = new Date(),
): Date {
  let due = nextDueAtFromAnchorDate(anchorDate, now);
  const todayStart = startOfCalendarDay(now, DEFAULT_PLANNING_TIME_ZONE);
  let guard = 0;
  while (due.getTime() < todayStart.getTime() && guard < 500) {
    due = addInterval(due, intervalUnit, intervalValue);
    guard += 1;
  }
  return due;
}

export function advanceNextDueAtPastNow(
  currentDue: Date,
  intervalUnit: MaintenanceIntervalUnit,
  intervalValue: number,
  now = new Date(),
): Date {
  let due = addInterval(currentDue, intervalUnit, intervalValue);
  const nowMs = now.getTime();
  let guard = 0;
  while (due.getTime() <= nowMs && guard < 500) {
    due = addInterval(due, intervalUnit, intervalValue);
    guard += 1;
  }
  return due;
}

function clampPlannedStartNotBeforeToday(iso: string): string {
  if (!isBeforeLocalToday(iso, DEFAULT_PLANNING_TIME_ZONE)) return iso;
  return startOfCalendarDay(new Date(), DEFAULT_PLANNING_TIME_ZONE).toISOString();
}

async function loadPlanForGenerate(
  planId: string,
  userId: string | null,
): Promise<MaintenancePlanGenerateRow | null> {
  const accessClause = userId
    ? `AND ${siteAccessSql('p."siteId"', "$2")}`
    : "";
  const params: unknown[] = userId ? [planId, userId] : [planId];
  const { rows } = await pool.query<MaintenancePlanGenerateRow>(
    `
    SELECT
      p."id",
      p."key",
      p."name",
      p."description",
      p."siteId",
      p."assetId",
      p."costCenterId",
      p."workgroupId",
      p."classificationId",
      p."inspectionRoundId",
      p."plannedDurationMinutes",
      p."orderType",
      p."intervalUnit",
      p."intervalValue",
      p."nextDueAt",
      p."leadTimeDays",
      p."status",
      p."ignoreOpenWorkOrders",
      p."updatedBy",
      COALESCE(
        (
          SELECT array_agg(r."employeeId"::text ORDER BY e."key")
          FROM "maintenancePlanResponsibleEmployee" r
          JOIN "employee" e ON e."id" = r."employeeId"
          WHERE r."maintenancePlanId" = p."id"
        ),
        ARRAY[]::text[]
      ) AS "responsibleEmployeeIds"
    FROM "maintenancePlan" p
    WHERE p."id" = $1::uuid
      ${accessClause}
    LIMIT 1
    `,
    params,
  );
  return rows[0] ?? null;
}

async function hasOpenWorkOrderForPlan(planId: string): Promise<boolean> {
  const { rows } = await pool.query<{ id: string }>(
    `
    SELECT "id"
    FROM "workOrder"
    WHERE "maintenancePlanId" = $1::uuid
      AND "status" IN ${OPEN_WO_STATUSES}
    LIMIT 1
    `,
    [planId],
  );
  return Boolean(rows[0]);
}

function isPlanDue(plan: MaintenancePlanGenerateRow, now = new Date()): boolean {
  if (plan.status !== "active") return false;
  const due = new Date(plan.nextDueAt);
  if (Number.isNaN(due.getTime())) return false;
  const leadMs = plan.leadTimeDays * 24 * 60 * 60 * 1000;
  return due.getTime() <= now.getTime() + leadMs;
}

export async function generateWorkOrderForPlan(params: {
  planId: string;
  actorUserId: string;
  force?: boolean;
  /** When true, skip open-WO gate (Ausrollen or explicit override). */
  ignoreOpen?: boolean;
  /** When true, skip site-access filter (background job uses plan.updatedBy as actor). */
  systemSweep?: boolean;
}): Promise<GeneratePlanResult> {
  const { planId, force = false, systemSweep = false } = params;
  const plan = await loadPlanForGenerate(planId, systemSweep ? null : params.actorUserId);
  if (!plan) {
    return { planId, status: "skipped", reason: "not_found" };
  }
  if (plan.status !== "active") {
    return { planId, status: "skipped", reason: "not_active" };
  }
  if (!force && !isPlanDue(plan)) {
    return { planId, status: "skipped", reason: "not_due" };
  }
  const ignoreOpen = params.ignoreOpen === true || plan.ignoreOpenWorkOrders === true;
  if (!ignoreOpen && (await hasOpenWorkOrderForPlan(planId))) {
    return { planId, status: "skipped", reason: "open_work_order_exists" };
  }
  if (!plan.responsibleEmployeeIds.length) {
    return { planId, status: "skipped", reason: "no_responsibles" };
  }

  const actorUserId = systemSweep ? plan.updatedBy : params.actorUserId;
  const plannedStart = clampPlannedStartNotBeforeToday(new Date(plan.nextDueAt).toISOString());

  const meta = {
    userId: actorUserId,
    requestId: randomUUID(),
    source: systemSweep ? "maintenance_plan_daily_generate" : "maintenance_plan_generate",
  };

  try {
    const result = await withAuditContext(meta, async (client) => {
      const created = await createWorkOrderRecord(client, actorUserId, {
        name: plan.name,
        description: plan.description,
        assetId: plan.assetId,
        costCenterId: plan.costCenterId,
        plannedStart,
        plannedEnd: null,
        plannedDurationMinutes: plan.plannedDurationMinutes,
        orderType: plan.orderType,
        responsibleEmployeeIds: plan.responsibleEmployeeIds,
        workgroupId: plan.workgroupId,
        classificationId: plan.classificationId,
        originalWo: null,
        maintenancePlanId: plan.id,
        inspectionRoundId: plan.inspectionRoundId,
      });

      const nextDue = advanceNextDueAtPastNow(
        new Date(plan.nextDueAt),
        plan.intervalUnit,
        plan.intervalValue,
      );
      await client.query(
        `
        UPDATE "maintenancePlan"
        SET
          "nextDueAt" = $2::timestamptz,
          "executionCount" = "executionCount" + 1
        WHERE "id" = $1::uuid
        `,
        [plan.id, nextDue.toISOString()],
      );

      const { rows } = await client.query<{ orderNumber: number; siteId: string }>(
        `SELECT "orderNumber", "siteId" FROM "workOrder" WHERE "id" = $1::uuid`,
        [created.id],
      );
      return {
        workOrderId: created.id,
        orderNumber: rows[0]?.orderNumber,
        siteId: rows[0]?.siteId ?? created.siteId,
      };
    });

    scheduleReindex(`workOrder ${result.workOrderId}`, () => reindexWorkOrder(result.workOrderId));

    void getWorkOrderRowForRealtime(result.workOrderId)
      .then((row) => {
        if (!row) return;
        return broadcastWorkOrderCreated(row.siteId, row);
      })
      .catch((err) => {
        console.error("[maintenance-plan-generate] work-order broadcast failed", err);
      });

    return {
      planId,
      status: "created",
      workOrderId: result.workOrderId,
      orderNumber: result.orderNumber,
    };
  } catch (err) {
    const message = (err as Error).message;
    return { planId, status: "skipped", reason: message || "create_failed" };
  }
}

export async function generateDueMaintenancePlans(params: {
  actorUserId: string | null;
  systemSweep?: boolean;
  planId?: string;
  force?: boolean;
}): Promise<GeneratePlanResult[]> {
  const { systemSweep = false, planId, force = false } = params;

  if (planId) {
    const actor = params.actorUserId;
    if (!actor && !systemSweep) {
      return [{ planId, status: "skipped", reason: "unauthorized" }];
    }
    return [
      await generateWorkOrderForPlan({
        planId,
        actorUserId: actor ?? "",
        force,
        systemSweep,
      }),
    ];
  }

  const accessClause =
    !systemSweep && params.actorUserId
      ? `AND ${siteAccessSql('p."siteId"', "$1")}`
      : "";
  const queryParams = !systemSweep && params.actorUserId ? [params.actorUserId] : [];

  const { rows } = await pool.query<{ id: string }>(
    `
    SELECT p."id"
    FROM "maintenancePlan" p
    WHERE p."status" = 'active'
      AND p."nextDueAt" <= now() + make_interval(days => p."leadTimeDays")
      ${accessClause}
    ORDER BY p."nextDueAt" ASC
    `,
    queryParams,
  );

  const results: GeneratePlanResult[] = [];
  for (const row of rows) {
    results.push(
      await generateWorkOrderForPlan({
        planId: row.id,
        actorUserId: params.actorUserId ?? "",
        force: false,
        systemSweep,
      }),
    );
  }
  return results;
}

const ROLLOUT_MAX_ITERATIONS = 500;

export async function rolloutMaintenancePlan(params: {
  planId: string;
  actorUserId: string;
  untilDate: string;
}): Promise<{ created: number; results: GeneratePlanResult[] }> {
  const until = params.untilDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    throw new Error("invalid_until_date");
  }
  const todayKey = calendarDayKey(new Date(), DEFAULT_PLANNING_TIME_ZONE);
  if (until < todayKey) {
    throw new Error("until_date_in_past");
  }

  const results: GeneratePlanResult[] = [];
  let created = 0;

  for (let i = 0; i < ROLLOUT_MAX_ITERATIONS; i++) {
    const plan = await loadPlanForGenerate(params.planId, params.actorUserId);
    if (!plan) {
      results.push({ planId: params.planId, status: "skipped", reason: "not_found" });
      break;
    }
    if (plan.status !== "active") {
      results.push({ planId: params.planId, status: "skipped", reason: "not_active" });
      break;
    }
    const dueKey = calendarDayKey(new Date(plan.nextDueAt), DEFAULT_PLANNING_TIME_ZONE);
    if (dueKey > until) {
      break;
    }

    const result = await generateWorkOrderForPlan({
      planId: params.planId,
      actorUserId: params.actorUserId,
      force: true,
      ignoreOpen: true,
      systemSweep: false,
    });
    results.push(result);
    if (result.status !== "created") {
      break;
    }
    created += 1;
  }

  return { created, results };
}

function zonedParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** UTC ms for local wall time `YYYY-MM-DD` + `HH:mm` in `timeZone`. */
function zonedWallTimeToUtcMs(ymd: string, hm: string, timeZone: string): number {
  const [ys, ms, ds] = ymd.split("-");
  const [hs, mins] = hm.split(":");
  const Y = Number(ys);
  const M = Number(ms);
  const D = Number(ds);
  const h = Number(hs);
  const m = Number(mins);
  let utc = Date.UTC(Y, M - 1, D, h, m, 0);
  for (let i = 0; i < 4; i++) {
    const parts = zonedParts(new Date(utc), timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const wanted = Date.UTC(Y, M - 1, D, h, m, 0);
    const delta = wanted - asUtc;
    if (delta === 0) break;
    utc += delta;
  }
  return utc;
}

function addCalendarDaysYmd(ymd: string, days: number): string {
  const [ys, ms, ds] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(ys!, ms! - 1, ds! + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

async function computeNextDailyGenerateAtMs(now = new Date()): Promise<{ atMs: number; scheduleTime: string }> {
  const scheduleTime = await getGenerateWoFromMpTime(pool);
  const parts = zonedParts(now, DEFAULT_PLANNING_TIME_ZONE);
  const todayYmd = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const [sh, sm] = scheduleTime.split(":").map(Number);
  let ymd = todayYmd;
  if (parts.hour > sh! || (parts.hour === sh && parts.minute >= sm!)) {
    ymd = addCalendarDaysYmd(todayYmd, 1);
  }
  const atMs = zonedWallTimeToUtcMs(ymd, scheduleTime, DEFAULT_PLANNING_TIME_ZONE);
  return { atMs, scheduleTime };
}

let dailyTimer: ReturnType<typeof setTimeout> | null = null;
let dailyStarted = false;
let dailyLastRunAtMs: number | null = null;
let dailyNextRunAtMs: number | null = null;
let dailyScheduleTime = "06:00";

export type MaintenancePlanSweepStatus = {
  enabled: boolean;
  /** @deprecated kept for older clients; always null for daily schedule */
  intervalMs: number | null;
  scheduleTime: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  remainingMs: number | null;
};

export function getMaintenancePlanSweepStatus(): MaintenancePlanSweepStatus {
  const now = Date.now();
  const remainingMs =
    dailyNextRunAtMs === null ? null : Math.max(0, dailyNextRunAtMs - now);
  return {
    enabled: dailyStarted,
    intervalMs: null,
    scheduleTime: dailyScheduleTime,
    lastRunAt: dailyLastRunAtMs === null ? null : new Date(dailyLastRunAtMs).toISOString(),
    nextRunAt: dailyNextRunAtMs === null ? null : new Date(dailyNextRunAtMs).toISOString(),
    remainingMs,
  };
}

async function scheduleNextDailyGenerate(): Promise<void> {
  if (dailyTimer) {
    clearTimeout(dailyTimer);
    dailyTimer = null;
  }
  const { atMs, scheduleTime } = await computeNextDailyGenerateAtMs();
  dailyScheduleTime = scheduleTime;
  dailyNextRunAtMs = atMs;
  const delay = Math.max(1_000, atMs - Date.now());
  dailyTimer = setTimeout(() => {
    void runDailyGenerate();
  }, delay);
}

async function runDailyGenerate(): Promise<void> {
  dailyLastRunAtMs = Date.now();
  try {
    const results = await generateDueMaintenancePlans({ actorUserId: null, systemSweep: true });
    const created = results.filter((r) => r.status === "created").length;
    if (created > 0) {
      console.info(`[maintenance-plan-daily] created ${created} work order(s)`);
    }
  } catch (err) {
    console.error("[maintenance-plan-daily] failed", err);
  } finally {
    await scheduleNextDailyGenerate().catch((err) => {
      console.error("[maintenance-plan-daily] reschedule failed", err);
      dailyTimer = setTimeout(() => {
        void runDailyGenerate();
      }, 60_000);
    });
  }
}

export function rescheduleMaintenancePlanDailyGenerate(): void {
  if (!dailyStarted) return;
  void scheduleNextDailyGenerate().catch((err) => {
    console.error("[maintenance-plan-daily] reschedule failed", err);
  });
}

/** @deprecated use startMaintenancePlanDailyGenerate */
export function startMaintenancePlanSweep(): void {
  startMaintenancePlanDailyGenerate();
}

export function startMaintenancePlanDailyGenerate(): void {
  if (dailyStarted) return;
  dailyStarted = true;
  const bootDelayMs = 5_000;
  dailyNextRunAtMs = Date.now() + bootDelayMs;
  dailyTimer = setTimeout(() => {
    void scheduleNextDailyGenerate().catch((err) => {
      console.error("[maintenance-plan-daily] initial schedule failed", err);
    });
  }, bootDelayMs);
}
