export type ShiftAssignment = {
  id: string;
  employeeId: string;
  employeeKey: string;
  employeeName: string;
  shiftId: string;
  assignmentDate: string;
};

export type PlanningEmployee = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  isShiftPlanning: boolean;
  hasPhoto?: boolean;
};

export type ShiftCalendarBlock = {
  id: string;
  date: string;
  shiftId: string;
  shiftKey: string;
  shiftName: string;
  shortCode: string;
  colorHex: string;
  startTime: string;
  endTime: string;
  assignments: ShiftAssignment[];
  continuesBefore?: boolean;
  continuesAfter?: boolean;
  segmentKind?: "full" | "evening" | "morning";
};

export const SHIFT_WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const JS_DAY_TO_WEEKDAY_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type ShiftWeekdayKey = (typeof SHIFT_WEEKDAY_KEYS)[number];

export type ShiftMasterRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  shortCode: string;
  colorHex: string;
  startTime: string;
  endTime: string;
  breakHours: string | number;
  weekdays: ShiftWeekdayKey[];
  isActive: boolean;
};
