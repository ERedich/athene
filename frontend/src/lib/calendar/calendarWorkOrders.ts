import { apiFetch } from "../api";
import type { WorkOrderFormSource } from "../workOrderForm";
import type { WorkOrderType } from "../workOrderForm";
import type { WorkOrderEditMeta, WorkOrderStatus } from "../workOrderTypes";
import type { CalendarEvent } from "./calendarTypes";

/** Statuses shown in Kalendar — excludes Beendet (ended), Erledigt (done) and Storniert (cancelled). */
export const CALENDAR_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  "open",
  "assigned",
  "started",
  "paused",
  "continued",
];

export type CalendarWorkOrder = {
  id: string;
  orderNumber: number;
  name: string;
  description: string | null;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  assetId: string;
  assetKey: string;
  assetName: string;
  costCenterId: string;
  costCenterKey: string;
  costCenterName: string;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  workgroupId: string | null;
  workgroupKey: string | null;
  workgroupName: string | null;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationMinutes: number | null;
  orderType: WorkOrderType;
  status: WorkOrderStatus;
  responsibleEmployeeIds: string[];
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  currentSegmentStartedAt: string | null;
  documentCount: number;
  assetDocumentCount: number;
  assignedEmployeeCount: number;
  transactionCount: number;
};

export function calendarWorkOrderToEditSource(
  wo: CalendarWorkOrder,
): WorkOrderFormSource & { id: string; meta: WorkOrderEditMeta } {
  return {
    id: wo.id,
    orderNumber: wo.orderNumber,
    name: wo.name,
    description: wo.description,
    assetId: wo.assetId,
    costCenterId: wo.costCenterId,
    plannedStart: wo.plannedStart,
    plannedEnd: wo.plannedEnd,
    plannedDurationMinutes: wo.plannedDurationMinutes,
    orderType: wo.orderType,
    responsibleEmployeeIds: wo.responsibleEmployeeIds ?? [],
    workgroupId: wo.workgroupId,
    classificationId: wo.classificationId,
    meta: {
      status: wo.status,
      orderNumber: wo.orderNumber,
      currentSegmentStartedAt: wo.currentSegmentStartedAt,
      workgroupId: wo.workgroupId,
      siteId: wo.siteId,
      siteKey: wo.siteKey,
      siteName: wo.siteName,
      assetId: wo.assetId,
      assetKey: wo.assetKey,
      assetName: wo.assetName,
      name: wo.name,
      documentCount: wo.documentCount,
      assetDocumentCount: wo.assetDocumentCount,
      transactionCount: wo.transactionCount,
    },
  };
}

export function buildWorkOrderOverlapQuery(rangeStart: Date, rangeEnd: Date): string {
  const params = new URLSearchParams();
  params.set("plannedStartTo", rangeEnd.toISOString());
  params.set("plannedEndFrom", rangeStart.toISOString());
  for (const status of CALENDAR_WORK_ORDER_STATUSES) {
    params.append("status", status);
  }
  return params.toString();
}

export async function fetchCalendarWorkOrders(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<CalendarWorkOrder[]> {
  const qs = buildWorkOrderOverlapQuery(rangeStart, rangeEnd);
  const params = new URLSearchParams(qs);
  // Calendar needs the full overlap window; request the soft-limit max.
  params.set("limit", "2000");
  params.set("offset", "0");
  const res = await apiFetch(`/api/work-orders?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`work_orders_fetch_failed_${res.status}`);
  }
  const data = (await res.json()) as unknown;
  if (Array.isArray(data)) return data as CalendarWorkOrder[];
  if (data && typeof data === "object" && Array.isArray((data as { rows?: unknown }).rows)) {
    return (data as { rows: CalendarWorkOrder[] }).rows;
  }
  return [];
}

export function workOrderToCalendarEvent(wo: CalendarWorkOrder): CalendarEvent {
  const start = new Date(wo.plannedStart);
  let end = wo.plannedEnd ? new Date(wo.plannedEnd) : new Date(start);
  if (end.getTime() < start.getTime()) {
    end = new Date(start);
  }
  return {
    id: wo.id,
    kind: "workOrder",
    title: `#${wo.orderNumber} ${wo.name}`,
    start,
    end,
    laneKey: wo.siteId,
    meta: {
      orderType: wo.orderType,
      siteColorHex: wo.siteColorHex,
      workOrder: wo,
    },
  };
}

export function filterCalendarEventsBySearch(
  events: CalendarEvent[],
  searchTerm: string,
): CalendarEvent[] {
  const q = searchTerm.trim().toLowerCase();
  if (!q) return events;
  return events.filter((ev) => {
    if (ev.title.toLowerCase().includes(q)) return true;
    const wo = ev.meta?.workOrder as CalendarWorkOrder | undefined;
    if (wo) {
      return String(wo.orderNumber).includes(q) || wo.name.toLowerCase().includes(q);
    }
    const plan = ev.meta?.maintenancePlan as
      | { key?: string; name?: string }
      | undefined;
    if (plan) {
      return (
        (plan.key?.toLowerCase().includes(q) ?? false) ||
        (plan.name?.toLowerCase().includes(q) ?? false)
      );
    }
    return false;
  });
}

export function filterCalendarEventsByWorkgroup(
  events: CalendarEvent[],
  workgroupId: string | null,
): CalendarEvent[] {
  if (!workgroupId) return events;
  return events.filter((ev) => {
    const wo = ev.meta?.workOrder as CalendarWorkOrder | undefined;
    return wo?.workgroupId === workgroupId;
  });
}

export function workOrderMatchesWorkgroupFilter(
  workOrder: CalendarWorkOrder,
  workgroupFilterId: string | null,
): boolean {
  if (!workgroupFilterId) return true;
  return workOrder.workgroupId === workgroupFilterId;
}
