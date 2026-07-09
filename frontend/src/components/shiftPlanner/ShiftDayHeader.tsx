import { useTranslation } from "react-i18next";

import type { ShiftMasterRow } from "../../lib/shiftPlanner/shiftCalendarTypes";
import { JS_DAY_TO_WEEKDAY_KEY } from "../../lib/shiftPlanner/shiftCalendarTypes";
import { ShiftAddBlock } from "./ShiftAddBlock";

type Props = {
  isoDate: string;
  date: Date;
  dateLabel: string;
  isToday: boolean;
  isSelected: boolean;
  availableShifts: ShiftMasterRow[];
  addingShiftId?: string | null;
  onSelectDay?: (isoDate: string) => void;
  onAddShift?: (shift: ShiftMasterRow, isoDate: string) => void;
};

export function ShiftDayHeader({
  isoDate,
  date,
  dateLabel,
  isToday,
  isSelected,
  availableShifts,
  addingShiftId,
  onSelectDay,
  onAddShift,
}: Props) {
  const { t } = useTranslation();
  const weekdayKey = JS_DAY_TO_WEEKDAY_KEY[date.getDay()]!;
  const weekdayLabel = t(`kalendar.weekdays.${weekdayKey}`);

  return (
    <div
      className={`app-shift-planner-day-header${isToday ? " app-shift-planner-day-header--today" : ""}${isSelected ? " app-shift-planner-day-header--selected" : ""}`}
    >
      <button
        type="button"
        className="app-shift-planner-day-header__select"
        aria-label={t("schichtplaner.selectDay", {
          day: weekdayLabel,
          date: dateLabel,
        })}
        aria-pressed={isSelected}
        onClick={() => onSelectDay?.(isoDate)}
      >
        <span className="app-shift-planner-day-header__weekday">{weekdayLabel}</span>
        <span className="app-shift-planner-day-header__date">{dateLabel}</span>
      </button>
      {onAddShift ? (
        <ShiftAddBlock
          variant="header"
          isoDate={isoDate}
          availableShifts={availableShifts}
          addingShiftId={addingShiftId}
          onAddShift={onAddShift}
        />
      ) : null}
    </div>
  );
}
