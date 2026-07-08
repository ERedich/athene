import { useTranslation } from "react-i18next";

import type { PlanningEmployee } from "../../lib/shiftPlanner/shiftCalendarTypes";
import { ShiftEmployeeChip } from "./ShiftEmployeeChip";

type Props = {
  employees: PlanningEmployee[];
  draggingEmployeeId?: string | null;
  onDragStart?: (employeeId: string) => void;
  onDragEnd?: () => void;
};

export function ShiftEmployeePool({
  employees,
  draggingEmployeeId,
  onDragStart,
  onDragEnd,
}: Props) {
  const { t } = useTranslation();

  return (
    <section className="app-shift-planner-employees" aria-label={t("schichtplaner.employeesSection")}>
      <h3 className="app-shift-planner-employees__title">{t("schichtplaner.employeesSection")}</h3>
      {employees.length === 0 ? (
        <p className="app-shift-planner-employees__empty">{t("schichtplaner.employeesEmpty")}</p>
      ) : (
        <div className="app-shift-planner-employees__list">
          {employees.map((employee) => (
            <ShiftEmployeeChip
              key={employee.id}
              employee={employee}
              isDragging={draggingEmployeeId === employee.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </section>
  );
}
