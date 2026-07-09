export const CALENDAR_EMPLOYEE_DRAG_MIME = "application/x-athene-calendar-employee-id";

export function setCalendarEmployeeDragData(dataTransfer: DataTransfer, employeeId: string): void {
  dataTransfer.setData(CALENDAR_EMPLOYEE_DRAG_MIME, employeeId);
  dataTransfer.setData("text/plain", employeeId);
  dataTransfer.effectAllowed = "copy";
}

export function isCalendarEmployeeDrag(
  dataTransfer: DataTransfer,
  draggingEmployeeId?: string | null,
): boolean {
  if (draggingEmployeeId) return true;
  return dataTransfer.types.includes(CALENDAR_EMPLOYEE_DRAG_MIME);
}

export function readCalendarEmployeeDragData(
  dataTransfer: DataTransfer,
  draggingEmployeeId?: string | null,
): string | null {
  if (draggingEmployeeId) return draggingEmployeeId;
  const raw = dataTransfer.getData(CALENDAR_EMPLOYEE_DRAG_MIME);
  return raw.trim() || null;
}
