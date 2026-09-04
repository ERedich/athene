import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { CalendarEmployeePanel } from "../components/calendar/CalendarEmployeePanel";
import { CalendarMoveConfirmPanel } from "../components/calendar/CalendarMoveConfirmPanel";
import { CalendarDayTimeline } from "../components/calendar/CalendarDayTimeline";
import { CalendarGrid } from "../components/calendar/CalendarGrid";
import { CalendarToolbar } from "../components/calendar/CalendarToolbar";
import { CalendarViewToggle } from "../components/calendar/CalendarViewToggle";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import {
  buildMonthGrid,
  buildWeekGrid,
  eventIntersectsDay,
  formatPeriodTitle,
  getDayRange,
  getVisibleRange,
  shiftAnchorDate,
} from "../lib/calendar/calendarDates";
import { WORKGROUP_FILTER_NONE } from "../lib/calendar/calendarWorkgroupFilter";
import {
  buildPendingMove,
  isBeforeToday,
  type PendingCalendarMove,
} from "../lib/calendar/calendarMove";
import {
  buildDroppableWorkOrderIds,
  buildEmployeeWorkgroupMap,
  filterAssignableEmployees,
  type CalendarAssignableEmployee,
} from "../lib/calendar/calendarEmployeeAssignment";
import type { CalendarEvent, CalendarViewMode } from "../lib/calendar/calendarTypes";
import {
  fetchCalendarMaintenancePlans,
  filterPlansForCalendarRange,
  maintenancePlanMatchesWorkgroupFilter,
  maintenancePlanToCalendarEvent,
  type CalendarMaintenancePlan,
} from "../lib/calendar/calendarMaintenancePlans";
import {
  calendarWorkOrderToEditSource,
  fetchCalendarWorkOrders,
  filterCalendarEventsBySearch,
  workOrderMatchesWorkgroupFilter,
  workOrderMeetsCalendarMinDuration,
  workOrderToCalendarEvent,
  type CalendarWorkOrder,
} from "../lib/calendar/calendarWorkOrders";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import {
  fetchWorkOrderById,
  fetchWorkOrderPlanningConflicts,
  postWorkOrderAssignment,
  putWorkOrder,
} from "../lib/workOrderApi";
import { apiFetch } from "../lib/api";
import type { WorkOrderReferenceEmployee, WorkOrderReferenceWorkgroup } from "../lib/workOrderTypes";
import { useAuth } from "../auth/AuthContext";
import { useAtheneAssistant } from "../assistant/AtheneAssistantContext";
import { useMaintenancePlanDialog } from "../maintenancePlans/MaintenancePlanDialogContext";
import { useWorkOrderDialog } from "../workOrders/WorkOrderDialogContext";

export function KalendarPage() {
  const { t, i18n } = useTranslation();
  const woDialog = useWorkOrderDialog();
  const mpDialog = useMaintenancePlanDialog();
  const athene = useAtheneAssistant();
  const { appParameterCalendarMinDurationHours } = useAuth();
  const toastRef = useRef<Toast>(null);
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();

  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [workgroupFilterId, setWorkgroupFilterId] = useState<string | null>(null);
  const [workOrders, setWorkOrders] = useState<CalendarWorkOrder[]>([]);
  const [maintenancePlans, setMaintenancePlans] = useState<CalendarMaintenancePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingWorkOrderId, setDraggingWorkOrderId] = useState<string | null>(null);
  const [draggingEmployeeId, setDraggingEmployeeId] = useState<string | null>(null);
  const [assigningEmployeeId, setAssigningEmployeeId] = useState<string | null>(null);
  const [assignableEmployees, setAssignableEmployees] = useState<CalendarAssignableEmployee[]>([]);
  const [workgroups, setWorkgroups] = useState<WorkOrderReferenceWorkgroup[]>([]);
  const [workgroupMap, setWorkgroupMap] = useState(() => buildEmployeeWorkgroupMap([]));
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [pendingMove, setPendingMove] = useState<PendingCalendarMove | null>(null);
  const [moveSaving, setMoveSaving] = useState(false);

  const weeks = useMemo(() => {
    if (viewMode === "month") return buildMonthGrid(anchorDate);
    if (viewMode === "week") return buildWeekGrid(anchorDate);
    return [];
  }, [anchorDate, viewMode]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === "day") return getDayRange(anchorDate);
    if (weeks.length > 0) return getVisibleRange(weeks);
    return getDayRange(anchorDate);
  }, [anchorDate, viewMode, weeks]);

  const periodTitle = useMemo(
    () => formatPeriodTitle(anchorDate, viewMode, i18n.language),
    [anchorDate, viewMode, i18n.language],
  );

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

  const formatDateOnly = useCallback(
    (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      if (langDe) {
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
      }
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    },
    [langDe],
  );

  const loadEmployees = useCallback(async () => {
    setEmployeesLoading(true);
    try {
      const [employeesRes, workgroupsRes] = await Promise.all([
        apiFetch("/api/employees"),
        apiFetch("/api/workgroups"),
      ]);
      if (!employeesRes.ok || !workgroupsRes.ok) throw new Error("load_employees");
      const employees = (await employeesRes.json()) as WorkOrderReferenceEmployee[];
      const workgroups = (await workgroupsRes.json()) as WorkOrderReferenceWorkgroup[];
      const map = buildEmployeeWorkgroupMap(workgroups);
      setWorkgroups(workgroups);
      setWorkgroupMap(map);
      setAssignableEmployees(filterAssignableEmployees(employees, map));
    } catch {
      setWorkgroups([]);
      setWorkgroupMap(buildEmployeeWorkgroupMap([]));
      setAssignableEmployees([]);
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [woResult, planResult] = await Promise.allSettled([
        fetchCalendarWorkOrders(rangeStart, rangeEnd),
        fetchCalendarMaintenancePlans(),
      ]);

      if (woResult.status === "rejected") {
        throw woResult.reason;
      }
      setWorkOrders(woResult.value);

      if (planResult.status === "fulfilled") {
        setMaintenancePlans(filterPlansForCalendarRange(planResult.value, rangeStart, rangeEnd));
      } else {
        setMaintenancePlans([]);
      }
    } catch {
      setError(t("kalendar.loadError"));
      setWorkOrders([]);
      setMaintenancePlans([]);
    } finally {
      setLoading(false);
    }
  }, [rangeEnd, rangeStart, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const calendarWorkOrders = useMemo(
    () =>
      workOrders.filter((wo) =>
        workOrderMeetsCalendarMinDuration(wo, appParameterCalendarMinDurationHours),
      ),
    [appParameterCalendarMinDurationHours, workOrders],
  );

  const allEvents = useMemo(
    () => [
      ...calendarWorkOrders.map(workOrderToCalendarEvent),
      ...maintenancePlans.map(maintenancePlanToCalendarEvent),
    ],
    [calendarWorkOrders, maintenancePlans],
  );

  const filteredEvents = useMemo(
    () => filterCalendarEventsBySearch(allEvents, searchTerm),
    [allEvents, searchTerm],
  );

  const workgroupFilterOptions = useMemo(
    () => [
      { label: t("kalendar.workgroupFilterNone"), value: WORKGROUP_FILTER_NONE },
      ...workgroups
        .filter((wg) => wg.isActive)
        .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
        .map((wg) => ({ label: `${wg.key} - ${wg.name}`, value: wg.id })),
    ],
    [t, workgroups],
  );

  const droppableWorkOrderIds = useMemo(
    () =>
      buildDroppableWorkOrderIds(
        draggingEmployeeId,
        assignableEmployees,
        calendarWorkOrders,
        workgroupMap,
      ),
    [assignableEmployees, calendarWorkOrders, draggingEmployeeId, workgroupMap],
  );

  const activeDraggingEmployeeId = draggingEmployeeId ?? assigningEmployeeId;

  const displayEventCount = useMemo(() => {
    const countMatching = (events: typeof filteredEvents) => {
      if (!workgroupFilterId) return events.length;
      return events.filter((ev) => {
        if (ev.kind === "maintenancePlan") {
          const plan = ev.meta?.maintenancePlan as CalendarMaintenancePlan | undefined;
          return plan != null && maintenancePlanMatchesWorkgroupFilter(plan, workgroupFilterId);
        }
        const wo = ev.meta?.workOrder as CalendarWorkOrder | undefined;
        return wo != null && workOrderMatchesWorkgroupFilter(wo, workgroupFilterId);
      }).length;
    };
    if (viewMode === "day") {
      const dayEvents = filteredEvents.filter((ev) => eventIntersectsDay(ev.start, ev.end, anchorDate));
      return countMatching(dayEvents);
    }
    return countMatching(filteredEvents);
  }, [anchorDate, filteredEvents, viewMode, workgroupFilterId]);

  useEffect(() => {
    setHeaderRowCount(displayEventCount);
    return () => {
      setHeaderRowCount(null);
    };
  }, [displayEventCount, setHeaderRowCount]);

  const handlePrev = useCallback(() => {
    setAnchorDate((d) => shiftAnchorDate(d, viewMode, -1));
  }, [viewMode]);

  const handleNext = useCallback(() => {
    setAnchorDate((d) => shiftAnchorDate(d, viewMode, 1));
  }, [viewMode]);

  const handleToday = useCallback(() => {
    setAnchorDate(new Date());
  }, []);

  const handleOverflowWeekClick = useCallback((weekStart: Date) => {
    setAnchorDate(new Date(weekStart));
    setViewMode("week");
  }, []);

  const handleWeekClick = useCallback((weekStart: Date) => {
    setAnchorDate(new Date(weekStart));
    setViewMode("week");
  }, []);

  const handleDayClick = useCallback((day: Date) => {
    setAnchorDate(new Date(day));
    setViewMode("day");
  }, []);

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      if (event.kind === "workOrder") {
        const wo = event.meta?.workOrder as CalendarWorkOrder | undefined;
        if (!wo) return;
        woDialog.openEdit(calendarWorkOrderToEditSource(wo), {
          onSaved: () => void loadData(),
        });
        return;
      }
      if (event.kind === "maintenancePlan") {
        const plan = event.meta?.maintenancePlan as CalendarMaintenancePlan | undefined;
        if (!plan) return;
        mpDialog.openEdit(plan.id, {
          onSaved: () => void loadData(),
        });
      }
    },
    [loadData, mpDialog, woDialog],
  );

  const handleAskAthene = useCallback(
    (wo: CalendarWorkOrder) => {
      athene.openForCalendar({
        workOrderId: wo.id,
        label: `#${wo.orderNumber} ${wo.name}`,
        data: {
          viewMode,
          rangeStart: rangeStart.toISOString(),
          rangeEnd: rangeEnd.toISOString(),
          anchorDate: anchorDate.toISOString(),
        },
        onRescheduleApplied: () => void loadData(),
      });
    },
    [anchorDate, athene, loadData, rangeEnd, rangeStart, viewMode],
  );

  const handleDragStart = useCallback((workOrderId: string) => {
    setDraggingWorkOrderId(workOrderId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingWorkOrderId(null);
  }, []);

  const handleEmployeeDragStart = useCallback((employeeId: string) => {
    setDraggingEmployeeId(employeeId);
  }, []);

  const handleEmployeeDragEnd = useCallback(() => {
    setDraggingEmployeeId(null);
  }, []);

  const assignmentErrorMessage = useCallback(
    (code: string) => {
      if (code === "employee_not_in_workgroup") return t("workOrders.employeeNotInWorkgroup");
      if (code === "assignment_locked_by_status") return t("workOrders.assignmentLockedByStatus");
      if (code === "employee_site_mismatch") return t("workOrders.assignmentEmployeeSiteMismatch");
      if (code === "invalid_employee") return t("workOrders.assignmentInvalidEmployee");
      return t("kalendar.assignError");
    },
    [t],
  );

  const handleAssignEmployee = useCallback(
    async (workOrderId: string, employeeId: string) => {
      if (assigningEmployeeId) return;
      setAssigningEmployeeId(employeeId);
      try {
        const result = await postWorkOrderAssignment(workOrderId, employeeId);
        if (result.ok) {
          toastRef.current?.show({
            severity: "success",
            summary: t("kalendar.assignSuccess"),
            life: 3000,
          });
          await loadData();
        } else {
          toastRef.current?.show({
            severity: "warn",
            summary: assignmentErrorMessage(result.error),
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
        setAssigningEmployeeId(null);
        setDraggingEmployeeId(null);
      }
    },
    [assigningEmployeeId, assignmentErrorMessage, loadData, t],
  );

  const handleMoveReject = useCallback(() => {
    setPendingMove(null);
  }, []);

  useEffect(() => {
    if (!pendingMove) return;
    let cancelled = false;
    void (async () => {
      try {
        const check = await fetchWorkOrderPlanningConflicts(
          pendingMove.workOrder.id,
          pendingMove.newStart.toISOString(),
          pendingMove.newEnd.toISOString(),
        );
        if (cancelled) return;
        setPendingMove((cur) =>
          cur && cur.workOrder.id === pendingMove.workOrder.id
            ? { ...cur, planningConflict: check }
            : cur,
        );
      } catch {
        if (!cancelled) {
          setPendingMove((cur) =>
            cur && cur.workOrder.id === pendingMove.workOrder.id
              ? { ...cur, planningConflict: null }
              : cur,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingMove?.workOrder.id, pendingMove?.newStart, pendingMove?.newEnd]);

  const handleMoveProposal = useCallback(
    (wo: CalendarWorkOrder, targetDay: Date) => {
      const pending = buildPendingMove(wo, targetDay);
      if (!pending) {
        if (isBeforeToday(targetDay)) {
          toastRef.current?.show({
            severity: "warn",
            summary: t("kalendar.dropPastDenied"),
            life: 4000,
          });
        }
        return;
      }
      setPendingMove(pending);
    },
    [t],
  );

  const handleMoveAccept = useCallback(async () => {
    if (!pendingMove) return;
    setMoveSaving(true);
    try {
      const full = await fetchWorkOrderById(pendingMove.workOrder.id);
      if (!full) throw new Error("not_found");
      const durationMs = pendingMove.newEnd.getTime() - pendingMove.newStart.getTime();
      const plannedDurationMinutes = Math.max(0, Math.round(durationMs / 60_000));
      const hasConflict = (pendingMove.planningConflict?.conflicts.length ?? 0) > 0;
      await putWorkOrder(
        full,
        {
          plannedStart: pendingMove.newStart.toISOString(),
          plannedEnd: pendingMove.newEnd.toISOString(),
          plannedDurationMinutes,
        },
        { allowAssetOverlap: hasConflict },
      );
      toastRef.current?.show({
        severity: "success",
        summary: t("kalendar.moveSuccess"),
        life: 3000,
      });
      handleMoveReject();
      await loadData();
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("kalendar.moveError"),
        life: 6000,
      });
    } finally {
      setMoveSaving(false);
    }
  }, [handleMoveReject, loadData, pendingMove, t]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <CalendarViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        <li className="flex items-center" aria-hidden>
          <span className="app-calendar-toolbar-divider" />
        </li>
        <li className="min-w-0 shrink-0">
          <CalendarToolbar
            periodTitle={periodTitle}
            onPrev={handlePrev}
            onNext={handleNext}
            onToday={handleToday}
          />
        </li>
        <li className="ml-auto flex shrink-0 items-center gap-2">
          <Dropdown
            aria-label={t("kalendar.workgroupFilterLabel")}
            value={workgroupFilterId}
            options={workgroupFilterOptions}
            optionLabel="label"
            optionValue="value"
            placeholder={t("kalendar.workgroupFilterPlaceholder")}
            showClear
            onChange={(e) => setWorkgroupFilterId((e.value as string | null) ?? null)}
            className="app-header-preset-dropdown app-inline-icon-dropdown h-9 w-52 shrink-0 text-sm"
            panelClassName="app-header-preset-dropdown-panel"
            appendTo={overlayAppendTo}
          />
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("kalendar.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [
    handleNext,
    handlePrev,
    handleToday,
    periodTitle,
    searchTerm,
    setHeaderActions,
    t,
    viewMode,
    workgroupFilterId,
    workgroupFilterOptions,
  ]);

  const gridViewMode = viewMode === "week" ? "week" : "month";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Toast ref={toastRef} position="top-right" />
      <CalendarMoveConfirmPanel
        visible={pendingMove != null}
        pending={pendingMove}
        formatDate={formatDateOnly}
        saving={moveSaving}
        onAccept={() => void handleMoveAccept()}
        onReject={handleMoveReject}
      />

      {error ? (
        <div className="mx-4 mt-4 mb-3 rounded-lg bg-surface-container-low p-3 text-sm text-on-surface">
          <p>{error}</p>
          <Button
            type="button"
            label={t("kalendar.retry")}
            size="small"
            className="mt-2"
            onClick={() => void loadData()}
          />
        </div>
      ) : null}

      {loading || employeesLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-on-surface-variant">…</div>
      ) : (
        <div className="app-calendar-layout flex min-h-0 flex-1 overflow-hidden bg-surface-container-low">
          <div className="app-calendar-layout__main flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
            {!loading &&
            filteredEvents.length === 0 &&
            calendarWorkOrders.length === 0 &&
            maintenancePlans.length === 0 ? (
              <p className="p-4 text-center text-sm text-on-surface-variant">{t("kalendar.noEvents")}</p>
            ) : null}
            {!loading &&
            filteredEvents.length === 0 &&
            (calendarWorkOrders.length > 0 || maintenancePlans.length > 0) ? (
              <p className="p-4 text-center text-sm text-on-surface-variant">{t("kalendar.noEventsFiltered")}</p>
            ) : null}
            {viewMode === "day" ? (
              <CalendarDayTimeline
                anchorDate={anchorDate}
                events={filteredEvents}
                formatDateTime={formatDateTime}
                draggingEmployeeId={activeDraggingEmployeeId}
                droppableWorkOrderIds={droppableWorkOrderIds}
                workgroupFilterId={workgroupFilterId}
                onEventClick={handleEventClick}
                onAskAthene={handleAskAthene}
                onAssignEmployee={(workOrderId, employeeId) => void handleAssignEmployee(workOrderId, employeeId)}
              />
            ) : (
              <CalendarGrid
                weeks={weeks}
                events={filteredEvents}
                viewMode={gridViewMode}
                formatDateTime={formatDateTime}
                draggingWorkOrderId={draggingWorkOrderId}
                draggingEmployeeId={activeDraggingEmployeeId}
                droppableWorkOrderIds={droppableWorkOrderIds}
                workgroupFilterId={workgroupFilterId}
                onEventClick={handleEventClick}
                onAskAthene={handleAskAthene}
                onOverflowWeekClick={handleOverflowWeekClick}
                onWeekClick={handleWeekClick}
                onDayClick={handleDayClick}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onMoveProposal={handleMoveProposal}
                onAssignEmployee={(workOrderId, employeeId) => void handleAssignEmployee(workOrderId, employeeId)}
              />
            )}
          </div>
          <CalendarEmployeePanel
            employees={assignableEmployees}
            workgroupFilterId={workgroupFilterId}
            workgroupMap={workgroupMap}
            draggingEmployeeId={activeDraggingEmployeeId}
            onDragStart={handleEmployeeDragStart}
            onDragEnd={handleEmployeeDragEnd}
          />
        </div>
      )}
    </div>
  );
}
