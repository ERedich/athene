import { useTranslation } from "react-i18next";

import { setShiftEmployeeDragData } from "../../lib/shiftPlanner/shiftPlannerDrag";
import type { PlanningEmployee } from "../../lib/shiftPlanner/shiftCalendarTypes";

type Props = {
  employee: PlanningEmployee;
  isDragging?: boolean;
  onDragStart?: (employeeId: string) => void;
  onDragEnd?: () => void;
};

export function ShiftEmployeeChip({ employee, isDragging, onDragStart, onDragEnd }: Props) {
  const { t } = useTranslation();
  const label = `${employee.key} – ${employee.name}`;

  return (
    <div
      draggable
      className={`app-shift-planner-employee-chip${isDragging ? " app-shift-planner-employee-chip--dragging" : ""}`}
      title={label}
      aria-label={t("schichtplaner.dragEmployee", { name: employee.name })}
      onDragStart={(e) => {
        setShiftEmployeeDragData(e.dataTransfer, employee.id);
        onDragStart?.(employee.id);
      }}
      onDragEnd={() => {
        onDragEnd?.();
      }}
    >
      <span className="app-shift-planner-employee-chip__key">{employee.key}</span>
      <span className="app-shift-planner-employee-chip__name">{employee.name}</span>
    </div>
  );
}

