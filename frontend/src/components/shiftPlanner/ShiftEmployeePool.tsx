import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";

import type { PlanningEmployee } from "../../lib/shiftPlanner/shiftCalendarTypes";
import { LucideInputSearchIcon } from "../LucideInputSearchIcon";
import { ShiftEmployeeChip } from "./ShiftEmployeeChip";

type AvailabilityFilter = "all" | "available" | "assigned";

type Props = {
  employees: PlanningEmployee[];
  disabledEmployeeIds?: ReadonlySet<string>;
  disabledEmployeeContext?: "block" | "day" | null;
  draggingEmployeeId?: string | null;
  onDragStart?: (employeeId: string) => void;
  onDragEnd?: () => void;
};

export function ShiftEmployeePool({
  employees,
  disabledEmployeeIds,
  disabledEmployeeContext,
  draggingEmployeeId,
  onDragStart,
  onDragEnd,
}: Props) {
  const { t } = useTranslation();
  const [filterTerm, setFilterTerm] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");

  const hasAssignmentContext = disabledEmployeeContext != null;

  const filteredEmployees = useMemo(() => {
    const q = filterTerm.trim().toLowerCase();
    return employees.filter((employee) => {
      const isAssigned = disabledEmployeeIds?.has(employee.id) ?? false;
      if (availabilityFilter === "available" && isAssigned) return false;
      if (availabilityFilter === "assigned" && !isAssigned) return false;
      if (!q) return true;
      return employee.name.toLowerCase().includes(q) || employee.key.toLowerCase().includes(q);
    });
  }, [availabilityFilter, disabledEmployeeIds, employees, filterTerm]);

  return (
    <section className="app-shift-planner-employees" aria-label={t("schichtplaner.employeesSection")}>
      <div className="app-shift-planner-employees__head">
        <h3 className="app-shift-planner-employees__title">{t("schichtplaner.employeesSection")}</h3>
        {employees.length > 0 && hasAssignmentContext ? (
          <div
            className="app-shift-planner-employees__availability"
            role="group"
            aria-label={t("schichtplaner.employeesFilterAvailability")}
          >
            {(
              [
                ["all", t("schichtplaner.employeesFilterAll")],
                ["available", t("schichtplaner.employeesFilterAvailable")],
                ["assigned", t("schichtplaner.employeesFilterAssigned")],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`app-shift-planner-employees__filter-btn${availabilityFilter === mode ? " app-shift-planner-employees__filter-btn--active" : ""}`}
                aria-pressed={availabilityFilter === mode}
                onClick={() => setAvailabilityFilter(mode)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {employees.length > 0 ? (
          <div className="app-shift-planner-employees__head-actions">
            <span className="app-shift-planner-employees__count">
              {t("schichtplaner.employeesFilterCount", {
                visible: filteredEmployees.length,
                total: employees.length,
              })}
            </span>
            <IconField iconPosition="left" className="app-shift-planner-employees__search">
              <LucideInputSearchIcon />
              <InputText
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                placeholder={t("schichtplaner.employeesFilterPlaceholder")}
                className="app-shift-planner-employees__search-input app-header-search-input"
                aria-label={t("schichtplaner.employeesFilterPlaceholder")}
              />
            </IconField>
          </div>
        ) : null}
      </div>

      {employees.length === 0 ? (
        <p className="app-shift-planner-employees__empty">{t("schichtplaner.employeesEmpty")}</p>
      ) : filteredEmployees.length === 0 ? (
        <p className="app-shift-planner-employees__empty">{t("schichtplaner.employeesFilterNoResults")}</p>
      ) : (
        <div className="app-shift-planner-employees__list">
          {filteredEmployees.map((employee) => (
            <ShiftEmployeeChip
              key={employee.id}
              employee={employee}
              disabled={disabledEmployeeIds?.has(employee.id) ?? false}
              disabledContext={disabledEmployeeIds?.has(employee.id) ? disabledEmployeeContext : null}
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
