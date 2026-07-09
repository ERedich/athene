import { useTranslation } from "react-i18next";

import { setShiftEmployeeDragData } from "../../lib/shiftPlanner/shiftPlannerDrag";
import type { PlanningEmployee } from "../../lib/shiftPlanner/shiftCalendarTypes";

type Props = {
  employee: PlanningEmployee;
  disabled?: boolean;
  disabledContext?: "block" | "day" | null;
  isDragging?: boolean;
  onDragStart?: (employeeId: string) => void;
  onDragEnd?: () => void;
};

export function ShiftEmployeeChip({
  employee,
  disabled = false,
  disabledContext = null,
  isDragging,
  onDragStart,
  onDragEnd,
}: Props) {
  const { t } = useTranslation();
  const label = `${employee.key} – ${employee.name}`;
  const disabledLabel =
    disabledContext === "day"
      ? t("schichtplaner.employeeAssignedToDay", { name: employee.name })
      : t("schichtplaner.employeeAssignedToBlock", { name: employee.name });

  return (
    <div
      draggable={!disabled}
      className={`app-shift-planner-employee-chip${isDragging ? " app-shift-planner-employee-chip--dragging" : ""}${disabled ? " app-shift-planner-employee-chip--disabled" : ""}`}
      title={disabled ? disabledLabel : label}
      aria-label={disabled ? disabledLabel : t("schichtplaner.dragEmployee", { name: employee.name })}
      aria-disabled={disabled || undefined}
      onDragStart={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
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

