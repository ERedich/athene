import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
import { Toast } from "primereact/toast";

import { WorkOrderSearchPanel } from "../components/workOrders/WorkOrderSearchPanel";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { emptyWorkOrderAdvancedSearch, type WorkOrderAdvancedSearchState } from "../lib/workOrderApiFilters";
import {
  buildWorkOrderSearchPresetPayload,
  deleteWorkOrderSearchPreset,
  fetchWorkOrderSearchPresetDefaults,
  fetchWorkOrderSearchPresetDetail,
  fetchWorkOrderSearchPresetShares,
  fetchWorkOrderSearchPresets,
  isSamePresetId,
  normalizeSearchPresetDefaults,
  patchWorkOrderSearchPreset,
  putWorkOrderSearchPresetDefaults,
  putWorkOrderSearchPresetShares,
  type WorkOrderSearchPresetDefaults,
  type WorkOrderSearchPresetListItem,
} from "../lib/workOrderSearchPresetApi";
import { useWorkOrderSearchReferenceData } from "../hooks/useWorkOrderSearchReferenceData";

type UserDirectoryRow = { id: string; loginName: string; name: string };

export function SearchPresetsPage() {
  const { t } = useTranslation();
  const { setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const refData = useWorkOrderSearchReferenceData();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WorkOrderSearchPresetListItem[]>([]);
  const [defaults, setDefaults] = useState<WorkOrderSearchPresetDefaults>({
    workOrdersPresetId: null,
    monitoringPresetId: null,
    mobilePresetId: null,
  });
  const defaultsRef = useRef(defaults);
  const defaultsMutationLockRef = useRef(false);

  useEffect(() => {
    defaultsRef.current = defaults;
  }, [defaults]);

  const [directoryUsers, setDirectoryUsers] = useState<UserDirectoryRow[]>([]);

  const [shareDialogVisible, setShareDialogVisible] = useState(false);
  const [dialogPreset, setDialogPreset] = useState<WorkOrderSearchPresetListItem | null>(null);
  const [shareUserIds, setShareUserIds] = useState<string[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);

  const [editVisible, setEditVisible] = useState(false);
  const [editPreset, setEditPreset] = useState<WorkOrderSearchPresetListItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuick, setEditQuick] = useState("");
  const [editAdvanced, setEditAdvanced] = useState<WorkOrderAdvancedSearchState>(() => emptyWorkOrderAdvancedSearch());
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [filterSidebarVisible, setFilterSidebarVisible] = useState(false);
  /** Bumps after save so DataTable remounts; avoids stale row body after controlled updates. */
  const [dataTableEpoch, setDataTableEpoch] = useState(0);

  const userSelectOptions = useMemo(
    () => directoryUsers.map((u) => ({ label: `${u.loginName} — ${u.name}`, value: u.id })),
    [directoryUsers],
  );

  const fetchOwnedPresetsAndDefaults = useCallback(async () => {
    const [list, def] = await Promise.all([fetchWorkOrderSearchPresets(), fetchWorkOrderSearchPresetDefaults()]);
    return { list: list.filter((p) => p.isOwner), def };
  }, []);

  const loadPresets = useCallback(async () => {
    setLoading(true);
    try {
      const { list, def } = await fetchOwnedPresetsAndDefaults();
      setRows(list);
      setDefaults(def);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("suchkonfig.loadError"), life: 6000 });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fetchOwnedPresetsAndDefaults, t]);

  const reloadPresetsAfterSave = useCallback(async () => {
    try {
      const { list, def } = await fetchOwnedPresetsAndDefaults();
      setRows(list);
      setDefaults(def);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("suchkonfig.loadError"), life: 6000 });
    }
  }, [fetchOwnedPresetsAndDefaults, t]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiFetch("/api/users");
      if (!res.ok) throw new Error("users");
      const data = (await res.json()) as UserDirectoryRow[];
      setDirectoryUsers(Array.isArray(data) ? data.map((u) => ({ id: u.id, loginName: u.loginName, name: u.name })) : []);
    } catch {
      setDirectoryUsers([]);
    }
  }, []);

  useEffect(() => {
    void loadPresets();
    void loadUsers();
  }, [loadPresets, loadUsers]);

  useEffect(() => {
    setHeaderRowCount(rows.length);
    return () => setHeaderRowCount(null);
  }, [rows.length, setHeaderRowCount]);

  const openShareDialog = useCallback(
    (preset: WorkOrderSearchPresetListItem) => {
      setDialogPreset(preset);
      setShareUserIds([]);
      setShareDialogVisible(true);
      setShareLoading(true);
      void fetchWorkOrderSearchPresetShares(preset.id)
        .then((shareRows) => setShareUserIds(shareRows.map((r) => r.userId)))
        .catch(() => {
          toastRef.current?.show({ severity: "error", summary: t("suchkonfig.shareLoadError"), life: 6000 });
          setShareUserIds([]);
        })
        .finally(() => setShareLoading(false));
    },
    [t],
  );

  const closeShareDialog = useCallback(() => {
    setShareDialogVisible(false);
    setDialogPreset(null);
    setShareUserIds([]);
  }, []);

  const saveShares = useCallback(async () => {
    if (!dialogPreset) return;
    setShareSaving(true);
    try {
      await putWorkOrderSearchPresetShares(dialogPreset.id, shareUserIds);
      toastRef.current?.show({ severity: "success", summary: t("suchkonfig.shareSuccess"), life: 4000 });
      closeShareDialog();
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("suchkonfig.shareError"), life: 6000 });
    } finally {
      setShareSaving(false);
    }
  }, [closeShareDialog, dialogPreset, shareUserIds, t]);

  const confirmDelete = useCallback(
    (preset: WorkOrderSearchPresetListItem) => {
      confirmDialog({
        message: t("suchkonfig.confirmDelete", { name: preset.name }),
        header: t("suchkonfig.confirmDeleteTitle"),
        icon: "pi pi-exclamation-triangle",
        acceptClassName: "p-button-danger",
        acceptLabel: t("workOrders.yes"),
        rejectLabel: t("workOrders.no"),
        accept: () => {
          void (async () => {
            try {
              await deleteWorkOrderSearchPreset(preset.id);
              toastRef.current?.show({ severity: "success", summary: t("suchkonfig.deleteSuccess"), life: 4000 });
              await loadPresets();
            } catch {
              toastRef.current?.show({ severity: "error", summary: t("suchkonfig.deleteError"), life: 6000 });
            }
          })();
        },
      });
    },
    [loadPresets, t],
  );

  const updateWoDefault = useCallback(async (presetId: string, checked: boolean) => {
    if (defaultsMutationLockRef.current) return;
    defaultsMutationLockRef.current = true;
    const snapshot = defaultsRef.current;
    setDefaults((cur) =>
      normalizeSearchPresetDefaults({
        workOrdersPresetId: checked ? presetId : null,
        monitoringPresetId: cur.monitoringPresetId,
        mobilePresetId: cur.mobilePresetId,
      }),
    );
    try {
      const d = await putWorkOrderSearchPresetDefaults({
        workOrdersPresetId: checked ? presetId : null,
      });
      setDefaults(d);
      setDataTableEpoch((e) => e + 1);
    } catch {
      setDefaults(snapshot);
      toastRef.current?.show({ severity: "error", summary: t("suchkonfig.defaultsSaveError"), life: 6000 });
    } finally {
      defaultsMutationLockRef.current = false;
    }
  }, [t]);

  const updateMonitoringDefault = useCallback(async (presetId: string, checked: boolean) => {
    if (defaultsMutationLockRef.current) return;
    defaultsMutationLockRef.current = true;
    const snapshot = defaultsRef.current;
    setDefaults((cur) =>
      normalizeSearchPresetDefaults({
        workOrdersPresetId: cur.workOrdersPresetId,
        monitoringPresetId: checked ? presetId : null,
        mobilePresetId: cur.mobilePresetId,
      }),
    );
    try {
      const d = await putWorkOrderSearchPresetDefaults({
        monitoringPresetId: checked ? presetId : null,
      });
      setDefaults(d);
      setDataTableEpoch((e) => e + 1);
    } catch {
      setDefaults(snapshot);
      toastRef.current?.show({ severity: "error", summary: t("suchkonfig.defaultsSaveError"), life: 6000 });
    } finally {
      defaultsMutationLockRef.current = false;
    }
  }, [t]);

  const updateMobileDefault = useCallback(async (presetId: string, checked: boolean) => {
    if (defaultsMutationLockRef.current) return;
    defaultsMutationLockRef.current = true;
    const snapshot = defaultsRef.current;
    setDefaults((cur) =>
      normalizeSearchPresetDefaults({
        workOrdersPresetId: cur.workOrdersPresetId,
        monitoringPresetId: cur.monitoringPresetId,
        mobilePresetId: checked ? presetId : null,
      }),
    );
    try {
      const d = await putWorkOrderSearchPresetDefaults({
        mobilePresetId: checked ? presetId : null,
      });
      setDefaults(d);
      setDataTableEpoch((e) => e + 1);
    } catch {
      setDefaults(snapshot);
      toastRef.current?.show({ severity: "error", summary: t("suchkonfig.defaultsSaveError"), life: 6000 });
    } finally {
      defaultsMutationLockRef.current = false;
    }
  }, [t]);

  const openEdit = useCallback(
    async (preset: WorkOrderSearchPresetListItem) => {
      setEditPreset(preset);
      setEditVisible(true);
      setEditLoading(true);
      setFilterSidebarVisible(false);
      try {
        const [d, def] = await Promise.all([fetchWorkOrderSearchPresetDetail(preset.id), fetchWorkOrderSearchPresetDefaults()]);
        setEditName(d.name);
        setEditQuick(d.payload.quickSearch ?? "");
        setEditAdvanced({ ...d.payload.advanced });
        setDefaults(def);
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("suchkonfig.editLoadError"), life: 6000 });
        setEditVisible(false);
        setEditPreset(null);
      } finally {
        setEditLoading(false);
      }
    },
    [t],
  );

  const closeEdit = useCallback(() => {
    setEditVisible(false);
    setEditPreset(null);
    setEditName("");
    setEditQuick("");
    setEditAdvanced(emptyWorkOrderAdvancedSearch());
    setFilterSidebarVisible(false);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editPreset) return;
    const name = editName.trim();
    if (!name) {
      toastRef.current?.show({ severity: "warn", summary: t("suchkonfig.editNameRequired"), life: 4000 });
      return;
    }
    setEditSaving(true);
    try {
      const saved = await patchWorkOrderSearchPreset(editPreset.id, {
        name,
        payload: buildWorkOrderSearchPresetPayload(editQuick.trim(), editAdvanced),
      });
      setRows((prev) =>
        prev.map((r) =>
          isSamePresetId(r.id, saved.id) ? { id: saved.id, name: saved.name, isOwner: saved.isOwner } : r,
        ),
      );
      toastRef.current?.show({ severity: "success", summary: t("suchkonfig.editSaveSuccess"), life: 4000 });
      closeEdit();
      await reloadPresetsAfterSave();
      setDataTableEpoch((e) => e + 1);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("suchkonfig.editSaveError"), life: 6000 });
    } finally {
      setEditSaving(false);
    }
  }, [closeEdit, editAdvanced, editName, editPreset, editQuick, reloadPresetsAfterSave, t]);

  const shareDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button type="button" label={t("workOrders.cancel")} className="p-button-text" disabled={shareSaving} onClick={closeShareDialog} />
      <Button
        type="button"
        label={t("suchkonfig.shareApply")}
        icon="pi pi-check"
        loading={shareSaving}
        disabled={shareLoading || !dialogPreset}
        onClick={() => void saveShares()}
      />
    </div>
  );

  const stopDefaultCellBubble = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  const woDefaultBody = (preset: WorkOrderSearchPresetListItem) => (
    <div
      className="flex justify-center"
      role="presentation"
      onClick={stopDefaultCellBubble}
      onMouseDown={stopDefaultCellBubble}
    >
      <Checkbox
        inputId={`sk-def-wo-${preset.id}`}
        checked={isSamePresetId(defaults.workOrdersPresetId, preset.id)}
        className="rounded-none"
        onChange={(e) => {
          void updateWoDefault(preset.id, Boolean(e.checked));
        }}
        aria-label={t("suchkonfig.standardWorkOrders")}
      />
    </div>
  );

  const monitoringDefaultBody = (preset: WorkOrderSearchPresetListItem) => (
    <div
      className="flex justify-center"
      role="presentation"
      onClick={stopDefaultCellBubble}
      onMouseDown={stopDefaultCellBubble}
    >
      <Checkbox
        inputId={`sk-def-mon-${preset.id}`}
        checked={isSamePresetId(defaults.monitoringPresetId, preset.id)}
        className="rounded-none"
        onChange={(e) => {
          void updateMonitoringDefault(preset.id, Boolean(e.checked));
        }}
        aria-label={t("suchkonfig.standardMonitoring")}
      />
    </div>
  );

  const mobileDefaultBody = (preset: WorkOrderSearchPresetListItem) => (
    <div
      className="flex justify-center"
      role="presentation"
      onClick={stopDefaultCellBubble}
      onMouseDown={stopDefaultCellBubble}
    >
      <Checkbox
        inputId={`sk-def-mobile-${preset.id}`}
        checked={isSamePresetId(defaults.mobilePresetId, preset.id)}
        className="rounded-none"
        onChange={(e) => {
          void updateMobileDefault(preset.id, Boolean(e.checked));
        }}
        aria-label={t("suchkonfig.standardMobile")}
      />
    </div>
  );

  const actionsBody = (preset: WorkOrderSearchPresetListItem) => (
    <div className="flex flex-wrap gap-1">
      <Button
        type="button"
        icon="pi pi-pencil"
        className="p-button-text p-button-sm"
        label={t("suchkonfig.edit")}
        onClick={() => void openEdit(preset)}
      />
      <Button
        type="button"
        icon="pi pi-users"
        className="p-button-text p-button-sm"
        label={t("suchkonfig.assignments")}
        onClick={() => openShareDialog(preset)}
      />
      <Button
        type="button"
        icon="pi pi-trash"
        className="p-button-text p-button-sm p-button-danger"
        label={t("suchkonfig.delete")}
        onClick={() => confirmDelete(preset)}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />
      <WorkOrderSearchPanel
        visible={filterSidebarVisible}
        onHide={() => setFilterSidebarVisible(false)}
        value={editAdvanced}
        onChange={setEditAdvanced}
        onApply={() => setFilterSidebarVisible(false)}
        onReset={() => setEditAdvanced(emptyWorkOrderAdvancedSearch())}
        siteOptions={refData.searchSiteOptions}
        assetOptions={refData.searchAssetOptions}
        costCenterOptions={refData.searchCostCenterOptions}
        classificationOptions={refData.searchClassificationOptions}
        workgroupOptions={refData.searchWorkgroupOptions}
        employeeOptions={refData.searchEmployeeOptions}
        userOptions={refData.searchUserOptions}
        typeOrder={refData.typeOrder}
        typeLabel={refData.typeLabel}
        statusLabel={refData.statusLabel}
        calendarDateFormat={refData.calendarDateFormat}
        quickSearchForSave={editQuick}
        appliedSearchForSave={editAdvanced}
      />
      <p className="m-0 text-sm text-on-surface-variant">{t("suchkonfig.intro")}</p>
      <DataTable
        key={dataTableEpoch}
        className="app-data-table w-full"
        value={rows}
        loading={loading}
        dataKey="id"
        emptyMessage={t("suchkonfig.empty")}
        scrollable
        scrollHeight="flex"
      >
        <Column field="name" header={t("suchkonfig.columnName")} sortable />
        <Column
          header={t("suchkonfig.columnStandardWo")}
          body={woDefaultBody}
          style={{ width: "8rem" }}
          headerClassName="whitespace-normal text-center"
          className="text-center"
        />
        <Column
          header={t("suchkonfig.columnStandardMonitoring")}
          body={monitoringDefaultBody}
          style={{ width: "8rem" }}
          headerClassName="whitespace-normal text-center"
          className="text-center"
        />
        <Column
          header={t("suchkonfig.columnStandardMobile")}
          body={mobileDefaultBody}
          style={{ width: "8rem" }}
          headerClassName="whitespace-normal text-center"
          className="text-center"
        />
        <Column header={t("suchkonfig.columnActions")} body={actionsBody} style={{ width: "20rem" }} />
      </DataTable>

      <Dialog
        visible={shareDialogVisible}
        onHide={closeShareDialog}
        header={dialogPreset ? t("suchkonfig.dialogTitle", { name: dialogPreset.name }) : ""}
        style={{ width: "min(32rem, 95vw)" }}
        footer={shareDialogFooter}
      >
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-on-surface-variant">{t("suchkonfig.shareUsers")}</span>
          <MultiSelect
            value={shareUserIds}
            options={userSelectOptions}
            onChange={(e) => setShareUserIds((e.value as string[]) ?? [])}
            optionLabel="label"
            optionValue="value"
            display="chip"
            className="w-full"
            filter
            disabled={shareLoading}
            appendTo={overlayAppendTo}
            placeholder={t("workOrders.searchPanel.selectPlaceholder")}
          />
        </div>
      </Dialog>

      <Dialog
        visible={editVisible}
        onHide={() => !editSaving && closeEdit()}
        header={editPreset ? t("suchkonfig.editTitle", { name: editPreset.name }) : ""}
        style={{ width: "min(36rem, 95vw)" }}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" label={t("workOrders.cancel")} className="p-button-text" disabled={editSaving} onClick={closeEdit} />
            <Button
              type="button"
              label={t("suchkonfig.editSave")}
              icon="pi pi-check"
              loading={editSaving}
              disabled={editLoading || refData.loading}
              onClick={() => void saveEdit()}
            />
          </div>
        }
      >
        {editLoading ? (
          <p className="m-0 text-sm text-on-surface-variant">{t("suchkonfig.editLoading")}</p>
        ) : (
          <div className="flex flex-col gap-4 pt-1">
            <div className="space-y-2">
              <label className="text-xs font-medium text-on-surface-variant" htmlFor="sk-preset-name">
                {t("suchkonfig.editNameLabel")}
              </label>
              <InputText
                id="sk-preset-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full"
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-on-surface-variant" htmlFor="sk-preset-quick">
                {t("suchkonfig.editQuickLabel")}
              </label>
              <InputText id="sk-preset-quick" value={editQuick} onChange={(e) => setEditQuick(e.target.value)} className="w-full" />
            </div>
            <Button
              type="button"
              label={t("suchkonfig.editOpenFilters")}
              icon="pi pi-filter"
              className="p-button-outlined w-fit"
              onClick={() => setFilterSidebarVisible(true)}
            />
          </div>
        )}
      </Dialog>
    </div>
  );
}
