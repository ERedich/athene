import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  layoutWeekEvents,
  maxLaneIndexForWeek,
} from "../../lib/calendar/calendarEventLayout";
import { addDays, formatIsoDate } from "../../lib/calendar/calendarDates";
import type { CalendarEvent } from "../../lib/calendar/calendarTypes";
import type { CalendarWorkOrder } from "../../lib/calendar/calendarWorkOrders";
import { isoDateFromWeekClientX } from "../../lib/workOrderAssignmentWindow";
import type { WorkOrderAssignment } from "../../lib/workOrderTypes";
import { ShiftResourceOrderBar, resourceOrderPaneHeight } from "./ShiftResourceOrderBar";

type Props = {
  weekStart: Date;
  events: CalendarEvent[];
  assignmentsByOrderId: Map<string, WorkOrderAssignment[]>;
  draggingEmployeeId?: string | null;
  droppableWorkOrderIds?: ReadonlySet<string> | null;
  unassigningEmployeeId?: string | null;
  formatDateTime: (iso: string) => string;
  onOrderClick: (workOrder: CalendarWorkOrder) => void;
  onAssignEmployee: (workOrderId: string, employeeId: string, dropDayIso: string, event: React.DragEvent) => void;
  onUnassignEmployee: (workOrderId: string, employeeId: string) => void;
};

export function ShiftResourceOrderPane({
  weekStart,
  events,
  assignmentsByOrderId,
  draggingEmployeeId,
  droppableWorkOrderIds,
  unassigningEmployeeId,
  formatDateTime,
  onOrderClick,
  onAssignEmployee,
  onUnassignEmployee,
}: Props) {
  const { t } = useTranslation();

  const { segments } = useMemo(
    () => layoutWeekEvents(events, weekStart),
    [events, weekStart],
  );

  const height = resourceOrderPaneHeight(maxLaneIndexForWeek(segments));

  const handleAssign = (workOrderId: string, employeeId: string, event: React.DragEvent) => {
    const layer = event.currentTarget.parentElement;
    if (!layer) return;
    const dropDayIso = isoDateFromWeekClientX(weekStart, event.clientX, layer);
    onAssignEmployee(workOrderId, employeeId, dropDayIso, event);
  };

  return (
    <div className="app-resource-planning-orders" style={{ minHeight: height }}>
      <div className="app-resource-planning-orders__days" aria-hidden>
        {Array.from({ length: 7 }, (_, index) => {
          const iso = formatIsoDate(addDays(weekStart, index));
          return <div key={iso} className="app-resource-planning-orders__day" data-date={iso} />;
        })}
      </div>
      <div className="app-calendar-event-layer app-resource-planning-orders__layer">
        {segments.length === 0 ? (
          <p className="app-resource-planning-orders__empty">{t("schichtplaner.resourceOrdersEmpty")}</p>
        ) : (
          segments.map((seg) => {
            const wo = seg.meta?.workOrder as CalendarWorkOrder | undefined;
            const assignments = assignmentsByOrderId.get(seg.eventId) ?? [];
            const tooltip = wo
              ? `${seg.title}\n${formatDateTime(wo.plannedStart)} – ${formatDateTime(wo.plannedEnd)}`
              : seg.title;
            return (
              <ShiftResourceOrderBar
                key={`${seg.eventId}-${seg.colStart}-${seg.laneIndex}`}
                segment={seg}
                assignments={assignments}
                tooltip={tooltip}
                draggingEmployeeId={draggingEmployeeId}
                employeeDropAllowed={droppableWorkOrderIds?.has(seg.eventId) ?? false}
                unassigningEmployeeId={unassigningEmployeeId}
                onClick={() => {
                  if (wo) onOrderClick(wo);
                }}
                onAssignEmployee={handleAssign}
                onUnassignEmployee={
                  wo
                    ? (employeeId) => onUnassignEmployee(wo.id, employeeId)
                    : undefined
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
}
