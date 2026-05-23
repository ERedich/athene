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
import type { CalendarEvent } from "../../lib/calendar/calendarTypes";
import type { CalendarWorkOrder } from "../../lib/calendar/calendarWorkOrders";
import { CalendarTimelineEventBar } from "./CalendarTimelineEventBar";
import { CalendarTimelineHourHeader } from "./CalendarTimelineHourHeader";

type Props = {
  anchorDate: Date;
  events: CalendarEvent[];
  formatDateTime: (iso: string) => string;
  onEventClick: (workOrder: CalendarWorkOrder) => void;
  onAskAthene?: (workOrder: CalendarWorkOrder) => void;
};

export function CalendarDayTimeline({
  anchorDate,
  events,
  formatDateTime,
  onEventClick,
  onAskAthene,
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
    const wo = seg.meta?.workOrder as CalendarWorkOrder | undefined;
    if (!wo) return seg.title;
    const typeKey = `kalendar.orderType.${wo.orderType}` as const;
    const typeLabel = t(typeKey, { defaultValue: wo.orderType });
    return `${seg.title}\n${typeLabel}\n${formatDateTime(wo.plannedStart)} – ${formatDateTime(wo.plannedEnd)}\n${t("kalendar.askAtheneHint")}`;
  };

  const handleSegmentClick = (seg: CalendarTimelineSegment) => {
    const wo = seg.meta?.workOrder as CalendarWorkOrder | undefined;
    if (wo) onEventClick(wo);
  };

  return (
    <div className="app-calendar-day-timeline" role="grid" aria-label={t("kalendar.viewDay")}>
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
              {segments.map((seg) => (
                <CalendarTimelineEventBar
                  key={`${seg.eventId}-${seg.startMinute}-${seg.laneIndex}`}
                  segment={seg}
                  tooltip={segmentTooltip(seg)}
                  onClick={() => handleSegmentClick(seg)}
                  onAskAthene={
                    onAskAthene
                      ? () => {
                          const wo = seg.meta?.workOrder as CalendarWorkOrder | undefined;
                          if (wo) onAskAthene(wo);
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
