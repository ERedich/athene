import { useEffect, useMemo, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { OverlayPanel } from "primereact/overlaypanel";

import type { ShiftCalendarBlock } from "../../lib/shiftPlanner/shiftCalendarTypes";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

export type ShiftRolloutPending = {
  block: ShiftCalendarBlock;
  employeeId: string;
  employeeName: string;
  fromDate: string;
};

type Props = {
  panelRef: RefObject<OverlayPanel>;
  pending: ShiftRolloutPending | null;
  submitting: boolean;
  onConfirm: (toDate: string) => void;
  onCancel: () => void;
};

function isoFromDate(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ShiftAssignRolloutPanel({
  panelRef,
  pending,
  submitting,
  onConfirm,
  onCancel,
}: Props) {
  const { t, i18n } = useTranslation();
  const [toDateValue, setToDateValue] = useState<Date | null>(null);

  const minDate = useMemo(
    () => (pending ? new Date(`${pending.fromDate}T12:00:00`) : undefined),
    [pending],
  );

  useEffect(() => {
    if (!pending) {
      setToDateValue(null);
      return;
    }
    setToDateValue(new Date(`${pending.fromDate}T12:00:00`));
  }, [pending]);

  const handleConfirm = () => {
    if (!pending) return;
    const toDate = isoFromDate(toDateValue);
    if (!toDate || toDate < pending.fromDate) return;
    onConfirm(toDate);
  };

  return (
    <OverlayPanel ref={panelRef} appendTo={overlayAppendTo} className="app-shift-planner-rollout-panel">
      {pending ? (
        <div className="app-shift-planner-rollout-panel__content">
          <p className="app-shift-planner-rollout-panel__prompt">
            {t("schichtplaner.rolloutPrompt", { shortCode: pending.block.shortCode })}
          </p>
          <p className="app-shift-planner-rollout-panel__employee">{pending.employeeName}</p>
          <label className="app-shift-planner-rollout-panel__label" htmlFor="shift-rollout-until">
            {t("schichtplaner.rolloutUntilLabel")}
          </label>
          <Calendar
            inputId="shift-rollout-until"
            value={toDateValue}
            onChange={(e) => setToDateValue(e.value ?? null)}
            dateFormat={i18n.language?.toLowerCase().startsWith("de") ? "dd.mm.yy" : "mm/dd/yy"}
            minDate={minDate}
            showIcon
            appendTo={overlayAppendTo}
            disabled={submitting}
            className="app-shift-planner-rollout-panel__calendar w-full"
          />
          <div className="app-shift-planner-rollout-panel__actions">
            <Button
              type="button"
              label={t("schichtplaner.rolloutCancel")}
              severity="secondary"
              outlined
              disabled={submitting}
              onClick={onCancel}
            />
            <Button
              type="button"
              label={t("schichtplaner.rolloutConfirm")}
              loading={submitting}
              disabled={submitting || !toDateValue}
              onClick={handleConfirm}
            />
          </div>
        </div>
      ) : null}
    </OverlayPanel>
  );
}
