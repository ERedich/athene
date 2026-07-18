import { randomUUID } from "node:crypto";

import { withAuditContext } from "./auditContext.js";
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
  plannedDurationMinutes: number | null;
  intervalUnit: MaintenanceIntervalUnit;
  intervalValue: number;
  nextDueAt: string;
  leadTimeDays: number;
  status: string;
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
      p."plannedDurationMinutes",
      p."intervalUnit",
      p."intervalValue",
      p."nextDueAt",
      p."leadTimeDays",
      p."status",
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
  /** When true, skip site-access filter (background sweep uses plan.updatedBy as actor). */
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
  if (await hasOpenWorkOrderForPlan(planId)) {
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
    source: systemSweep ? "maintenance_plan_sweep" : "maintenance_plan_generate",
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
        orderType: "maintenance",
        responsibleEmployeeIds: plan.responsibleEmployeeIds,
        workgroupId: plan.workgroupId,
        classificationId: plan.classificationId,
        originalWo: null,
        maintenancePlanId: plan.id,
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

let sweepTimer: ReturnType<typeof setTimeout> | null = null;
let sweepIntervalMs = 15 * 60 * 1000;
let sweepStarted = false;
let sweepLastRunAtMs: number | null = null;
let sweepNextRunAtMs: number | null = null;

export type MaintenancePlanSweepStatus = {
  enabled: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  remainingMs: number | null;
};

export function getMaintenancePlanSweepStatus(): MaintenancePlanSweepStatus {
  const now = Date.now();
  const remainingMs =
    sweepNextRunAtMs === null ? null : Math.max(0, sweepNextRunAtMs - now);
  return {
    enabled: sweepStarted,
    intervalMs: sweepIntervalMs,
    lastRunAt: sweepLastRunAtMs === null ? null : new Date(sweepLastRunAtMs).toISOString(),
    nextRunAt: sweepNextRunAtMs === null ? null : new Date(sweepNextRunAtMs).toISOString(),
    remainingMs,
  };
}

export function startMaintenancePlanSweep(intervalMs = 15 * 60 * 1000): void {
  if (sweepStarted) return;
  sweepStarted = true;
  sweepIntervalMs = intervalMs;

  const run = () => {
    sweepLastRunAtMs = Date.now();
    sweepNextRunAtMs = sweepLastRunAtMs + sweepIntervalMs;
    void generateDueMaintenancePlans({ actorUserId: null, systemSweep: true })
      .then((results) => {
        const created = results.filter((r) => r.status === "created").length;
        if (created > 0) {
          console.info(`[maintenance-plan-sweep] created ${created} work order(s)`);
        }
      })
      .catch((err) => {
        console.error("[maintenance-plan-sweep] failed", err);
      })
      .finally(() => {
        if (sweepTimer) clearTimeout(sweepTimer);
        const delay = Math.max(0, (sweepNextRunAtMs ?? Date.now()) - Date.now());
        sweepTimer = setTimeout(run, delay > 0 ? delay : sweepIntervalMs);
      });
  };

  // Delay first run slightly so server can finish boot
  const firstDelayMs = 30_000;
  sweepNextRunAtMs = Date.now() + firstDelayMs;
  sweepTimer = setTimeout(run, firstDelayMs);
}
