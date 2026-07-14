import type { CalendarWorkOrder } from "./calendarWorkOrders";
import type { WorkOrderReferenceEmployee, WorkOrderReferenceWorkgroup, WorkOrderStatus } from "../workOrderTypes";

export type CalendarAssignableEmployee = {
  id: string;
  key: string;
  name: string;
  siteId: string;
};

export type EmployeeWorkgroupMap = Map<string, Set<string>>;

function assignmentsLocked(status: WorkOrderStatus): boolean {
  return status === "ended" || status === "done" || status === "cancelled";
}

export function buildEmployeeWorkgroupMap(workgroups: WorkOrderReferenceWorkgroup[]): EmployeeWorkgroupMap {
  const map: EmployeeWorkgroupMap = new Map();
  for (const wg of workgroups) {
    for (const employeeId of wg.employeeIds) {
      const existing = map.get(employeeId);
      if (existing) {
        existing.add(wg.id);
      } else {
        map.set(employeeId, new Set([wg.id]));
      }
    }
  }
  return map;
}

export function filterAssignableEmployees(
  employees: WorkOrderReferenceEmployee[],
  _workgroupMap: EmployeeWorkgroupMap,
): CalendarAssignableEmployee[] {
  return employees
    .filter((emp) => emp.isActive)
    .map((emp) => ({
      id: emp.id,
      key: emp.key,
      name: emp.name,
      siteId: emp.siteId,
    }));
}

export function filterEmployeesByWorkgroup(
  employees: CalendarAssignableEmployee[],
  workgroupMap: EmployeeWorkgroupMap,
  workgroupId: string | null,
): CalendarAssignableEmployee[] {
  if (!workgroupId) return employees;
  return employees.filter((emp) => employeeMatchesWorkgroupFilter(emp.id, workgroupMap, workgroupId));
}

export function employeeMatchesWorkgroupFilter(
  employeeId: string,
  workgroupMap: EmployeeWorkgroupMap,
  workgroupFilterId: string | null,
): boolean {
  if (!workgroupFilterId) return true;
  return workgroupMap.get(employeeId)?.has(workgroupFilterId) ?? false;
}

export function canAssignEmployeeToWorkOrder(
  employee: CalendarAssignableEmployee,
  workOrder: CalendarWorkOrder,
  workgroupMap: EmployeeWorkgroupMap,
): boolean {
  if (assignmentsLocked(workOrder.status)) return false;
  if (employee.siteId !== workOrder.siteId) return false;
  const workgroupId = workOrder.workgroupId?.trim();
  if (workgroupId) {
    const employeeWorkgroups = workgroupMap.get(employee.id);
    if (!employeeWorkgroups?.has(workgroupId)) return false;
  }
  return true;
}

export function buildDroppableWorkOrderIds(
  draggingEmployeeId: string | null,
  employees: CalendarAssignableEmployee[],
  workOrders: CalendarWorkOrder[],
  workgroupMap: EmployeeWorkgroupMap,
): ReadonlySet<string> | null {
  if (!draggingEmployeeId) return null;
  const employee = employees.find((e) => e.id === draggingEmployeeId);
  if (!employee) return new Set();
  const ids = new Set<string>();
  for (const wo of workOrders) {
    if (canAssignEmployeeToWorkOrder(employee, wo, workgroupMap)) {
      ids.add(wo.id);
    }
  }
  return ids;
}
