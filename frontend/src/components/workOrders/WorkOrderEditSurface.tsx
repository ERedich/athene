import { useMemo, type ReactNode } from "react";
import { Check, Pencil, Trash2, Upload, UserPlus, X } from "lucide-react";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import { AppDialog } from "../AppDialog";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
import { TabPanel, TabView } from "primereact/tabview";

import { DocumentMimeIcon } from "../documents/DocumentMimeIcon";
import { LucideInputSearchIcon } from "../LucideInputSearchIcon";
import { ReportCodePreview } from "../ReportCodePreview";
import { AssetSelItem } from "../selItem/AssetSelItem";
import { WorkOrderFeedbackTabContent } from "./WorkOrderFeedbackTabContent";
import { WorkOrderFeedbackTransactionsSection } from "./WorkOrderFeedbackTransactionsSection";
import { WorkOrderInspectionPointsTabContent } from "./WorkOrderInspectionPointsTabContent";
import { WorkOrderMessagesTabContent } from "./WorkOrderMessagesTabContent";
import {
  ASSET_DOCUMENT_CATEGORY_ORDER,
  documentCategoryBadgeClass,
  isAssetDocumentCategory,
} from "../../constants/assetDocumentCategory";
import { useDocumentImageHoverPreview } from "../../hooks/useDocumentImageHoverPreview";
import type { useWorkOrderEditDialogState } from "../../hooks/useWorkOrderEditDialogState";
import {
  addHours,
  PENDING_AUTO_UPLOAD_MS,
} from "../../hooks/useWorkOrderEditDialogState";
import {
  AppPauseIcon,
  AppPlayStartIcon,
  AppSquareStopIcon,
  LucideSpinner,
  lucidePrimeBtnIcon,
} from "../../icons/lucide";
import { isImageDocument } from "../../lib/isImageDocument";
import { orderDialogTabs } from "../../lib/workOrderDialog";
import type { WorkOrderType } from "../../lib/workOrderForm";
import { workOrderQrValue } from "../../lib/workOrderQr";
import { formatOriginalWoOrderNumber } from "../../lib/workOrderTypes";
import { workOrderStatusAllowsFeedbackTab } from "../../lib/workOrderStatus";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import { AppTabHeader } from "../tabs/AppTabHeader";
import { STANDARD_TAB_HOST_CLASS, STANDARD_TAB_VIEW_CLASS } from "../../lib/tabs";

export type WorkOrderEditDialogProps = ReturnType<typeof useWorkOrderEditDialogState>;

function formatHoursForDurationInput(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return "";
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function useWorkOrderEditHeaderIcons(props: WorkOrderEditDialogProps): ReactNode {
  const { t, editingId, openFeedbackTab, startOrder } = props;

  return useMemo(() => {
    if (!editingId || !props.editingRow) return null;
    const row = props.editingRow;
    let actionIcons: React.ReactNode = null;
    if (["open", "assigned", "paused"].includes(row.status)) {
      actionIcons = (
        <Button
          type="button"
          text
          rounded
          className="app-wo-start-action !h-8 !min-h-8 !w-8 !min-w-8 !p-0"
          icon={<AppPlayStartIcon />}
          title={t("workOrders.start")}
          aria-label={t("workOrders.start")}
          onClick={() => void startOrder(row)}
        />
      );
    } else if (row.status === "started" || row.status === "continued") {
      actionIcons = (
        <>
          <Button
            type="button"
            text
            rounded
            className="app-wo-stop-action !h-8 !min-h-8 !w-8 !min-w-8 !p-0"
            icon={<AppSquareStopIcon />}
            title={t("workOrders.stop")}
            aria-label={t("workOrders.stop")}
            onClick={() => openFeedbackTab(row, "stop")}
          />
          <Button
            type="button"
            text
            rounded
            className="!h-8 !min-h-8 !w-8 !min-w-8 !p-0"
            icon={<AppPauseIcon />}
            title={t("workOrders.pause")}
            aria-label={t("workOrders.pause")}
            onClick={() => openFeedbackTab(row, "pause")}
          />
        </>
      );
    }
    return actionIcons ? <div className="mr-1 flex items-center gap-1">{actionIcons}</div> : null;
  }, [editingId, openFeedbackTab, props.editingRow, startOrder, t]);
}

type WorkOrderEditFooterProps = {
  props: WorkOrderEditDialogProps;
  cancelLabel?: string;
};

export function WorkOrderEditFooter({ props, cancelLabel }: WorkOrderEditFooterProps) {
  const {
    t,
    closeDialog,
    editingId,
    editingMeta,
    save,
    saveFeedback,
    isFeedbackTab,
    feedbackSaving,
    saving,
  } = props;

  return (
    <div className="app-wo-edit-footer flex justify-end gap-2">
      <Button
        type="button"
        className="app-wo-cancel-button"
        label={cancelLabel ?? t("workOrders.cancel")}
        severity="secondary"
        outlined
        disabled={saving || (isFeedbackTab && feedbackSaving)}
        onClick={closeDialog}
      />
      <Button
        type="button"
        className="app-wo-save-button"
        label={isFeedbackTab ? t("workOrders.reportBackAndSave") : t("workOrders.save")}
        icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        loading={isFeedbackTab ? feedbackSaving : saving}
        disabled={isFeedbackTab ? feedbackSaving || !editingId || editingMeta?.status === "done" : saving}
        onClick={() => void (isFeedbackTab ? saveFeedback() : save())}
      />
    </div>
  );
}

export function WorkOrderEditTabContent(props: WorkOrderEditDialogProps) {
  const {
    t,
    editingId,
    editingMeta,
    form,
    setForm,
    activeTabIndex,
    setActiveTabIndex,
    fileInputRef,
    tabHostRef,
    statusLabel,
    orderStatusForUi,
    orderTypeOptions,
    assetKeyDisplay,
    setAssetKeyDisplay,
    handleAssetSelect,
    costCenterOptions,
    classificationOptions,
    inspectionRoundOptions,
    workgroupOptions,
    responsibleEmployeeOptions,
    calendarDateFormat,
    assignments,
    assignmentsLoading,
    assignmentsCascadeSeed,
    assignmentEmployeeIds,
    setAssignmentEmployeeIds,
    assignmentEmployeeOptions,
    assignmentAdding,
    addAssignments,
    removeAssignment,
    documents,
    documentsLoading,
    documentsSearchTerm,
    setDocumentsSearchTerm,
    pendingFiles,
    filteredPendingFiles,
    filteredDocuments,
    pendingUiTick,
    pendingRowUploading,
    uploading,
    handlePickFiles,
    removePendingFileByLocalId,
    openDocumentContent,
    deleteDocument,
    formatShortDt,
    formatFileSize,
    setDocumentEdit,
    setDocumentEditDisplayName,
    setDocumentEditCategory,
    feedbackHours,
    setFeedbackHours,
    feedbackRemark,
    setFeedbackRemark,
    feedbackPauseRemark,
    setFeedbackPauseRemark,
    feedbackStatusAction,
    setFeedbackStatusAction,
    feedbackEntryMode,
    feedbackAdditionalHours,
    setFeedbackAdditionalHours,
    feedbackTransactions,
    feedbackTransactionsLoading,
    workOrderMessages,
    workOrderMessagesLoading,
    workOrderMessageSending,
    sendMessage,
    reportingEmployeeLabel,
    feedbackAdditionalEmployeeOptions,
    userEmployeeId,
    currentUserId,
    documentsTabCount,
    assignmentsTabCount,
    feedbackTabCount,
    transactionsTabCount,
    messagesTabCount,
    updatePlannedDuration,
    saving,
    inspectionPoints,
    inspectionPointsLoading,
    inspectionPointTogglingId,
    toggleInspectionPoint,
  } = props;

  const assignmentsLocked =
    editingMeta?.status === "ended" || editingMeta?.status === "done" || editingMeta?.status === "cancelled";
  const inspectionPointsTabEnabled = Boolean(editingId && form.inspectionRoundId);
  const { showPreview, clearPreview, previewPortal } = useDocumentImageHoverPreview();
  const orderQrValue = workOrderQrValue(editingMeta?.orderNumber ?? form.orderNumber);

  return (
    <div ref={tabHostRef} className={STANDARD_TAB_HOST_CLASS}>
      {previewPortal}
      <TabView
        className={STANDARD_TAB_VIEW_CLASS}
        activeIndex={activeTabIndex}
        onTabChange={(e) => {
          const idx = e.index;
          if (idx === orderDialogTabs.Feedback && !workOrderStatusAllowsFeedbackTab(editingMeta?.status)) {
            return;
          }
          if (
            idx === orderDialogTabs.General ||
            idx === orderDialogTabs.Planning ||
            idx === orderDialogTabs.Documents ||
            idx === orderDialogTabs.InspectionPoints ||
            idx === orderDialogTabs.Feedback ||
            idx === orderDialogTabs.Transactions ||
            idx === orderDialogTabs.Messages
          ) {
            setActiveTabIndex(idx);
          }
        }}
      >
        <TabPanel header={<AppTabHeader label={t("workOrders.tabGeneral")} />}>
          <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-6 md:grid-rows-[auto_auto]" style={{ margin: 0, display: "grid" }}>
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="order-number" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.orderNumber")}
              </label>
              <InputText
                id="order-number"
                value={form.orderNumber ? String(form.orderNumber) : t("workOrders.autoNumberHint")}
                disabled
                className="w-full"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="order-status" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.status")}
              </label>
              <InputText
                id="order-status"
                disabled
                value={statusLabel(orderStatusForUi)}
                className={`w-full app-wo-status-input app-wo-status-${orderStatusForUi}`}
              />
            </div>

            <div className="space-y-2 md:col-span-2 md:row-span-2">
              <span className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.qrCode")}
              </span>
              <div
                className="flex min-h-[7.25rem] h-full flex-col items-center justify-center gap-1.5 rounded border border-outline-variant/40 bg-surface-container-lowest p-2"
                title={orderQrValue || undefined}
                aria-label={
                  orderQrValue
                    ? t("workOrders.qrCodeValue", { value: orderQrValue })
                    : t("workOrders.qrCodePending")
                }
              >
                <div className="h-24 w-24">
                  <ReportCodePreview
                    kind="qr"
                    value={orderQrValue}
                    width={96}
                    height={96}
                    align="center"
                    emptyLabel={t("workOrders.qrCodePending")}
                    kindLabel={t("workOrders.qrCode")}
                  />
                </div>
                <span className="max-w-full truncate font-mono text-xs text-on-surface-variant">
                  {orderQrValue || t("workOrders.qrCodePending")}
                </span>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="order-original-wo" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.originalWo")}
              </label>
              <InputText
                id="order-original-wo"
                value={formatOriginalWoOrderNumber(form.copySourceOrderNumber)}
                disabled
                className="w-full"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="order-type" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.orderType")}
                <span className="app-required-marker" aria-hidden>
                  *
                </span>
              </label>
              <Dropdown
                inputId="order-type"
                value={form.orderType}
                options={orderTypeOptions}
                onChange={(e) => setForm((cur) => ({ ...cur, orderType: e.value as WorkOrderType }))}
                className="w-full app-inline-icon-dropdown"
                appendTo={overlayAppendTo}
              />
            </div>

            <div className="space-y-2 md:col-span-6">
              <label htmlFor="order-name" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.name")}
                <span className="app-required-marker" aria-hidden>
                  *
                </span>
              </label>
              <InputText
                id="order-name"
                value={form.name}
                maxLength={200}
                onChange={(e) => setForm((cur) => ({ ...cur, name: e.target.value }))}
                className="w-full"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2 md:col-span-6">
              <label htmlFor="order-description" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.description")}
              </label>
              <textarea
                id="order-description"
                value={form.description}
                maxLength={2000}
                onChange={(e) => setForm((cur) => ({ ...cur, description: e.target.value }))}
                className="w-full p-inputtext p-component min-h-28 resize-y"
              />
              <div className="text-xs text-on-surface-variant text-right">
                {t("workOrders.descriptionCounter", { count: form.description.length, max: 2000 })}
              </div>
            </div>

            <div className="space-y-2 md:col-span-3">
              <label htmlFor="order-asset" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.asset")}
                <span className="app-required-marker" aria-hidden>
                  *
                </span>
              </label>
              <AssetSelItem
                inputId="order-asset"
                assetId={form.assetId}
                assetKey={assetKeyDisplay}
                onSelect={handleAssetSelect}
                onAssetKeyChange={setAssetKeyDisplay}
                placeholder={t("workOrders.assetPlaceholder")}
              />
            </div>

            <div className="space-y-2 md:col-span-3">
              <label htmlFor="order-cost-center" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.costCenter")}
                <span className="app-required-marker" aria-hidden>
                  *
                </span>
              </label>
              <Dropdown
                inputId="order-cost-center"
                value={form.costCenterId}
                options={costCenterOptions}
                onChange={(e) => setForm((cur) => ({ ...cur, costCenterId: String(e.value ?? "") }))}
                placeholder={t("workOrders.costCenterPlaceholder")}
                className="w-full app-inline-icon-dropdown"
                disabled={!form.assetId}
                filter
                appendTo={overlayAppendTo}
              />
            </div>

            <div className="space-y-2 md:col-span-6">
              <label htmlFor="order-classification" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.classification")}
              </label>
              <Dropdown
                inputId="order-classification"
                value={form.classificationId || null}
                options={classificationOptions}
                onChange={(e) => setForm((cur) => ({ ...cur, classificationId: String(e.value ?? "") }))}
                placeholder={t("workOrders.classificationPlaceholder")}
                className="w-full app-inline-icon-dropdown"
                disabled={!form.assetId}
                filter
                showClear
                appendTo={overlayAppendTo}
              />
            </div>

            <div className="space-y-2 md:col-span-6">
              <label htmlFor="order-inspection-round" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.inspectionRound")}
              </label>
              <Dropdown
                inputId="order-inspection-round"
                value={form.inspectionRoundId || null}
                options={inspectionRoundOptions}
                onChange={(e) =>
                  setForm((cur) => ({ ...cur, inspectionRoundId: String(e.value ?? "") }))
                }
                placeholder={t("workOrders.inspectionRoundPlaceholder")}
                className="w-full app-inline-icon-dropdown"
                disabled={!form.assetId}
                filter
                showClear
                appendTo={overlayAppendTo}
              />
            </div>

            <div className="space-y-2 md:col-span-6">
              <label htmlFor="order-workgroup" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.workgroup")}
                <span className="app-required-marker" aria-hidden>
                  *
                </span>
              </label>
              <Dropdown
                inputId="order-workgroup"
                value={form.workgroupId || null}
                options={workgroupOptions}
                onChange={(e) => setForm((cur) => ({ ...cur, workgroupId: String(e.value ?? "") }))}
                placeholder={t("workOrders.workgroupPlaceholder")}
                className="w-full app-inline-icon-dropdown"
                filter
                disabled={!form.assetId}
                appendTo={overlayAppendTo}
              />
            </div>

            <div className="space-y-2 md:col-span-6">
              <label htmlFor="order-responsible" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t("workOrders.responsible")}
                <span className="app-required-marker" aria-hidden>
                  *
                </span>
              </label>
              <MultiSelect
                inputId="order-responsible"
                value={form.responsibleEmployeeIds}
                options={responsibleEmployeeOptions}
                onChange={(e) =>
                  setForm((cur) => ({
                    ...cur,
                    responsibleEmployeeIds: (Array.isArray(e.value) ? e.value : []).map((entry) => String(entry)),
                  }))
                }
                placeholder={t("workOrders.responsiblePlaceholder")}
                className="w-full"
                filter
                display="comma"
                appendTo={overlayAppendTo}
                disabled={!form.workgroupId || responsibleEmployeeOptions.length === 0}
              />
            </div>
          </div>
        </TabPanel>
        <TabPanel
          header={<AppTabHeader label={t("workOrders.tabPlandaten")} count={assignmentsTabCount} />}
        >
          <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2" style={{ margin: 0, display: "grid" }}>
            <div
              className="grid w-full max-w-full grid-cols-1 gap-4 overflow-hidden md:col-span-2 md:grid-cols-3"
              style={{ margin: 0, display: "grid" }}
            >
              <div className="min-w-0 max-w-full space-y-2">
                <label htmlFor="order-plan-start" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                  {t("workOrders.plannedStart")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <Calendar
                  inputId="order-plan-start"
                  value={form.plannedStart}
                  onChange={(e) => {
                    const next = e.value instanceof Date ? e.value : null;
                    setForm((cur) => {
                      if (!next) return { ...cur, plannedStart: null };
                      let nextEnd = cur.plannedEnd;
                      const parsedHours = Number(cur.plannedDurationHours.trim().replace(",", "."));
                      if (cur.plannedDurationHours.trim() !== "" && Number.isFinite(parsedHours) && parsedHours >= 0) {
                        nextEnd = new Date(next.getTime() + parsedHours * 60 * 60 * 1000);
                      } else if (!nextEnd) {
                        nextEnd = addHours(next, 24);
                      }
                      return { ...cur, plannedStart: next, plannedEnd: nextEnd };
                    });
                  }}
                  showTime
                  hourFormat="24"
                  dateFormat={calendarDateFormat}
                  className="w-full min-w-0 max-w-full"
                  appendTo={overlayAppendTo}
                />
              </div>

              <div className="min-w-0 max-w-full space-y-2">
                <label htmlFor="order-plan-end" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                  {t("workOrders.plannedEnd")}
                </label>
                <Calendar
                  inputId="order-plan-end"
                  value={form.plannedEnd}
                  onChange={(e) => {
                    const next = e.value instanceof Date ? e.value : null;
                    setForm((cur) => {
                      if (!next) return { ...cur, plannedEnd: null, plannedDurationHours: "" };
                      if (!cur.plannedStart) return { ...cur, plannedEnd: next };
                      const diffMs = next.getTime() - cur.plannedStart.getTime();
                      const hours = Math.max(0, diffMs / (1000 * 60 * 60));
                      return {
                        ...cur,
                        plannedEnd: next,
                        plannedDurationHours: formatHoursForDurationInput(hours),
                      };
                    });
                  }}
                  showTime
                  hourFormat="24"
                  dateFormat={calendarDateFormat}
                  className="w-full min-w-0 max-w-full"
                  appendTo={overlayAppendTo}
                />
              </div>

              <div className="min-w-0 max-w-full space-y-2">
                <label htmlFor="order-duration" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                  {t("workOrders.plannedDuration")}
                </label>
                <InputText
                  id="order-duration"
                  value={form.plannedDurationHours}
                  onChange={(e) => {
                    const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
                    const normalized = raw.split(".").length > 2 ? raw.replace(/\.(?=.*\.)/g, "") : raw;
                    setForm((cur) => ({ ...cur, plannedDurationHours: normalized }));
                    if (normalized === "") {
                      updatePlannedDuration(null);
                    } else {
                      const nextHours = Number(normalized);
                      if (Number.isFinite(nextHours) && nextHours >= 0) {
                        updatePlannedDuration(nextHours);
                      }
                    }
                  }}
                  className="w-full min-w-0 max-w-full"
                  autoComplete="off"
                  placeholder={t("workOrders.plannedDurationPlaceholder")}
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="text-sm text-on-surface-variant">{t("workOrders.assignmentsTitle")}</div>
              {!editingId ? (
                <div className="text-sm text-on-surface-variant">{t("workOrders.assignmentsApplyOnSaveHint")}</div>
              ) : null}
              <div className="flex flex-wrap items-start gap-2">
                <MultiSelect
                  inputId="order-assignments-multiselect"
                  value={assignmentEmployeeIds}
                  options={assignmentEmployeeOptions}
                  optionLabel="label"
                  optionValue="value"
                  display="chip"
                  onChange={(e) => setAssignmentEmployeeIds((e.value as string[] | null | undefined) ?? [])}
                  placeholder={t("workOrders.assignmentsAddPlaceholder")}
                  className="min-w-0 flex-1 app-inline-icon-multiselect"
                  filter
                  showClear
                  maxSelectedLabels={4}
                  disabled={saving || assignmentsLocked}
                  appendTo={overlayAppendTo}
                />
                <Button
                  type="button"
                  icon={<UserPlus className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                  label={t("workOrders.assignmentsAdd")}
                  loading={assignmentAdding}
                  onClick={() => void addAssignments()}
                  disabled={saving || assignmentEmployeeIds.length === 0 || assignmentsLocked || !editingId}
                />
              </div>
              {!editingId ? (
                assignmentEmployeeIds.length > 0 ? (
                  <div className="text-sm text-on-surface-variant">{t("workOrders.assignmentsPendingHint")}</div>
                ) : null
              ) : assignmentsLoading ? (
                <div className="text-sm text-on-surface-variant">{t("workOrders.documentsLoading")}</div>
              ) : assignments.length > 0 ? (
                <div key={assignmentsCascadeSeed} className="flex flex-wrap gap-2">
                  {assignments.map((item, index) => (
                    <span
                      key={item.id}
                      className="app-card-cascade app-wo-assignment-chip"
                      style={{ ["--app-cascade-index" as string]: index }}
                    >
                      <span className="app-wo-assignment-chip__key">{item.employeeKey}</span>
                      <span className="app-wo-assignment-chip__name">{item.employeeName}</span>
                      <Button
                        type="button"
                        text
                        severity="danger"
                        className="!h-5 !min-h-5 !w-5 !min-w-5 !p-0"
                        icon={<X className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                        onClick={() => void removeAssignment(item.employeeId)}
                        disabled={assignmentsLocked}
                      />
                    </span>
                  ))}
                </div>
              ) : assignmentEmployeeIds.length > 0 ? (
                <div className="text-sm text-on-surface-variant">{t("workOrders.assignmentsPendingHint")}</div>
              ) : (
                <div className="text-sm text-on-surface-variant">{t("workOrders.assignmentsEmpty")}</div>
              )}
            </div>
          </div>
        </TabPanel>
        <TabPanel header={<AppTabHeader label={t("workOrders.tabDocuments")} count={documentsTabCount} />}>
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-[8fr_2fr] items-stretch gap-2">
              <Button
                type="button"
                icon={<Upload className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                label={t("workOrders.documentsUpload")}
                className="w-full min-w-0 justify-center !h-9 min-h-9 max-h-9 py-0"
                onClick={() => fileInputRef.current?.click()}
              />
              <IconField iconPosition="left" className="min-w-0 w-full !h-9 min-h-9 max-h-9">
                <LucideInputSearchIcon />
                <InputText
                  value={documentsSearchTerm}
                  onChange={(e) => setDocumentsSearchTerm(e.target.value)}
                  placeholder={t("workOrders.documentsSearchPlaceholder")}
                  className="app-header-search-input !h-full min-h-0 w-full !rounded-sm text-sm"
                />
              </IconField>
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handlePickFiles} />
            {uploading ? (
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
                <span>{t("workOrders.documentsUploading")}</span>
              </div>
            ) : null}

            {pendingFiles.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm text-on-surface-variant">{t("workOrders.documentsPending")}</div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {filteredPendingFiles.map((doc, index) => {
                    const mime = doc.file.type || "application/octet-stream";
                    const imageDoc = isImageDocument(mime, doc.file.name);
                    return (
                    <div
                      key={doc.localId}
                      className="app-card-cascade flex items-center gap-3 rounded-sm border border-solid app-wo-detail-outline-border px-3 py-2"
                      style={{ ["--app-cascade-index" as string]: index }}
                      title={imageDoc ? t("documentsUi.imagePreviewHint") : undefined}
                      onMouseEnter={(e) => {
                        if (!imageDoc) return;
                        showPreview({
                          cacheKey: `pending:${doc.localId}`,
                          title: doc.displayName || doc.file.name,
                          mimeType: mime,
                          fileName: doc.file.name,
                          anchor: e.currentTarget.getBoundingClientRect(),
                          file: doc.file,
                        });
                      }}
                      onMouseLeave={() => {
                        if (imageDoc) clearPreview();
                      }}
                    >
                      <DocumentMimeIcon mimeType={mime} fileName={doc.file.name} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{doc.displayName}</div>
                        <div className="text-xs text-on-surface-variant">
                          <span
                            className={`inline align-middle rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight md:text-xs ${documentCategoryBadgeClass(doc.category)}`}
                          >
                            {t(`workOrders.documentCategories.${doc.category}`)}
                          </span>
                          <span className="text-on-surface-variant"> · </span>
                          {mime.split(";")[0]} · {formatFileSize(doc.file.size)}
                        </div>
                      </div>
                      <Button type="button" text disabled className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0 opacity-100">
                        {Boolean(pendingRowUploading[doc.localId]) ? (
                          <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
                        ) : (
                          <span className="text-xs">
                            {Math.max(
                              0,
                              Math.ceil(
                                (PENDING_AUTO_UPLOAD_MS - (Date.now() - doc.addedAt) + pendingUiTick * 0) / 1000,
                              ),
                            )}
                          </span>
                        )}
                      </Button>
                      <Button
                        type="button"
                        text
                        severity="danger"
                        className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0"
                        icon={<X className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                        aria-label={t("workOrders.documentsRemovePending")}
                        title={t("workOrders.documentsRemovePending")}
                        onClick={() => removePendingFileByLocalId(doc.localId)}
                      />
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {editingId ? (
              <div className="space-y-2">
                <div className="text-sm text-on-surface-variant">{t("workOrders.documentsExisting")}</div>
                {documentsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                    <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
                    <span>{t("workOrders.documentsLoading")}</span>
                  </div>
                ) : documents.length === 0 ? (
                  <div className="text-sm text-on-surface-variant">{t("workOrders.documentsEmpty")}</div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {filteredDocuments.map((doc, index) => {
                      const mime = doc.mimeType ?? "application/octet-stream";
                      const imageDoc = isImageDocument(mime, doc.fileName);
                      const contentUrl =
                        doc.source === "asset" && doc.assetId
                          ? `/api/assets/${doc.assetId}/documents/${doc.id}/content`
                          : doc.workOrderId
                            ? `/api/work-orders/${doc.workOrderId}/documents/${doc.id}/content`
                            : null;
                      return (
                      <div
                        key={doc.id}
                        className="app-card-cascade flex cursor-pointer items-center gap-3 rounded-sm border border-solid app-wo-detail-outline-border px-3 py-2"
                        style={{ ["--app-cascade-index" as string]: index }}
                        title={imageDoc ? t("documentsUi.imagePreviewHint") : undefined}
                        onClick={() => void openDocumentContent(doc)}
                        onMouseEnter={(e) => {
                          if (!imageDoc || !contentUrl) return;
                          showPreview({
                            cacheKey: `${doc.source}:${doc.id}`,
                            title: doc.displayName || doc.fileName,
                            mimeType: mime,
                            fileName: doc.fileName,
                            anchor: e.currentTarget.getBoundingClientRect(),
                            fetchUrl: contentUrl,
                          });
                        }}
                        onMouseLeave={() => {
                          if (imageDoc) clearPreview();
                        }}
                      >
                        <DocumentMimeIcon mimeType={mime} fileName={doc.fileName} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{doc.displayName || doc.fileName}</div>
                          <div className="text-xs text-on-surface-variant">
                            <span
                              className={`inline align-middle rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight md:text-xs ${documentCategoryBadgeClass(doc.category)}`}
                            >
                              {t(`workOrders.documentCategories.${doc.category}`)}
                            </span>
                            <span className="text-on-surface-variant"> · </span>
                            <span
                              className={`inline align-middle rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight md:text-xs ${
                                doc.source === "asset" ? "bg-green-200 text-slate-900" : "bg-cyan-200 text-slate-900"
                              }`}
                            >
                              {t(`workOrders.documentsSource.${doc.source}`)}
                            </span>
                            <span className="text-on-surface-variant"> · </span>
                            {mime.split(";")[0]} · {formatFileSize(doc.fileSize)}
                          </div>
                          <div className="text-xs text-on-surface-variant">
                            {t("workOrders.documentsUploadedBy")}: {doc.createdBy} · {t("workOrders.documentsUploadedAt")}:{" "}
                            {formatShortDt(doc.createdAt)}
                          </div>
                        </div>
                        <Button
                          type="button"
                          text
                          className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0"
                          icon={<Pencil className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDocumentEdit(doc);
                            setDocumentEditDisplayName(doc.displayName || doc.fileName);
                            setDocumentEditCategory(doc.category);
                          }}
                        />
                        {doc.source === "workOrder" && doc.workOrderId ? (
                          <Button
                            type="button"
                            text
                            severity="danger"
                            className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0"
                            icon={<Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteDocument(doc.workOrderId!, doc.id);
                            }}
                          />
                        ) : null}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-sm border border-solid app-wo-detail-outline-border px-3 py-2 text-sm text-on-surface-variant">
                {t("workOrders.documentsCreateHint")}
              </div>
            )}
          </div>
        </TabPanel>
        <TabPanel
          header={
            <AppTabHeader
              label={t("workOrders.tabInspectionPoints")}
              count={
                inspectionPoints.length > 0
                  ? `${inspectionPoints.filter((p) => p.checked).length}/${inspectionPoints.length}`
                  : null
              }
            />
          }
          disabled={!inspectionPointsTabEnabled}
        >
          <WorkOrderInspectionPointsTabContent
            rows={inspectionPoints}
            loading={inspectionPointsLoading}
            togglingId={inspectionPointTogglingId}
            emptyLabel={t("workOrders.inspectionPointsEmpty")}
            loadingLabel={t("workOrders.inspectionPointsLoading")}
            posLabel={t("workOrders.inspectionPointPos")}
            nameLabel={t("workOrders.inspectionPointName")}
            assetLabel={t("workOrders.asset")}
            pointLabel={t("workOrders.inspectionPoint")}
            formatPos={(pos) => String(pos).padStart(4, "0")}
            onToggle={(row, checked) => void toggleInspectionPoint(row, checked)}
          />
        </TabPanel>
        <TabPanel
          header={<AppTabHeader label={t("workOrders.tabFeedback")} count={feedbackTabCount} />}
          disabled={!editingId || !workOrderStatusAllowsFeedbackTab(editingMeta?.status)}
        >
          <WorkOrderFeedbackTabContent
            reportingEmployeeLabel={reportingEmployeeLabel}
            feedbackHours={feedbackHours}
            onFeedbackHoursChange={setFeedbackHours}
            feedbackRemark={feedbackRemark}
            onFeedbackRemarkChange={setFeedbackRemark}
            feedbackPauseRemark={feedbackPauseRemark}
            onFeedbackPauseRemarkChange={setFeedbackPauseRemark}
            feedbackStatusAction={feedbackStatusAction}
            onFeedbackStatusActionChange={setFeedbackStatusAction}
            feedbackEntryMode={feedbackEntryMode}
            additionalHoursRows={feedbackAdditionalHours}
            onAdditionalHoursRowsChange={setFeedbackAdditionalHours}
            additionalEmployeeOptions={feedbackAdditionalEmployeeOptions}
            sessionEmployeeId={userEmployeeId}
            disabled={props.feedbackSaving}
            doneOrder={editingMeta?.status === "done"}
            pcrEnabled={props.pcrEnabled}
            pcrRequired={props.pcrRequired}
            pcrProblemId={props.pcrProblemId}
            pcrCauseId={props.pcrCauseId}
            pcrRemedyId={props.pcrRemedyId}
            onPcrProblemIdChange={props.setPcrProblemId}
            onPcrCauseIdChange={props.setPcrCauseId}
            onPcrRemedyIdChange={props.setPcrRemedyId}
            pcrProblemOptions={props.pcrProblemOptions}
            pcrCauseOptions={props.pcrCauseOptions}
            pcrRemedyOptions={props.pcrRemedyOptions}
            pcrLoading={props.pcrLoading}
          />
        </TabPanel>
        <TabPanel
          header={<AppTabHeader label={t("workOrders.tabTransactions")} count={transactionsTabCount} />}
          disabled={!editingId}
        >
          <div className="pt-1">
            <WorkOrderFeedbackTransactionsSection rows={feedbackTransactions} loading={feedbackTransactionsLoading} />
          </div>
        </TabPanel>
        <TabPanel
          header={<AppTabHeader label={t("workOrders.tabMessages")} count={messagesTabCount} />}
          disabled={!editingId}
        >
          <div className="app-wo-messages-tab">
            <WorkOrderMessagesTabContent
              messages={workOrderMessages}
              loading={workOrderMessagesLoading}
              sending={workOrderMessageSending}
              currentUserId={currentUserId}
              onSend={sendMessage}
            />
          </div>
        </TabPanel>
      </TabView>
    </div>
  );
}

export function WorkOrderEditDocumentDialog(props: WorkOrderEditDialogProps) {
  const {
    t,
    documentEdit,
    setDocumentEdit,
    documentEditDisplayName,
    setDocumentEditDisplayName,
    documentEditCategory,
    setDocumentEditCategory,
    documentEditSaving,
    saveDocumentEdit,
  } = props;

  return (
    <AppDialog
      header={t("workOrders.documentsEditTitle")}
      visible={documentEdit !== null}
      className="app-modal-window"
      onHide={() => {
        if (!documentEditSaving) setDocumentEdit(null);
      }}
      modal
      dismissableMask={!documentEditSaving}
      closable={!documentEditSaving}
      draggable={false}
      resizable={false}
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <label htmlFor="order-document-edit-display-name" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
            {t("workOrders.documentsDisplayName")}
          </label>
          <InputText
            id="order-document-edit-display-name"
            value={documentEditDisplayName}
            onChange={(e) => setDocumentEditDisplayName(e.target.value)}
            className="w-full"
            autoComplete="off"
            disabled={documentEditSaving}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="order-document-edit-category" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
            {t("workOrders.documentsCategory")}
          </label>
          <Dropdown
            inputId="order-document-edit-category"
            value={documentEditCategory}
            options={ASSET_DOCUMENT_CATEGORY_ORDER.map((value) => ({
              value,
              label: t(`workOrders.documentCategories.${value}`),
            }))}
            optionLabel="label"
            optionValue="value"
            onChange={(e) => {
              const v = String(e.value ?? "general");
              if (isAssetDocumentCategory(v)) setDocumentEditCategory(v);
            }}
            className="w-full app-inline-icon-dropdown"
            disabled={documentEditSaving}
            appendTo={overlayAppendTo}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            label={t("workOrders.cancel")}
            severity="secondary"
            outlined
            disabled={documentEditSaving}
            onClick={() => setDocumentEdit(null)}
          />
          <Button
            type="button"
            label={t("workOrders.save")}
            icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
            loading={documentEditSaving}
            disabled={documentEditSaving}
            onClick={() => void saveDocumentEdit()}
          />
        </div>
      </div>
    </AppDialog>
  );
}
