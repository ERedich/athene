import { Plus, Trash2 } from "lucide-react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { RadioButton } from "primereact/radiobutton";
import { useTranslation } from "react-i18next";

import { lucidePrimeBtnIcon } from "../../icons/lucide";
import type {
  FeedbackAdditionalHoursRow,
  FeedbackEntryMode,
  FeedbackStatusAction,
} from "../../lib/workOrderDialog";

type SelectOption = { label: string; value: string };

type Props = {
  reportingEmployeeLabel: string;
  feedbackHours: string;
  onFeedbackHoursChange: (value: string) => void;
  feedbackRemark: string;
  onFeedbackRemarkChange: (value: string) => void;
  feedbackPauseRemark: string;
  onFeedbackPauseRemarkChange: (value: string) => void;
  feedbackStatusAction: FeedbackStatusAction;
  onFeedbackStatusActionChange: (value: FeedbackStatusAction) => void;
  feedbackEntryMode: FeedbackEntryMode;
  additionalHoursRows: FeedbackAdditionalHoursRow[];
  onAdditionalHoursRowsChange: (rows: FeedbackAdditionalHoursRow[]) => void;
  additionalEmployeeOptions: SelectOption[];
  sessionEmployeeId: string | null;
  disabled: boolean;
  doneOrder: boolean;
};

export function WorkOrderFeedbackTabContent(props: Props) {
  const { t } = useTranslation();
  const {
    reportingEmployeeLabel,
    feedbackHours,
    onFeedbackHoursChange,
    feedbackRemark,
    onFeedbackRemarkChange,
    feedbackPauseRemark,
    onFeedbackPauseRemarkChange,
    feedbackStatusAction,
    onFeedbackStatusActionChange,
    feedbackEntryMode,
    additionalHoursRows,
    onAdditionalHoursRowsChange,
    additionalEmployeeOptions,
    sessionEmployeeId,
    disabled,
    doneOrder,
  } = props;

  const showPauseRemark = feedbackEntryMode === "pause" || feedbackStatusAction === "pause";
  const fieldDisabled = disabled || doneOrder;

  const usedEmployeeIds = new Set(
    [sessionEmployeeId, ...additionalHoursRows.map((r) => r.employeeId)].filter(Boolean) as string[],
  );

  const optionsForRow = (row: FeedbackAdditionalHoursRow) =>
    additionalEmployeeOptions.filter((o) => o.value === row.employeeId || !usedEmployeeIds.has(o.value));

  const addRow = () => {
    onAdditionalHoursRowsChange([...additionalHoursRows, { localId: crypto.randomUUID(), employeeId: "", hours: "" }]);
  };

  const updateRow = (localId: string, patch: Partial<FeedbackAdditionalHoursRow>) => {
    onAdditionalHoursRowsChange(additionalHoursRows.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const removeRow = (localId: string) => {
    onAdditionalHoursRowsChange(additionalHoursRows.filter((r) => r.localId !== localId));
  };

  return (
    <div className="grid grid-cols-2 gap-4 pt-1 md:grid-cols-6">
      <div className="space-y-2 col-span-1 md:col-span-4">
        <label htmlFor="order-feedback-employee" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
          {t("workOrders.feedbackReportingEmployee")}
        </label>
        <InputText id="order-feedback-employee" disabled value={reportingEmployeeLabel} className="w-full" />
      </div>

      <div className="space-y-2 col-span-1 md:col-span-2">
        <label htmlFor="order-feedback-hours" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
          {t("workOrders.feedbackHours")}
          <span className="app-required-marker" aria-hidden>
            *
          </span>
        </label>
        <InputText
          id="order-feedback-hours"
          value={feedbackHours}
          onChange={(e) => onFeedbackHoursChange(e.target.value)}
          placeholder={t("workOrders.feedbackHoursPlaceholder")}
          className="w-full"
          disabled={fieldDisabled}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2 col-span-2 md:col-span-6">
        <div className="flex items-center justify-between gap-2">
          <span className="block text-[11px] text-outline uppercase tracking-[0.1em]">
            {t("workOrders.feedbackAdditionalHoursTitle")}
          </span>
          <Button
            type="button"
            text
            size="small"
            icon={<Plus className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
            label={t("workOrders.feedbackAddEmployee")}
            onClick={addRow}
            disabled={fieldDisabled}
          />
        </div>
        {additionalHoursRows.length === 0 ? (
          <div className="text-sm text-on-surface-variant">{t("workOrders.feedbackAdditionalHoursEmpty")}</div>
        ) : (
          <div className="space-y-2">
            {additionalHoursRows.map((row) => (
              <div key={row.localId} className="grid grid-cols-1 gap-2 md:grid-cols-12 md:items-end">
                <div className="md:col-span-7">
                  <Dropdown
                    value={row.employeeId || null}
                    options={optionsForRow(row)}
                    optionLabel="label"
                    optionValue="value"
                    onChange={(e) => updateRow(row.localId, { employeeId: (e.value as string) ?? "" })}
                    placeholder={t("workOrders.feedbackAdditionalEmployeePlaceholder")}
                    className="w-full"
                    disabled={fieldDisabled}
                    filter
                  />
                </div>
                <div className="md:col-span-4">
                  <InputText
                    value={row.hours}
                    onChange={(e) => updateRow(row.localId, { hours: e.target.value })}
                    placeholder={t("workOrders.feedbackHoursPlaceholder")}
                    className="w-full"
                    disabled={fieldDisabled}
                    autoComplete="off"
                  />
                </div>
                <div className="flex md:col-span-1 md:justify-end">
                  <Button
                    type="button"
                    text
                    severity="danger"
                    className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0"
                    icon={<Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                    onClick={() => removeRow(row.localId)}
                    disabled={fieldDisabled}
                    aria-label={t("workOrders.feedbackRemoveEmployee")}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPauseRemark ? (
        <div className="space-y-2 col-span-2 md:col-span-6">
          <label htmlFor="order-feedback-pause-remark" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
            {t("workOrders.feedbackPauseRemark")}
            <span className="app-required-marker" aria-hidden>
              *
            </span>
          </label>
          <textarea
            id="order-feedback-pause-remark"
            value={feedbackPauseRemark}
            maxLength={2000}
            onChange={(e) => onFeedbackPauseRemarkChange(e.target.value)}
            className="w-full p-inputtext p-component min-h-24 resize-y"
            disabled={fieldDisabled}
          />
          <div className="text-xs text-on-surface-variant text-right">
            {t("workOrders.descriptionCounter", { count: feedbackPauseRemark.length, max: 2000 })}
          </div>
        </div>
      ) : null}

      <div className="space-y-2 col-span-2 md:col-span-6">
        <label htmlFor="order-feedback-remark" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
          {t("workOrders.feedbackRemark")}
        </label>
        <textarea
          id="order-feedback-remark"
          value={feedbackRemark}
          maxLength={2000}
          onChange={(e) => onFeedbackRemarkChange(e.target.value)}
          className="w-full p-inputtext p-component min-h-28 resize-y"
          disabled={fieldDisabled}
        />
        <div className="text-xs text-on-surface-variant text-right">
          {t("workOrders.descriptionCounter", { count: feedbackRemark.length, max: 2000 })}
        </div>
      </div>

      <fieldset className="col-span-2 md:col-span-6 space-y-2 border-0 p-0 m-0" disabled={fieldDisabled}>
        <legend className="block text-[11px] text-outline uppercase tracking-[0.1em] mb-2">
          {t("workOrders.feedbackStatusActionLegend")}
        </legend>
        <div className="flex flex-col gap-2">
          {(["none", "pause", "end"] as const).map((value) => (
            <div key={value} className="flex items-center gap-2">
              <RadioButton
                inputId={`order-feedback-status-${value}`}
                name="order-feedback-status"
                value={value}
                checked={feedbackStatusAction === value}
                onChange={(e) => onFeedbackStatusActionChange(e.value as FeedbackStatusAction)}
              />
              <label htmlFor={`order-feedback-status-${value}`} className="cursor-pointer text-sm">
                {t(`workOrders.feedbackStatusAction.${value}`)}
              </label>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
