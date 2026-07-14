import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";

import { PlanningConflictWarning } from "../PlanningConflictWarning";
import type { PendingCalendarMove } from "../../lib/calendar/calendarMove";

type Props = {
  visible: boolean;
  pending: PendingCalendarMove | null;
  formatDate: (date: Date) => string;
  saving: boolean;
  onAccept: () => void;
  onReject: () => void;
};

export function CalendarMoveConfirmPanel({
  visible,
  pending,
  formatDate,
  saving,
  onAccept,
  onReject,
}: Props) {
  const { t } = useTranslation();

  const footer = pending ? (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("kalendar.moveCancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={onReject}
      />
      <Button
        type="button"
        label={
          pending.planningConflict?.conflicts.length
            ? t("kalendar.moveConfirmDespiteConflict")
            : t("kalendar.moveConfirm")
        }
        loading={saving}
        onClick={onAccept}
      />
    </div>
  ) : null;

  return (
    <Dialog
      visible={visible}
      header={t("kalendar.moveTitle")}
      footer={footer}
      onHide={onReject}
      className="app-calendar-move-panel app-dialog-sm"
      modal
      draggable={false}
      dismissableMask
    >
      {pending ? (
        <div className="app-calendar-move-content">
          <p className="app-calendar-move-section-label">{t("kalendar.moveOldRange")}</p>
          <p className="app-calendar-move-range">
            {formatDate(pending.oldStart)} – {formatDate(pending.oldEnd)}
          </p>
          <p className="app-calendar-move-section-label app-calendar-move-section-label--spaced">
            {t("kalendar.moveNewRange")}
          </p>
          <p className="app-calendar-move-range">
            {formatDate(pending.newStart)} – {formatDate(pending.newEnd)}
          </p>
          {pending.planningConflict && pending.planningConflict.conflicts.length > 0 ? (
            <div className="mt-3">
              <PlanningConflictWarning
                assetKey={pending.planningConflict.assetKey}
                assetName={pending.planningConflict.assetName}
                conflicts={pending.planningConflict.conflicts}
                sameDayConflict={pending.planningConflict.sameDayConflict}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
