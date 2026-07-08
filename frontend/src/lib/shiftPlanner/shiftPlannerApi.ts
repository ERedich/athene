import { apiFetch } from "../api";
import type { ShiftAssignment } from "./shiftCalendarTypes";

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
