import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UnfoldHorizontal } from "lucide-react";

import {
  isCalendarEmployeeDrag,
  readCalendarEmployeeDragData,
} from "../../lib/calendar/calendarEmployeeDrag";
import type { CalendarTimelineSegment } from "../../lib/calendar/calendarDayTimelineLayout";
import { timelineSegmentStyle } from "../../lib/calendar/calendarDayTimelineLayout";
import { readableSiteColor } from "../../lib/siteColor";

type Props = {
  segment: CalendarTimelineSegment;
  tooltip: string;
  disabled?: boolean;
  disabledTooltip?: string;
  draggingEmployeeId?: string | null;
  employeeDropAllowed?: boolean;
  readOnly?: boolean;
  onClick: () => void;
  onAskAthene?: () => void;
  onAssignEmployee?: (workOrderId: string, employeeId: string) => void;
};

function orderTypeClass(orderType?: string): string {
  if (orderType === "repair" || orderType === "plannedRepair") return "app-calendar-event-bar--repair";
  if (orderType === "breakdown") return "app-calendar-event-bar--breakdown";
  if (orderType === "inspection") return "app-calendar-event-bar--inspection";
  if (orderType === "maintenancePlan") return "app-calendar-event-bar--maintenancePlan";
  return "app-calendar-event-bar--maintenance";
}

export function CalendarTimelineEventBar({
  segment,
  tooltip,
  disabled = false,
  disabledTooltip,
  draggingEmployeeId,
  employeeDropAllowed = false,
  readOnly = false,
  onClick,
  onAskAthene,
  onAssignEmployee,
}: Props) {
  const { t } = useTranslation();
  const pos = timelineSegmentStyle(segment);
  const radiusBefore = segment.continuesBefore ? "0" : "0.25rem";
  const radiusAfter = segment.continuesAfter ? "0" : "0.25rem";
  const textColor = readableSiteColor(segment.siteColorHex);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [isDropDenied, setIsDropDenied] = useState(false);

  const employeeDragActive = draggingEmployeeId != null;
  const employeeDropDenied = employeeDragActive && !employeeDropAllowed && !readOnly;
  const shortHint = t("kalendar.shortEventExpanded");
  const titleParts = [tooltip];
  if (pos.isShortDisplay) titleParts.push(shortHint);
  if (disabled && disabledTooltip) titleParts.push(disabledTooltip);

  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly || disabled || !onAssignEmployee || !isCalendarEmployeeDrag(e.dataTransfer, draggingEmployeeId)) return;
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
    if (!onAssignEmployee || !employeeDropAllowed || disabled || readOnly) return;
    const employeeId = readCalendarEmployeeDragData(e.dataTransfer, draggingEmployeeId);
    if (!employeeId) return;
    onAssignEmployee(segment.eventId, employeeId);
  };

  return (
    <button
      type="button"
      className={`app-calendar-event-bar ${orderTypeClass(segment.orderType)}${
        disabled ? " app-calendar-event-bar--filter-disabled" : ""
      }${employeeDropDenied ? " app-calendar-event-bar--employee-drop-denied" : ""}${
        isDropTarget ? " app-calendar-event-bar--drop-target" : ""
      }${isDropDenied ? " app-calendar-event-bar--drop-denied" : ""}${
        pos.isShortDisplay ? " app-calendar-event-bar--short" : ""
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
      title={titleParts.join("\n")}
      aria-disabled={disabled || undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onClick}
      onContextMenu={(event) => {
        if (!onAskAthene) return;
        event.preventDefault();
        onAskAthene();
      }}
    >
      {pos.isShortDisplay ? (
        <UnfoldHorizontal
          className="app-calendar-event-bar__short-icon"
          strokeWidth={2.25}
          aria-hidden
        />
      ) : null}
      <span className="app-calendar-event-bar__label">{segment.title}</span>
    </button>
  );
}
