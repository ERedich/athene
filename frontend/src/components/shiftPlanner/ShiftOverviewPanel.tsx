import { useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { OverlayPanel } from "primereact/overlaypanel";

import { formatIsoDate } from "../../lib/calendar/calendarDates";
import { formatShiftTimeRange } from "../../lib/shiftPlanner/shiftCalendarExpand";
import type { ShiftCalendarBlock } from "../../lib/shiftPlanner/shiftCalendarTypes";
import type { ShiftOverviewAroundDate } from "../../lib/shiftPlanner/shiftOverview";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

type Props = {
  panelRef: RefObject<OverlayPanel>;
  block: ShiftCalendarBlock | null;
  around: ShiftOverviewAroundDate | null;
  onHide?: () => void;
};

function formatDayLabel(isoDate: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    day: "2-digit",
    month: "long",
  }).format(new Date(`${isoDate}T12:00:00`));
}

function DayColumn({
  dateLabel,
  assignments,
  highlighted,
  emptyLabel,
  countLabel,
}: {
  dateLabel: string;
  assignments: ShiftOverviewAroundDate["current"]["assignments"];
  highlighted?: boolean;
  emptyLabel: string;
  countLabel: string;
}) {
  return (
    <div
      className={`app-shift-planner-overview-panel__day${highlighted ? " app-shift-planner-overview-panel__day--current" : ""}`}
    >
      <p className="app-shift-planner-overview-panel__day-date">{dateLabel}</p>
      <p className="app-shift-planner-overview-panel__day-count">{countLabel}</p>
      {assignments.length === 0 ? (
        <p className="app-shift-planner-assignments-panel__empty">{emptyLabel}</p>
      ) : (
        <ul className="app-shift-planner-assignments-panel__list">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="app-shift-planner-assignments-panel__item">
              <span className="app-shift-planner-assignments-panel__key">{assignment.employeeKey}</span>
              <span className="app-shift-planner-assignments-panel__name">{assignment.employeeName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ShiftOverviewPanel({ panelRef, block, around, onHide }: Props) {
  const { t, i18n } = useTranslation();

  const timeLabel = useMemo(
    () => (block ? formatShiftTimeRange(block.startTime, block.endTime) : ""),
    [block],
  );

  const todayIso = formatIsoDate(new Date());
  const dayLabel = (isoDate: string) =>
    isoDate === todayIso
      ? t("schichtplaner.shiftOverviewToday")
      : formatDayLabel(isoDate, i18n.language);

  const prevDateLabel = around ? dayLabel(around.prev.date) : "";
  const currentDateLabel = around ? dayLabel(around.current.date) : "";
  const nextDateLabel = around ? dayLabel(around.next.date) : "";

  return (
    <OverlayPanel
      ref={panelRef}
      appendTo={overlayAppendTo}
      className="app-shift-planner-overview-panel"
      onHide={onHide}
    >
      {block && around ? (
        <div className="app-shift-planner-overview-panel__content">
          <p className="app-shift-planner-overview-panel__title">
            {t("schichtplaner.shiftOverviewTitle", {
              shift: block.shiftName,
              time: timeLabel,
            })}
          </p>
          <div className="app-shift-planner-overview-panel__days">
            <DayColumn
              dateLabel={prevDateLabel}
              assignments={around.prev.assignments}
              emptyLabel={t("schichtplaner.assignedEmployeesEmpty")}
              countLabel={t("schichtplaner.shiftOverviewEmployeeCount", {
                count: around.prev.assignments.length,
              })}
            />
            <DayColumn
              dateLabel={currentDateLabel}
              assignments={around.current.assignments}
              highlighted
              emptyLabel={t("schichtplaner.assignedEmployeesEmpty")}
              countLabel={t("schichtplaner.shiftOverviewEmployeeCount", {
                count: around.current.assignments.length,
              })}
            />
            <DayColumn
              dateLabel={nextDateLabel}
              assignments={around.next.assignments}
              emptyLabel={t("schichtplaner.assignedEmployeesEmpty")}
              countLabel={t("schichtplaner.shiftOverviewEmployeeCount", {
                count: around.next.assignments.length,
              })}
            />
          </div>
        </div>
      ) : null}
    </OverlayPanel>
  );
}
