import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Toast } from "primereact/toast";

import {
  formatPeriodTitle,
  getWeekStart,
  isoWeekNumberForWeekStart,
} from "../../lib/calendar/calendarDates";
import { apiFetch } from "../../lib/api";
import {
  addShiftToWeekday,
  expandShiftsForWeek,
  removeShiftFromWeekday,
  weekdayKeyForDate,
} from "../../lib/shiftPlanner/shiftCalendarExpand";
import { attachAssignmentsToBlocks } from "../../lib/shiftPlanner/shiftPlannerMerge";
import {
  assignEmployeeToShift,
  deleteShiftAssignment,
  fetchShiftAssignments,
  ShiftPlannerApiError,
} from "../../lib/shiftPlanner/shiftPlannerApi";
import type {
  PlanningEmployee,
  ShiftCalendarBlock,
  ShiftMasterRow,
} from "../../lib/shiftPlanner/shiftCalendarTypes";
import { getWeekStartIso, ShiftWeekCalendarGrid, shiftWeekAnchor } from "./ShiftWeekCalendarGrid";
import { ShiftWeekCalendarToolbar } from "./ShiftWeekCalendarToolbar";

type Props = {
  anchorDate: Date;
  searchTerm: string;
  onAnchorDateChange: (date: Date) => void;
};

function mapAssignError(code: string | undefined, t: (key: string) => string): string {
  if (code === "site_mismatch") return t("schichtplaner.assignSiteMismatch");
  if (code === "shift_not_on_date") return t("schichtplaner.assignShiftNotOnDate");
  if (code === "employee_not_shift_planning") return t("schichtplaner.assignNotPlanning");
  return t("schichtplaner.assignError");
}

export function ShiftWeekCalendar({ anchorDate, searchTerm, onAnchorDateChange }: Props) {
  const { t, i18n } = useTranslation();
  const toastRef = useRef<Toast>(null);
  const [shifts, setShifts] = useState<ShiftMasterRow[]>([]);
  const [blocks, setBlocks] = useState<ShiftCalendarBlock[]>([]);
  const [planningEmployees, setPlanningEmployees] = useState<PlanningEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingBlockId, setRemovingBlockId] = useState<string | null>(null);
  const [addingShiftId, setAddingShiftId] = useState<string | null>(null);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
  const [assigningEmployeeId, setAssigningEmployeeId] = useState<string | null>(null);
  const [draggingEmployeeId, setDraggingEmployeeId] = useState<string | null>(null);

  const weekStart = useMemo(() => getWeekStart(anchorDate), [anchorDate]);
  const weekStartIso = useMemo(() => getWeekStartIso(anchorDate), [anchorDate]);

  const activeShifts = useMemo(() => shifts.filter((s) => s.isActive), [shifts]);

  const periodTitle = useMemo(() => {
    const base = formatPeriodTitle(anchorDate, "week", i18n.language);
    const weekNum = isoWeekNumberForWeekStart(weekStart);
    return `${t("schichtplaner.calendarWeekShort", { week: weekNum })} · ${base}`;
  }, [anchorDate, i18n.language, t, weekStart]);

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
      const assignments = assignmentsRes;

      const expanded = expandShiftsForWeek(loadedShifts, weekStartIso);
      const withAssignments = attachAssignmentsToBlocks(expanded, assignments);
      const planning = employees.filter((e) => e.isActive && e.isShiftPlanning);

      setShifts(loadedShifts);
      setBlocks(withAssignments);
      setPlanningEmployees(planning);
    } catch {
      setError(t("schichtplaner.loadError"));
      setShifts([]);
      setBlocks([]);
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
      setAssigningEmployeeId(employeeId);
      try {
        await assignEmployeeToShift({
          employeeId,
          shiftId: block.shiftId,
          assignmentDate: block.date,
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

  const handlePrev = useCallback(() => {
    onAnchorDateChange(shiftWeekAnchor(anchorDate, -1));
  }, [anchorDate, onAnchorDateChange]);

  const handleNext = useCallback(() => {
    onAnchorDateChange(shiftWeekAnchor(anchorDate, 1));
  }, [anchorDate, onAnchorDateChange]);

  const handleToday = useCallback(() => {
    onAnchorDateChange(new Date());
  }, [onAnchorDateChange]);

  const showGrid = activeShifts.length > 0 || planningEmployees.length > 0;

  return (
    <div className="app-shift-planner-calendar flex min-h-0 flex-1 flex-col">
      <Toast ref={toastRef} />
      <div className="app-shift-planner-calendar-toolbar shrink-0 px-4 py-3">
        <ShiftWeekCalendarToolbar
          periodTitle={periodTitle}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
        />
      </div>
      <div className="app-shift-planner-calendar-body min-h-0 flex-1 overflow-hidden px-4 pb-4">
        {loading ? (
          <p className="text-on-surface-variant">{t("schichtplaner.loading")}</p>
        ) : error ? (
          <p className="text-danger">{error}</p>
        ) : !showGrid ? (
          <p className="text-on-surface-variant">{t("schichtplaner.empty")}</p>
        ) : (
          <ShiftWeekCalendarGrid
            weekStart={weekStart}
            blocks={filteredBlocks}
            shifts={activeShifts}
            planningEmployees={filteredPlanningEmployees}
            draggingEmployeeId={draggingEmployeeId ?? assigningEmployeeId}
            removingBlockId={removingBlockId}
            removingAssignmentId={removingAssignmentId}
            addingShiftId={addingShiftId}
            onRemoveBlock={handleRemoveBlock}
            onAddShift={handleAddShift}
            onAssignEmployee={handleAssignEmployee}
            onUnassignEmployee={handleUnassignEmployee}
            onEmployeeDragStart={setDraggingEmployeeId}
            onEmployeeDragEnd={() => setDraggingEmployeeId(null)}
          />
        )}
        {!loading && !error && showGrid && blocks.length > 0 && filteredBlocks.length === 0 ? (
          <p className="mt-2 text-on-surface-variant">{t("schichtplaner.noSearchResults")}</p>
        ) : null}
      </div>
    </div>
  );
}
