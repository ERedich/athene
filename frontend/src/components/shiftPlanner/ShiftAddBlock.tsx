import { Plus } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { OverlayPanel } from "primereact/overlaypanel";

import {
  formatShiftTimeRange,
  shiftDisplayTimes,
  weekdayKeyForDate,
} from "../../lib/shiftPlanner/shiftCalendarExpand";
import { contrastTextOnBackground } from "../../lib/shiftPlanner/shiftCalendarLayout";
import type { ShiftMasterRow } from "../../lib/shiftPlanner/shiftCalendarTypes";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

type Props = {
  isoDate: string;
  availableShifts: ShiftMasterRow[];
  addingShiftId?: string | null;
  onAddShift: (shift: ShiftMasterRow, isoDate: string) => void;
  variant?: "header";
};

function shiftTimeLabel(shift: ShiftMasterRow): string {
  const { startTime, endTime } = shiftDisplayTimes(shift);
  return formatShiftTimeRange(startTime, endTime);
}

export function ShiftAddBlock({
  isoDate,
  availableShifts,
  addingShiftId,
  onAddShift,
  variant,
}: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<OverlayPanel>(null);
  const weekdayKey = weekdayKeyForDate(isoDate);
  const dayLabel = t(`kalendar.weekdays.${weekdayKey}`);
  const hasAvailableShifts = availableShifts.length > 0;
  const busy = addingShiftId !== null && addingShiftId !== undefined;
  const disabled = !hasAvailableShifts || busy;

  const label = hasAvailableShifts
    ? t("schichtplaner.addShift", { day: dayLabel })
    : t("schichtplaner.addShiftNone", { day: dayLabel });

  const buttonClass =
    variant === "header"
      ? "app-shift-planner-day-header__add"
      : "app-shift-planner-block app-shift-planner-block--add";

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!hasAvailableShifts) return;
          panelRef.current?.toggle(e);
        }}
      >
        <Plus
          className={variant === "header" ? "h-5 w-5" : "h-4 w-4"}
          strokeWidth={2.25}
          aria-hidden
        />
      </button>
      {hasAvailableShifts ? (
        <OverlayPanel ref={panelRef} appendTo={overlayAppendTo} className="app-shift-planner-add-panel">
          <p className="app-shift-planner-add-panel__title">
            {t("schichtplaner.addShiftTitle", { day: dayLabel })}
          </p>
          <ul className="app-shift-planner-add-panel__list">
            {availableShifts.map((shift) => {
              const textColor = contrastTextOnBackground(shift.colorHex);
              const shiftBusy = addingShiftId === shift.id;
              return (
                <li key={shift.id}>
                  <button
                    type="button"
                    className="app-shift-planner-add-panel__option"
                    style={{
                      backgroundColor: shift.colorHex,
                      color: textColor,
                    }}
                    disabled={shiftBusy}
                    onClick={() => {
                      panelRef.current?.hide();
                      onAddShift(shift, isoDate);
                    }}
                  >
                    <span className="app-shift-planner-add-panel__code">{shift.shortCode}</span>
                    <span className="app-shift-planner-add-panel__time">{shiftTimeLabel(shift)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </OverlayPanel>
      ) : null}
    </>
  );
}
