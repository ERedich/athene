import { apiFetch } from "../api";
import type { CalendarEvent } from "./calendarTypes";

const DEFAULT_PLAN_DURATION_MINUTES = 60;

export type CalendarMaintenancePlan = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  assetId: string;
  assetKey: string;
  assetName: string;
  workgroupId: string;
  workgroupKey: string;
  workgroupName: string;
  plannedDurationMinutes: number | null;
  nextDueAt: string;
  status: "active" | "paused" | "ended";
};

export async function fetchCalendarMaintenancePlans(): Promise<CalendarMaintenancePlan[]> {
  const res = await apiFetch("/api/maintenance-plans");
  if (!res.ok) {
    throw new Error(`maintenance_plans_fetch_failed_${res.status}`);
  }
  return (await res.json()) as CalendarMaintenancePlan[];
}

export function filterPlansForCalendarRange(
  plans: CalendarMaintenancePlan[],
  rangeStart: Date,
  rangeEnd: Date,
): CalendarMaintenancePlan[] {
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  return plans.filter((plan) => {
    if (plan.status !== "active") return false;
    const dueMs = new Date(plan.nextDueAt).getTime();
    if (Number.isNaN(dueMs)) return false;
    return dueMs >= startMs && dueMs <= endMs;
  });
}

export function maintenancePlanToCalendarEvent(plan: CalendarMaintenancePlan): CalendarEvent {
  const start = new Date(plan.nextDueAt);
  const durationMinutes =
    plan.plannedDurationMinutes != null && plan.plannedDurationMinutes > 0
      ? plan.plannedDurationMinutes
      : DEFAULT_PLAN_DURATION_MINUTES;
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return {
    id: `mp:${plan.id}`,
    kind: "maintenancePlan",
    title: `${plan.key} ${plan.name}`,
    start,
    end,
    laneKey: plan.siteId,
    meta: {
      orderType: "maintenancePlan",
      siteColorHex: plan.siteColorHex,
      maintenancePlan: plan,
    },
  };
}

export function maintenancePlanMatchesWorkgroupFilter(
  plan: CalendarMaintenancePlan,
  workgroupFilterId: string | null,
): boolean {
  if (!workgroupFilterId) return true;
  return plan.workgroupId === workgroupFilterId;
}
