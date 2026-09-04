import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Toast } from "primereact/toast";
import { OverlayPanel } from "primereact/overlaypanel";

import { apiFetch } from "../../lib/api";
import { addDays, endOfDay, getWeekStart } from "../../lib/calendar/calendarDates";
import {
  buildDroppableWorkOrderIds,
  buildEmployeeWorkgroupMap,
  filterAssignableEmployees,
  type CalendarAssignableEmployee,
} from "../../lib/calendar/calendarEmployeeAssignment";
import {
  calendarWorkOrderToEditSource,
  fetchCalendarWorkOrders,
  filterCalendarEventsBySearch,
  workOrderToCalendarEvent,
  type CalendarWorkOrder,
} from "../../lib/calendar/calendarWorkOrders";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import { expandShiftsForWeek } from "../../lib/shiftPlanner/shiftCalendarExpand";
import { attachAssignmentsToBlocks } from "../../lib/shiftPlanner/shiftPlannerMerge";
import { fetchShiftAssignments } from "../../lib/shiftPlanner/shiftPlannerApi";
import type {
  PlanningEmployee,
  ShiftAssignment,
  ShiftCalendarBlock,
  ShiftMasterRow,
} from "../../lib/shiftPlanner/shiftCalendarTypes";
import type { ShiftPlannerViewMode } from "../../lib/shiftPlanner/shiftPlannerViewMode";
import {
  fetchWorkOrderAssignmentsForRange,
  postWorkOrderAssignment,
  type WorkOrderAssignmentError,
} from "../../lib/workOrderApi";
import { defaultAssignmentWindow, type ShiftWindowHint } from "../../lib/workOrderAssignmentWindow";
import type { WorkOrderAssignment, WorkOrderReferenceWorkgroup } from "../../lib/workOrderTypes";
import { useWorkOrderDialog } from "../../workOrders/WorkOrderDialogContext";
import {
  WorkOrderAssignWindowPanel,
  type WorkOrderAssignWindowPending,
} from "../workOrders/WorkOrderAssignWindowPanel";
import { getWeekStartIso } from "./ShiftWeekCalendarGrid";
import { ShiftBlockInfoModal } from "./ShiftBlockInfoModal";
import { ShiftResourcePlanningGrid } from "./ShiftResourcePlanningGrid";

type Props = {
  anchorDate: Date;
  searchTerm: string;
  viewMode: ShiftPlannerViewMode;
};

function mapAssignmentError(code: WorkOrderAssignmentError, t: (key: string) => string): string {
  if (code === "employee_not_in_workgroup") return t("workOrders.employeeNotInWorkgroup");
  if (code === "assignment_locked_by_status") return t("workOrders.assignmentLockedByStatus");
  if (code === "employee_site_mismatch") return t("workOrders.assignmentEmployeeSiteMismatch");
  if (code === "invalid_employee") return t("workOrders.assignmentInvalidEmployee");
  if (code === "invalid_assignment_window") return t("workOrders.assignmentWindowInvalid");
  if (code === "assignment_window_outside_order") return t("workOrders.assignmentWindowOutsideOrder");
  return t("kalendar.assignError");
}

export function ShiftResourcePlanningWeek({ anchorDate, searchTerm, viewMode }: Props) {
  const { t, i18n } = useTranslation();
  const woDialog = useWorkOrderDialog();
  const toastRef = useRef<Toast>(null);
  const assignPanelRef = useRef<OverlayPanel>(null);

  const [shifts, setShifts] = useState<ShiftMasterRow[]>([]);
  const [planningEmployees, setPlanningEmployees] = useState<PlanningEmployee[]>([]);
  const [assignableEmployees, setAssignableEmployees] = useState<CalendarAssignableEmployee[]>([]);
  const [workgroupMap, setWorkgroupMap] = useState(() => buildEmployeeWorkgroupMap([]));
  const [workOrders, setWorkOrders] = useState<CalendarWorkOrder[]>([]);
  const [orderAssignments, setOrderAssignments] = useState<WorkOrderAssignment[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingEmployeeId, setDraggingEmployeeId] = useState<string | null>(null);
  const [draggingShiftHint, setDraggingShiftHint] = useState<ShiftWindowHint | null>(null);
  const [unassigningEmployeeId, setUnassigningEmployeeId] = useState<string | null>(null);
  const [infoBlock, setInfoBlock] = useState<ShiftCalendarBlock | null>(null);
  const [pendingAssign, setPendingAssign] = useState<WorkOrderAssignWindowPending | null>(null);
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const weekStart = useMemo(() => getWeekStart(anchorDate), [anchorDate]);
  const weekStartIso = useMemo(() => getWeekStartIso(anchorDate), [anchorDate]);
  const weekEnd = useMemo(() => endOfDay(addDays(weekStart, 6)), [weekStart]);

  const langDe = i18n.language?.toLowerCase().startsWith("de");
  const formatDateTime = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, "0");
      if (langDe) {
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    [langDe],
  );

  const blocks = useMemo(() => {
    const expanded = expandShiftsForWeek(shifts, weekStartIso, {
      splitOvernight: viewMode === "complex",
    });
    return attachAssignmentsToBlocks(expanded, shiftAssignments);
  }, [shiftAssignments, shifts, viewMode, weekStartIso]);

  const loadData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      setError(null);
      try {
        const [shiftsRes, employeesRes, workgroupsRes, loadedShiftAssignments, loadedOrders, loadedOrderAssignments] =
          await Promise.all([
            apiFetch("/api/shifts"),
            apiFetch("/api/employees"),
            apiFetch("/api/workgroups"),
            fetchShiftAssignments(weekStartIso),
            fetchCalendarWorkOrders(weekStart, weekEnd),
            fetchWorkOrderAssignmentsForRange(weekStart, weekEnd),
          ]);
        if (!shiftsRes.ok || !employeesRes.ok || !workgroupsRes.ok) throw new Error("load");

        const loadedShifts = (await shiftsRes.json()) as ShiftMasterRow[];
        const employees = (await employeesRes.json()) as PlanningEmployee[];
        const workgroups = (await workgroupsRes.json()) as WorkOrderReferenceWorkgroup[];
        const map = buildEmployeeWorkgroupMap(workgroups);
        const planning = employees.filter((e) => e.isActive && e.isShiftPlanning);

        setShifts(loadedShifts);
        setShiftAssignments(loadedShiftAssignments);
        setWorkOrders(loadedOrders);
        setOrderAssignments(loadedOrderAssignments);
        setWorkgroupMap(map);
        setPlanningEmployees(planning);
        setAssignableEmployees(
          filterAssignableEmployees(
            employees.map((e) => ({
              id: e.id,
              key: e.key,
              name: e.name,
              siteId: e.siteId,
              isActive: e.isActive,
            })),
            map,
          ),
        );
      } catch {
        setError(t("schichtplaner.resourceLoadError"));
        setShifts([]);
        setShiftAssignments([]);
        setWorkOrders([]);
        setOrderAssignments([]);
        setPlanningEmployees([]);
        setAssignableEmployees([]);
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [t, weekEnd, weekStart, weekStartIso],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const events = useMemo(() => {
    const all = workOrders.map(workOrderToCalendarEvent);
    return filterCalendarEventsBySearch(all, searchTerm);
  }, [searchTerm, workOrders]);

  const filteredBlocks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return blocks;
    return blocks.filter(
      (b) =>
        b.shiftName.toLowerCase().includes(q) ||
        b.shiftKey.toLowerCase().includes(q) ||
        b.shortCode.toLowerCase().includes(q) ||
        b.startTime.includes(q) ||
        b.endTime.includes(q) ||
        b.assignments.some(
          (a) =>
            a.employeeName.toLowerCase().includes(q) || a.employeeKey.toLowerCase().includes(q),
        ),
    );
  }, [blocks, searchTerm]);

  const assignmentsByOrderId = useMemo(() => {
    const map = new Map<string, WorkOrderAssignment[]>();
    for (const assignment of orderAssignments) {
      const list = map.get(assignment.workOrderId) ?? [];
      list.push(assignment);
      map.set(assignment.workOrderId, list);
    }
    return map;
  }, [orderAssignments]);

  const droppableWorkOrderIds = useMemo(
    () => buildDroppableWorkOrderIds(draggingEmployeeId, assignableEmployees, workOrders, workgroupMap),
    [assignableEmployees, draggingEmployeeId, workOrders, workgroupMap],
  );

  const handleAssignedEmployeeDragStart = useCallback((employeeId: string, block: ShiftCalendarBlock) => {
    setDraggingEmployeeId(employeeId);
    setDraggingShiftHint({
      date: block.date,
      startTime: block.startTime,
      endTime: block.endTime,
      segmentKind: block.segmentKind,
    });
  }, []);

  const handleAssignedEmployeeDragEnd = useCallback(() => {
    setDraggingEmployeeId(null);
    setDraggingShiftHint(null);
  }, []);

  const handleRequestAssign = useCallback(
    (workOrderId: string, employeeId: string, dropDayIso: string, event: React.SyntheticEvent) => {
      const order = workOrders.find((wo) => wo.id === workOrderId);
      if (!order) return;
      const employee =
        assignableEmployees.find((item) => item.id === employeeId) ??
        planningEmployees.find((item) => item.id === employeeId);
      const window = defaultAssignmentWindow(
        order.plannedStart,
        order.plannedEnd,
        dropDayIso,
        draggingShiftHint,
      );
      if (!window) {
        toastRef.current?.show({
          severity: "warn",
          summary: t("workOrders.assignmentWindowOutsideOrder"),
          life: 5000,
        });
        return;
      }
      setPendingAssign({
        workOrderId: order.id,
        workOrderLabel: `#${order.orderNumber} ${order.name}`,
        employeeIds: [employeeId],
        employeeLabel: employee ? `${employee.key} – ${employee.name}` : employeeId,
        assignedFrom: window.assignedFrom,
        assignedTo: window.assignedTo,
        minDate: new Date(order.plannedStart),
        maxDate: new Date(order.plannedEnd),
      });
      setDraggingEmployeeId(null);
      setDraggingShiftHint(null);
      assignPanelRef.current?.toggle(event);
    },
    [assignableEmployees, draggingShiftHint, planningEmployees, t, workOrders],
  );

  const handleAssignCancel = useCallback(() => {
    assignPanelRef.current?.hide();
    setPendingAssign(null);
  }, []);

  const handleAssignConfirm = useCallback(
    async (assignedFrom: Date, assignedTo: Date) => {
      if (!pendingAssign) return;
      setAssignSubmitting(true);
      try {
        const employeeId = pendingAssign.employeeIds[0];
        if (!employeeId) return;
        const result = await postWorkOrderAssignment(
          pendingAssign.workOrderId,
          employeeId,
          assignedFrom.toISOString(),
          assignedTo.toISOString(),
        );
        if (result.ok) {
          assignPanelRef.current?.hide();
          setPendingAssign(null);
          await loadData({ silent: true });
          toastRef.current?.show({
            severity: "success",
            summary: t("kalendar.assignSuccess"),
            life: 3000,
          });
        } else {
          toastRef.current?.show({
            severity: "warn",
            summary: mapAssignmentError(result.error, t),
            life: 5000,
          });
        }
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("kalendar.assignError"),
          life: 6000,
        });
      } finally {
        setAssignSubmitting(false);
      }
    },
    [loadData, pendingAssign, t],
  );

  const handleUnassignFromOrder = useCallback(
    async (workOrderId: string, employeeId: string) => {
      setUnassigningEmployeeId(employeeId);
      try {
        const res = await apiFetch(
          `/api/work-orders/${encodeURIComponent(workOrderId)}/assignments/${encodeURIComponent(employeeId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          toastRef.current?.show({
            severity: "warn",
            summary: t("workOrders.assignmentLockedByStatus"),
            life: 5000,
          });
          return;
        }
        await loadData({ silent: true });
        toastRef.current?.show({
          severity: "success",
          summary: t("schichtplaner.unassigned"),
          life: 3000,
        });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("schichtplaner.unassignError"),
          life: 6000,
        });
      } finally {
        setUnassigningEmployeeId(null);
      }
    },
    [loadData, t],
  );

  const handleOrderClick = useCallback(
    (workOrder: CalendarWorkOrder) => {
      woDialog.openEdit(calendarWorkOrderToEditSource(workOrder), {
        onSaved: () => void loadData({ silent: true }),
      });
    },
    [loadData, woDialog],
  );

  const showGrid = shifts.some((s) => s.isActive) || workOrders.length > 0 || planningEmployees.length > 0;

  return (
    <div className="app-shift-planner-calendar flex min-h-0 flex-1 flex-col">
      <Toast ref={toastRef} position="top-right" appendTo={overlayAppendTo} />
      <ShiftBlockInfoModal block={infoBlock} onHide={() => setInfoBlock(null)} />
      <WorkOrderAssignWindowPanel
        panelRef={assignPanelRef}
        pending={pendingAssign}
        submitting={assignSubmitting}
        onConfirm={(from, to) => void handleAssignConfirm(from, to)}
        onCancel={handleAssignCancel}
      />
      <div className="app-shift-planner-calendar-body min-h-0 flex-1 overflow-hidden px-4 py-4">
        {loading ? (
          <p className="text-on-surface-variant">{t("schichtplaner.resourceLoading")}</p>
        ) : error ? (
          <p className="text-danger">{error}</p>
        ) : !showGrid ? (
          <p className="text-on-surface-variant">{t("schichtplaner.resourceEmpty")}</p>
        ) : (
          <ShiftResourcePlanningGrid
            weekStart={weekStart}
            viewMode={viewMode}
            events={events}
            blocks={filteredBlocks}
            assignmentsByOrderId={assignmentsByOrderId}
            draggingEmployeeId={draggingEmployeeId}
            droppableWorkOrderIds={droppableWorkOrderIds}
            unassigningEmployeeId={unassigningEmployeeId}
            formatDateTime={formatDateTime}
            onOrderClick={handleOrderClick}
            onAssignEmployeeToOrder={handleRequestAssign}
            onUnassignEmployeeFromOrder={handleUnassignFromOrder}
            onAssignedEmployeeDragStart={handleAssignedEmployeeDragStart}
            onAssignedEmployeeDragEnd={handleAssignedEmployeeDragEnd}
            onOpenInfo={setInfoBlock}
          />
        )}
      </div>
    </div>
  );
}
