import { useMemo, useState } from "react";
import { Check, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
import { SelectButton } from "primereact/selectbutton";
import { Sidebar } from "primereact/sidebar";

import { overlayAppendTo } from "../../lib/overlayAppendTo";
import {
  EMPLOYEE_PSEUDO_ME,
  WORKGROUP_PSEUDO_MY,
  type WorkOrderAdvancedSearchState,
  type WorkOrderPlanningDateMode,
  emptyWorkOrderAdvancedSearch,
} from "../../lib/workOrderApiFilters";
import {
  buildWorkOrderSearchPresetPayload,
  type WorkOrderSearchPresetPayloadV1,
} from "../../lib/workOrderSearchPresetApi";
import { lucidePrimeBtnIcon } from "../../icons/lucide";

export const WORK_ORDER_STATUS_ORDER = [
  "open",
  "assigned",
  "started",
  "paused",
  "continued",
  "ended",
  "done",
  "cancelled",
] as const;

type SelectOption = { label: string; value: string };

type WorkOrderSearchPanelProps = {
  visible: boolean;
  onHide: () => void;
  value: WorkOrderAdvancedSearchState;
  onChange: (next: WorkOrderAdvancedSearchState) => void;
  onApply: () => void;
  onReset: () => void;
  siteOptions: SelectOption[];
  assetOptions: SelectOption[];
  costCenterOptions: SelectOption[];
  classificationOptions: SelectOption[];
  workgroupOptions: SelectOption[];
  employeeOptions: SelectOption[];
  maintenancePlanOptions: SelectOption[];
  /** Users for discrete „Angelegt von“ / „Geändert von“ filters */
  userOptions: SelectOption[];
  typeOrder: readonly string[];
  typeLabel: (code: string) => string;
  statusLabel: (code: string) => string;
  calendarDateFormat: string;
  /** Current header quick search + applied filters (for saving presets). */
  quickSearchForSave?: string;
  appliedSearchForSave?: WorkOrderAdvancedSearchState;
  onSaveSearchPreset?: (name: string, payload: WorkOrderSearchPresetPayloadV1) => Promise<void>;
  cleverSearchEnabled?: boolean;
};

const RANGE_CONTROL = "h-9 w-full min-w-0 flex-1";

function RangeText({
  label,
  from,
  to,
  onFrom,
  onTo,
}: {
  label: string;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-on-surface-variant">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <InputText
          value={from}
          onChange={(e) => {
            onFrom(e.target.value);
          }}
          className={RANGE_CONTROL}
          placeholder="…"
        />
        <span className="text-on-surface-variant">—</span>
        <InputText value={to} onChange={(e) => onTo(e.target.value)} className={RANGE_CONTROL} placeholder="…" />
      </div>
    </div>
  );
}

function LikeTextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-on-surface-variant">{label}</span>
      <InputText value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full" placeholder="…" />
    </div>
  );
}

function RangeCalendar({
  label,
  fromIso,
  toIso,
  onFrom,
  onTo,
  dateFormat,
}: {
  label?: string;
  fromIso: string;
  toIso: string;
  onFrom: (iso: string) => void;
  onTo: (iso: string) => void;
  dateFormat: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label ? <span className="text-xs font-medium text-on-surface-variant">{label}</span> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Calendar
          value={fromIso ? new Date(fromIso) : null}
          onChange={(e) => {
            onFrom(e.value ? (e.value as Date).toISOString() : "");
          }}
          showTime
          hourFormat="24"
          dateFormat={dateFormat}
          className={RANGE_CONTROL}
          appendTo={overlayAppendTo}
        />
        <span className="text-on-surface-variant">—</span>
        <Calendar
          value={toIso ? new Date(toIso) : null}
          onChange={(e) => onTo(e.value ? (e.value as Date).toISOString() : "")}
          showTime
          hourFormat="24"
          dateFormat={dateFormat}
          className={RANGE_CONTROL}
          appendTo={overlayAppendTo}
        />
      </div>
    </div>
  );
}

function daysToNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function RelativePlanningRange({
  pastDays,
  futureDays,
  onPastDays,
  onFutureDays,
  nowLabel,
  daysLabel,
}: {
  pastDays: string;
  futureDays: string;
  onPastDays: (v: string) => void;
  onFutureDays: (v: string) => void;
  nowLabel: string;
  daysLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="shrink-0 text-sm text-on-surface-variant" aria-hidden>
        −
      </span>
      <InputNumber
        value={daysToNumber(pastDays)}
        onValueChange={(e) => onPastDays(e.value == null ? "" : String(e.value))}
        min={0}
        useGrouping={false}
        className="w-[5.5rem]"
        inputClassName="h-9 w-full"
        placeholder="…"
      />
      <span className="shrink-0 text-xs text-on-surface-variant">{daysLabel}</span>
      <span className="shrink-0 rounded-sm bg-surface-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-on-surface dark:bg-surface-800">
        {nowLabel}
      </span>
      <span className="shrink-0 text-sm text-on-surface-variant" aria-hidden>
        +
      </span>
      <InputNumber
        value={daysToNumber(futureDays)}
        onValueChange={(e) => onFutureDays(e.value == null ? "" : String(e.value))}
        min={0}
        useGrouping={false}
        className="w-[5.5rem]"
        inputClassName="h-9 w-full"
        placeholder="…"
      />
      <span className="shrink-0 text-xs text-on-surface-variant">{daysLabel}</span>
    </div>
  );
}

function PlanningDateField({
  label,
  mode,
  onMode,
  fromIso,
  toIso,
  onFrom,
  onTo,
  pastDays,
  futureDays,
  onPastDays,
  onFutureDays,
  dateFormat,
  modeOptions,
  nowLabel,
  daysLabel,
}: {
  label: string;
  mode: WorkOrderPlanningDateMode;
  onMode: (mode: WorkOrderPlanningDateMode) => void;
  fromIso: string;
  toIso: string;
  onFrom: (iso: string) => void;
  onTo: (iso: string) => void;
  pastDays: string;
  futureDays: string;
  onPastDays: (v: string) => void;
  onFutureDays: (v: string) => void;
  dateFormat: string;
  modeOptions: { label: string; value: WorkOrderPlanningDateMode }[];
  nowLabel: string;
  daysLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-on-surface-variant">{label}</span>
        <SelectButton
          value={mode}
          options={modeOptions}
          optionLabel="label"
          optionValue="value"
          onChange={(e) => {
            if (e.value === "absolute" || e.value === "relative") onMode(e.value);
          }}
          allowEmpty={false}
        />
      </div>
      {mode === "relative" ? (
        <RelativePlanningRange
          pastDays={pastDays}
          futureDays={futureDays}
          onPastDays={onPastDays}
          onFutureDays={onFutureDays}
          nowLabel={nowLabel}
          daysLabel={daysLabel}
        />
      ) : (
        <RangeCalendar fromIso={fromIso} toIso={toIso} onFrom={onFrom} onTo={onTo} dateFormat={dateFormat} />
      )}
    </div>
  );
}

export function WorkOrderSearchPanel({
  visible,
  onHide,
  value,
  onChange,
  onApply,
  onReset,
  siteOptions,
  assetOptions,
  costCenterOptions,
  classificationOptions,
  workgroupOptions,
  employeeOptions,
  maintenancePlanOptions,
  userOptions,
  typeOrder,
  typeLabel,
  statusLabel,
  calendarDateFormat,
  quickSearchForSave = "",
  appliedSearchForSave,
  onSaveSearchPreset,
  cleverSearchEnabled = false,
}: WorkOrderSearchPanelProps) {
  const { t } = useTranslation();
  const patch = (partial: Partial<WorkOrderAdvancedSearchState>) => {
    onChange({ ...value, ...partial });
  };

  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState("");

  const workgroupOptionsWithPseudo = useMemo(
    () => [{ label: t("workOrders.searchPanel.myWorkgroups"), value: WORKGROUP_PSEUDO_MY }, ...workgroupOptions],
    [t, workgroupOptions],
  );

  const employeeOptionsWithPseudo = useMemo(
    () => [{ label: t("workOrders.searchPanel.me"), value: EMPLOYEE_PSEUDO_ME }, ...employeeOptions],
    [t, employeeOptions],
  );

  const typeOptions = useMemo(
    () => typeOrder.map((code) => ({ label: typeLabel(code), value: code })),
    [typeLabel, typeOrder],
  );

  const statusOptions = useMemo(
    () => WORK_ORDER_STATUS_ORDER.map((code) => ({ label: statusLabel(code), value: code })),
    [statusLabel],
  );

  const planningModeOptions = useMemo(
    () => [
      { label: t("workOrders.searchPanel.modeRelative"), value: "relative" as const },
      { label: t("workOrders.searchPanel.modeAbsolute"), value: "absolute" as const },
    ],
    [t],
  );

  const appliedForSave = appliedSearchForSave ?? emptyWorkOrderAdvancedSearch();

  const section =
    "rounded-sm border border-solid app-wo-detail-outline-border bg-surface-50/80 p-3 dark:bg-surface-900/40";
  const sectionTitle = "mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant";
  const multiClass = "w-full";

  const saveFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("workOrders.cancel")}
        className="p-button-text"
        disabled={saveBusy}
        onClick={() => {
          setSaveDialogVisible(false);
          setSaveName("");
          setSaveError("");
        }}
      />
      <Button
        type="button"
        label={t("workOrders.searchPresets.saveConfirm")}
        icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        loading={saveBusy}
        disabled={!saveName.trim()}
        onClick={() => {
          if (!onSaveSearchPreset) return;
          const name = saveName.trim();
          if (!name) return;
          setSaveBusy(true);
          setSaveError("");
          const payload = buildWorkOrderSearchPresetPayload(quickSearchForSave.trim(), appliedForSave);
          void onSaveSearchPreset(name, payload)
            .then(() => {
              setSaveDialogVisible(false);
              setSaveName("");
            })
            .catch(() => setSaveError(t("workOrders.searchPresets.saveError")))
            .finally(() => setSaveBusy(false));
        }}
      />
    </div>
  );

  return (
    <>
    <Sidebar
      visible={visible}
      position="right"
      onHide={onHide}
      modal={false}
      closeOnEscape={!cleverSearchEnabled}
      dismissable={!cleverSearchEnabled}
      className="app-wo-search-sidebar !w-[min(60vw,100vw)] max-w-none"
      appendTo={typeof document !== "undefined" ? document.body : undefined}
      header={t("workOrders.searchPanel.title")}
      pt={{
        header: { className: "app-wo-search-sidebar-header" },
        content: { className: "app-wo-search-sidebar-content flex min-h-0 flex-1 flex-col p-0" },
      }}
    >
      <form
        className="flex max-h-[calc(100dvh-4.5rem)] min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          onApply();
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <p className="col-span-1 m-0 text-sm text-on-surface-variant md:col-span-2">{t("workOrders.searchPanel.intro")}</p>

            <div className={`${section} col-span-1`}>
              <div className={sectionTitle}>{t("workOrders.searchPanel.sectionNumbers")}</div>
              <div className="flex flex-col gap-3">
                <RangeText
                  label={t("workOrders.orderNumber")}
                  from={value.orderNumberFrom}
                  to={value.orderNumberTo}
                  onFrom={(v) => patch({ orderNumberFrom: v, orderNumberTo: v })}
                  onTo={(v) => patch({ orderNumberTo: v })}
                />
                <RangeText
                  label={t("workOrders.searchPanel.plannedDurationMinutes")}
                  from={value.plannedDurationFrom}
                  to={value.plannedDurationTo}
                  onFrom={(v) => patch({ plannedDurationFrom: v, plannedDurationTo: v })}
                  onTo={(v) => patch({ plannedDurationTo: v })}
                />
                <RangeText
                  label={`${t("workOrders.references")} (WO)`}
                  from={value.documentCountFrom}
                  to={value.documentCountTo}
                  onFrom={(v) => patch({ documentCountFrom: v, documentCountTo: v })}
                  onTo={(v) => patch({ documentCountTo: v })}
                />
                <RangeText
                  label={t("workOrders.searchPanel.assetDocCount")}
                  from={value.assetDocumentCountFrom}
                  to={value.assetDocumentCountTo}
                  onFrom={(v) => patch({ assetDocumentCountFrom: v, assetDocumentCountTo: v })}
                  onTo={(v) => patch({ assetDocumentCountTo: v })}
                />
                <RangeText
                  label={t("workOrders.assignmentsReference")}
                  from={value.assignedEmployeeCountFrom}
                  to={value.assignedEmployeeCountTo}
                  onFrom={(v) => patch({ assignedEmployeeCountFrom: v, assignedEmployeeCountTo: v })}
                  onTo={(v) => patch({ assignedEmployeeCountTo: v })}
                />
              </div>
            </div>

            <div className={`${section} col-span-1`}>
              <div className={sectionTitle}>{t("workOrders.searchPanel.sectionDiscrete")}</div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">{t("workOrders.orderType")}</span>
                  <MultiSelect
                    value={value.orderType}
                    options={typeOptions}
                    optionLabel="label"
                    optionValue="value"
                    onChange={(e) => patch({ orderType: (e.value as string[]) ?? [] })}
                    display="chip"
                    className={multiClass}
                    filter
                    appendTo={overlayAppendTo}
                    placeholder={t("workOrders.searchPanel.selectPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">{t("workOrders.status")}</span>
                  <MultiSelect
                    value={value.status}
                    options={statusOptions}
                    optionLabel="label"
                    optionValue="value"
                    onChange={(e) => patch({ status: (e.value as string[]) ?? [] })}
                    display="chip"
                    className={multiClass}
                    filter
                    appendTo={overlayAppendTo}
                    placeholder={t("workOrders.searchPanel.selectPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">{t("workOrders.searchPanel.site")}</span>
                  <MultiSelect
                    value={value.siteId}
                    options={siteOptions}
                    onChange={(e) => patch({ siteId: (e.value as string[]) ?? [] })}
                    optionLabel="label"
                    optionValue="value"
                    display="chip"
                    className={multiClass}
                    filter
                    appendTo={overlayAppendTo}
                    placeholder={t("workOrders.searchPanel.selectPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">{t("workOrders.asset")}</span>
                  <MultiSelect
                    value={value.assetId}
                    options={assetOptions}
                    onChange={(e) => patch({ assetId: (e.value as string[]) ?? [] })}
                    optionLabel="label"
                    optionValue="value"
                    display="chip"
                    className={multiClass}
                    filter
                    appendTo={overlayAppendTo}
                    placeholder={t("workOrders.searchPanel.selectPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">{t("workOrders.costCenter")}</span>
                  <MultiSelect
                    value={value.costCenterId}
                    options={costCenterOptions}
                    onChange={(e) => patch({ costCenterId: (e.value as string[]) ?? [] })}
                    optionLabel="label"
                    optionValue="value"
                    display="chip"
                    className={multiClass}
                    filter
                    appendTo={overlayAppendTo}
                    placeholder={t("workOrders.searchPanel.selectPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">{t("workOrders.classification")}</span>
                  <MultiSelect
                    value={value.classificationId}
                    options={classificationOptions}
                    onChange={(e) => patch({ classificationId: (e.value as string[]) ?? [] })}
                    optionLabel="label"
                    optionValue="value"
                    display="chip"
                    className={multiClass}
                    filter
                    appendTo={overlayAppendTo}
                    placeholder={t("workOrders.searchPanel.selectPlaceholder")}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={value.classificationUnassigned}
                    onChange={(e) => patch({ classificationUnassigned: e.checked === true })}
                  />
                  <span>{t("workOrders.searchPanel.classificationUnassigned")}</span>
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">
                    {t("workOrders.searchPanel.maintenancePlanKey")}
                  </span>
                  <MultiSelect
                    value={value.maintenancePlanId}
                    options={maintenancePlanOptions}
                    onChange={(e) => patch({ maintenancePlanId: (e.value as string[]) ?? [] })}
                    optionLabel="label"
                    optionValue="value"
                    display="chip"
                    className={multiClass}
                    filter
                    appendTo={overlayAppendTo}
                    placeholder={t("workOrders.searchPanel.selectPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">{t("workOrders.workgroup")}</span>
                  <MultiSelect
                    value={value.workgroupId}
                    options={workgroupOptionsWithPseudo}
                    onChange={(e) => patch({ workgroupId: (e.value as string[]) ?? [] })}
                    optionLabel="label"
                    optionValue="value"
                    display="chip"
                    className={multiClass}
                    filter
                    appendTo={overlayAppendTo}
                    placeholder={t("workOrders.searchPanel.selectPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">{t("workOrders.responsible")}</span>
                  <MultiSelect
                    value={value.responsibleEmployeeId}
                    options={employeeOptions}
                    onChange={(e) => patch({ responsibleEmployeeId: (e.value as string[]) ?? [] })}
                    optionLabel="label"
                    optionValue="value"
                    display="chip"
                    className={multiClass}
                    filter
                    appendTo={overlayAppendTo}
                    placeholder={t("workOrders.responsiblePlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">{t("workOrders.searchPanel.employee")}</span>
                  <MultiSelect
                    value={value.employeeId}
                    options={employeeOptionsWithPseudo}
                    onChange={(e) => patch({ employeeId: (e.value as string[]) ?? [] })}
                    optionLabel="label"
                    optionValue="value"
                    display="chip"
                    className={multiClass}
                    filter
                    appendTo={overlayAppendTo}
                    placeholder={t("workOrders.searchPanel.employeeHint")}
                  />
                </div>
              </div>
            </div>

            <div className={`${section} col-span-1 md:col-span-2`}>
              <div className={sectionTitle}>{t("workOrders.searchPanel.sectionFreeText")}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <LikeTextField label={t("workOrders.name")} value={value.name} onChange={(v) => patch({ name: v })} />
                <LikeTextField label={t("workOrders.description")} value={value.description} onChange={(v) => patch({ description: v })} />
              </div>
            </div>

            <div className={`${section} col-span-1`}>
              <div className={sectionTitle}>{t("workOrders.searchPanel.sectionPlanning")}</div>
              <p className="mb-3 mt-0 text-xs text-on-surface-variant">{t("workOrders.searchPanel.relativePlanningHint")}</p>
              <div className="flex flex-col gap-4">
                <PlanningDateField
                  label={t("workOrders.plannedStart")}
                  mode={value.plannedStartMode}
                  onMode={(mode) =>
                    patch(
                      mode === "relative"
                        ? {
                            plannedStartMode: "relative",
                            plannedStartFrom: "",
                            plannedStartTo: "",
                          }
                        : {
                            plannedStartMode: "absolute",
                            plannedStartPastDays: "",
                            plannedStartFutureDays: "",
                          },
                    )
                  }
                  fromIso={value.plannedStartFrom}
                  toIso={value.plannedStartTo}
                  onFrom={(v) => patch({ plannedStartFrom: v, plannedStartTo: v })}
                  onTo={(v) => patch({ plannedStartTo: v })}
                  pastDays={value.plannedStartPastDays}
                  futureDays={value.plannedStartFutureDays}
                  onPastDays={(v) => patch({ plannedStartPastDays: v })}
                  onFutureDays={(v) => patch({ plannedStartFutureDays: v })}
                  dateFormat={calendarDateFormat}
                  modeOptions={planningModeOptions}
                  nowLabel={t("workOrders.searchPanel.relativeNow")}
                  daysLabel={t("workOrders.searchPanel.relativeDays")}
                />
                <PlanningDateField
                  label={t("workOrders.plannedEnd")}
                  mode={value.plannedEndMode}
                  onMode={(mode) =>
                    patch(
                      mode === "relative"
                        ? {
                            plannedEndMode: "relative",
                            plannedEndFrom: "",
                            plannedEndTo: "",
                          }
                        : {
                            plannedEndMode: "absolute",
                            plannedEndPastDays: "",
                            plannedEndFutureDays: "",
                          },
                    )
                  }
                  fromIso={value.plannedEndFrom}
                  toIso={value.plannedEndTo}
                  onFrom={(v) => patch({ plannedEndFrom: v, plannedEndTo: v })}
                  onTo={(v) => patch({ plannedEndTo: v })}
                  pastDays={value.plannedEndPastDays}
                  futureDays={value.plannedEndFutureDays}
                  onPastDays={(v) => patch({ plannedEndPastDays: v })}
                  onFutureDays={(v) => patch({ plannedEndFutureDays: v })}
                  dateFormat={calendarDateFormat}
                  modeOptions={planningModeOptions}
                  nowLabel={t("workOrders.searchPanel.relativeNow")}
                  daysLabel={t("workOrders.searchPanel.relativeDays")}
                />
              </div>
            </div>

            <div className={`${section} col-span-1`}>
              <div className={sectionTitle}>{t("workOrders.searchPanel.sectionAudit")}</div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">{t("workOrders.searchPanel.createdBy")}</span>
                  <MultiSelect
                    value={value.createdBy}
                    options={userOptions}
                    onChange={(e) => patch({ createdBy: (e.value as string[]) ?? [] })}
                    optionLabel="label"
                    optionValue="value"
                    display="chip"
                    className={multiClass}
                    filter
                    appendTo={overlayAppendTo}
                    placeholder={t("workOrders.searchPanel.selectPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-on-surface-variant">{t("workOrders.searchPanel.updatedBy")}</span>
                  <MultiSelect
                    value={value.updatedBy}
                    options={userOptions}
                    onChange={(e) => patch({ updatedBy: (e.value as string[]) ?? [] })}
                    optionLabel="label"
                    optionValue="value"
                    display="chip"
                    className={multiClass}
                    filter
                    appendTo={overlayAppendTo}
                    placeholder={t("workOrders.searchPanel.selectPlaceholder")}
                  />
                </div>
                <RangeCalendar
                  label={t("workOrders.searchPanel.createdAt")}
                  fromIso={value.createdAtFrom}
                  toIso={value.createdAtTo}
                  onFrom={(v) => patch({ createdAtFrom: v, createdAtTo: v })}
                  onTo={(v) => patch({ createdAtTo: v })}
                  dateFormat={calendarDateFormat}
                />
                <RangeCalendar
                  label={t("workOrders.searchPanel.updatedAt")}
                  fromIso={value.updatedAtFrom}
                  toIso={value.updatedAtTo}
                  onFrom={(v) => patch({ updatedAtFrom: v, updatedAtTo: v })}
                  onTo={(v) => patch({ updatedAtTo: v })}
                  dateFormat={calendarDateFormat}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="app-wo-search-sidebar-footer sticky bottom-0 z-[1] flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-solid app-wo-detail-outline-border px-3 py-3">
          <Button
            type="button"
            label={t("workOrders.searchPanel.reset")}
            className="p-button-text"
            onClick={() => {
              onChange(emptyWorkOrderAdvancedSearch());
              onReset();
            }}
          />
          {onSaveSearchPreset ? (
            <Button
              type="button"
              label={t("workOrders.searchPresets.save")}
              icon={<Save className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
              className="p-button-outlined"
              title={t("workOrders.searchPresets.saveHint")}
              onClick={() => {
                setSaveName("");
                setSaveError("");
                setSaveDialogVisible(true);
              }}
            />
          ) : null}
          <Button
            type="submit"
            label={t("workOrders.searchPanel.apply")}
            icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
          />
        </div>
      </form>
    </Sidebar>
    <Dialog
      header={t("workOrders.searchPresets.saveTitle")}
      visible={saveDialogVisible}
      style={{ width: "min(28rem, 95vw)" }}
      onHide={() => {
        if (saveBusy) return;
        setSaveDialogVisible(false);
        setSaveName("");
        setSaveError("");
      }}
      footer={saveFooter}
    >
      <div className="flex flex-col gap-2">
        <p className="m-0 text-xs text-on-surface-variant">{t("workOrders.searchPresets.saveHint")}</p>
        <label className="text-xs font-medium text-on-surface-variant" htmlFor="wo-preset-name">
          {t("workOrders.searchPresets.name")}
        </label>
        <InputText
          id="wo-preset-name"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          className="w-full"
          maxLength={200}
          autoFocus
        />
        {saveError ? <p className="m-0 text-sm text-red-500">{saveError}</p> : null}
      </div>
    </Dialog>
    </>
  );
}
