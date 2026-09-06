import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Check, Filter, Pencil, Trash2, TriangleAlert, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { AppDialog } from "../components/AppDialog";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { WorkOrderSearchPanel } from "../components/workOrders/WorkOrderSearchPanel";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { coerceWorkOrderAdvancedSearch, emptyWorkOrderAdvancedSearch, type WorkOrderAdvancedSearchState } from "../lib/workOrderApiFilters";
import {
  buildWorkOrderSearchPresetPayload,
  deleteWorkOrderSearchPreset,
  fetchWorkOrderSearchPresetDefaults,
  fetchWorkOrderSearchPresetDetail,
  fetchWorkOrderSearchPresets,
  isSamePresetId,
  normalizeSearchPresetDefaults,
  patchWorkOrderSearchPreset,
  putWorkOrderSearchPresetDefaults,
  type WorkOrderSearchPresetDefaults,
  type WorkOrderSearchPresetListItem,
} from "../lib/workOrderSearchPresetApi";
import { useWorkOrderSearchReferenceData } from "../hooks/useWorkOrderSearchReferenceData";
import { lucidePrimeBtnIcon } from "../icons/lucide";
import { useAppCrud } from "../lib/usePermission";
import {
  deleteActionIcon,
  deleteActionNavItem,
  primaryActionIcon,
  primaryActionNavItem,
} from "../lib/headerActionClasses";

export function SearchPresetsPage() {
  const { t } = useTranslation();
  const crud = useAppCrud("search-presets");
  const navigate = useNavigate();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const refData = useWorkOrderSearchReferenceData({ includeAssets: false });

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WorkOrderSearchPresetListItem[]>([]);
  const [selected, setSelected] = useState<WorkOrderSearchPresetListItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
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

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(q));
  }, [rows, searchTerm]);

  useEffect(() => {
    if (selected && !filtered.some((r) => r.id === selected.id)) {
      setSelected(null);
    }
  }, [filtered, selected]);

  const confirmDelete = useCallback(
    (preset: WorkOrderSearchPresetListItem) => {
      confirmDialog({
        message: t("suchkonfig.confirmDelete", { name: preset.name }),
        header: t("suchkonfig.confirmDeleteTitle"),
        icon: <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />,
        acceptClassName: "p-button-danger",
        acceptLabel: t("workOrders.yes"),
        rejectLabel: t("workOrders.no"),
        accept: () => {
          void (async () => {
            try {
              await deleteWorkOrderSearchPreset(preset.id);
              toastRef.current?.show({ severity: "success", summary: t("suchkonfig.deleteSuccess"), life: 4000 });
              setSelected(null);
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
        setEditAdvanced(coerceWorkOrderAdvancedSearch(d.payload.advanced));
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

  const openAssignments = useCallback(
    (preset: WorkOrderSearchPresetListItem) => {
      navigate(`/zuweisungen/search-preset/${preset.id}`);
    },
    [navigate],
  );

  useEffect(() => {
    setHeaderRowCount(filtered.length);
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        {crud.canUpdate ? (
          <li>
            <button
              type="button"
              className={primaryActionNavItem}
              disabled={!selected}
              onClick={() => {
                if (selected) void openEdit(selected);
              }}
            >
              <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("suchkonfig.edit")}</span>
            </button>
          </li>
        ) : null}
        {crud.canUpdate ? (
          <li>
            <button
              type="button"
              className={primaryActionNavItem}
              disabled={!selected}
              onClick={() => {
                if (selected) openAssignments(selected);
              }}
            >
              <Users className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("suchkonfig.assignments")}</span>
            </button>
          </li>
        ) : null}
        {crud.canDelete ? (
          <li>
            <button
              type="button"
              className={deleteActionNavItem}
              disabled={!selected}
              onClick={() => {
                if (selected) confirmDelete(selected);
              }}
            >
              <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("suchkonfig.delete")}</span>
            </button>
          </li>
        ) : null}
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("suchkonfig.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
      setHeaderRowCount(null);
    };
  }, [
    confirmDelete,
    crud.canDelete,
    crud.canUpdate,
    filtered.length,
    openAssignments,
    openEdit,
    searchTerm,
    selected,
    setHeaderActions,
    setHeaderRowCount,
    t,
  ]);

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
        assetSuggestMode
        costCenterOptions={refData.searchCostCenterOptions}
        classificationOptions={refData.searchClassificationOptions}
        workgroupOptions={refData.searchWorkgroupOptions}
        employeeOptions={refData.searchEmployeeOptions}
        maintenancePlanOptions={refData.searchMaintenancePlanOptions}
        userOptions={refData.searchUserOptions}
        typeOrder={refData.typeOrder}
        typeLabel={refData.typeLabel}
        statusLabel={refData.statusLabel}
        calendarDateFormat={refData.calendarDateFormat}
        quickSearchForSave={editQuick}
        appliedSearchForSave={editAdvanced}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <DataTable
          key={dataTableEpoch}
          className="app-data-table w-full"
          value={filtered}
          loading={loading}
          dataKey="id"
          selection={selected}
          onSelectionChange={(e) => setSelected((e.value as WorkOrderSearchPresetListItem | null) ?? null)}
          onRowDoubleClick={(e) => void openEdit(e.data as WorkOrderSearchPresetListItem)}
          selectionMode="single"
          metaKeySelection={false}
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
        </DataTable>
      </div>

      <AppDialog
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
              icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
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
              icon={<Filter className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
              className="p-button-outlined w-fit"
              onClick={() => setFilterSidebarVisible(true)}
            />
          </div>
        )}
      </AppDialog>
    </div>
  );
}
