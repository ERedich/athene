import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { Check, Pencil, Plus, Trash2, TriangleAlert, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { MultiSelect } from "primereact/multiselect";
import { Toast } from "primereact/toast";

import { TableLayoutEditorDialog } from "../components/tableLayouts/TableLayoutEditorDialog";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import {
  deleteTableLayout,
  fetchTableLayoutDefaults,
  fetchTableLayoutDetail,
  fetchTableLayoutShares,
  fetchTableLayouts,
  isSameLayoutId,
  normalizeTableLayoutDefaults,
  putTableLayoutDefaults,
  putTableLayoutShares,
  type TableLayoutDefaults,
  type TableLayoutListItem,
} from "../lib/tableLayoutApi";
import {
  originalMonitoringTableLayoutPayload,
  TABLE_KEY_MONITORING_WORK_ORDERS,
} from "../lib/tableLayouts/tableLayoutPayload";
import { lucidePrimeBtnIcon } from "../icons/lucide";

type UserDirectoryRow = { id: string; loginName: string; name: string };

export function TableLayoutsPage() {
  const { t } = useTranslation();
  const { setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TableLayoutListItem[]>([]);
  const [defaults, setDefaults] = useState<TableLayoutDefaults>({ monitoringLayoutId: null });
  const defaultsRef = useRef(defaults);
  const defaultsMutationLockRef = useRef(false);

  const [directoryUsers, setDirectoryUsers] = useState<UserDirectoryRow[]>([]);
  const [shareDialogVisible, setShareDialogVisible] = useState(false);
  const [dialogLayout, setDialogLayout] = useState<TableLayoutListItem | null>(null);
  const [shareUserIds, setShareUserIds] = useState<string[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorLayoutId, setEditorLayoutId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState("");
  const [editorPayload, setEditorPayload] = useState(originalMonitoringTableLayoutPayload());
  const [editorLoading, setEditorLoading] = useState(false);

  useEffect(() => {
    defaultsRef.current = defaults;
  }, [defaults]);

  const userSelectOptions = directoryUsers.map((u) => ({
    label: `${u.loginName} — ${u.name}`,
    value: u.id,
  }));

  const fetchOwnedLayoutsAndDefaults = useCallback(async () => {
    const [list, def] = await Promise.all([
      fetchTableLayouts(TABLE_KEY_MONITORING_WORK_ORDERS),
      fetchTableLayoutDefaults(),
    ]);
    return { list: list.filter((l) => l.isOwner), def };
  }, []);

  const loadLayouts = useCallback(async () => {
    setLoading(true);
    try {
      const { list, def } = await fetchOwnedLayoutsAndDefaults();
      setRows(list);
      setDefaults(def);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("tableLayouts.loadError"), life: 6000 });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fetchOwnedLayoutsAndDefaults, t]);

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
    void loadLayouts();
    void loadUsers();
  }, [loadLayouts, loadUsers]);

  useEffect(() => {
    setHeaderRowCount(rows.length);
    return () => setHeaderRowCount(null);
  }, [rows.length, setHeaderRowCount]);

  const openShareDialog = useCallback(
    (layout: TableLayoutListItem) => {
      setDialogLayout(layout);
      setShareUserIds([]);
      setShareDialogVisible(true);
      setShareLoading(true);
      void fetchTableLayoutShares(layout.id)
        .then((shareRows) => setShareUserIds(shareRows.map((r) => r.userId)))
        .catch(() => {
          toastRef.current?.show({ severity: "error", summary: t("tableLayouts.shareLoadError"), life: 6000 });
          setShareUserIds([]);
        })
        .finally(() => setShareLoading(false));
    },
    [t],
  );

  const closeShareDialog = useCallback(() => {
    setShareDialogVisible(false);
    setDialogLayout(null);
    setShareUserIds([]);
  }, []);

  const saveShares = useCallback(async () => {
    if (!dialogLayout) return;
    setShareSaving(true);
    try {
      await putTableLayoutShares(dialogLayout.id, shareUserIds);
      toastRef.current?.show({ severity: "success", summary: t("tableLayouts.shareSuccess"), life: 4000 });
      closeShareDialog();
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("tableLayouts.shareError"), life: 6000 });
    } finally {
      setShareSaving(false);
    }
  }, [closeShareDialog, dialogLayout, shareUserIds, t]);

  const confirmDelete = useCallback(
    (layout: TableLayoutListItem) => {
      confirmDialog({
        message: t("tableLayouts.confirmDelete", { name: layout.name }),
        header: t("tableLayouts.confirmDeleteTitle"),
        icon: <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />,
        acceptClassName: "p-button-danger",
        acceptLabel: t("workOrders.yes"),
        rejectLabel: t("workOrders.no"),
        accept: () => {
          void (async () => {
            try {
              await deleteTableLayout(layout.id);
              toastRef.current?.show({ severity: "success", summary: t("tableLayouts.deleteSuccess"), life: 4000 });
              await loadLayouts();
            } catch {
              toastRef.current?.show({ severity: "error", summary: t("tableLayouts.deleteError"), life: 6000 });
            }
          })();
        },
      });
    },
    [loadLayouts, t],
  );

  const updateMonitoringDefault = useCallback(
    async (layoutId: string, checked: boolean) => {
      if (defaultsMutationLockRef.current) return;
      defaultsMutationLockRef.current = true;
      const snapshot = defaultsRef.current;
      setDefaults(
        normalizeTableLayoutDefaults({
          monitoringLayoutId: checked ? layoutId : null,
        }),
      );
      try {
        const d = await putTableLayoutDefaults({
          monitoringLayoutId: checked ? layoutId : null,
        });
        setDefaults(d);
      } catch {
        setDefaults(snapshot);
        toastRef.current?.show({ severity: "error", summary: t("tableLayouts.defaultsSaveError"), life: 6000 });
      } finally {
        defaultsMutationLockRef.current = false;
      }
    },
    [t],
  );

  const openEdit = useCallback(
    async (layout: TableLayoutListItem) => {
      setEditorLayoutId(layout.id);
      setEditorVisible(true);
      setEditorLoading(true);
      try {
        const d = await fetchTableLayoutDetail(layout.id);
        setEditorName(d.name);
        setEditorPayload(d.payload);
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("tableLayouts.editLoadError"), life: 6000 });
        setEditorVisible(false);
        setEditorLayoutId(null);
      } finally {
        setEditorLoading(false);
      }
    },
    [t],
  );

  const openCreate = useCallback(() => {
    setEditorLayoutId(null);
    setEditorName("");
    setEditorPayload(originalMonitoringTableLayoutPayload());
    setEditorLoading(false);
    setEditorVisible(true);
  }, []);

  const stopDefaultCellBubble = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  const monitoringDefaultBody = (layout: TableLayoutListItem) => (
    <div
      className="flex justify-center"
      role="presentation"
      onClick={stopDefaultCellBubble}
      onMouseDown={stopDefaultCellBubble}
    >
      <Checkbox
        inputId={`tl-def-mon-${layout.id}`}
        checked={isSameLayoutId(defaults.monitoringLayoutId, layout.id)}
        className="rounded-none"
        onChange={(e) => {
          void updateMonitoringDefault(layout.id, Boolean(e.checked));
        }}
        aria-label={t("tableLayouts.standardMonitoring")}
      />
    </div>
  );

  const actionsBody = (layout: TableLayoutListItem) => (
    <div className="flex flex-wrap gap-1">
      <Button
        type="button"
        icon={<Pencil className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        className="p-button-text p-button-sm"
        label={t("tableLayouts.edit")}
        onClick={() => void openEdit(layout)}
      />
      <Button
        type="button"
        icon={<Users className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        className="p-button-text p-button-sm"
        label={t("tableLayouts.assignments")}
        onClick={() => openShareDialog(layout)}
      />
      <Button
        type="button"
        icon={<Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        className="p-button-text p-button-sm p-button-danger"
        label={t("tableLayouts.delete")}
        onClick={() => confirmDelete(layout)}
      />
    </div>
  );

  const shareDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button type="button" label={t("workOrders.cancel")} className="p-button-text" disabled={shareSaving} onClick={closeShareDialog} />
      <Button
        type="button"
        label={t("tableLayouts.shareApply")}
        icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        loading={shareSaving}
        disabled={shareLoading || !dialogLayout}
        onClick={() => void saveShares()}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />
      <TableLayoutEditorDialog
        visible={editorVisible && !editorLoading}
        onHide={() => {
          setEditorVisible(false);
          setEditorLayoutId(null);
        }}
        tableKey={TABLE_KEY_MONITORING_WORK_ORDERS}
        layoutId={editorLayoutId}
        initialName={editorName}
        initialPayload={editorPayload}
        onSaved={async () => {
          toastRef.current?.show({ severity: "success", summary: t("tableLayouts.editor.saveSuccess"), life: 4000 });
          setEditorVisible(false);
          setEditorLayoutId(null);
          await loadLayouts();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-on-surface-variant">{t("tableLayouts.intro")}</p>
        <Button
          type="button"
          icon={<Plus className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
          label={t("tableLayouts.createNew")}
          onClick={openCreate}
        />
      </div>
      <DataTable
        className="app-data-table w-full"
        value={rows}
        loading={loading}
        dataKey="id"
        emptyMessage={t("tableLayouts.empty")}
        scrollable
        scrollHeight="flex"
      >
        <Column field="name" header={t("tableLayouts.columnName")} sortable />
        <Column
          header={t("tableLayouts.columnStandardMonitoring")}
          body={monitoringDefaultBody}
          style={{ width: "10rem", textAlign: "center" }}
        />
        <Column header={t("tableLayouts.columnActions")} body={actionsBody} style={{ width: "20rem" }} />
      </DataTable>

      <Dialog
        visible={shareDialogVisible}
        onHide={closeShareDialog}
        header={dialogLayout ? t("tableLayouts.dialogTitle", { name: dialogLayout.name }) : ""}
        footer={shareDialogFooter}
        className="w-full max-w-lg"
        appendTo={overlayAppendTo}
        blockScroll
      >
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-on-surface-variant">{t("tableLayouts.shareUsers")}</span>
          <MultiSelect
            value={shareUserIds}
            options={userSelectOptions}
            optionLabel="label"
            optionValue="value"
            onChange={(e) => setShareUserIds((e.value as string[]) ?? [])}
            display="comma"
            className="w-full"
            appendTo={overlayAppendTo}
            disabled={shareLoading}
            placeholder={t("tableLayouts.shareUsersPlaceholder")}
          />
        </div>
      </Dialog>
    </div>
  );
}
