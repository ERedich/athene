import { addDays, formatIsoDate, startOfDay } from "./calendar/calendarDates";

export type ShiftWindowHint = {
  date: string;
  startTime: string;
  endTime: string;
  segmentKind?: "full" | "evening" | "morning";
};

export type AssignmentWindow = {
  assignedFrom: Date;
  assignedTo: Date;
};

function parseHm(value: string): { h: number; m: number } {
  const parts = value.split(":");
  const h = Number.parseInt(parts[0] ?? "0", 10);
  const m = Number.parseInt(parts[1] ?? "0", 10);
  return {
    h: Number.isFinite(h) ? h : 0,
    m: Number.isFinite(m) ? m : 0,
  };
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatIsoDate(d);
}

function atLocal(isoDate: string, hm: string): Date {
  const { h, m } = parseHm(hm);
  const d = new Date(`${isoDate}T12:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function shiftHintToRange(hint: ShiftWindowHint): AssignmentWindow {
  if (hint.segmentKind === "evening") {
    return {
      assignedFrom: atLocal(hint.date, hint.startTime),
      assignedTo: atLocal(addDaysIso(hint.date, 1), "00:00"),
    };
  }
  if (hint.segmentKind === "morning") {
    return {
      assignedFrom: atLocal(hint.date, "00:00"),
      assignedTo: atLocal(hint.date, hint.endTime),
    };
  }
  const assignedFrom = atLocal(hint.date, hint.startTime);
  const sameDayEnd = atLocal(hint.date, hint.endTime);
  if (sameDayEnd.getTime() <= assignedFrom.getTime()) {
    return {
      assignedFrom,
      assignedTo: atLocal(addDaysIso(hint.date, 1), hint.endTime),
    };
  }
  return { assignedFrom, assignedTo: sameDayEnd };
}

export function intersectAssignmentWindows(
  a: AssignmentWindow,
  b: AssignmentWindow,
): AssignmentWindow | null {
  const startMs = Math.max(a.assignedFrom.getTime(), b.assignedFrom.getTime());
  const endMs = Math.min(a.assignedTo.getTime(), b.assignedTo.getTime());
  if (endMs <= startMs) return null;
  return { assignedFrom: new Date(startMs), assignedTo: new Date(endMs) };
}

export function dayWindow(dayIso: string): AssignmentWindow {
  const dayStart = startOfDay(new Date(`${dayIso}T12:00:00`));
  return {
    assignedFrom: dayStart,
    assignedTo: addDays(dayStart, 1),
  };
}

export function defaultAssignmentWindow(
  orderPlannedStart: Date | string,
  orderPlannedEnd: Date | string,
  dayIso: string,
  shift?: ShiftWindowHint | null,
): AssignmentWindow | null {
  const order: AssignmentWindow = {
    assignedFrom: asDate(orderPlannedStart),
    assignedTo: asDate(orderPlannedEnd),
  };
  if (Number.isNaN(order.assignedFrom.getTime()) || Number.isNaN(order.assignedTo.getTime())) {
    return null;
  }
  let window = intersectAssignmentWindows(order, dayWindow(dayIso));
  if (!window) return null;
  if (shift) {
    const withShift = intersectAssignmentWindows(window, shiftHintToRange(shift));
    if (withShift) window = withShift;
  }
  return window;
}

export function assignmentWindowIsValid(
  assignedFrom: Date,
  assignedTo: Date,
  orderStart: Date | string,
  orderEnd: Date | string,
): boolean {
  const start = asDate(orderStart);
  const end = asDate(orderEnd);
  return (
    assignedTo.getTime() > assignedFrom.getTime() &&
    assignedFrom.getTime() >= start.getTime() &&
    assignedTo.getTime() <= end.getTime()
  );
}

export function isoDateFromWeekClientX(
  weekStart: Date,
  clientX: number,
  layer: HTMLElement,
): string {
  const rect = layer.getBoundingClientRect();
  const ratio = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
  const index = Math.min(6, Math.max(0, Math.floor(ratio * 7)));
  return formatIsoDate(addDays(weekStart, index));
}
