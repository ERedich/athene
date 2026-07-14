import { useRef, useState } from "react";

import { CALENDAR_DRAG_MIME } from "../../lib/calendar/calendarMove";
import {
  isCalendarEmployeeDrag,
  readCalendarEmployeeDragData,
} from "../../lib/calendar/calendarEmployeeDrag";
import { segmentBarStyle, type CalendarEventSegment } from "../../lib/calendar/calendarEventLayout";
import { readableSiteColor } from "../../lib/siteColor";

type Props = {
  segment: CalendarEventSegment;
  tooltip: string;
  isDragging?: boolean;
  disabled?: boolean;
  disabledTooltip?: string;
  draggingEmployeeId?: string | null;
  employeeDropAllowed?: boolean;
  onClick: () => void;
  onAskAthene?: () => void;
  onDragStart?: (workOrderId: string) => void;
  onDragEnd?: () => void;
  onAssignEmployee?: (workOrderId: string, employeeId: string) => void;
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
  disabled = false,
  disabledTooltip,
  draggingEmployeeId,
  employeeDropAllowed = false,
  onClick,
  onAskAthene,
  onDragStart,
  onDragEnd,
  onAssignEmployee,
}: Props) {
  const pos = segmentBarStyle(segment);
  const radiusBefore = segment.continuesBefore ? "0" : "0.25rem";
  const radiusAfter = segment.continuesAfter ? "0" : "0.25rem";
  const textColor = readableSiteColor(segment.siteColorHex);
  const draggedRef = useRef(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [isDropDenied, setIsDropDenied] = useState(false);

  const employeeDragActive = draggingEmployeeId != null;
  const employeeDropDenied = employeeDragActive && !employeeDropAllowed;
  const interactionLocked = disabled || employeeDragActive;

  const handleDragOver = (e: React.DragEvent) => {
    if (disabled || !onAssignEmployee || !isCalendarEmployeeDrag(e.dataTransfer, draggingEmployeeId)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (employeeDropAllowed) {
      setIsDropTarget(true);
      setIsDropDenied(false);
    } else {
      setIsDropTarget(false);
      setIsDropDenied(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDropTarget(false);
    setIsDropDenied(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);
    setIsDropDenied(false);
    if (!onAssignEmployee || !employeeDropAllowed || disabled) return;
    const employeeId = readCalendarEmployeeDragData(e.dataTransfer, draggingEmployeeId);
    if (!employeeId) return;
    onAssignEmployee(segment.eventId, employeeId);
  };

  return (
    <button
      type="button"
      draggable={!interactionLocked}
      className={`app-calendar-event-bar ${orderTypeClass(segment.orderType)}${
        isDragging ? " app-calendar-event-bar--dragging" : ""
      }${disabled ? " app-calendar-event-bar--filter-disabled" : ""}${
        employeeDropDenied ? " app-calendar-event-bar--employee-drop-denied" : ""
      }${isDropTarget ? " app-calendar-event-bar--drop-target" : ""}${
        isDropDenied ? " app-calendar-event-bar--drop-denied" : ""
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
      title={disabled && disabledTooltip ? `${tooltip}\n${disabledTooltip}` : tooltip}
      aria-disabled={disabled || undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragStart={(e) => {
        if (interactionLocked) {
          e.preventDefault();
          return;
        }
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
