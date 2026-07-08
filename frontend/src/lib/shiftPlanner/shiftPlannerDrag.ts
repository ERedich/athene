export const SHIFT_EMPLOYEE_DRAG_MIME = "application/x-athene-shift-employee-id";

export function setShiftEmployeeDragData(dataTransfer: DataTransfer, employeeId: string): void {
  dataTransfer.setData(SHIFT_EMPLOYEE_DRAG_MIME, employeeId);
  dataTransfer.setData("text/plain", employeeId);
  dataTransfer.effectAllowed = "copy";
}

export function isShiftEmployeeDrag(
  dataTransfer: DataTransfer,
  draggingEmployeeId?: string | null,
): boolean {
  if (draggingEmployeeId) return true;
  return dataTransfer.types.includes(SHIFT_EMPLOYEE_DRAG_MIME);
}

export function readShiftEmployeeDragData(
  dataTransfer: DataTransfer,
  draggingEmployeeId?: string | null,
): string | null {
  const fromMime = dataTransfer.getData(SHIFT_EMPLOYEE_DRAG_MIME).trim();
  if (fromMime) return fromMime;
  const fromPlain = dataTransfer.getData("text/plain").trim();
  if (fromPlain) return fromPlain;
  return draggingEmployeeId?.trim() || null;
}
