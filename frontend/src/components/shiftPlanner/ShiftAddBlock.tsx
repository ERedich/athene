import { Plus } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { OverlayPanel } from "primereact/overlaypanel";

import {
  formatShiftTimeRange,
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
};

function shiftTimeLabel(shift: ShiftMasterRow): string {
  const start = shift.startTime.slice(0, 5);
  let end = shift.endTime.slice(0, 5);
  if (end <= start) end = "24:00";
  return formatShiftTimeRange(start, end);
}

export function ShiftAddBlock({ isoDate, availableShifts, addingShiftId, onAddShift }: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<OverlayPanel>(null);
  const weekdayKey = weekdayKeyForDate(isoDate);

  if (availableShifts.length === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="app-shift-planner-block app-shift-planner-block--add"
        aria-label={t("schichtplaner.addShift", {
          day: t(`kalendar.weekdays.${weekdayKey}`),
        })}
        title={t("schichtplaner.addShift", {
          day: t(`kalendar.weekdays.${weekdayKey}`),
        })}
        disabled={addingShiftId !== null && addingShiftId !== undefined}
        onClick={(e) => panelRef.current?.toggle(e)}
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </button>
      <OverlayPanel ref={panelRef} appendTo={overlayAppendTo} className="app-shift-planner-add-panel">
        <p className="app-shift-planner-add-panel__title">
          {t("schichtplaner.addShiftTitle", { day: t(`kalendar.weekdays.${weekdayKey}`) })}
        </p>
        <ul className="app-shift-planner-add-panel__list">
          {availableShifts.map((shift) => {
            const textColor = contrastTextOnBackground(shift.colorHex);
            const busy = addingShiftId === shift.id;
            return (
              <li key={shift.id}>
                <button
                  type="button"
                  className="app-shift-planner-add-panel__option"
                  style={{
                    backgroundColor: shift.colorHex,
                    color: textColor,
                  }}
                  disabled={busy}
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
    </>
  );
}
