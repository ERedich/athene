import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { isShiftEmployeeDrag, readShiftEmployeeDragData } from "../../lib/shiftPlanner/shiftPlannerDrag";
import { segmentBarStyle, type CalendarEventSegment } from "../../lib/calendar/calendarEventLayout";
import type { WorkOrderAssignment } from "../../lib/workOrderTypes";
import { readableSiteColor } from "../../lib/siteColor";

const RESOURCE_ORDER_LANE_HEIGHT_PX = 44;
const RESOURCE_ORDER_LANE_GAP_PX = 4;
const RESOURCE_ORDER_PAD_PX = 6;

export function resourceOrderLaneTop(laneIndex: number): number {
  return RESOURCE_ORDER_PAD_PX + laneIndex * (RESOURCE_ORDER_LANE_HEIGHT_PX + RESOURCE_ORDER_LANE_GAP_PX);
}

export function resourceOrderPaneHeight(maxLaneIndex: number): number {
  if (maxLaneIndex < 0) return 72;
  return (
    RESOURCE_ORDER_PAD_PX * 2 +
    (maxLaneIndex + 1) * RESOURCE_ORDER_LANE_HEIGHT_PX +
    maxLaneIndex * RESOURCE_ORDER_LANE_GAP_PX
  );
}

function orderTypeClass(orderType?: string): string {
  if (orderType === "repair" || orderType === "plannedRepair") return "app-calendar-event-bar--repair";
  if (orderType === "breakdown") return "app-calendar-event-bar--breakdown";
  if (orderType === "inspection") return "app-calendar-event-bar--inspection";
  return "app-calendar-event-bar--maintenance";
}

type Props = {
  segment: CalendarEventSegment;
  assignments: WorkOrderAssignment[];
  tooltip: string;
  draggingEmployeeId?: string | null;
  employeeDropAllowed?: boolean;
  unassigningEmployeeId?: string | null;
  onClick: () => void;
  onAssignEmployee?: (workOrderId: string, employeeId: string, event: React.DragEvent) => void;
  onUnassignEmployee?: (employeeId: string) => void;
};

export function ShiftResourceOrderBar({
  segment,
  assignments,
  tooltip,
  draggingEmployeeId,
  employeeDropAllowed = false,
  unassigningEmployeeId,
  onClick,
  onAssignEmployee,
  onUnassignEmployee,
}: Props) {
  const { t } = useTranslation();
  const pos = segmentBarStyle(segment);
  const radiusBefore = segment.continuesBefore ? "0" : "0.25rem";
  const radiusAfter = segment.continuesAfter ? "0" : "0.25rem";
  const textColor = readableSiteColor(segment.siteColorHex);
  const employeeDragActive = draggingEmployeeId != null;
  const employeeDropDenied = employeeDragActive && !employeeDropAllowed;

  const handleDragOver = (e: React.DragEvent) => {
    if (!onAssignEmployee || !isShiftEmployeeDrag(e.dataTransfer, draggingEmployeeId)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = employeeDropAllowed ? "copy" : "none";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onAssignEmployee || !employeeDropAllowed) return;
    const employeeId = readShiftEmployeeDragData(e.dataTransfer, draggingEmployeeId);
    if (!employeeId) return;
    onAssignEmployee(segment.eventId, employeeId, e);
  };

  return (
    <div
      className={`app-resource-order-bar app-calendar-event-bar ${orderTypeClass(segment.orderType)}${
        employeeDropDenied ? " app-calendar-event-bar--employee-drop-denied" : ""
      }${employeeDropAllowed && employeeDragActive ? " app-calendar-event-bar--drop-target" : ""}`}
      style={{
        left: pos.left,
        width: pos.width,
        top: resourceOrderLaneTop(segment.laneIndex),
        height: RESOURCE_ORDER_LANE_HEIGHT_PX,
        borderTopLeftRadius: radiusBefore,
        borderBottomLeftRadius: radiusBefore,
        borderTopRightRadius: radiusAfter,
        borderBottomRightRadius: radiusAfter,
        color: textColor,
      }}
      title={tooltip}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <button
        type="button"
        className="app-resource-order-bar__open"
        onClick={onClick}
        style={{ color: textColor }}
      >
        <span className="app-calendar-event-bar__label">{segment.title}</span>
      </button>
      {assignments.length > 0 ? (
        <div className="app-resource-order-bar__chips">
          {assignments.map((assignment) => (
            <span key={assignment.id} className="app-resource-order-bar__chip" title={assignment.employeeName}>
              <span>{assignment.employeeKey}</span>
              {onUnassignEmployee ? (
                <button
                  type="button"
                  className="app-resource-order-bar__chip-remove"
                  aria-label={t("schichtplaner.unassignEmployee", { name: assignment.employeeName })}
                  disabled={unassigningEmployeeId === assignment.employeeId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnassignEmployee(assignment.employeeId);
                  }}
                >
                  <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
