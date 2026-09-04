import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { buildWeekGrid, startOfDay } from "../../lib/calendar/calendarDates";
import { groupShiftsByDate } from "../../lib/shiftPlanner/shiftCalendarLayout";
import type { CalendarEvent } from "../../lib/calendar/calendarTypes";
import type { CalendarWorkOrder } from "../../lib/calendar/calendarWorkOrders";
import type { WorkOrderAssignment } from "../../lib/workOrderTypes";
import { JS_DAY_TO_WEEKDAY_KEY } from "../../lib/shiftPlanner/shiftCalendarTypes";
import type { ShiftCalendarBlock } from "../../lib/shiftPlanner/shiftCalendarTypes";
import type { ShiftPlannerViewMode } from "../../lib/shiftPlanner/shiftPlannerViewMode";
import { ShiftDayHeader } from "./ShiftDayHeader";
import { ShiftResourceOrderPane } from "./ShiftResourceOrderPane";
import { ShiftWeekDayColumn } from "./ShiftWeekDayColumn";
import { ShiftWeekTimeAxis } from "./ShiftWeekTimeAxis";

type Props = {
  weekStart: Date;
  viewMode: ShiftPlannerViewMode;
  events: CalendarEvent[];
  blocks: ShiftCalendarBlock[];
  assignmentsByOrderId: Map<string, WorkOrderAssignment[]>;
  draggingEmployeeId?: string | null;
  droppableWorkOrderIds?: ReadonlySet<string> | null;
  unassigningEmployeeId?: string | null;
  removingAssignmentId?: string | null;
  formatDateTime: (iso: string) => string;
  onOrderClick: (workOrder: CalendarWorkOrder) => void;
  onAssignEmployeeToOrder: (workOrderId: string, employeeId: string, dropDayIso: string, event: React.DragEvent) => void;
  onUnassignEmployeeFromOrder: (workOrderId: string, employeeId: string) => void;
  onAssignedEmployeeDragStart?: (employeeId: string, block: ShiftCalendarBlock) => void;
  onAssignedEmployeeDragEnd?: () => void;
  onOpenInfo?: (block: ShiftCalendarBlock) => void;
};

export function ShiftResourcePlanningGrid({
  weekStart,
  viewMode,
  events,
  blocks,
  assignmentsByOrderId,
  draggingEmployeeId,
  droppableWorkOrderIds,
  unassigningEmployeeId,
  removingAssignmentId,
  formatDateTime,
  onOrderClick,
  onAssignEmployeeToOrder,
  onUnassignEmployeeFromOrder,
  onAssignedEmployeeDragStart,
  onAssignedEmployeeDragEnd,
  onOpenInfo,
}: Props) {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => startOfDay(new Date()), []);
  const isComplex = viewMode === "complex";

  const days = useMemo(() => {
    const week = buildWeekGrid(weekStart)[0];
    return week?.days ?? [];
  }, [weekStart]);

  const shiftsByDate = useMemo(() => groupShiftsByDate(blocks), [blocks]);

  const formatDayHeader = (date: Date) => {
    return new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" }).format(date);
  };

  return (
    <div
      className={`app-resource-planning-week${isComplex ? "" : " app-resource-planning-week--simple"}`}
      role="grid"
      aria-label={t("schichtplaner.tabResources")}
    >
      {isComplex ? <div className="app-shift-planner-week-layout__corner app-resource-planning-week__corner" aria-hidden /> : null}
      <div className="app-shift-planner-week-head app-resource-planning-week__head" role="row">
        {days.map((day) => (
          <ShiftDayHeader
            key={day.isoKey}
            isoDate={day.isoKey}
            date={day.date}
            dateLabel={formatDayHeader(day.date)}
            isToday={day.date.getTime() === today.getTime()}
            isSelected={false}
            availableShifts={[]}
          />
        ))}
      </div>

      {isComplex ? <div className="app-resource-planning-week__orders-gutter" aria-hidden /> : null}
      <ShiftResourceOrderPane
        weekStart={weekStart}
        events={events}
        assignmentsByOrderId={assignmentsByOrderId}
        draggingEmployeeId={draggingEmployeeId}
        droppableWorkOrderIds={droppableWorkOrderIds}
        unassigningEmployeeId={unassigningEmployeeId}
        formatDateTime={formatDateTime}
        onOrderClick={onOrderClick}
        onAssignEmployee={onAssignEmployeeToOrder}
        onUnassignEmployee={onUnassignEmployeeFromOrder}
      />

      <div className="app-resource-planning-week__shifts">
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
              viewMode={viewMode}
              blocks={shiftsByDate.get(day.isoKey) ?? []}
              draggingEmployeeId={draggingEmployeeId}
              removingAssignmentId={removingAssignmentId}
              onOpenInfo={onOpenInfo}
              onAssignedEmployeeDragStart={onAssignedEmployeeDragStart}
              onAssignedEmployeeDragEnd={onAssignedEmployeeDragEnd}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
