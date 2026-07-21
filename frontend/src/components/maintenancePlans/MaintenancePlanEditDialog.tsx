import { Check, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { AppDialog } from "../AppDialog";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
import { TabPanel, TabView } from "primereact/tabview";

import { lucidePrimeBtnIcon } from "../../icons/lucide";
import type {
  MaintenancePlanEditDialogProps,
  MaintenancePlanIntervalUnit,
} from "../../hooks/useMaintenancePlanEditDialogState";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

const fieldLabelClass = "block text-[11px] text-outline uppercase tracking-[0.1em]";

export type { MaintenancePlanEditDialogProps };

export function MaintenancePlanEditDialog(props: MaintenancePlanEditDialogProps) {
  const { t } = useTranslation();
  const {
    dialogVisible,
    editingId,
    editingRow,
    activeTabIndex,
    setActiveTabIndex,
    form,
    setForm,
    saving,
    siteFieldLocked,
    tabHostRef,
    refData,
    intervalUnitOptions,
    siteDropdownOptions,
    assetOptions,
    costCenterOptions,
    classificationOptions,
    inspectionRoundOptions,
    workgroupOptions,
    responsibleEmployeeOptions,
    updateTabInk,
    closeDialog,
    save,
  } = props;

  const dialogFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("maintenancePlans.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={closeDialog}
      />
      <Button
        type="button"
        label={t("maintenancePlans.save")}
        icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        loading={saving}
        onClick={() => void save()}
      />
    </div>
  );

  return (
    <AppDialog
      header={editingId ? t("maintenancePlans.editTitle") : t("maintenancePlans.createTitle")}
      visible={dialogVisible}
      className="app-big-modal-window app-tabbed-modal-window"
      onShow={updateTabInk}
      onHide={closeDialog}
      footer={dialogFooter}
      modal
      dismissableMask
      draggable={false}
      resizable={false}
      appendTo={overlayAppendTo}
    >
      <div ref={tabHostRef} className="app-tabview-with-ink app-wo-edit-tab-host">
        <TabView
          className="app-sticky-tabs"
          activeIndex={activeTabIndex}
          onTabChange={(e) => setActiveTabIndex(e.index)}
        >
          <TabPanel header={t("workOrders.tabGeneral")}>
            <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-6" style={{ margin: 0, display: "grid" }}>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="mp-key" className={fieldLabelClass}>
                  {t("maintenancePlans.key")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <InputText
                  id="mp-key"
                  value={form.key}
                  onChange={(e) => setForm((c) => ({ ...c, key: e.target.value }))}
                  className="w-full"
                  autoComplete="off"
                />
              </div>

              <div
                className={`space-y-2 flex flex-col justify-end ${
                  !form.siteId && siteFieldLocked ? "md:col-span-4" : "md:col-span-2"
                }`}
              >
                <div className="flex items-center gap-2 pb-2">
                  <Checkbox
                    inputId="mp-isActive"
                    checked={form.isActive}
                    onChange={(e) => setForm((c) => ({ ...c, isActive: Boolean(e.checked) }))}
                  />
                  <label htmlFor="mp-isActive" className="text-sm">
                    {t("maintenancePlans.active")}
                  </label>
                </div>
              </div>

              {!form.siteId && siteFieldLocked ? null : (
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="mp-site" className={fieldLabelClass}>
                    {t("maintenancePlans.site")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <Dropdown
                    inputId="mp-site"
                    value={form.siteId}
                    options={siteDropdownOptions}
                    onChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        siteId: String(e.value ?? ""),
                        assetId: "",
                        costCenterId: "",
                        workgroupId: "",
                        classificationId: "",
                        responsibleEmployeeIds: [],
                      }))
                    }
                    placeholder={t("maintenancePlans.sitePlaceholder")}
                    disabled={siteFieldLocked}
                    className="w-full app-inline-icon-dropdown"
                    appendTo={overlayAppendTo}
                  />
                </div>
              )}

              <div className="space-y-2 md:col-span-6">
                <label htmlFor="mp-name" className={fieldLabelClass}>
                  {t("workOrders.name")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <InputText
                  id="mp-name"
                  value={form.name}
                  onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                  className="w-full"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2 md:col-span-6">
                <label htmlFor="mp-description" className={fieldLabelClass}>
                  {t("workOrders.description")}
                </label>
                <textarea
                  id="mp-description"
                  value={form.description}
                  maxLength={2000}
                  onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
                  className="w-full p-inputtext p-component min-h-28 resize-y"
                />
                <div className="text-xs text-on-surface-variant text-right">
                  {t("workOrders.descriptionCounter", { count: form.description.length, max: 2000 })}
                </div>
              </div>

              <div className="space-y-2 md:col-span-3">
                <label htmlFor="mp-asset" className={fieldLabelClass}>
                  {t("workOrders.asset")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <Dropdown
                  inputId="mp-asset"
                  value={form.assetId}
                  options={assetOptions}
                  onChange={(e) => {
                    const assetId = String(e.value ?? "");
                    const asset = refData.accessibleAssets.find((a) => a.id === assetId);
                    setForm((c) => ({
                      ...c,
                      assetId,
                      siteId: asset?.siteId ?? c.siteId,
                      costCenterId: asset?.costCenterId ?? "",
                      workgroupId: "",
                      classificationId: "",
                      responsibleEmployeeIds: [],
                    }));
                  }}
                  placeholder={t("workOrders.assetPlaceholder")}
                  className="w-full app-inline-icon-dropdown"
                  filter
                  appendTo={overlayAppendTo}
                />
              </div>

              <div className="space-y-2 md:col-span-3">
                <label htmlFor="mp-cost-center" className={fieldLabelClass}>
                  {t("workOrders.costCenter")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <Dropdown
                  inputId="mp-cost-center"
                  value={form.costCenterId}
                  options={costCenterOptions}
                  onChange={(e) => setForm((c) => ({ ...c, costCenterId: String(e.value ?? "") }))}
                  placeholder={t("workOrders.costCenterPlaceholder")}
                  className="w-full app-inline-icon-dropdown"
                  disabled={!form.assetId}
                  filter
                  appendTo={overlayAppendTo}
                />
              </div>

              <div className="space-y-2 md:col-span-6">
                <label htmlFor="mp-classification" className={fieldLabelClass}>
                  {t("workOrders.classification")}
                </label>
                <Dropdown
                  inputId="mp-classification"
                  value={form.classificationId || null}
                  options={classificationOptions}
                  onChange={(e) => setForm((c) => ({ ...c, classificationId: String(e.value ?? "") }))}
                  placeholder={t("workOrders.classificationPlaceholder")}
                  className="w-full app-inline-icon-dropdown"
                  disabled={!form.assetId}
                  filter
                  showClear
                  appendTo={overlayAppendTo}
                />
              </div>

              <div className="space-y-2 md:col-span-6">
                <label htmlFor="mp-inspection-round" className={fieldLabelClass}>
                  {t("workOrders.inspectionRound")}
                </label>
                <Dropdown
                  inputId="mp-inspection-round"
                  value={form.inspectionRoundId || null}
                  options={inspectionRoundOptions}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, inspectionRoundId: String(e.value ?? "") }))
                  }
                  placeholder={t("workOrders.inspectionRoundPlaceholder")}
                  className="w-full app-inline-icon-dropdown"
                  disabled={!form.assetId}
                  filter
                  showClear
                  appendTo={overlayAppendTo}
                />
              </div>

              <div className="space-y-2 md:col-span-3">
                <label htmlFor="mp-workgroup" className={fieldLabelClass}>
                  {t("workOrders.workgroup")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <Dropdown
                  inputId="mp-workgroup"
                  value={form.workgroupId}
                  options={workgroupOptions}
                  onChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      workgroupId: String(e.value ?? ""),
                      responsibleEmployeeIds: [],
                    }))
                  }
                  placeholder={t("workOrders.workgroupPlaceholder")}
                  className="w-full app-inline-icon-dropdown"
                  disabled={!form.assetId}
                  filter
                  appendTo={overlayAppendTo}
                />
              </div>

              <div className="space-y-2 md:col-span-3">
                <label htmlFor="mp-responsible" className={fieldLabelClass}>
                  {t("workOrders.responsible")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <MultiSelect
                  inputId="mp-responsible"
                  value={form.responsibleEmployeeIds}
                  options={responsibleEmployeeOptions}
                  onChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      responsibleEmployeeIds: (Array.isArray(e.value) ? e.value : []).map(String),
                    }))
                  }
                  placeholder={t("workOrders.responsiblePlaceholder")}
                  disabled={!form.workgroupId || responsibleEmployeeOptions.length === 0}
                  display="chip"
                  className="w-full"
                  appendTo={overlayAppendTo}
                />
              </div>

              {!form.workgroupId ? (
                <p className="md:col-span-6 flex items-start gap-2 text-sm text-on-surface-variant">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {t("maintenancePlans.workgroupHint")}
                </p>
              ) : null}
            </div>
          </TabPanel>

          <TabPanel header={t("workOrders.tabPlandaten")}>
            <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-6" style={{ margin: 0, display: "grid" }}>
              <div className="space-y-2 md:col-span-3">
                <label htmlFor="mp-next-due" className={fieldLabelClass}>
                  {t("maintenancePlans.nextDueAt")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <Calendar
                  inputId="mp-next-due"
                  value={form.nextDueAt}
                  onChange={(e) => {
                    const next = e.value instanceof Date ? e.value : null;
                    setForm((c) => ({ ...c, nextDueAt: next }));
                  }}
                  showTime
                  hourFormat="24"
                  dateFormat={refData.calendarDateFormat}
                  className="w-full min-w-0 max-w-full"
                  appendTo={overlayAppendTo}
                />
              </div>

              <div className="space-y-2 md:col-span-3">
                <label htmlFor="mp-duration" className={fieldLabelClass}>
                  {t("workOrders.plannedDuration")}
                </label>
                <InputNumber
                  inputId="mp-duration"
                  value={form.plannedDurationMinutes}
                  onValueChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      plannedDurationMinutes: typeof e.value === "number" ? e.value : null,
                    }))
                  }
                  min={0}
                  className="w-full"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="mp-interval-value" className={fieldLabelClass}>
                  {t("maintenancePlans.intervalValue")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <InputNumber
                  inputId="mp-interval-value"
                  value={form.intervalValue}
                  onValueChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      intervalValue: typeof e.value === "number" && e.value >= 1 ? e.value : 1,
                    }))
                  }
                  min={1}
                  className="w-full"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="mp-interval-unit" className={fieldLabelClass}>
                  {t("maintenancePlans.intervalUnit")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <Dropdown
                  inputId="mp-interval-unit"
                  value={form.intervalUnit}
                  options={intervalUnitOptions}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, intervalUnit: e.value as MaintenancePlanIntervalUnit }))
                  }
                  className="w-full app-inline-icon-dropdown"
                  appendTo={overlayAppendTo}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="mp-lead" className={fieldLabelClass}>
                  {t("maintenancePlans.leadTimeDays")}
                </label>
                <InputNumber
                  inputId="mp-lead"
                  value={form.leadTimeDays}
                  onValueChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      leadTimeDays: typeof e.value === "number" && e.value >= 0 ? e.value : 0,
                    }))
                  }
                  min={0}
                  className="w-full"
                />
              </div>

              {editingId ? (
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="mp-executions" className={fieldLabelClass}>
                    {t("maintenancePlans.executionCount")}
                  </label>
                  <InputText
                    id="mp-executions"
                    value={String(editingRow?.executionCount ?? 0)}
                    disabled
                    className="w-full"
                  />
                </div>
              ) : null}

              <div className="space-y-2 md:col-span-6 flex flex-col justify-end">
                <div className="flex items-center gap-2 pb-2">
                  <Checkbox
                    inputId="mp-ignore-open"
                    checked={form.ignoreOpenWorkOrders}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, ignoreOpenWorkOrders: Boolean(e.checked) }))
                    }
                  />
                  <label htmlFor="mp-ignore-open" className="text-sm">
                    {t("maintenancePlans.ignoreOpenWorkOrders")}
                  </label>
                </div>
                <p className="m-0 text-xs text-on-surface-variant">
                  {t("maintenancePlans.ignoreOpenWorkOrdersHint")}
                </p>
              </div>
            </div>
          </TabPanel>
        </TabView>
      </div>
    </AppDialog>
  );
}
