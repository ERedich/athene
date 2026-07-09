import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  addDays,
  buildWeekGrid,
  formatIsoDate,
  getWeekStart,
  startOfDay,
} from "../../lib/calendar/calendarDates";
import {
  getShiftsAvailableForWeekday,
  weekdayKeyForDate,
} from "../../lib/shiftPlanner/shiftCalendarExpand";
import { groupShiftsByDate } from "../../lib/shiftPlanner/shiftCalendarLayout";
import type {
  PlanningEmployee,
  ShiftCalendarBlock,
  ShiftMasterRow,
} from "../../lib/shiftPlanner/shiftCalendarTypes";
import { JS_DAY_TO_WEEKDAY_KEY } from "../../lib/shiftPlanner/shiftCalendarTypes";
import type { ShiftPlannerViewMode } from "../../lib/shiftPlanner/shiftPlannerViewMode";
import { ShiftDayHeader } from "./ShiftDayHeader";
import { ShiftEmployeePool } from "./ShiftEmployeePool";
import { ShiftWeekDayColumn } from "./ShiftWeekDayColumn";
import { ShiftWeekTimeAxis } from "./ShiftWeekTimeAxis";

type Props = {
  weekStart: Date;
  viewMode: ShiftPlannerViewMode;
  blocks: ShiftCalendarBlock[];
  shifts: ShiftMasterRow[];
  planningEmployees: PlanningEmployee[];
  draggingEmployeeId?: string | null;
  removingBlockId?: string | null;
  removingAssignmentId?: string | null;
  addingShiftId?: string | null;
  onRemoveBlock?: (block: ShiftCalendarBlock) => void;
  onAddShift?: (shift: ShiftMasterRow, isoDate: string) => void;
  onAssignEmployee?: (block: ShiftCalendarBlock, employeeId: string) => void;
  onRequestRollout?: (
    block: ShiftCalendarBlock,
    employeeId: string,
    event: React.SyntheticEvent,
  ) => void;
  onUnassignEmployee?: (block: ShiftCalendarBlock, assignmentId: string) => void;
  onEmployeeDragStart?: (employeeId: string) => void;
  onEmployeeDragEnd?: () => void;
  selectedBlockId?: string | null;
  selectedDayIso?: string | null;
  onSelectBlock?: (block: ShiftCalendarBlock) => void;
  onSelectDay?: (isoDate: string) => void;
  onOpenInfo?: (block: ShiftCalendarBlock) => void;
  disabledEmployeeIds?: ReadonlySet<string>;
  disabledEmployeeContext?: "block" | "day" | null;
};

export function ShiftWeekCalendarGrid({
  weekStart,
  viewMode,
  blocks,
  shifts,
  planningEmployees,
  draggingEmployeeId,
  removingBlockId,
  removingAssignmentId,
  addingShiftId,
  onRemoveBlock,
  onAddShift,
  onAssignEmployee,
  onRequestRollout,
  onUnassignEmployee,
  onEmployeeDragStart,
  onEmployeeDragEnd,
  selectedBlockId,
  selectedDayIso,
  onSelectBlock,
  onSelectDay,
  onOpenInfo,
  disabledEmployeeIds,
  disabledEmployeeContext,
}: Props) {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => startOfDay(new Date()), []);
  const isComplex = viewMode === "complex";

  const days = useMemo(() => {
    const week = buildWeekGrid(weekStart)[0];
    return week?.days ?? [];
  }, [weekStart]);

  const shiftsByDate = useMemo(() => groupShiftsByDate(blocks), [blocks]);

  const availableByDate = useMemo(() => {
    const map = new Map<string, ShiftMasterRow[]>();
    for (const day of days) {
      const weekdayKey = weekdayKeyForDate(day.isoKey);
      map.set(day.isoKey, getShiftsAvailableForWeekday(shifts, weekdayKey));
    }
    return map;
  }, [days, shifts]);

  const formatDayHeader = (date: Date) => {
    return new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" }).format(date);
  };

  return (
    <div className="app-shift-planner-calendar-content">
      <ShiftEmployeePool
        employees={planningEmployees}
        disabledEmployeeIds={disabledEmployeeIds}
        disabledEmployeeContext={disabledEmployeeContext}
        draggingEmployeeId={draggingEmployeeId}
        onDragStart={onEmployeeDragStart}
        onDragEnd={onEmployeeDragEnd}
      />

      <div className="app-shift-planner-week-scroll">
        <div
          className={`app-shift-planner-week-layout${isComplex ? "" : " app-shift-planner-week-layout--simple"}`}
          role="grid"
          aria-label={t("schichtplaner.tabOverview")}
        >
          {isComplex ? <div className="app-shift-planner-week-layout__corner" aria-hidden /> : null}
          <div className="app-shift-planner-week-head" role="row">
            {days.map((day) => (
              <ShiftDayHeader
                key={day.isoKey}
                isoDate={day.isoKey}
                date={day.date}
                dateLabel={formatDayHeader(day.date)}
                isToday={day.date.getTime() === today.getTime()}
                isSelected={selectedDayIso === day.isoKey}
                availableShifts={availableByDate.get(day.isoKey) ?? []}
                addingShiftId={addingShiftId}
                onSelectDay={onSelectDay}
                onAddShift={onAddShift}
              />
            ))}
          </div>

          {isComplex ? <ShiftWeekTimeAxis /> : null}

          <div
            className={`app-shift-planner-week-body${draggingEmployeeId ? " app-shift-planner-week-body--drag-active" : ""}`}
            role="row"
          >
            {days.map((day) => (
              <ShiftWeekDayColumn
                key={day.isoKey}
                isoDate={day.isoKey}
                dayLabel={t(`kalendar.weekdays.${JS_DAY_TO_WEEKDAY_KEY[day.date.getDay()]}`)}
                dateLabel={formatDayHeader(day.date)}
                isToday={day.date.getTime() === today.getTime()}
                isSelectedDay={selectedDayIso === day.isoKey}
                viewMode={viewMode}
                blocks={shiftsByDate.get(day.isoKey) ?? []}
                draggingEmployeeId={draggingEmployeeId}
                removingBlockId={removingBlockId}
                removingAssignmentId={removingAssignmentId}
                onRemoveBlock={onRemoveBlock}
                onAssignEmployee={onAssignEmployee}
                onRequestRollout={onRequestRollout}
                onUnassignEmployee={onUnassignEmployee}
                selectedBlockId={selectedBlockId}
                onSelectBlock={onSelectBlock}
                onOpenInfo={onOpenInfo}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function getWeekStartIso(anchorDate: Date): string {
  return formatIsoDate(getWeekStart(anchorDate));
}

export function shiftWeekAnchor(anchorDate: Date, direction: -1 | 1): Date {
  return addDays(anchorDate, direction * 7);
}
