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
import { ShiftEmployeePool } from "./ShiftEmployeePool";
import { ShiftWeekDayColumn } from "./ShiftWeekDayColumn";

type Props = {
  weekStart: Date;
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
  onUnassignEmployee?: (block: ShiftCalendarBlock, assignmentId: string) => void;
  onEmployeeDragStart?: (employeeId: string) => void;
  onEmployeeDragEnd?: () => void;
};

export function ShiftWeekCalendarGrid({
  weekStart,
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
  onUnassignEmployee,
  onEmployeeDragStart,
  onEmployeeDragEnd,
}: Props) {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => startOfDay(new Date()), []);

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
    <div className="app-shift-planner-week-scroll">
      <div className="app-shift-planner-week-grid" role="grid" aria-label={t("schichtplaner.tabOverview")}>
        <div className="app-shift-planner-week-head" role="row">
          {days.map((day) => (
            <div
              key={day.isoKey}
              className={`app-shift-planner-day-header${day.isToday ? " app-shift-planner-day-header--today" : ""}`}
              role="columnheader"
            >
              <span className="app-shift-planner-day-header__weekday">
                {t(`kalendar.weekdays.${JS_DAY_TO_WEEKDAY_KEY[day.date.getDay()]}`)}
              </span>
              <span className="app-shift-planner-day-header__date">{formatDayHeader(day.date)}</span>
            </div>
          ))}
        </div>

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
              blocks={shiftsByDate.get(day.isoKey) ?? []}
              availableShifts={availableByDate.get(day.isoKey) ?? []}
              draggingEmployeeId={draggingEmployeeId}
              removingBlockId={removingBlockId}
              removingAssignmentId={removingAssignmentId}
              addingShiftId={addingShiftId}
              onRemoveBlock={onRemoveBlock}
              onAddShift={onAddShift}
              onAssignEmployee={onAssignEmployee}
              onUnassignEmployee={onUnassignEmployee}
            />
          ))}
        </div>
      </div>

      <ShiftEmployeePool
        employees={planningEmployees}
        draggingEmployeeId={draggingEmployeeId}
        onDragStart={onEmployeeDragStart}
        onDragEnd={onEmployeeDragEnd}
      />
    </div>
  );
}

export function getWeekStartIso(anchorDate: Date): string {
  return formatIsoDate(getWeekStart(anchorDate));
}

export function shiftWeekAnchor(anchorDate: Date, direction: -1 | 1): Date {
  return addDays(anchorDate, direction * 7);
}
