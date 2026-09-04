import { apiFetch } from "./api";
import type { WorkOrder, WorkOrderAssignment } from "./workOrderTypes";

export type WorkOrderPlanningConflict = {
  id: string;
  orderNumber: number;
  name: string;
  assetKey?: string;
  plannedStart: string;
  plannedEnd: string | null;
};

export type WorkOrderPlanningConflictCheck = {
  assetId: string;
  assetKey: string;
  assetName: string;
  conflicts: WorkOrderPlanningConflict[];
  sameDayConflict: boolean;
};

export class WorkOrderAssetConflictError extends Error {
  readonly code = "asset_conflict" as const;
  readonly assetKey: string;
  readonly assetName: string;
  readonly conflicts: WorkOrderPlanningConflict[];
  readonly sameDayConflict: boolean;

  constructor(payload: {
    assetKey: string;
    assetName: string;
    conflicts: WorkOrderPlanningConflict[];
    sameDayConflict?: boolean;
  }) {
    super("asset_conflict");
    this.assetKey = payload.assetKey;
    this.assetName = payload.assetName;
    this.conflicts = payload.conflicts;
    this.sameDayConflict = payload.sameDayConflict ?? true;
  }
}

export type WorkOrderPutBody = {
  name: string;
  description: string | null;
  assetId: string;
  costCenterId: string;
  plannedStart: string;
  plannedEnd: string | null;
  plannedDurationMinutes: number | null;
  orderType: WorkOrder["orderType"];
  responsibleEmployeeIds: string[];
  workgroupId: string;
  classificationId: string | null;
  allowAssetOverlap?: boolean;
};

export type WorkOrderPutPatch = {
  plannedStart: string;
  plannedEnd: string | null;
  plannedDurationMinutes?: number | null;
};

export type WorkOrderPutOptions = {
  allowAssetOverlap?: boolean;
};

export function buildWorkOrderPutBody(
  order: WorkOrder,
  patch?: WorkOrderPutPatch,
  options?: WorkOrderPutOptions,
): WorkOrderPutBody {
  return {
    name: order.name,
    description: order.description,
    assetId: order.assetId,
    costCenterId: order.costCenterId,
    plannedStart: patch?.plannedStart ?? order.plannedStart,
    plannedEnd: patch?.plannedEnd !== undefined ? patch.plannedEnd : order.plannedEnd,
    plannedDurationMinutes:
      patch?.plannedDurationMinutes !== undefined
        ? patch.plannedDurationMinutes
        : order.plannedDurationMinutes,
    orderType: order.orderType,
    responsibleEmployeeIds: order.responsibleEmployeeIds ?? [],
    workgroupId: order.workgroupId ?? "",
    classificationId: order.classificationId,
    ...(options?.allowAssetOverlap ? { allowAssetOverlap: true } : {}),
  };
}

export async function fetchWorkOrderById(id: string): Promise<WorkOrder | null> {
  const res = await apiFetch(`/api/work-orders/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`work_order_fetch_failed_${res.status}`);
  return (await res.json()) as WorkOrder;
}

export async function fetchWorkOrderByOrderNumber(orderNumber: number): Promise<WorkOrder | null> {
  const params = new URLSearchParams();
  params.set("orderNumberFrom", String(orderNumber));
  params.set("orderNumberTo", String(orderNumber));
  params.set("limit", "5");
  params.set("offset", "0");
  const res = await apiFetch(`/api/work-orders?${params.toString()}`);
  if (!res.ok) throw new Error(`work_order_fetch_failed_${res.status}`);
  const data = (await res.json()) as unknown;
  const rows = Array.isArray(data)
    ? (data as WorkOrder[])
    : data && typeof data === "object" && Array.isArray((data as { rows?: unknown }).rows)
      ? ((data as { rows: WorkOrder[] }).rows)
      : [];
  return rows.find((row) => row.orderNumber === orderNumber) ?? rows[0] ?? null;
}

export async function fetchWorkOrderPlanningConflicts(
  workOrderId: string,
  plannedStart: string,
  plannedEnd: string | null,
): Promise<WorkOrderPlanningConflictCheck> {
  const params = new URLSearchParams();
  params.set("plannedStart", plannedStart);
  if (plannedEnd) params.set("plannedEnd", plannedEnd);
  const res = await apiFetch(
    `/api/work-orders/${encodeURIComponent(workOrderId)}/planning-conflicts?${params.toString()}`,
  );
  if (!res.ok) throw new Error(`planning_conflicts_failed_${res.status}`);
  return (await res.json()) as WorkOrderPlanningConflictCheck;
}

export async function putWorkOrder(
  order: WorkOrder,
  patch?: WorkOrderPutPatch,
  options?: WorkOrderPutOptions,
): Promise<WorkOrder> {
  const body = buildWorkOrderPutBody(order, patch, options);
  const res = await apiFetch(`/api/work-orders/${encodeURIComponent(order.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    const data = (await res.json()) as {
      error?: string;
      assetKey?: string;
      assetName?: string;
      conflicts?: WorkOrderPlanningConflict[];
      sameDayConflict?: boolean;
    };
    if (data.error === "asset_conflict" && data.conflicts) {
      throw new WorkOrderAssetConflictError({
        assetKey: data.assetKey ?? "",
        assetName: data.assetName ?? "",
        conflicts: data.conflicts,
        sameDayConflict: data.sameDayConflict,
      });
    }
  }
  if (!res.ok) throw new Error(`work_order_put_failed_${res.status}`);
  return (await res.json()) as WorkOrder;
}

export type WorkOrderAssignmentError =
  | "assignment_locked_by_status"
  | "employee_not_in_workgroup"
  | "employee_site_mismatch"
  | "invalid_employee"
  | "invalid_assignment_window"
  | "assignment_window_outside_order"
  | "unknown";

const ASSIGNMENT_ERROR_CODES: WorkOrderAssignmentError[] = [
  "assignment_locked_by_status",
  "employee_not_in_workgroup",
  "employee_site_mismatch",
  "invalid_employee",
  "invalid_assignment_window",
  "assignment_window_outside_order",
];

export async function postWorkOrderAssignment(
  orderId: string,
  employeeId: string,
  assignedFrom: string,
  assignedTo: string,
): Promise<{ ok: true } | { ok: false; error: WorkOrderAssignmentError }> {
  const res = await apiFetch(`/api/work-orders/${encodeURIComponent(orderId)}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId, assignedFrom, assignedTo }),
  });
  if (res.ok) return { ok: true };
  let code: string | undefined;
  try {
    code = ((await res.json()) as { error?: string }).error;
  } catch {
    /* ignore */
  }
  if (code && (ASSIGNMENT_ERROR_CODES as string[]).includes(code)) {
    return { ok: false, error: code as WorkOrderAssignmentError };
  }
  return { ok: false, error: "unknown" };
}

export async function fetchWorkOrderAssignmentsForRange(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<WorkOrderAssignment[]> {
  const params = new URLSearchParams();
  params.set("plannedStartTo", rangeEnd.toISOString());
  params.set("plannedEndFrom", rangeStart.toISOString());
  const res = await apiFetch(`/api/work-orders/assignments?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`work_order_assignments_fetch_failed_${res.status}`);
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as WorkOrderAssignment[]) : [];
}
