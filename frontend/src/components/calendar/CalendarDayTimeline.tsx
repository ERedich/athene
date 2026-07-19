import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { eventIntersectsDay } from "../../lib/calendar/calendarDates";
import {
  DAY_TIMELINE_TRACK_MIN_WIDTH_PX,
  layoutDayTimelineEvents,
  maxTimelineLaneIndex,
  timelineTrackHeight,
  type CalendarTimelineSegment,
} from "../../lib/calendar/calendarDayTimelineLayout";
import type { CalendarMaintenancePlan } from "../../lib/calendar/calendarMaintenancePlans";
import type { CalendarEvent } from "../../lib/calendar/calendarTypes";
import type { CalendarWorkOrder } from "../../lib/calendar/calendarWorkOrders";
import { CalendarTimelineEventBar } from "./CalendarTimelineEventBar";
import { CalendarTimelineHourHeader } from "./CalendarTimelineHourHeader";

type Props = {
  anchorDate: Date;
  events: CalendarEvent[];
  formatDateTime: (iso: string) => string;
  draggingEmployeeId?: string | null;
  droppableWorkOrderIds?: ReadonlySet<string> | null;
  workgroupFilterId?: string | null;
  onEventClick: (event: CalendarEvent) => void;
  onAskAthene?: (workOrder: CalendarWorkOrder) => void;
  onAssignEmployee?: (workOrderId: string, employeeId: string) => void;
};

export function CalendarDayTimeline({
  anchorDate,
  events,
  formatDateTime,
  draggingEmployeeId,
  droppableWorkOrderIds,
  workgroupFilterId = null,
  onEventClick,
  onAskAthene,
  onAssignEmployee,
}: Props) {
  const { t } = useTranslation();

  const dayEvents = useMemo(
    () => events.filter((ev) => eventIntersectsDay(ev.start, ev.end, anchorDate)),
    [anchorDate, events],
  );

  const segments = useMemo(
    () => layoutDayTimelineEvents(dayEvents, anchorDate),
    [anchorDate, dayEvents],
  );

  const trackHeight = timelineTrackHeight(maxTimelineLaneIndex(segments));

  const segmentTooltip = (seg: CalendarTimelineSegment): string => {
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

  const handleSegmentClick = (seg: CalendarTimelineSegment) => {
    const event = dayEvents.find((ev) => ev.id === seg.eventId);
    if (event) onEventClick(event);
  };

  return (
    <div
      className={`app-calendar-day-timeline${draggingEmployeeId ? " app-calendar-day-timeline--employee-drag-active" : ""}`}
      role="grid"
      aria-label={t("kalendar.viewDay")}
    >
      <div className="app-calendar-day-timeline-scroll">
        <div
          className="app-calendar-day-timeline-inner"
          style={{ minWidth: DAY_TIMELINE_TRACK_MIN_WIDTH_PX }}
        >
          <CalendarTimelineHourHeader />
          <div className="app-calendar-timeline-track" style={{ minHeight: trackHeight }}>
            <div className="app-calendar-timeline-grid" aria-hidden>
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} className="app-calendar-timeline-grid-cell" />
              ))}
            </div>
            <div className="app-calendar-timeline-events">
              {segments.map((seg) => {
                const isPlan = seg.kind === "maintenancePlan";
                const wo = seg.meta?.workOrder as CalendarWorkOrder | undefined;
                const plan = seg.meta?.maintenancePlan as CalendarMaintenancePlan | undefined;
                const filterDisabled =
                  workgroupFilterId != null &&
                  (isPlan
                    ? plan != null && plan.workgroupId !== workgroupFilterId
                    : wo != null && wo.workgroupId !== workgroupFilterId);
                return (
                <CalendarTimelineEventBar
                  key={`${seg.eventId}-${seg.startMinute}-${seg.laneIndex}`}
                  segment={seg}
                  tooltip={segmentTooltip(seg)}
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
                  onAssignEmployee={isPlan ? undefined : onAssignEmployee}
                />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
