import { useEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { OverlayPanel } from "primereact/overlaypanel";

import { overlayAppendTo } from "../../lib/overlayAppendTo";
import { assignmentWindowIsValid } from "../../lib/workOrderAssignmentWindow";

export type WorkOrderAssignWindowPending = {
  workOrderId: string;
  workOrderLabel: string;
  employeeIds: string[];
  employeeLabel: string;
  assignedFrom: Date;
  assignedTo: Date;
  minDate: Date;
  maxDate: Date;
};

type Props = {
  panelRef: RefObject<OverlayPanel>;
  pending: WorkOrderAssignWindowPending | null;
  submitting: boolean;
  onConfirm: (assignedFrom: Date, assignedTo: Date) => void;
  onCancel: () => void;
};

export function WorkOrderAssignWindowPanel({
  panelRef,
  pending,
  submitting,
  onConfirm,
  onCancel,
}: Props) {
  const { t, i18n } = useTranslation();
  const [fromValue, setFromValue] = useState<Date | null>(null);
  const [toValue, setToValue] = useState<Date | null>(null);

  useEffect(() => {
    if (!pending) {
      setFromValue(null);
      setToValue(null);
      return;
    }
    setFromValue(new Date(pending.assignedFrom));
    setToValue(new Date(pending.assignedTo));
  }, [pending]);

  const dateFormat = i18n.language?.toLowerCase().startsWith("de") ? "dd.mm.yy" : "mm/dd/yy";
  const canConfirm =
    fromValue != null &&
    toValue != null &&
    pending != null &&
    assignmentWindowIsValid(fromValue, toValue, pending.minDate, pending.maxDate);

  const handleConfirm = () => {
    if (!pending || !fromValue || !toValue || !canConfirm) return;
    onConfirm(fromValue, toValue);
  };

  return (
    <OverlayPanel
      ref={panelRef}
      appendTo={overlayAppendTo}
      className="app-work-order-assign-window-panel"
    >
      {pending ? (
        <div className="app-work-order-assign-window-panel__content">
          <p className="app-work-order-assign-window-panel__prompt">
            {t("workOrders.assignmentWindowPrompt", { order: pending.workOrderLabel })}
          </p>
          <p className="app-work-order-assign-window-panel__employee">{pending.employeeLabel}</p>
          <label className="app-work-order-assign-window-panel__label" htmlFor="wo-assign-from">
            {t("workOrders.assignmentWindowFrom")}
          </label>
          <Calendar
            inputId="wo-assign-from"
            value={fromValue}
            onChange={(e) => setFromValue(e.value ?? null)}
            dateFormat={dateFormat}
            showTime
            hourFormat="24"
            minDate={pending.minDate}
            maxDate={pending.maxDate}
            showIcon
            appendTo={overlayAppendTo}
            disabled={submitting}
            className="w-full"
          />
          <label className="app-work-order-assign-window-panel__label" htmlFor="wo-assign-to">
            {t("workOrders.assignmentWindowTo")}
          </label>
          <Calendar
            inputId="wo-assign-to"
            value={toValue}
            onChange={(e) => setToValue(e.value ?? null)}
            dateFormat={dateFormat}
            showTime
            hourFormat="24"
            minDate={pending.minDate}
            maxDate={pending.maxDate}
            showIcon
            appendTo={overlayAppendTo}
            disabled={submitting}
            className="w-full"
          />
          <div className="app-work-order-assign-window-panel__actions">
            <Button
              type="button"
              label={t("workOrders.assignmentWindowCancel")}
              severity="secondary"
              outlined
              disabled={submitting}
              onClick={onCancel}
            />
            <Button
              type="button"
              label={t("workOrders.assignmentWindowConfirm")}
              loading={submitting}
              disabled={submitting || !canConfirm}
              onClick={handleConfirm}
            />
          </div>
        </div>
      ) : null}
    </OverlayPanel>
  );
}
