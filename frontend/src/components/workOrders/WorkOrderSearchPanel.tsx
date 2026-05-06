import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
import { Sidebar } from "primereact/sidebar";

import { overlayAppendTo } from "../../lib/overlayAppendTo";
import {
  EMPLOYEE_PSEUDO_ME,
  WORKGROUP_PSEUDO_MY,
  type WorkOrderAdvancedSearchState,
  emptyWorkOrderAdvancedSearch,
} from "../../lib/workOrderApiFilters";
import {
  buildWorkOrderSearchPresetPayload,
  type WorkOrderSearchPresetPayloadV1,
} from "../../lib/workOrderSearchPresetApi";

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
};

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
          className="h-9 flex-1 min-w-[6rem]"
          placeholder="…"
        />
        <span className="text-on-surface-variant">—</span>
        <InputText value={to} onChange={(e) => onTo(e.target.value)} className="h-9 flex-1 min-w-[6rem]" placeholder="…" />
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
  label: string;
  fromIso: string;
  toIso: string;
  onFrom: (iso: string) => void;
  onTo: (iso: string) => void;
  dateFormat: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-on-surface-variant">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Calendar
          value={fromIso ? new Date(fromIso) : null}
          onChange={(e) => {
            onFrom(e.value ? (e.value as Date).toISOString() : "");
          }}
          showTime
          hourFormat="24"
          dateFormat={dateFormat}
          className="flex-1 min-w-[10rem]"
          appendTo={overlayAppendTo}
        />
        <span className="text-on-surface-variant">—</span>
        <Calendar
          value={toIso ? new Date(toIso) : null}
          onChange={(e) => onTo(e.value ? (e.value as Date).toISOString() : "")}
          showTime
          hourFormat="24"
          dateFormat={dateFormat}
          className="flex-1 min-w-[10rem]"
          appendTo={overlayAppendTo}
        />
      </div>
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
  userOptions,
  typeOrder,
  typeLabel,
  statusLabel,
  calendarDateFormat,
  quickSearchForSave = "",
  appliedSearchForSave,
  onSaveSearchPreset,
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

  const appliedForSave = appliedSearchForSave ?? emptyWorkOrderAdvancedSearch();

  const section = "rounded-sm border border-outline/40 bg-surface-50/80 p-3 dark:bg-surface-900/40";
  const sectionTitle = "mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant";

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
        icon="pi pi-check"
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
      className="!w-[min(60vw,100vw)] max-w-none"
      blockScroll
      appendTo={typeof document !== "undefined" ? document.body : undefined}
      header={t("workOrders.searchPanel.title")}
      pt={{
        content: { className: "flex min-h-0 flex-1 flex-col p-0" },
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
                    className="w-full"
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
                    className="w-full"
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
                    className="w-full"
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
                    className="w-full"
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
                    className="w-full"
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
                    className="w-full"
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
                  <span className="text-xs font-medium text-on-surface-variant">{t("workOrders.workgroup")}</span>
                  <MultiSelect
                    value={value.workgroupId}
                    options={workgroupOptionsWithPseudo}
                    onChange={(e) => patch({ workgroupId: (e.value as string[]) ?? [] })}
                    optionLabel="label"
                    optionValue="value"
                    display="chip"
                    className="w-full"
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
                    className="w-full"
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
                    className="w-full"
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
              <div className="flex flex-col gap-3">
                <RangeCalendar
                  label={t("workOrders.plannedStart")}
                  fromIso={value.plannedStartFrom}
                  toIso={value.plannedStartTo}
                  onFrom={(v) => patch({ plannedStartFrom: v, plannedStartTo: v })}
                  onTo={(v) => patch({ plannedStartTo: v })}
                  dateFormat={calendarDateFormat}
                />
                <RangeCalendar
                  label={t("workOrders.plannedEnd")}
                  fromIso={value.plannedEndFrom}
                  toIso={value.plannedEndTo}
                  onFrom={(v) => patch({ plannedEndFrom: v, plannedEndTo: v })}
                  onTo={(v) => patch({ plannedEndTo: v })}
                  dateFormat={calendarDateFormat}
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
                    className="w-full"
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
                    className="w-full"
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

        <div className="sticky bottom-0 z-[1] flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-outline/40 bg-[var(--surface-ground)] px-3 py-3">
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
              icon="pi pi-save"
              className="p-button-outlined"
              title={t("workOrders.searchPresets.saveHint")}
              onClick={() => {
                setSaveName("");
                setSaveError("");
                setSaveDialogVisible(true);
              }}
            />
          ) : null}
          <Button type="submit" label={t("workOrders.searchPanel.apply")} icon="pi pi-check" />
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
