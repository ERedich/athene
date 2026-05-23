import { forwardRef, useImperativeHandle, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { OverlayPanel } from "primereact/overlaypanel";

import type { PendingCalendarMove } from "../../lib/calendar/calendarMove";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

export type CalendarMoveConfirmPanelHandle = {
  show: (event: React.SyntheticEvent) => void;
  hide: () => void;
};

type Props = {
  pending: PendingCalendarMove | null;
  formatDateTime: (date: Date) => string;
  saving: boolean;
  onAccept: () => void;
  onReject: () => void;
};

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-calendar-move-row">
      <dt className="app-calendar-move-label">{label}</dt>
      <dd className="app-calendar-move-value">{value}</dd>
    </div>
  );
}

export const CalendarMoveConfirmPanel = forwardRef<CalendarMoveConfirmPanelHandle, Props>(
  function CalendarMoveConfirmPanel({ pending, formatDateTime, saving, onAccept, onReject }, ref) {
    const { t } = useTranslation();
    const panelRef = useRef<OverlayPanel>(null);

    useImperativeHandle(ref, () => ({
      show: (event) => panelRef.current?.show(event, null),
      hide: () => panelRef.current?.hide(),
    }));

    return (
      <OverlayPanel
        ref={panelRef}
        appendTo={overlayAppendTo}
        className="app-calendar-move-panel"
        dismissable
        onHide={onReject}
      >
        {pending ? (
          <div className="app-calendar-move-content">
            <p className="app-calendar-move-intro">{t("kalendar.moveConfirmIntro")}</p>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
              {t("kalendar.moveFrom")}
            </p>
            <dl className="app-calendar-move-dl">
              <DateRow
                label={t("kalendar.moveOldPlannedStart")}
                value={formatDateTime(pending.oldStart)}
              />
              <DateRow
                label={t("kalendar.moveOldPlannedEnd")}
                value={formatDateTime(pending.oldEnd)}
              />
            </dl>
            <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
              {t("kalendar.moveTo")}
            </p>
            <dl className="app-calendar-move-dl">
              <DateRow
                label={t("kalendar.moveNewPlannedStart")}
                value={formatDateTime(pending.newStart)}
              />
              <DateRow
                label={t("kalendar.moveNewPlannedEnd")}
                value={formatDateTime(pending.newEnd)}
              />
            </dl>
            {pending.planningConflict && pending.planningConflict.conflicts.length > 0 ? (
              <div className="mt-3 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-on-surface">
                <p className="m-0">
                  {pending.planningConflict.sameDayConflict
                    ? t("kalendar.moveAssetConflictSameDay", {
                        assetKey: pending.planningConflict.assetKey,
                        assetName: pending.planningConflict.assetName,
                      })
                    : t("kalendar.moveAssetConflictOverlap", {
                        assetKey: pending.planningConflict.assetKey,
                        assetName: pending.planningConflict.assetName,
                      })}
                </p>
                <ul className="mb-0 mt-2 list-inside list-disc text-xs text-on-surface-variant">
                  {pending.planningConflict.conflicts.map((c) => (
                    <li key={c.id}>
                      #{c.orderNumber} {c.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
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
          </div>
        ) : null}
      </OverlayPanel>
    );
  },
);
