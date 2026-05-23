import { useMemo, type DragEvent } from "react";
import { useTranslation } from "react-i18next";

import type { CalendarDayCell as DayCell } from "../../lib/calendar/calendarDates";
import { isValidMoveTarget } from "../../lib/calendar/calendarMove";

type Props = {
  cell: DayCell;
  viewMode: "month" | "week";
  dropHighlight?: boolean;
  dropDenied?: boolean;
  onDayClick?: (day: Date) => void;
  onDragOver?: (event: DragEvent, cell: DayCell) => void;
  onDragLeave?: (event: DragEvent, cell: DayCell) => void;
  onDrop?: (event: DragEvent, cell: DayCell) => void;
};

export function CalendarDayCell({
  cell,
  viewMode,
  dropHighlight,
  dropDenied,
  onDayClick,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  const { t, i18n } = useTranslation();
  const dayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(cell.date),
    [cell.date, i18n.language],
  );
  const dimmed = viewMode === "month" && !cell.inMonth;

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = isValidMoveTarget(cell.date) ? "move" : "none";
    onDragOver?.(event, cell);
  };

  return (
    <div
      className={`app-calendar-day${dimmed ? " app-calendar-day--out" : ""}${
        cell.isToday ? " app-calendar-day--today" : ""
      }${dropHighlight ? " app-calendar-day--drop-target" : ""}${
        dropDenied ? " app-calendar-day--drop-denied" : ""
      }`}
      data-date={cell.isoKey}
      onDragOver={handleDragOver}
      onDragLeave={(e) => onDragLeave?.(e, cell)}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.(e, cell);
      }}
    >
      {onDayClick ? (
        <button
          type="button"
          className="app-calendar-day__num"
          title={t("kalendar.openDayView", { date: dayLabel })}
          aria-label={t("kalendar.openDayView", { date: dayLabel })}
          onClick={(e) => {
            e.stopPropagation();
            onDayClick(cell.date);
          }}
        >
          {cell.date.getDate()}
        </button>
      ) : (
        <span className="app-calendar-day__num">{cell.date.getDate()}</span>
      )}
    </div>
  );
}
