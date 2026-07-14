import { useTranslation } from "react-i18next";

import { setCalendarEmployeeDragData } from "../../lib/calendar/calendarEmployeeDrag";
import type { CalendarAssignableEmployee } from "../../lib/calendar/calendarEmployeeAssignment";

type Props = {
  employee: CalendarAssignableEmployee;
  disabled?: boolean;
  isDragging?: boolean;
  onDragStart?: (employeeId: string) => void;
  onDragEnd?: () => void;
};

export function CalendarEmployeeChip({ employee, disabled = false, isDragging, onDragStart, onDragEnd }: Props) {
  const { t } = useTranslation();
  const label = `${employee.key} – ${employee.name}`;
  const disabledLabel = t("kalendar.workgroupFilterDisabledEmployee");

  return (
    <div
      draggable={!disabled}
      className={`app-shift-planner-employee-chip${isDragging ? " app-shift-planner-employee-chip--dragging" : ""}${disabled ? " app-shift-planner-employee-chip--disabled" : ""}`}
      title={disabled ? disabledLabel : label}
      aria-label={disabled ? disabledLabel : t("kalendar.dragEmployee", { name: employee.name })}
      aria-disabled={disabled || undefined}
      onDragStart={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        setCalendarEmployeeDragData(e.dataTransfer, employee.id);
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
