import { addDaysIso } from "./shiftCalendarExpand";
import type { ShiftAssignment } from "./shiftCalendarTypes";

export type ShiftOverviewDayAssignments = {
  date: string;
  assignments: ShiftAssignment[];
};

export type ShiftOverviewAroundDate = {
  prev: ShiftOverviewDayAssignments;
  current: ShiftOverviewDayAssignments;
  next: ShiftOverviewDayAssignments;
};

function assignmentsForShiftOnDate(
  assignments: ShiftAssignment[],
  shiftId: string,
  date: string,
): ShiftAssignment[] {
  return assignments
    .filter((a) => a.shiftId === shiftId && a.assignmentDate === date)
    .slice()
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/** Group assignments for a shift on centerDate ± 1 day (assignment dates). */
export function assignmentsForShiftAroundDate(
  assignments: ShiftAssignment[],
  shiftId: string,
  centerDate: string,
): ShiftOverviewAroundDate {
  const prevDate = addDaysIso(centerDate, -1);
  const nextDate = addDaysIso(centerDate, 1);
  return {
    prev: {
      date: prevDate,
      assignments: assignmentsForShiftOnDate(assignments, shiftId, prevDate),
    },
    current: {
      date: centerDate,
      assignments: assignmentsForShiftOnDate(assignments, shiftId, centerDate),
    },
    next: {
      date: nextDate,
      assignments: assignmentsForShiftOnDate(assignments, shiftId, nextDate),
    },
  };
}
