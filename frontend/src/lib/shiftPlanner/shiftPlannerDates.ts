import { isBeforeToday } from "../calendar/calendarMove";

export function canAssignEmployeeOnDate(isoDate: string): boolean {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  return !isBeforeToday(date);
}
