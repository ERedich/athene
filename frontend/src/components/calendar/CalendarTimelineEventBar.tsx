import type { CalendarTimelineSegment } from "../../lib/calendar/calendarDayTimelineLayout";
import { timelineSegmentStyle } from "../../lib/calendar/calendarDayTimelineLayout";
import { readableSiteColor } from "../../lib/siteColor";

type Props = {
  segment: CalendarTimelineSegment;
  tooltip: string;
  onClick: () => void;
  onAskAthene?: () => void;
};

function orderTypeClass(orderType?: string): string {
  if (orderType === "repair") return "app-calendar-event-bar--repair";
  if (orderType === "breakdown") return "app-calendar-event-bar--breakdown";
  return "app-calendar-event-bar--maintenance";
}

export function CalendarTimelineEventBar({ segment, tooltip, onClick, onAskAthene }: Props) {
  const pos = timelineSegmentStyle(segment);
  const radiusBefore = segment.continuesBefore ? "0" : "0.25rem";
  const radiusAfter = segment.continuesAfter ? "0" : "0.25rem";
  const textColor = readableSiteColor(segment.siteColorHex);

  return (
    <button
      type="button"
      className={`app-calendar-event-bar ${orderTypeClass(segment.orderType)}`}
      style={{
        left: pos.left,
        width: pos.width,
        top: pos.top,
        borderTopLeftRadius: radiusBefore,
        borderBottomLeftRadius: radiusBefore,
        borderTopRightRadius: radiusAfter,
        borderBottomRightRadius: radiusAfter,
        color: textColor,
      }}
      title={tooltip}
      onClick={onClick}
      onContextMenu={(event) => {
        if (!onAskAthene) return;
        event.preventDefault();
        onAskAthene();
      }}
    >
      <span className="app-calendar-event-bar__label">{segment.title}</span>
    </button>
  );
}
