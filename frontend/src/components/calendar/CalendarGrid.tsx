import { useTranslation } from "react-i18next";
import type { DragEvent } from "react";

import { isoWeekNumberForWeekStart, type CalendarWeekRow as WeekRow } from "../../lib/calendar/calendarDates";
import type { CalendarEvent } from "../../lib/calendar/calendarTypes";
import type { CalendarWorkOrder } from "../../lib/calendar/calendarWorkOrders";
import { CalendarWeekRow } from "./CalendarWeekRow";

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type Props = {
  weeks: WeekRow[];
  events: CalendarEvent[];
  viewMode: "month" | "week";
  formatDateTime: (iso: string) => string;
  draggingWorkOrderId: string | null;
  draggingEmployeeId?: string | null;
  droppableWorkOrderIds?: ReadonlySet<string> | null;
  workgroupFilterId?: string | null;
  onEventClick: (event: CalendarEvent) => void;
  onAskAthene?: (workOrder: CalendarWorkOrder) => void;
  onOverflowWeekClick?: (weekStart: Date) => void;
  onWeekClick?: (weekStart: Date) => void;
  onDayClick?: (day: Date) => void;
  onDragStart?: (workOrderId: string) => void;
  onDragEnd?: () => void;
  onMoveProposal?: (
    workOrder: CalendarWorkOrder,
    targetDay: Date,
    event: DragEvent | React.MouseEvent,
  ) => void;
  onAssignEmployee?: (workOrderId: string, employeeId: string, dropDayIso: string, event: React.DragEvent) => void;
};

export function CalendarGrid({
  weeks,
  events,
  viewMode,
  formatDateTime,
  draggingWorkOrderId,
  draggingEmployeeId,
  droppableWorkOrderIds,
  workgroupFilterId = null,
  onEventClick,
  onAskAthene,
  onOverflowWeekClick,
  onWeekClick,
  onDayClick,
  onDragStart,
  onDragEnd,
  onMoveProposal,
  onAssignEmployee,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="app-calendar-grid" role="grid" aria-label={t("kalendar.appName")}>
      <div className="app-calendar-grid-head" role="row">
        <div
          className="app-calendar-week-col app-calendar-week-col--header"
          aria-hidden
        >
          <span className="app-calendar-week-col__label">{t("kalendar.calendarWeekShort")}</span>
        </div>
        <div className="app-calendar-weekdays">
          {WEEKDAY_KEYS.map((key) => (
            <div key={key} className="app-calendar-weekday" role="columnheader">
              {t(`kalendar.weekdays.${key}`)}
            </div>
          ))}
        </div>
      </div>
      {weeks.map((week) => {
        const weekNum = isoWeekNumberForWeekStart(week.weekStart);
        return (
          <div key={week.weekStart.toISOString()} className="app-calendar-grid-week">
            {onWeekClick ? (
              <button
                type="button"
                className="app-calendar-week-col"
                title={t("kalendar.openWeekView", { week: weekNum })}
                aria-label={t("kalendar.openWeekView", { week: weekNum })}
                onClick={() => onWeekClick(week.weekStart)}
              >
                {weekNum}
              </button>
            ) : (
              <div className="app-calendar-week-col app-calendar-week-col--static" aria-hidden>
                {weekNum}
              </div>
            )}
            <CalendarWeekRow
              week={week}
              events={events}
              viewMode={viewMode}
              formatDateTime={formatDateTime}
              draggingWorkOrderId={draggingWorkOrderId}
              draggingEmployeeId={draggingEmployeeId}
              droppableWorkOrderIds={droppableWorkOrderIds}
              workgroupFilterId={workgroupFilterId}
              onEventClick={onEventClick}
              onAskAthene={onAskAthene}
              onOverflowWeekClick={onOverflowWeekClick}
              onDayClick={onDayClick}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onMoveProposal={onMoveProposal}
              onAssignEmployee={onAssignEmployee}
            />
          </div>
        );
      })}
    </div>
  );
}
