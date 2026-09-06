import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { AppDialog } from "../components/AppDialog";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";
import { Toast } from "primereact/toast";

import { useAuth } from "../auth/AuthContext";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { AssetSelItem } from "../components/selItem/AssetSelItem";
import { lucidePrimeBtnIcon } from "../icons/lucide";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import {
  createInspectionRound,
  deleteInspectionRound,
  fetchInspectionRoundById,
  fetchInspectionRounds,
  updateInspectionRound,
  type InspectionRoundSavePayload,
} from "../lib/inspectionRoundApi";
import {
  emptyInspectionRoundForm,
  formatPosDisplay,
  inspectionRoundToFormState,
  newActivityForm,
  type InspectionRound,
  type InspectionRoundActivityForm,
  type InspectionRoundFormState,
} from "../lib/inspectionRoundTypes";
import { apiFetch } from "../lib/api";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../lib/appParameterKeys";
import { collectSubtreeAssetIds } from "../lib/assetTree";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";
import { STANDARD_TAB_HOST_CLASS, STANDARD_TAB_VIEW_CLASS, useTabInk } from "../lib/tabs";
import { useAppCrud } from "../lib/usePermission";
import { useTableContextMenu } from "../lib/useTableContextMenu";
import {
  createActionIcon,
  createActionNavItem,
  deleteActionIcon,
  deleteActionNavItem,
  primaryActionIcon,
  primaryActionNavItem,
} from "../lib/headerActionClasses";

type SiteOption = {
  id: string;
  key: string;
  name: string;
  colorHex?: string;
};

type AssetTreeRef = {
  id: string;
  parentAssetId: string | null;
};

type InspectionPointOption = {
  id: string;
  key: string;
  name: string;
  assetId: string;
};

type SelectOption = { label: string; value: string };

const fieldLabelClass = "block text-[11px] text-outline uppercase tracking-[0.1em]";

export function InspectionRoundsPage() {
  const { t } = useTranslation();
  const crud = useAppCrud("inspection-rounds");
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const tabHostRef = useRef<HTMLDivElement | null>(null);
  const requestedInspectionPointAssets = useRef(new Set<string>());

  const [rounds, setRounds] = useState<InspectionRound[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [assets, setAssets] = useState<AssetTreeRef[]>([]);
  const [inspectionPoints, setInspectionPoints] = useState<Record<string, InspectionPointOption[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRound, setSelectedRound] = useState<InspectionRound | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<InspectionRoundFormState>(emptyInspectionRoundForm());

  const updateTabInk = useTabInk(tabHostRef, [activeTabIndex, dialogVisible, dialogLoading], dialogVisible);

  const siteOptions = useMemo<SelectOption[]>(
    () => sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
    [sites],
  );

  const allowedActivityAssetIds = useMemo(() => {
    if (!form.assetId) return null;
    return collectSubtreeAssetIds(assets, form.assetId);
  }, [assets, form.assetId]);

  const scrubActivitiesForHeaderAsset = useCallback(
    (
      activities: InspectionRoundActivityForm[],
      headerAssetId: string,
    ): InspectionRoundActivityForm[] => {
      if (!headerAssetId) return activities;
      const allowed = collectSubtreeAssetIds(assets, headerAssetId);
      return activities.map((activity) => {
        if (!activity.assetId || allowed.has(activity.assetId)) return activity;
        return {
          ...activity,
          assetId: "",
          assetKey: "",
          inspectionPointId: "",
        };
      });
    },
    [assets],
  );

  const filteredRounds = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return rounds;
    return rounds.filter((round) =>
      [
        round.key,
        round.name,
        round.siteKey,
        round.siteName,
        round.assetKey,
        round.assetName,
        String(round.activityCount),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [rounds, searchTerm]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [roundRows, sitesRes, assetsRes] = await Promise.all([
        fetchInspectionRounds(),
        apiFetch("/api/sites"),
        apiFetch("/api/assets"),
      ]);
      if (!sitesRes.ok || !assetsRes.ok) throw new Error("reference_data");
      const siteRows = (await sitesRes.json()) as SiteOption[];
      const assetRows = (await assetsRes.json()) as unknown;
      setRounds(roundRows);
      setSites(Array.isArray(siteRows) ? siteRows : []);
      setAssets(
        Array.isArray(assetRows)
          ? assetRows
              .map((raw): AssetTreeRef | null => {
                if (!raw || typeof raw !== "object") return null;
                const o = raw as Record<string, unknown>;
                if (typeof o.id !== "string") return null;
                return {
                  id: o.id,
                  parentAssetId: typeof o.parentAssetId === "string" ? o.parentAssetId : null,
                };
              })
              .filter((row): row is AssetTreeRef => row != null)
          : [],
      );
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("inspectionRounds.loadError"),
        life: 5000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setHeaderRowCount(filteredRounds.length);
    return () => setHeaderRowCount(null);
  }, [filteredRounds.length, setHeaderRowCount]);

  const loadInspectionPoints = useCallback(
    async (assetId: string) => {
      if (!assetId || requestedInspectionPointAssets.current.has(assetId)) return;
      requestedInspectionPointAssets.current.add(assetId);
      try {
        const res = await apiFetch(`/api/assets/${encodeURIComponent(assetId)}/inspection-points`);
        if (!res.ok) throw new Error("inspection_points");
        const data = (await res.json()) as InspectionPointOption[];
        setInspectionPoints((current) => ({
          ...current,
          [assetId]: Array.isArray(data) ? data : [],
        }));
      } catch {
        requestedInspectionPointAssets.current.delete(assetId);
        toastRef.current?.show({
          severity: "error",
          summary: t("inspectionRounds.loadError"),
          life: 4000,
        });
      }
    },
    [t],
  );

  useEffect(() => {
    for (const activity of form.activities) {
      if (activity.assetId) void loadInspectionPoints(activity.assetId);
    }
  }, [form.activities, loadInspectionPoints]);

  useEffect(() => {
    if (!dialogVisible || !form.assetId || assets.length === 0) return;
    setForm((current) => {
      if (!current.assetId) return current;
      const nextActivities = scrubActivitiesForHeaderAsset(current.activities, current.assetId);
      const changed = nextActivities.some(
        (activity, index) => activity.assetId !== current.activities[index]?.assetId,
      );
      return changed ? { ...current, activities: nextActivities } : current;
    });
  }, [assets, dialogVisible, form.assetId, scrubActivitiesForHeaderAsset]);

  const closeDialog = useCallback(() => {
    if (saving) return;
    setDialogVisible(false);
    setEditingId(null);
  }, [saving]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setActiveTabIndex(0);
    setForm(emptyInspectionRoundForm(siteFieldLocked ? user.workingSiteId : ""));
    setDialogVisible(true);
  }, [siteFieldLocked, user.workingSiteId]);

  const openEdit = useCallback(
    async (row: InspectionRound) => {
      setEditingId(row.id);
      setActiveTabIndex(0);
      setDialogVisible(true);
      setDialogLoading(true);
      try {
        const fullRound = await fetchInspectionRoundById(row.id);
        if (!fullRound) throw new Error("not_found");
        setForm(inspectionRoundToFormState(fullRound));
      } catch {
        setDialogVisible(false);
        setEditingId(null);
        toastRef.current?.show({
          severity: "error",
          summary: t("inspectionRounds.loadError"),
          life: 5000,
        });
      } finally {
        setDialogLoading(false);
      }
    },
    [t],
  );

  const save = useCallback(async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    const parsedActivities = form.activities.map((activity) => ({
      source: activity,
      pos: Number.parseInt(activity.pos.trim(), 10),
      name: activity.name.trim(),
    }));
    const invalidActivity = parsedActivities.some(
      ({ source, pos, name: activityName }) =>
        !/^\d{1,4}$/.test(source.pos.trim()) ||
        !Number.isInteger(pos) ||
        pos < 1 ||
        pos > 9999 ||
        !activityName,
    );
    if (
      (form.assetKey.trim() && !form.assetId) ||
      form.activities.some((activity) => activity.assetKey.trim() && !activity.assetId)
    ) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("selItem.asset.invalidKey"),
        life: 4000,
      });
      return;
    }
    if (!key || !name || !siteId || invalidActivity) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("inspectionRounds.validationRequired"),
        life: 4000,
      });
      return;
    }

    const payload: InspectionRoundSavePayload = {
      key,
      name,
      siteId,
      assetId: form.assetId || null,
      activities: parsedActivities.map(({ source, pos, name: activityName }) => ({
        pos,
        name: activityName,
        assetId: source.assetId || null,
        inspectionPointId: source.inspectionPointId || null,
      })),
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateInspectionRound(editingId, payload);
      } else {
        await createInspectionRound(payload);
      }
      setDialogVisible(false);
      setEditingId(null);
      await loadData();
    } catch (error) {
      const code = (error as Error).message;
      toastRef.current?.show({
        severity: "error",
        summary:
          code === "duplicate_key"
            ? t("inspectionRounds.duplicateKey")
            : code === "activity_asset_outside_header"
              ? t("inspectionRounds.activityAssetOutsideHeader")
              : t("inspectionRounds.saveError"),
        life: 5000,
      });
    } finally {
      setSaving(false);
    }
  }, [editingId, form, loadData, t]);

  const deleteRow = useCallback(
    (row: InspectionRound) => {
      confirmDialog({
        header: t("inspectionRounds.delete"),
        message: t("inspectionRounds.deleteConfirm", { name: row.name }),
        icon: "pi pi-exclamation-triangle",
        acceptLabel: t("inspectionRounds.delete"),
        rejectLabel: t("inspectionRounds.cancel"),
        acceptClassName: "p-button-danger",
        accept: () => {
          void (async () => {
            try {
              await deleteInspectionRound(row.id);
              setSelectedRound((current) => (current?.id === row.id ? null : current));
              await loadData();
            } catch {
              toastRef.current?.show({
                severity: "error",
                summary: t("inspectionRounds.saveError"),
                life: 5000,
              });
            }
          })();
        },
      });
    },
    [loadData, t],
  );

  const tableCtx = useTableContextMenu<InspectionRound>({
    labels: {
      new: t("inspectionRounds.create"),
      edit: t("inspectionRounds.edit"),
      delete: t("inspectionRounds.delete"),
    },
    handlers: {
      onCreate: crud.canCreate ? openCreate : undefined,
      onEdit: crud.canUpdate ? openEdit : undefined,
      onDelete: crud.canDelete ? deleteRow : undefined,
    },
    canCreate: crud.canCreate,
    canEdit: crud.canUpdate,
    canDelete: crud.canDelete,
    selection: selectedRound,
    setSelection: setSelectedRound,
  });

  useEffect(() => {
    if (selectedRound && !rounds.some((round) => round.id === selectedRound.id)) {
      setSelectedRound(null);
    }
  }, [rounds, selectedRound]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        {crud.canCreate ? (
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("inspectionRounds.create")}</span>
          </button>
          </li>
        ) : null}
        {crud.canUpdate ? (
          <li>
            <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedRound}
            onClick={() => {
              if (selectedRound) void openEdit(selectedRound);
            }}
          >
            <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("inspectionRounds.edit")}</span>
          </button>
          </li>
        ) : null}
        {crud.canDelete ? (
          <li>
            <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedRound}
            onClick={() => {
              if (selectedRound) deleteRow(selectedRound);
            }}
          >
            <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("inspectionRounds.delete")}</span>
          </button>
          </li>
        ) : null}
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t("inspectionRounds.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [deleteRow, crud.canCreate, crud.canDelete, crud.canUpdate, openCreate, openEdit, searchTerm, selectedRound, setHeaderActions, t]);

  const siteColumnBody = useCallback((row: InspectionRound) => {
    const color = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    return (
      <span className="truncate" style={{ color: readableSiteColor(color) }}>
        {row.siteName}
      </span>
    );
  }, []);

  const updateActivity = useCallback((localId: string, patch: Partial<InspectionRoundActivityForm>) => {
    setForm((current) => ({
      ...current,
      activities: current.activities.map((activity) =>
        activity.localId === localId ? { ...activity, ...patch } : activity,
      ),
    }));
  }, []);

  const dialogFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("inspectionRounds.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={closeDialog}
      />
      <Button
        type="button"
        label={t("inspectionRounds.save")}
        icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        loading={saving}
        disabled={dialogLoading}
        onClick={() => void save()}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />
      {tableCtx.ContextMenuEl}

      <div className="flex min-h-0 flex-1 flex-col" {...tableCtx.wrapperProps}>
        <DataTable
          className="app-data-table w-full"
          value={filteredRounds}
          loading={loading}
          dataKey="id"
          selection={selectedRound}
          onSelectionChange={(event) => setSelectedRound(event.value as InspectionRound | null)}
          onRowDoubleClick={(event) => void openEdit(event.data as InspectionRound)}
          {...tableCtx.tableProps}
          selectionMode="single"
          metaKeySelection={false}
          stripedRows
          showGridlines
          scrollable
          resizableColumns
          reorderableColumns
          columnResizeMode="expand"
          scrollHeight="flex"
          tableStyle={{ minWidth: "56rem" }}
          stateStorage="local"
          stateKey="athene-inspection-rounds-table"
        >
          <Column field="key" header={t("inspectionRounds.key")} sortable />
          <Column field="name" header={t("inspectionRounds.name")} sortable />
          <Column field="siteName" header={t("inspectionRounds.site")} body={siteColumnBody} sortable />
          <Column
            field="assetName"
            header={t("inspectionRounds.asset")}
            body={(row: InspectionRound) =>
              row.assetId ? `${row.assetKey ?? ""} - ${row.assetName ?? ""}` : "—"
            }
            sortable
          />
          <Column
            field="activityCount"
            header={t("inspectionRounds.activities")}
            className="w-32 text-center tabular-nums"
            sortable
          />
        </DataTable>
      </div>

      <AppDialog
        header={editingId ? t("inspectionRounds.editTitle") : t("inspectionRounds.createTitle")}
        visible={dialogVisible}
        className="app-big-modal-window app-tabbed-modal-window"
        onShow={updateTabInk}
        onHide={closeDialog}
        footer={dialogFooter}
        modal
        dismissableMask={!saving}
        draggable={false}
        resizable={false}
        appendTo={overlayAppendTo}
      >
        {dialogLoading ? (
          <div className="flex min-h-52 items-center justify-center">
            <i className="pi pi-spin pi-spinner text-2xl" aria-hidden />
          </div>
        ) : (
          <div ref={tabHostRef} className={STANDARD_TAB_HOST_CLASS}>
            <TabView
              className={STANDARD_TAB_VIEW_CLASS}
              activeIndex={activeTabIndex}
              onTabChange={(event) => setActiveTabIndex(event.index)}
            >
              <TabPanel header={t("inspectionRounds.tabGeneral")}>
                <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-6" style={{ margin: 0, display: "grid" }}>
                  <div className="space-y-2 md:col-span-3">
                    <label htmlFor="inspection-round-key" className={fieldLabelClass}>
                      {t("inspectionRounds.key")}
                      <span className="app-required-marker" aria-hidden>*</span>
                    </label>
                    <InputText
                      id="inspection-round-key"
                      value={form.key}
                      onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
                      className="w-full"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <label htmlFor="inspection-round-site" className={fieldLabelClass}>
                      {t("inspectionRounds.site")}
                      <span className="app-required-marker" aria-hidden>*</span>
                    </label>
                    <Dropdown
                      inputId="inspection-round-site"
                      value={form.siteId}
                      options={siteOptions}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          siteId: String(event.value ?? ""),
                          assetId: "",
                          assetKey: "",
                          activities: current.activities.map((activity) => ({
                            ...activity,
                            assetId: "",
                            assetKey: "",
                            inspectionPointId: "",
                          })),
                        }))
                      }
                      disabled={siteFieldLocked}
                      className="w-full app-inline-icon-dropdown"
                      filter
                      appendTo={overlayAppendTo}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-6">
                    <label htmlFor="inspection-round-name" className={fieldLabelClass}>
                      {t("inspectionRounds.name")}
                      <span className="app-required-marker" aria-hidden>*</span>
                    </label>
                    <InputText
                      id="inspection-round-name"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      className="w-full"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-6">
                    <label htmlFor="inspection-round-asset" className={fieldLabelClass}>
                      {t("inspectionRounds.asset")}
                    </label>
                    <AssetSelItem
                      inputId="inspection-round-asset"
                      assetId={form.assetId}
                      assetKey={form.assetKey}
                      siteId={form.siteId || undefined}
                      disabled={!form.siteId}
                      placeholder={t("inspectionRounds.assetPlaceholder")}
                      onAssetKeyChange={(key) => setForm((current) => ({ ...current, assetKey: key }))}
                      onSelect={(asset) =>
                        setForm((current) => {
                          const nextAssetId = asset?.id ?? "";
                          return {
                            ...current,
                            assetId: nextAssetId,
                            assetKey: asset?.key ?? current.assetKey,
                            activities:
                              nextAssetId && assets.length > 0
                                ? scrubActivitiesForHeaderAsset(current.activities, nextAssetId)
                                : current.activities,
                          };
                        })
                      }
                    />
                  </div>
                </div>
              </TabPanel>

              <TabPanel header={t("inspectionRounds.tabActivities")}>
                <div className="flex flex-col gap-3 pt-1">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      label={t("inspectionRounds.addActivity")}
                      icon={<Plus className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                      outlined
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          activities: [
                            ...current.activities,
                            newActivityForm(
                              Math.min(
                                9999,
                                Math.max(
                                  0,
                                  ...current.activities.map(
                                    (activity) => Number.parseInt(activity.pos, 10) || 0,
                                  ),
                                ) + 1,
                              ),
                            ),
                          ],
                        }))
                      }
                    />
                  </div>

                  {form.activities.length === 0 ? (
                    <p className="m-0 rounded-sm border border-outline-variant/50 p-4 text-sm text-on-surface-variant">
                      {t("inspectionRounds.emptyActivitiesOk")}
                    </p>
                  ) : (
                    form.activities.map((activity) => {
                      const pointOptions = (inspectionPoints[activity.assetId] ?? []).map((point) => ({
                        label: `${point.key} - ${point.name}`,
                        value: point.id,
                      }));
                      return (
                        <div
                          key={activity.localId}
                          className="grid grid-cols-1 gap-3 rounded-sm border border-outline-variant/50 p-3 md:grid-cols-12"
                        >
                          <div className="space-y-2 md:col-span-2">
                            <label htmlFor={`activity-pos-${activity.localId}`} className={fieldLabelClass}>
                              {t("inspectionRounds.pos")}
                            </label>
                            <InputText
                              id={`activity-pos-${activity.localId}`}
                              value={activity.pos}
                              inputMode="numeric"
                              maxLength={4}
                              onChange={(event) =>
                                updateActivity(activity.localId, {
                                  pos: event.target.value.replace(/\D/g, "").slice(0, 4),
                                })
                              }
                              onBlur={() =>
                                updateActivity(activity.localId, {
                                  pos: formatPosDisplay(activity.pos),
                                })
                              }
                              className="w-full tabular-nums"
                            />
                          </div>
                          <div className="space-y-2 md:col-span-4">
                            <label htmlFor={`activity-name-${activity.localId}`} className={fieldLabelClass}>
                              {t("inspectionRounds.designation")}
                              <span className="app-required-marker" aria-hidden>*</span>
                            </label>
                            <InputText
                              id={`activity-name-${activity.localId}`}
                              value={activity.name}
                              onChange={(event) =>
                                updateActivity(activity.localId, { name: event.target.value })
                              }
                              className="w-full"
                            />
                          </div>
                          <div className="space-y-2 md:col-span-3">
                            <label htmlFor={`activity-asset-${activity.localId}`} className={fieldLabelClass}>
                              {t("inspectionRounds.asset")}
                            </label>
                            <AssetSelItem
                              inputId={`activity-asset-${activity.localId}`}
                              assetId={activity.assetId}
                              assetKey={activity.assetKey}
                              siteId={form.siteId || undefined}
                              allowedAssetIds={allowedActivityAssetIds}
                              disabled={!form.siteId}
                              placeholder={t("inspectionRounds.assetPlaceholder")}
                              onAssetKeyChange={(key) =>
                                updateActivity(activity.localId, { assetKey: key })
                              }
                              onSelect={(asset) => {
                                updateActivity(activity.localId, {
                                  assetId: asset?.id ?? "",
                                  assetKey: asset?.key ?? activity.assetKey,
                                  inspectionPointId: "",
                                });
                                if (asset?.id) void loadInspectionPoints(asset.id);
                              }}
                            />
                          </div>
                          <div className="space-y-2 md:col-span-3">
                            <label htmlFor={`activity-point-${activity.localId}`} className={fieldLabelClass}>
                              {t("inspectionRounds.inspectionPoint")}
                            </label>
                            <Dropdown
                              inputId={`activity-point-${activity.localId}`}
                              value={activity.inspectionPointId || null}
                              options={pointOptions}
                              onChange={(event) =>
                                updateActivity(activity.localId, {
                                  inspectionPointId: String(event.value ?? ""),
                                })
                              }
                              disabled={!activity.assetId}
                              className="w-full app-inline-icon-dropdown"
                              filter
                              showClear
                              appendTo={overlayAppendTo}
                            />
                          </div>
                          <div className="flex justify-end md:col-span-12">
                            <Button
                              type="button"
                              label={t("inspectionRounds.removeActivity")}
                              icon={<Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                              severity="danger"
                              text
                              onClick={() =>
                                setForm((current) => ({
                                  ...current,
                                  activities: current.activities.filter(
                                    (entry) => entry.localId !== activity.localId,
                                  ),
                                }))
                              }
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </TabPanel>
            </TabView>
          </div>
        )}
      </AppDialog>
    </div>
  );
}
