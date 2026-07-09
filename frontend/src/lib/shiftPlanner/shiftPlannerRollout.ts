import { addDaysIso, weekdayKeyForDate } from "./shiftCalendarExpand";
import type { ShiftWeekdayKey } from "./shiftCalendarTypes";
import { assignmentDateForBlock } from "./shiftBlockWindow";

export { assignmentDateForBlock };

export function enumerateShiftAssignmentDates(
  fromDate: string,
  toDate: string,
  weekdays: ShiftWeekdayKey[],
): string[] {
  const weekdaySet = new Set<string>(weekdays);
  const dates: string[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    if (weekdaySet.has(weekdayKeyForDate(cursor))) {
      dates.push(cursor);
    }
    cursor = addDaysIso(cursor, 1);
  }
  return dates;
}

export function countRolloutDays(
  fromDate: string,
  toDate: string,
  weekdays: ShiftWeekdayKey[],
): number {
  return enumerateShiftAssignmentDates(fromDate, toDate, weekdays).length;
}
