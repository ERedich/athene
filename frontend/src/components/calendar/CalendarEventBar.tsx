import { useRef } from "react";

import { CALENDAR_DRAG_MIME } from "../../lib/calendar/calendarMove";
import { segmentBarStyle, type CalendarEventSegment } from "../../lib/calendar/calendarEventLayout";
import { readableSiteColor } from "../../lib/siteColor";

type Props = {
  segment: CalendarEventSegment;
  tooltip: string;
  isDragging?: boolean;
  onClick: () => void;
  onAskAthene?: () => void;
  onDragStart?: (workOrderId: string) => void;
  onDragEnd?: () => void;
};

function orderTypeClass(orderType?: string): string {
  if (orderType === "repair") return "app-calendar-event-bar--repair";
  if (orderType === "breakdown") return "app-calendar-event-bar--breakdown";
  return "app-calendar-event-bar--maintenance";
}

export function CalendarEventBar({
  segment,
  tooltip,
  isDragging,
  onClick,
  onAskAthene,
  onDragStart,
  onDragEnd,
}: Props) {
  const pos = segmentBarStyle(segment);
  const radiusBefore = segment.continuesBefore ? "0" : "0.25rem";
  const radiusAfter = segment.continuesAfter ? "0" : "0.25rem";
  const textColor = readableSiteColor(segment.siteColorHex);
  const draggedRef = useRef(false);

  return (
    <button
      type="button"
      draggable
      className={`app-calendar-event-bar ${orderTypeClass(segment.orderType)}${
        isDragging ? " app-calendar-event-bar--dragging" : ""
      }`}
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
      onDragStart={(e) => {
        draggedRef.current = true;
        e.dataTransfer.setData(CALENDAR_DRAG_MIME, segment.eventId);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(segment.eventId);
      }}
      onDragEnd={() => {
        onDragEnd?.();
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }}
      onClick={() => {
        if (draggedRef.current) return;
        onClick();
      }}
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
