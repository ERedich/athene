import { apiFetch } from "../api";
import type { ShiftAssignment, ShiftCalendarBlock } from "./shiftCalendarTypes";
import { shiftBlockQueryParams } from "./shiftBlockWindow";

export type ShiftKpiWorkOrder = {
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
};

export type ShiftKpiWorkgroup = {
  id: string;
  key: string;
  name: string;
  orderCount?: number;
  employeeCount?: number;
};

export type ShiftBlockKpis = {
  window: { start: string; end: string };
  workOrders: ShiftKpiWorkOrder[];
  totalPlannedDurationMinutes: number;
  requestedWorkgroups: ShiftKpiWorkgroup[];
  availableWorkgroups: ShiftKpiWorkgroup[];
  employeesWithoutWorkgroupCount: number;
};

export type ShiftRolloutResult = {
  created: number;
  updated: number;
  skipped: number;
  dates: string[];
};

export class ShiftPlannerApiError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "ShiftPlannerApiError";
    this.code = code;
  }
}

async function readErrorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return typeof body.error === "string" ? body.error : "unknown";
  } catch {
    return "unknown";
  }
}

export async function fetchShiftAssignments(weekStart: string): Promise<ShiftAssignment[]> {
  const res = await apiFetch(
    `/api/shift-planner/assignments?weekStart=${encodeURIComponent(weekStart)}`,
  );
  if (!res.ok) throw new ShiftPlannerApiError(await readErrorCode(res));
  return res.json() as Promise<ShiftAssignment[]>;
}

export async function assignEmployeeToShift(body: {
  employeeId: string;
  shiftId: string;
  assignmentDate: string;
}): Promise<ShiftAssignment> {
  const res = await apiFetch("/api/shift-planner/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ShiftPlannerApiError(await readErrorCode(res));
  return res.json() as Promise<ShiftAssignment>;
}

export async function deleteShiftAssignment(id: string): Promise<void> {
  const res = await apiFetch(`/api/shift-planner/assignments/${id}`, { method: "DELETE" });
  if (!res.ok) throw new ShiftPlannerApiError(await readErrorCode(res));
}

export async function fetchShiftBlockKpis(block: ShiftCalendarBlock): Promise<ShiftBlockKpis> {
  const qs = shiftBlockQueryParams(block);
  const res = await apiFetch(`/api/shift-planner/shift-kpis?${qs}`);
  if (!res.ok) throw new ShiftPlannerApiError(await readErrorCode(res));
  return res.json() as Promise<ShiftBlockKpis>;
}

export async function rolloutEmployeeToShift(body: {
  employeeId: string;
  shiftId: string;
  fromDate: string;
  toDate: string;
}): Promise<ShiftRolloutResult> {
  const res = await apiFetch("/api/shift-planner/assignments/rollout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ShiftPlannerApiError(await readErrorCode(res));
  return res.json() as Promise<ShiftRolloutResult>;
}
