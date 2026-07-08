import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ShiftAssignment } from "../../lib/shiftPlanner/shiftCalendarTypes";

type Props = {
  assignment: ShiftAssignment;
  removing?: boolean;
  onRemove?: (assignment: ShiftAssignment) => void;
};

export function ShiftAssignedEmployee({ assignment, removing = false, onRemove }: Props) {
  const { t } = useTranslation();

  return (
    <span className="app-shift-planner-assigned-employee" title={assignment.employeeName}>
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
          <X className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
