import { startOfDay } from "./calendarDates";
import type { CalendarWorkOrder } from "./calendarWorkOrders";
import type { WorkOrderPlanningConflictCheck } from "../workOrderApi";

export const CALENDAR_DRAG_MIME = "application/x-athene-work-order-id";

export type PendingCalendarMove = {
  workOrder: CalendarWorkOrder;
  targetDay: Date;
  oldStart: Date;
  oldEnd: Date;
  newStart: Date;
  newEnd: Date;
  planningConflict?: WorkOrderPlanningConflictCheck | null;
};

export type ShiftPlannedRangeResult = {
  oldStart: Date;
  oldEnd: Date;
  newStart: Date;
  newEnd: Date;
  deltaDays: number;
};

export function startOfToday(): Date {
  return startOfDay(new Date());
}

export function isBeforeToday(date: Date): boolean {
  return startOfDay(date).getTime() < startOfToday().getTime();
}

export function isValidMoveTarget(targetDay: Date): boolean {
  return !isBeforeToday(targetDay);
}

export function shiftWorkOrderPlannedRange(
  plannedStartIso: string,
  plannedEndIso: string,
  targetDay: Date,
): ShiftPlannedRangeResult | null {
  const oldStart = new Date(plannedStartIso);
  let oldEnd = plannedEndIso ? new Date(plannedEndIso) : new Date(oldStart);
  if (Number.isNaN(oldStart.getTime())) return null;
  if (Number.isNaN(oldEnd.getTime())) oldEnd = new Date(oldStart);

  const deltaMs = startOfDay(targetDay).getTime() - startOfDay(oldStart).getTime();
  const deltaDays = Math.round(deltaMs / (24 * 60 * 60 * 1000));
  if (deltaDays === 0) return null;

  const newStart = new Date(oldStart.getTime() + deltaMs);
  const newEnd = new Date(oldEnd.getTime() + deltaMs);

  return { oldStart, oldEnd, newStart, newEnd, deltaDays };
}

export function buildPendingMove(
  workOrder: CalendarWorkOrder,
  targetDay: Date,
): PendingCalendarMove | null {
  if (!isValidMoveTarget(targetDay)) return null;
  const shifted = shiftWorkOrderPlannedRange(
    workOrder.plannedStart,
    workOrder.plannedEnd,
    targetDay,
  );
  if (!shifted) return null;
  return {
    workOrder,
    targetDay,
    oldStart: shifted.oldStart,
    oldEnd: shifted.oldEnd,
    newStart: shifted.newStart,
    newEnd: shifted.newEnd,
  };
}
