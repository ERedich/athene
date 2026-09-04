import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { setShiftEmployeeDragData } from "../../lib/shiftPlanner/shiftPlannerDrag";
import type { ShiftAssignment } from "../../lib/shiftPlanner/shiftCalendarTypes";

type Props = {
  assignment: ShiftAssignment;
  removing?: boolean;
  draggable?: boolean;
  isDragging?: boolean;
  onRemove?: (assignment: ShiftAssignment) => void;
  onDragStart?: (employeeId: string) => void;
  onDragEnd?: () => void;
};

export function ShiftAssignedEmployee({
  assignment,
  removing = false,
  draggable = false,
  isDragging = false,
  onRemove,
  onDragStart,
  onDragEnd,
}: Props) {
  const { t } = useTranslation();

  return (
    <span
      className={`app-shift-planner-assigned-employee${draggable ? " app-shift-planner-assigned-employee--draggable" : ""}${isDragging ? " app-shift-planner-assigned-employee--dragging" : ""}`}
      title={assignment.employeeName}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        setShiftEmployeeDragData(e.dataTransfer, assignment.employeeId);
        onDragStart?.(assignment.employeeId);
      }}
      onDragEnd={() => {
        onDragEnd?.();
      }}
    >
      <span className="app-shift-planner-assigned-employee__label">
        {assignment.employeeKey} – {assignment.employeeName}
      </span>
      {onRemove ? (
        <button
          type="button"
          className="app-shift-planner-assigned-employee__remove"
          aria-label={t("schichtplaner.unassignEmployee", { name: assignment.employeeName })}
          title={t("schichtplaner.unassignEmployee", { name: assignment.employeeName })}
          disabled={removing}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(assignment);
          }}
        >
          <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
