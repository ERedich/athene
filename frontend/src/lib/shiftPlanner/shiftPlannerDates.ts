/** Must match backend `DEFAULT_PLANNING_TIME_ZONE` in workOrderScheduling.ts */
export const PLANNING_TIME_ZONE = "Europe/Berlin";

/** Calendar day key (YYYY-MM-DD) in the planning timezone. */
export function planningDayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: PLANNING_TIME_ZONE }).format(date);
}

/**
 * Whether an assignment date (YYYY-MM-DD) is today or later in the planning timezone.
 * Aligns with backend `isAssignmentDateBeforeToday` so the UI does not allow drops
 * that the API will reject when the browser TZ differs from Europe/Berlin.
 */
export function canAssignEmployeeOnDate(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  return isoDate >= planningDayKey();
}
