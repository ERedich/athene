import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";

import type { CalendarAssignableEmployee } from "../../lib/calendar/calendarEmployeeAssignment";
import { LucideInputSearchIcon } from "../LucideInputSearchIcon";
import { CalendarEmployeeChip } from "./CalendarEmployeeChip";

type Props = {
  employees: CalendarAssignableEmployee[];
  draggingEmployeeId?: string | null;
  onDragStart?: (employeeId: string) => void;
  onDragEnd?: () => void;
};

export function CalendarEmployeePanel({
  employees,
  draggingEmployeeId,
  onDragStart,
  onDragEnd,
}: Props) {
  const { t } = useTranslation();
  const [filterTerm, setFilterTerm] = useState("");

  const filteredEmployees = useMemo(() => {
    const q = filterTerm.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (employee) =>
        employee.name.toLowerCase().includes(q) || employee.key.toLowerCase().includes(q),
    );
  }, [employees, filterTerm]);

  return (
    <aside className="app-calendar-employees" aria-label={t("kalendar.employeesSection")}>
      <div className="app-calendar-employees__head">
        <h3 className="app-calendar-employees__title">{t("kalendar.employeesSection")}</h3>
        {employees.length > 0 ? (
          <div className="app-calendar-employees__head-actions">
            <span className="app-calendar-employees__count">
              {t("kalendar.employeesFilterCount", {
                visible: filteredEmployees.length,
                total: employees.length,
              })}
            </span>
            <IconField iconPosition="left" className="app-calendar-employees__search">
              <LucideInputSearchIcon />
              <InputText
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                placeholder={t("kalendar.employeesFilterPlaceholder")}
                className="app-calendar-employees__search-input app-header-search-input"
                aria-label={t("kalendar.employeesFilterPlaceholder")}
              />
            </IconField>
          </div>
        ) : null}
      </div>

      {employees.length === 0 ? (
        <p className="app-calendar-employees__empty">{t("kalendar.employeesEmpty")}</p>
      ) : filteredEmployees.length === 0 ? (
        <p className="app-calendar-employees__empty">{t("kalendar.employeesFilterNoResults")}</p>
      ) : (
        <div className="app-calendar-employees__list">
          {filteredEmployees.map((employee) => (
            <CalendarEmployeeChip
              key={employee.id}
              employee={employee}
              isDragging={draggingEmployeeId === employee.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
