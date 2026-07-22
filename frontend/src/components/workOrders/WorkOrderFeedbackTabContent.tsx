import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { useTranslation } from "react-i18next";

import { lucidePrimeBtnIcon } from "../../icons/lucide";
import type {
  FeedbackAdditionalHoursRow,
  FeedbackEntryMode,
  FeedbackStatusAction,
} from "../../lib/workOrderDialog";
import { FeedbackRemarkInput } from "./FeedbackRemarkInput";

const FEEDBACK_FADE_MS = 200;

function FeedbackFade({ show, className, children }: { show: boolean; className?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(show);
  const [opaque, setOpaque] = useState(show);

  useEffect(() => {
    if (show) {
      setMounted(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setOpaque(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    setOpaque(false);
    const timer = window.setTimeout(() => setMounted(false), FEEDBACK_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!mounted) return null;

  return (
    <div
      className={`app-feedback-fade${opaque ? " app-feedback-fade--in" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden={!opaque}
    >
      {children}
    </div>
  );
}

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
  pcrEnabled: boolean;
  pcrRequired: boolean;
  pcrProblemId: string;
  pcrCauseId: string;
  pcrRemedyId: string;
  onPcrProblemIdChange: (value: string) => void;
  onPcrCauseIdChange: (value: string) => void;
  onPcrRemedyIdChange: (value: string) => void;
  pcrProblemOptions: SelectOption[];
  pcrCauseOptions: SelectOption[];
  pcrRemedyOptions: SelectOption[];
  pcrLoading: boolean;
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
    pcrEnabled,
    pcrRequired,
    pcrProblemId,
    pcrCauseId,
    pcrRemedyId,
    onPcrProblemIdChange,
    onPcrCauseIdChange,
    onPcrRemedyIdChange,
    pcrProblemOptions,
    pcrCauseOptions,
    pcrRemedyOptions,
    pcrLoading,
  } = props;

  const showPauseRemark = feedbackEntryMode === "pause" || feedbackStatusAction === "pause";
  const fieldDisabled = disabled || doneOrder;
  const [remarkSlidePulse, setRemarkSlidePulse] = useState(false);
  const skipRemarkSlideOnMount = useRef(true);

  useEffect(() => {
    if (skipRemarkSlideOnMount.current) {
      skipRemarkSlideOnMount.current = false;
      return;
    }
    setRemarkSlidePulse(true);
    const timer = window.setTimeout(() => setRemarkSlidePulse(false), FEEDBACK_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [showPauseRemark]);

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
    <div className="grid grid-cols-2 gap-4 pt-1 md:grid-cols-6" style={{ margin: 0, display: "grid" }}>
      <div className="space-y-2 col-span-2 md:col-span-2">
        <div className="block text-[11px] text-outline uppercase tracking-[0.1em]">
          {t("workOrders.feedbackStatusActionLegend")}
        </div>
        <div
          className="app-segmented-control app-segmented-control--match-input"
          role="group"
          aria-label={t("workOrders.feedbackStatusActionLegend")}
        >
          {(["none", "pause", "end"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`app-segmented-control__btn${
                feedbackStatusAction === value ? " app-segmented-control__btn--active" : ""
              }`}
              aria-pressed={feedbackStatusAction === value}
              disabled={fieldDisabled}
              onClick={() => onFeedbackStatusActionChange(value)}
            >
              {t(`workOrders.feedbackStatusAction.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 col-span-2 md:col-span-2">
        <label htmlFor="order-feedback-employee" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
          {t("workOrders.feedbackReportingEmployee")}
        </label>
        <InputText id="order-feedback-employee" disabled value={reportingEmployeeLabel} className="w-full" />
      </div>

      <div className="space-y-2 col-span-2 md:col-span-2">
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
              <div
                key={row.localId}
                className="grid grid-cols-1 gap-2 md:grid-cols-12 md:items-end"
                style={{ margin: 0, display: "grid" }}
              >
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

      <FeedbackFade show={showPauseRemark} className="col-span-2 md:col-span-6">
        <FeedbackRemarkInput
          id="order-feedback-pause-remark"
          label={t("workOrders.feedbackPauseRemark")}
          value={feedbackPauseRemark}
          onChange={onFeedbackPauseRemarkChange}
          disabled={fieldDisabled}
          required
          minHeightClass="min-h-24"
        />
      </FeedbackFade>

      <div
        className={`col-span-2 md:col-span-6 app-feedback-slide-y${
          remarkSlidePulse ? " app-feedback-slide-y--pulse" : ""
        }`}
      >
        <FeedbackRemarkInput
          id="order-feedback-remark"
          label={t("workOrders.feedbackRemark")}
          value={feedbackRemark}
          onChange={onFeedbackRemarkChange}
          disabled={fieldDisabled}
        />
      </div>

      {pcrEnabled ? (
        <div className="col-span-2 md:col-span-6 space-y-3 border-t border-solid border-outline-variant/60 pt-3">
          <div className="text-[11px] text-outline uppercase tracking-[0.1em]">
            {t("workOrders.pcrSection")}
            <span
              className={`app-required-marker app-feedback-fade-inline${pcrRequired ? " app-feedback-fade-inline--in" : ""}`}
              aria-hidden={!pcrRequired}
            >
              *
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.pcrProblem")}
              </label>
              <Dropdown
                value={pcrProblemId || null}
                options={pcrProblemOptions}
                optionLabel="label"
                optionValue="value"
                placeholder={t("workOrders.pcrProblemPlaceholder")}
                className="w-full"
                disabled={fieldDisabled || pcrLoading}
                filter
                showClear
                onChange={(e) => onPcrProblemIdChange(String(e.value ?? ""))}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.pcrCause")}
              </label>
              <Dropdown
                value={pcrCauseId || null}
                options={pcrCauseOptions}
                optionLabel="label"
                optionValue="value"
                placeholder={t("workOrders.pcrCausePlaceholder")}
                className="w-full"
                disabled={fieldDisabled || pcrLoading || !pcrProblemId}
                filter
                showClear
                onChange={(e) => onPcrCauseIdChange(String(e.value ?? ""))}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.pcrRemedy")}
              </label>
              <Dropdown
                value={pcrRemedyId || null}
                options={pcrRemedyOptions}
                optionLabel="label"
                optionValue="value"
                placeholder={t("workOrders.pcrRemedyPlaceholder")}
                className="w-full"
                disabled={fieldDisabled || pcrLoading || !pcrCauseId}
                filter
                showClear
                onChange={(e) => onPcrRemedyIdChange(String(e.value ?? ""))}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
