import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Toast } from "primereact/toast";

import { apiFetch } from "../../lib/api";
import { getWeekStart } from "../../lib/calendar/calendarDates";
import {
  addShiftToWeekday,
  addDaysIso,
  expandShiftsForWeek,
  removeShiftFromWeekday,
  weekdayKeyForDate,
} from "../../lib/shiftPlanner/shiftCalendarExpand";
import { attachAssignmentsToBlocks } from "../../lib/shiftPlanner/shiftPlannerMerge";
import { canAssignEmployeeOnDate } from "../../lib/shiftPlanner/shiftPlannerDates";
import {
  assignEmployeeToShift,
  deleteShiftAssignment,
  fetchShiftAssignments,
  rolloutEmployeeToShift,
  ShiftPlannerApiError,
} from "../../lib/shiftPlanner/shiftPlannerApi";
import { assignmentDateForBlock } from "../../lib/shiftPlanner/shiftPlannerRollout";
import type {
  PlanningEmployee,
  ShiftAssignment,
  ShiftCalendarBlock,
  ShiftMasterRow,
} from "../../lib/shiftPlanner/shiftCalendarTypes";
import type { ShiftPlannerViewMode } from "../../lib/shiftPlanner/shiftPlannerViewMode";
import { getWeekStartIso, ShiftWeekCalendarGrid } from "./ShiftWeekCalendarGrid";
import { ShiftBlockInfoModal } from "./ShiftBlockInfoModal";
import {
  ShiftAssignRolloutPanel,
  type ShiftRolloutPending,
} from "./ShiftAssignRolloutPanel";
import { ShiftOverviewPanel } from "./ShiftOverviewPanel";
import { assignmentsForShiftAroundDate } from "../../lib/shiftPlanner/shiftOverview";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import { OverlayPanel } from "primereact/overlaypanel";

type Props = {
  anchorDate: Date;
  searchTerm: string;
  viewMode: ShiftPlannerViewMode;
};

function mapAssignError(code: string | undefined, t: (key: string) => string): string {
  if (code === "site_mismatch") return t("schichtplaner.assignSiteMismatch");
  if (code === "shift_not_on_date") return t("schichtplaner.assignShiftNotOnDate");
  if (code === "employee_not_shift_planning") return t("schichtplaner.assignNotPlanning");
  if (code === "assignment_date_in_past") return t("schichtplaner.assignDateInPast");
  if (code === "invalid_date_range") return t("schichtplaner.rolloutInvalidRange");
  return t("schichtplaner.assignError");
}

export function ShiftWeekCalendar({ anchorDate, searchTerm, viewMode }: Props) {
  const { t } = useTranslation();
  const toastRef = useRef<Toast>(null);
  const rolloutPanelRef = useRef<OverlayPanel>(null);
  const overviewPanelRef = useRef<OverlayPanel>(null);
  const [shifts, setShifts] = useState<ShiftMasterRow[]>([]);
  const [planningEmployees, setPlanningEmployees] = useState<PlanningEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingBlockId, setRemovingBlockId] = useState<string | null>(null);
  const [addingShiftId, setAddingShiftId] = useState<string | null>(null);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
  const [assigningEmployeeId, setAssigningEmployeeId] = useState<string | null>(null);
  const [draggingEmployeeId, setDraggingEmployeeId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [infoBlock, setInfoBlock] = useState<ShiftCalendarBlock | null>(null);
  const [overviewBlock, setOverviewBlock] = useState<ShiftCalendarBlock | null>(null);
  const [pendingRollout, setPendingRollout] = useState<ShiftRolloutPending | null>(null);
  const [rolloutSubmitting, setRolloutSubmitting] = useState(false);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);

  const weekStart = useMemo(() => getWeekStart(anchorDate), [anchorDate]);
  const weekStartIso = useMemo(() => getWeekStartIso(anchorDate), [anchorDate]);

  const activeShifts = useMemo(() => shifts.filter((s) => s.isActive), [shifts]);

  const blocks = useMemo(() => {
    const expanded = expandShiftsForWeek(shifts, weekStartIso, {
      splitOvernight: viewMode === "complex",
    });
    return attachAssignmentsToBlocks(expanded, assignments);
  }, [assignments, shifts, viewMode, weekStartIso]);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [shiftsRes, employeesRes, assignmentsRes] = await Promise.all([
        apiFetch("/api/shifts"),
        apiFetch("/api/employees"),
        fetchShiftAssignments(weekStartIso),
      ]);
      if (!shiftsRes.ok || !employeesRes.ok) throw new Error("load");

      const loadedShifts = (await shiftsRes.json()) as ShiftMasterRow[];
      const employees = (await employeesRes.json()) as PlanningEmployee[];
      const loadedAssignments = assignmentsRes;
      const planning = employees.filter((e) => e.isActive && e.isShiftPlanning);

      setShifts(loadedShifts);
      setAssignments(loadedAssignments);
      setPlanningEmployees(planning);
    } catch {
      setError(t("schichtplaner.loadError"));
      setShifts([]);
      setAssignments([]);
      setPlanningEmployees([]);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [t, weekStartIso]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setSelectedBlockId(null);
    setSelectedDayIso(null);
    setOverviewBlock(null);
    overviewPanelRef.current?.hide();
  }, [weekStartIso]);

  useEffect(() => {
    setSelectedBlockId(null);
    setOverviewBlock(null);
    overviewPanelRef.current?.hide();
  }, [viewMode]);

  const disabledEmployeeIds = useMemo(() => {
    if (selectedBlockId) {
      const block = blocks.find((item) => item.id === selectedBlockId);
      return new Set(block?.assignments.map((assignment) => assignment.employeeId) ?? []);
    }
    if (selectedDayIso) {
      const ids = new Set<string>();
      for (const block of blocks) {
        if (block.date !== selectedDayIso) continue;
        for (const assignment of block.assignments) {
          ids.add(assignment.employeeId);
        }
      }
      return ids;
    }
    return new Set<string>();
  }, [blocks, selectedBlockId, selectedDayIso]);

  const disabledEmployeeContext = selectedDayIso ? "day" : selectedBlockId ? "block" : null;

  const handleSelectBlock = useCallback((block: ShiftCalendarBlock) => {
    setSelectedDayIso(null);
    setSelectedBlockId((current) => (current === block.id ? null : block.id));
  }, []);

  const handleSelectDay = useCallback((isoDate: string) => {
    setSelectedBlockId(null);
    setSelectedDayIso((current) => (current === isoDate ? null : isoDate));
  }, []);

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

  const filteredPlanningEmployees = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return planningEmployees;
    return planningEmployees.filter(
      (e) => e.name.toLowerCase().includes(q) || e.key.toLowerCase().includes(q),
    );
  }, [planningEmployees, searchTerm]);

  const handleRemoveBlock = useCallback(
    async (block: ShiftCalendarBlock) => {
      const shift = shifts.find((s) => s.id === block.shiftId);
      if (!shift) return;

      setRemovingBlockId(block.id);
      try {
        const weekdayKey = weekdayKeyForDate(block.date);
        const result = await removeShiftFromWeekday(shift, weekdayKey);
        if (!result.ok) {
          toastRef.current?.show({
            severity: "warn",
            summary:
              result.error === "last_weekday"
                ? t("schichtplaner.removeLastWeekday")
                : t("schichtplaner.removeError"),
            life: 6000,
          });
          return;
        }
        await loadData();
        toastRef.current?.show({
          severity: "success",
          summary: t("schichtplaner.removed"),
          life: 3000,
        });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("schichtplaner.removeError"),
          life: 6000,
        });
      } finally {
        setRemovingBlockId(null);
      }
    },
    [loadData, shifts, t],
  );

  const handleAddShift = useCallback(
    async (shift: ShiftMasterRow, isoDate: string) => {
      setAddingShiftId(shift.id);
      try {
        const weekdayKey = weekdayKeyForDate(isoDate);
        const result = await addShiftToWeekday(shift, weekdayKey);
        if (!result.ok) {
          toastRef.current?.show({
            severity: "error",
            summary: t("schichtplaner.addError"),
            life: 6000,
          });
          return;
        }
        await loadData();
        toastRef.current?.show({
          severity: "success",
          summary: t("schichtplaner.added"),
          life: 3000,
        });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("schichtplaner.addError"),
          life: 6000,
        });
      } finally {
        setAddingShiftId(null);
      }
    },
    [loadData, t],
  );

  const handleAssignEmployee = useCallback(
    async (block: ShiftCalendarBlock, employeeId: string) => {
      const assignmentDate =
        block.segmentKind === "morning" ? addDaysIso(block.date, -1) : block.date;
      if (!canAssignEmployeeOnDate(assignmentDate)) {
        toastRef.current?.show({
          severity: "error",
          summary: t("schichtplaner.assignDateInPast"),
          life: 6000,
        });
        return;
      }
      setAssigningEmployeeId(employeeId);
      try {
        await assignEmployeeToShift({
          employeeId,
          shiftId: block.shiftId,
          assignmentDate,
        });
        await loadData({ silent: true });
        toastRef.current?.show({
          severity: "success",
          summary: t("schichtplaner.assigned"),
          life: 3000,
        });
      } catch (err) {
        const code = err instanceof ShiftPlannerApiError ? err.code : undefined;
        toastRef.current?.show({
          severity: "error",
          summary: mapAssignError(code, t),
          life: 6000,
        });
      } finally {
        setAssigningEmployeeId(null);
        setDraggingEmployeeId(null);
      }
    },
    [loadData, t],
  );

  const handleUnassignEmployee = useCallback(
    async (_block: ShiftCalendarBlock, assignmentId: string) => {
      setRemovingAssignmentId(assignmentId);
      try {
        await deleteShiftAssignment(assignmentId);
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
        setRemovingAssignmentId(null);
      }
    },
    [loadData, t],
  );

  const handleOpenInfo = useCallback((block: ShiftCalendarBlock) => {
    setInfoBlock(block);
  }, []);

  const overviewAround = useMemo(() => {
    if (!overviewBlock) return null;
    const centerDate = assignmentDateForBlock(overviewBlock);
    return assignmentsForShiftAroundDate(assignments, overviewBlock.shiftId, centerDate);
  }, [assignments, overviewBlock]);

  const handleOpenShiftOverview = useCallback(
    (block: ShiftCalendarBlock, event: React.MouseEvent) => {
      if (overviewBlock?.id === block.id) {
        setOverviewBlock(null);
        overviewPanelRef.current?.hide();
        return;
      }
      setOverviewBlock(block);
      const target = event.currentTarget as HTMLElement;
      queueMicrotask(() => {
        overviewPanelRef.current?.show(event, target);
      });
    },
    [overviewBlock],
  );

  const handleRequestRollout = useCallback(
    (block: ShiftCalendarBlock, employeeId: string, event: React.SyntheticEvent) => {
      const fromDate = assignmentDateForBlock(block);
      if (!canAssignEmployeeOnDate(fromDate)) {
        toastRef.current?.show({
          severity: "error",
          summary: t("schichtplaner.assignDateInPast"),
          life: 6000,
        });
        return;
      }
      const employee = planningEmployees.find((item) => item.id === employeeId);
      setPendingRollout({
        block,
        employeeId,
        employeeName: employee?.name ?? employeeId,
        fromDate,
      });
      setDraggingEmployeeId(null);
      rolloutPanelRef.current?.toggle(event);
    },
    [planningEmployees, t],
  );

  const handleRolloutCancel = useCallback(() => {
    rolloutPanelRef.current?.hide();
    setPendingRollout(null);
  }, []);

  const handleRolloutConfirm = useCallback(
    async (toDate: string) => {
      if (!pendingRollout) return;
      if (toDate < pendingRollout.fromDate) {
        toastRef.current?.show({
          severity: "error",
          summary: t("schichtplaner.rolloutInvalidRange"),
          life: 6000,
        });
        return;
      }
      setRolloutSubmitting(true);
      try {
        const result = await rolloutEmployeeToShift({
          employeeId: pendingRollout.employeeId,
          shiftId: pendingRollout.block.shiftId,
          fromDate: pendingRollout.fromDate,
          toDate,
        });
        rolloutPanelRef.current?.hide();
        setPendingRollout(null);
        await loadData({ silent: true });
        toastRef.current?.show({
          severity: "success",
          summary: t("schichtplaner.rolloutSuccess", {
            created: result.created,
            updated: result.updated,
            skipped: result.skipped,
          }),
          life: 5000,
        });
      } catch (err) {
        const code = err instanceof ShiftPlannerApiError ? err.code : undefined;
        toastRef.current?.show({
          severity: "error",
          summary: code ? mapAssignError(code, t) : t("schichtplaner.rolloutError"),
          life: 6000,
        });
      } finally {
        setRolloutSubmitting(false);
        setAssigningEmployeeId(null);
      }
    },
    [loadData, pendingRollout, t],
  );

  const showGrid = activeShifts.length > 0 || planningEmployees.length > 0;

  return (
    <div className="app-shift-planner-calendar flex min-h-0 flex-1 flex-col">
      <Toast ref={toastRef} position="top-right" appendTo={overlayAppendTo} />
      <ShiftBlockInfoModal block={infoBlock} onHide={() => setInfoBlock(null)} />
      <ShiftOverviewPanel
        panelRef={overviewPanelRef}
        block={overviewBlock}
        around={overviewAround}
        onHide={() => setOverviewBlock(null)}
      />
      <ShiftAssignRolloutPanel
        panelRef={rolloutPanelRef}
        pending={pendingRollout}
        submitting={rolloutSubmitting}
        onConfirm={handleRolloutConfirm}
        onCancel={handleRolloutCancel}
      />
      <div className="app-shift-planner-calendar-body min-h-0 flex-1 overflow-hidden px-4 py-4">
        {loading ? (
          <p className="text-on-surface-variant">{t("schichtplaner.loading")}</p>
        ) : error ? (
          <p className="text-danger">{error}</p>
        ) : !showGrid ? (
          <p className="text-on-surface-variant">{t("schichtplaner.empty")}</p>
        ) : (
          <ShiftWeekCalendarGrid
            weekStart={weekStart}
            viewMode={viewMode}
            blocks={filteredBlocks}
            shifts={activeShifts}
            planningEmployees={filteredPlanningEmployees}
            draggingEmployeeId={draggingEmployeeId ?? assigningEmployeeId}
            removingBlockId={removingBlockId}
            removingAssignmentId={removingAssignmentId}
            addingShiftId={addingShiftId}
            onRemoveBlock={handleRemoveBlock}
            onAddShift={handleAddShift}
            onAssignEmployee={viewMode === "simple" ? handleAssignEmployee : undefined}
            onRequestRollout={viewMode === "complex" ? handleRequestRollout : undefined}
            onUnassignEmployee={handleUnassignEmployee}
            onEmployeeDragStart={setDraggingEmployeeId}
            onEmployeeDragEnd={() => setDraggingEmployeeId(null)}
            selectedBlockId={selectedBlockId}
            selectedDayIso={selectedDayIso}
            onSelectBlock={handleSelectBlock}
            onSelectDay={handleSelectDay}
            onOpenInfo={handleOpenInfo}
            onOpenShiftOverview={handleOpenShiftOverview}
            disabledEmployeeIds={disabledEmployeeIds}
            disabledEmployeeContext={disabledEmployeeContext}
          />
        )}
        {!loading && !error && showGrid && blocks.length > 0 && filteredBlocks.length === 0 ? (
          <p className="mt-2 text-on-surface-variant">{t("schichtplaner.noSearchResults")}</p>
        ) : null}
      </div>
    </div>
  );
}
