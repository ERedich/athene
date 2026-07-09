import { useTranslation } from "react-i18next";

import { setCalendarEmployeeDragData } from "../../lib/calendar/calendarEmployeeDrag";
import type { CalendarAssignableEmployee } from "../../lib/calendar/calendarEmployeeAssignment";

type Props = {
  employee: CalendarAssignableEmployee;
  isDragging?: boolean;
  onDragStart?: (employeeId: string) => void;
  onDragEnd?: () => void;
};

export function CalendarEmployeeChip({ employee, isDragging, onDragStart, onDragEnd }: Props) {
  const { t } = useTranslation();
  const label = `${employee.key} – ${employee.name}`;

  return (
    <div
      draggable
      className={`app-shift-planner-employee-chip${isDragging ? " app-shift-planner-employee-chip--dragging" : ""}`}
      title={label}
      aria-label={t("kalendar.dragEmployee", { name: employee.name })}
      onDragStart={(e) => {
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
