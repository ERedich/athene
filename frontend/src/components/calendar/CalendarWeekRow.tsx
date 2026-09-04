import { useMemo, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  layoutWeekEvents,
  maxLaneIndexForWeek,
  weekRowContentHeight,
  type CalendarEventSegment,
} from "../../lib/calendar/calendarEventLayout";
import type { CalendarWeekRow as WeekRow } from "../../lib/calendar/calendarDates";
import { isBeforeToday, isValidMoveTarget } from "../../lib/calendar/calendarMove";
import { isoDateFromWeekClientX } from "../../lib/workOrderAssignmentWindow";
import {
  maintenancePlanMatchesWorkgroupFilter,
  type CalendarMaintenancePlan,
} from "../../lib/calendar/calendarMaintenancePlans";
import { CALENDAR_MONTH_MAX_EVENT_LANES, type CalendarEvent } from "../../lib/calendar/calendarTypes";
import {
  workOrderMatchesWorkgroupFilter,
  type CalendarWorkOrder,
} from "../../lib/calendar/calendarWorkOrders";
import { CalendarDayCell } from "./CalendarDayCell";
import { CalendarEventBar } from "./CalendarEventBar";
import { CalendarMonthOverflowHint } from "./CalendarMonthOverflowHint";

type Props = {
  week: WeekRow;
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

export function CalendarWeekRow({
  week,
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
  onDayClick,
  onDragStart,
  onDragEnd,
  onMoveProposal,
  onAssignEmployee,
}: Props) {
  const { t } = useTranslation();
  const [hoverDropIso, setHoverDropIso] = useState<string | null>(null);

  const maxEventLanes = viewMode === "month" ? CALENDAR_MONTH_MAX_EVENT_LANES : undefined;

  const { segments, overflowCount } = useMemo(
    () => layoutWeekEvents(events, week.weekStart, maxEventLanes),
    [events, maxEventLanes, week.weekStart],
  );

  const showOverflowRow = viewMode === "month" && overflowCount > 0;

  const rowHeight = weekRowContentHeight(maxLaneIndexForWeek(segments), {
    showOverflowRow,
  });

  const segmentTooltip = (seg: CalendarEventSegment): string => {
    if (seg.kind === "maintenancePlan") {
      const plan = seg.meta?.maintenancePlan as CalendarMaintenancePlan | undefined;
      const typeLabel = t("kalendar.orderType.maintenancePlan");
      if (!plan) return `${seg.title}\n${typeLabel}`;
      return `${seg.title}\n${typeLabel}\n${formatDateTime(plan.nextDueAt)}`;
    }
    const wo = seg.meta?.workOrder as CalendarWorkOrder | undefined;
    if (!wo) return seg.title;
    const typeKey = `kalendar.orderType.${wo.orderType}` as const;
    const typeLabel = t(typeKey, { defaultValue: wo.orderType });
    return `${seg.title}\n${typeLabel}\n${formatDateTime(wo.plannedStart)} – ${formatDateTime(wo.plannedEnd)}\n${t("kalendar.askAtheneHint")}`;
  };

  const handleSegmentClick = (seg: CalendarEventSegment) => {
    const event = events.find((ev) => ev.id === seg.eventId);
    if (event) onEventClick(event);
  };

  const resolveWorkOrder = (workOrderId: string): CalendarWorkOrder | undefined => {
    for (const ev of events) {
      if (ev.id === workOrderId && ev.kind === "workOrder") {
        return ev.meta?.workOrder as CalendarWorkOrder | undefined;
      }
    }
    return undefined;
  };

  const handleDrop = (event: DragEvent, cell: (typeof week.days)[0]) => {
    setHoverDropIso(null);
    const wo = draggingWorkOrderId ? resolveWorkOrder(draggingWorkOrderId) : undefined;
    if (!wo) return;
    onMoveProposal?.(wo, cell.date, event);
  };

  return (
    <div
      className={`app-calendar-week-row${draggingWorkOrderId ? " app-calendar-week-row--drag-active" : ""}${
        draggingEmployeeId ? " app-calendar-week-row--employee-drag-active" : ""
      }`}
      style={{ minHeight: rowHeight, height: "100%" }}
    >
      {week.days.map((day) => (
        <CalendarDayCell
          key={day.isoKey}
          cell={day}
          viewMode={viewMode}
          dropHighlight={hoverDropIso === day.isoKey && isValidMoveTarget(day.date)}
          dropDenied={hoverDropIso === day.isoKey && isBeforeToday(day.date)}
          onDayClick={onDayClick}
          onDragOver={(_e, cell) => setHoverDropIso(cell.isoKey)}
          onDragLeave={(e, cell) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setHoverDropIso((cur) => (cur === cell.isoKey ? null : cur));
          }}
          onDrop={handleDrop}
        />
      ))}
      <div
        className="app-calendar-event-layer"
        aria-hidden={segments.length === 0 && !showOverflowRow}
      >
        {segments.map((seg) => {
          const isPlan = seg.kind === "maintenancePlan";
          const wo = seg.meta?.workOrder as CalendarWorkOrder | undefined;
          const plan = seg.meta?.maintenancePlan as CalendarMaintenancePlan | undefined;
          const filterDisabled =
            workgroupFilterId != null &&
            (isPlan
              ? plan != null && !maintenancePlanMatchesWorkgroupFilter(plan, workgroupFilterId)
              : wo != null && !workOrderMatchesWorkgroupFilter(wo, workgroupFilterId));
          return (
          <CalendarEventBar
            key={`${seg.eventId}-${seg.colStart}-${seg.laneIndex}`}
            segment={seg}
            tooltip={segmentTooltip(seg)}
            isDragging={!isPlan && draggingWorkOrderId === seg.eventId}
            disabled={filterDisabled}
            disabledTooltip={filterDisabled ? t("kalendar.workgroupFilterDisabledOrder") : undefined}
            draggingEmployeeId={isPlan ? null : draggingEmployeeId}
            employeeDropAllowed={
              !isPlan && !filterDisabled && (droppableWorkOrderIds?.has(seg.eventId) ?? false)
            }
            readOnly={isPlan}
            onClick={() => handleSegmentClick(seg)}
            onAskAthene={
              !isPlan && onAskAthene
                ? () => {
                    if (wo) onAskAthene(wo);
                  }
                : undefined
            }
            onDragStart={isPlan ? undefined : onDragStart}
            onDragEnd={isPlan ? undefined : onDragEnd}
            onAssignEmployee={
              isPlan || !onAssignEmployee
                ? undefined
                : (workOrderId, employeeId, event) => {
                    const row = event.currentTarget.closest(".app-calendar-week-row");
                    const dropDayIso = row
                      ? isoDateFromWeekClientX(week.weekStart, event.clientX, row as HTMLElement)
                      : week.days[0]?.isoKey ?? "";
                    onAssignEmployee(workOrderId, employeeId, dropDayIso, event);
                  }
            }
          />
          );
        })}
        {showOverflowRow && onOverflowWeekClick ? (
          <CalendarMonthOverflowHint
            overflowCount={overflowCount}
            onClick={() => onOverflowWeekClick(week.weekStart)}
          />
        ) : null}
      </div>
    </div>
  );
}
