/** Shared work-order planning helpers (calendar / Athene). */

export const DEFAULT_PLANNING_TIME_ZONE = "Europe/Berlin";

export type PlanningOrderRow = {
  id: string;
  orderNumber: number;
  name: string;
  assetId: string;
  assetKey?: string;
  plannedStart: string;
  plannedEnd: string | null;
};

export type PlanningConflict = {
  id: string;
  orderNumber: number;
  name: string;
  assetKey?: string;
  plannedStart: string;
  plannedEnd: string | null;
};

export type PlanningSlot = {
  plannedStart: string;
  plannedEnd: string;
  conflictCount: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calendarDayKey(date: Date, timeZone = DEFAULT_PLANNING_TIME_ZONE): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(date);
}

export function startOfCalendarDay(date: Date, timeZone = DEFAULT_PLANNING_TIME_ZONE): Date {
  const key = calendarDayKey(date, timeZone);
  return new Date(`${key}T00:00:00.000Z`);
}

export function isBeforeLocalToday(
  isoStart: string,
  timeZone = DEFAULT_PLANNING_TIME_ZONE,
  now = new Date(),
): boolean {
  const start = new Date(isoStart);
  if (Number.isNaN(start.getTime())) return true;
  return calendarDayKey(start, timeZone) < calendarDayKey(now, timeZone);
}

export function effectivePlannedEnd(plannedStart: string, plannedEnd: string | null): Date {
  const start = new Date(plannedStart);
  if (Number.isNaN(start.getTime())) return new Date(NaN);
  if (plannedEnd) {
    const end = new Date(plannedEnd);
    if (!Number.isNaN(end.getTime()) && end.getTime() >= start.getTime()) return end;
  }
  return new Date(start);
}

export function intervalsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  if (
    Number.isNaN(startA.getTime()) ||
    Number.isNaN(endA.getTime()) ||
    Number.isNaN(startB.getTime()) ||
    Number.isNaN(endB.getTime())
  ) {
    return false;
  }
  return startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime();
}

export function getAssetPlanningConflicts(
  orders: PlanningOrderRow[],
  assetId: string,
  proposedStart: Date,
  proposedEnd: Date,
  excludeWorkOrderId?: string | Iterable<string>,
): PlanningConflict[] {
  const excludeSet =
    excludeWorkOrderId === undefined
      ? null
      : typeof excludeWorkOrderId === "string"
        ? new Set([excludeWorkOrderId])
        : new Set(excludeWorkOrderId);
  const conflicts: PlanningConflict[] = [];
  for (const order of orders) {
    if (order.assetId !== assetId) continue;
    if (excludeSet?.has(order.id)) continue;
    const start = new Date(order.plannedStart);
    const end = effectivePlannedEnd(order.plannedStart, order.plannedEnd);
    if (intervalsOverlap(proposedStart, proposedEnd, start, end)) {
      conflicts.push({
        id: order.id,
        orderNumber: order.orderNumber,
        name: order.name,
        assetKey: order.assetKey,
        plannedStart: order.plannedStart,
        plannedEnd: order.plannedEnd,
      });
    }
  }
  return conflicts;
}

export function computePlannedDurationMinutes(plannedStart: Date, plannedEnd: Date): number {
  return Math.max(0, Math.round((plannedEnd.getTime() - plannedStart.getTime()) / 60_000));
}

export function shiftPlannedRangeByDays(
  plannedStartIso: string,
  plannedEndIso: string | null,
  deltaDays: number,
): { plannedStart: Date; plannedEnd: Date } | null {
  return shiftPlannedRangeByDeltaMs(plannedStartIso, plannedEndIso, deltaDays * MS_PER_DAY);
}

export function shiftPlannedRangeByDeltaMs(
  plannedStartIso: string,
  plannedEndIso: string | null,
  deltaMs: number,
): { plannedStart: Date; plannedEnd: Date } | null {
  const oldStart = new Date(plannedStartIso);
  let oldEnd = plannedEndIso ? new Date(plannedEndIso) : new Date(oldStart);
  if (Number.isNaN(oldStart.getTime())) return null;
  if (Number.isNaN(oldEnd.getTime())) oldEnd = new Date(oldStart);

  return {
    plannedStart: new Date(oldStart.getTime() + deltaMs),
    plannedEnd: new Date(oldEnd.getTime() + deltaMs),
  };
}

/** ISO week (Mon–Sun), Monday-based — matches frontend Kalendar. */
export function getIsoWeekRange(isoWeekYear: number, isoWeek: number): {
  rangeStart: Date;
  rangeEnd: Date;
} {
  const jan4 = new Date(isoWeekYear, 0, 4);
  jan4.setHours(0, 0, 0, 0);
  const day = jan4.getDay();
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setDate(jan4.getDate() - ((day + 6) % 7));
  const weekStart = new Date(mondayWeek1);
  weekStart.setDate(mondayWeek1.getDate() + (isoWeek - 1) * 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { rangeStart: weekStart, rangeEnd: weekEnd };
}

export type ShiftedPlanningAssignment = {
  id: string;
  orderNumber: number;
  name: string;
  assetId: string;
  assetKey?: string;
  oldPlannedStart: string;
  oldPlannedEnd: string | null;
  plannedStart: string;
  plannedEnd: string;
  beforeToday: boolean;
  assetConflictCount: number;
  assetConflicts: PlanningConflict[];
};

/** Detect same-asset overlaps with orders outside the moving batch (warnings, not blockers). */
export function attachAssetConflictsToShiftAssignments(
  assignments: Array<
    Pick<
      ShiftedPlanningAssignment,
      "id" | "orderNumber" | "assetId" | "assetKey" | "plannedStart" | "plannedEnd"
    >
  >,
  occupiedOrders: PlanningOrderRow[],
): ShiftedPlanningAssignment[] {
  const movingIds = new Set(assignments.map((a) => a.id));
  return assignments.map((row) => {
    const proposedStart = new Date(row.plannedStart);
    const proposedEnd = effectivePlannedEnd(row.plannedStart, row.plannedEnd);
    const assetConflicts = getAssetPlanningConflicts(
      occupiedOrders,
      row.assetId,
      proposedStart,
      proposedEnd,
      movingIds,
    );
    return {
      ...row,
      assetConflictCount: assetConflicts.length,
      assetConflicts,
    } as ShiftedPlanningAssignment;
  });
}

export function computePlanningWindowShiftDeltaMs(
  sourceRangeStart: Date,
  targetRangeStart: Date,
  timeZone = DEFAULT_PLANNING_TIME_ZONE,
): number {
  return (
    startOfCalendarDay(targetRangeStart, timeZone).getTime() -
    startOfCalendarDay(sourceRangeStart, timeZone).getTime()
  );
}

export function findFreePlanningSlots(params: {
  assetId: string;
  durationMs: number;
  rangeStart: Date;
  rangeEnd: Date;
  occupiedOrders: PlanningOrderRow[];
  excludeWorkOrderId?: string;
  anchorPlannedStart?: Date;
  anchorPlannedEnd?: Date | null;
  maxSlots?: number;
  timeZone?: string;
}): PlanningSlot[] {
  const {
    assetId,
    durationMs,
    rangeStart,
    rangeEnd,
    occupiedOrders,
    excludeWorkOrderId,
    maxSlots = 5,
    timeZone = DEFAULT_PLANNING_TIME_ZONE,
  } = params;

  if (durationMs < 0 || Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    return [];
  }

  const anchorStart = params.anchorPlannedStart ?? rangeStart;
  const anchorEnd =
    params.anchorPlannedEnd !== undefined && params.anchorPlannedEnd !== null
      ? params.anchorPlannedEnd
      : new Date(anchorStart.getTime() + durationMs);

  const anchorDurationMs = Math.max(durationMs, anchorEnd.getTime() - anchorStart.getTime());

  const rangeStartDay = startOfCalendarDay(rangeStart, timeZone).getTime();
  const rangeEndDay = startOfCalendarDay(rangeEnd, timeZone).getTime();
  const anchorDay = startOfCalendarDay(anchorStart, timeZone).getTime();

  const slots: PlanningSlot[] = [];
  const seen = new Set<string>();

  const tryCandidate = (plannedStart: Date, plannedEnd: Date) => {
    if (slots.length >= maxSlots) return;
    if (plannedStart.getTime() > rangeEnd.getTime()) return;
    if (plannedEnd.getTime() < rangeStart.getTime()) return;
    if (isBeforeLocalToday(plannedStart.toISOString(), timeZone)) return;

    const key = plannedStart.toISOString();
    if (seen.has(key)) return;
    seen.add(key);

    const conflicts = getAssetPlanningConflicts(
      occupiedOrders,
      assetId,
      plannedStart,
      plannedEnd,
      excludeWorkOrderId,
    );
    if (conflicts.length > 0) return;

    slots.push({
      plannedStart: plannedStart.toISOString(),
      plannedEnd: plannedEnd.toISOString(),
      conflictCount: 0,
    });
  };

  const minDayOffset = Math.floor((rangeStartDay - anchorDay) / MS_PER_DAY);
  const maxDayOffset = Math.ceil((rangeEndDay - anchorDay) / MS_PER_DAY);

  for (let delta = minDayOffset; delta <= maxDayOffset; delta += 1) {
    const shifted = shiftPlannedRangeByDays(
      anchorStart.toISOString(),
      anchorEnd.toISOString(),
      delta,
    );
    if (!shifted) continue;
    const plannedEnd =
      durationMs === anchorDurationMs
        ? shifted.plannedEnd
        : new Date(shifted.plannedStart.getTime() + durationMs);
    tryCandidate(shifted.plannedStart, plannedEnd);
  }

  return slots;
}

export type OrderToPlanSequentially = {
  id: string;
  orderNumber: number;
  name: string;
  durationMs: number;
  plannedStart: string;
  plannedEnd: string | null;
};

export type SequentialPlannedAssignment = {
  id: string;
  orderNumber: number;
  name: string;
  plannedStart: string;
  plannedEnd: string;
  durationMinutes: number;
};

type TimeInterval = { start: Date; end: Date };

function toOccupiedIntervals(
  orders: PlanningOrderRow[],
  assetId: string,
  excludeIds: Set<string>,
): TimeInterval[] {
  const intervals: TimeInterval[] = [];
  for (const order of orders) {
    if (order.assetId !== assetId) continue;
    if (excludeIds.has(order.id)) continue;
    const start = new Date(order.plannedStart);
    const end = effectivePlannedEnd(order.plannedStart, order.plannedEnd);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      intervals.push({ start, end });
    }
  }
  return intervals;
}

function overlapsAny(interval: TimeInterval, occupancy: TimeInterval[]): boolean {
  return occupancy.some((block) =>
    intervalsOverlap(interval.start, interval.end, block.start, block.end),
  );
}

function latestOverlapEnd(interval: TimeInterval, occupancy: TimeInterval[]): Date {
  let latest = interval.start;
  for (const block of occupancy) {
    if (intervalsOverlap(interval.start, interval.end, block.start, block.end)) {
      if (block.end.getTime() > latest.getTime()) latest = block.end;
    }
  }
  return latest;
}

function applyTimeOfDay(baseDay: Date, timeSource: Date): Date {
  const result = new Date(baseDay);
  result.setUTCHours(
    timeSource.getUTCHours(),
    timeSource.getUTCMinutes(),
    timeSource.getUTCSeconds(),
    timeSource.getUTCMilliseconds(),
  );
  return result;
}

function findEarliestSequentialSlot(
  cursor: Date,
  durationMs: number,
  rangeEnd: Date,
  occupancy: TimeInterval[],
  timeZone = DEFAULT_PLANNING_TIME_ZONE,
  timeOfDaySource?: Date,
): TimeInterval | null {
  let start = new Date(cursor);
  if (timeOfDaySource) {
    start = applyTimeOfDay(startOfCalendarDay(start, timeZone), timeOfDaySource);
    if (start.getTime() < cursor.getTime()) {
      start = new Date(start.getTime() + MS_PER_DAY);
    }
  }

  const guardLimit = 500;
  for (let guard = 0; guard < guardLimit; guard += 1) {
    if (start.getTime() + durationMs > rangeEnd.getTime()) return null;
    if (isBeforeLocalToday(start.toISOString(), timeZone)) {
      const nextDay = new Date(startOfCalendarDay(start, timeZone).getTime() + MS_PER_DAY);
      start = timeOfDaySource ? applyTimeOfDay(new Date(nextDay), timeOfDaySource) : new Date(nextDay);
      continue;
    }
    const end = new Date(start.getTime() + durationMs);
    const candidate = { start, end };
    if (!overlapsAny(candidate, occupancy)) return candidate;
    const next = latestOverlapEnd(candidate, occupancy);
    start = new Date(Math.max(next.getTime(), start.getTime() + 60_000));
  }
  return null;
}

/** Pack multiple work orders on the same asset back-to-back without overlaps. */
export function planSequentialWorkOrderSlots(params: {
  assetId: string;
  orders: OrderToPlanSequentially[];
  rangeStart: Date;
  rangeEnd: Date;
  occupiedOrders: PlanningOrderRow[];
  timeZone?: string;
  preserveTimeOfDayFromFirst?: boolean;
}): {
  ok: true;
  assignments: SequentialPlannedAssignment[];
} | {
  ok: false;
  error: "cannot_fit_all" | "empty_orders";
  planned: SequentialPlannedAssignment[];
  unplannedOrderNumbers: number[];
} {
  const { assetId, orders, rangeStart, rangeEnd, occupiedOrders, timeZone = DEFAULT_PLANNING_TIME_ZONE } =
    params;
  if (orders.length === 0) {
    return { ok: false, error: "empty_orders", planned: [], unplannedOrderNumbers: [] };
  }

  const movingIds = new Set(orders.map((o) => o.id));
  const occupancy = toOccupiedIntervals(occupiedOrders, assetId, movingIds);
  const timeOfDaySource = params.preserveTimeOfDayFromFirst
    ? new Date(orders[0].plannedStart)
    : undefined;

  const todayStart = startOfCalendarDay(new Date(), timeZone);
  let cursor = new Date(Math.max(rangeStart.getTime(), todayStart.getTime()));
  if (timeOfDaySource) {
    cursor = applyTimeOfDay(startOfCalendarDay(cursor, timeZone), timeOfDaySource);
    if (cursor.getTime() < todayStart.getTime()) {
      cursor = new Date(cursor.getTime() + MS_PER_DAY);
    }
  }

  const assignments: SequentialPlannedAssignment[] = [];
  const unplannedOrderNumbers: number[] = [];

  for (const order of orders) {
    const slot = findEarliestSequentialSlot(
      cursor,
      order.durationMs,
      rangeEnd,
      occupancy,
      timeZone,
      timeOfDaySource,
    );
    if (!slot) {
      unplannedOrderNumbers.push(order.orderNumber);
      continue;
    }
    occupancy.push(slot);
    cursor = new Date(slot.end);
    assignments.push({
      id: order.id,
      orderNumber: order.orderNumber,
      name: order.name,
      plannedStart: slot.start.toISOString(),
      plannedEnd: slot.end.toISOString(),
      durationMinutes: Math.round(order.durationMs / 60_000),
    });
  }

  if (assignments.length !== orders.length) {
    return { ok: false, error: "cannot_fit_all", planned: assignments, unplannedOrderNumbers };
  }
  return { ok: true, assignments };
}

export function validateBatchPlanningAssignments(
  assetId: string,
  assignments: Array<{ id: string; plannedStart: string; plannedEnd: string }>,
  occupiedOrders: PlanningOrderRow[],
): { valid: true } | { valid: false; conflicts: PlanningConflict[] } {
  const movingIds = new Set(assignments.map((a) => a.id));
  const external = toOccupiedIntervals(occupiedOrders, assetId, movingIds);
  const internal: TimeInterval[] = [];

  for (const assignment of assignments) {
    const start = new Date(assignment.plannedStart);
    const end = new Date(assignment.plannedEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { valid: false, conflicts: [] };
    }
    if (isBeforeLocalToday(assignment.plannedStart)) {
      return { valid: false, conflicts: [] };
    }
    const candidate = { start, end };
    if (overlapsAny(candidate, external) || overlapsAny(candidate, internal)) {
      const conflicts = getAssetPlanningConflicts(
        occupiedOrders,
        assetId,
        start,
        end,
        movingIds,
      );
      return { valid: false, conflicts };
    }
    internal.push(candidate);
  }
  return { valid: true };
}
