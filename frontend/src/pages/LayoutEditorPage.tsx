import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Eye,
  LayoutTemplate,
  Pencil,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { AppDialog } from "../components/AppDialog";
import {
  LayoutEditorPanel,
  type LayoutEditorPanelHandle,
} from "../components/layoutEditor/LayoutEditorPanel";
import { LayoutTableEditorPanel } from "../components/layoutEditor/LayoutTableEditorPanel";
import { LayoutPreviewDialog } from "../components/layoutEditor/LayoutPreviewDialog";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";
import {
  copyAppLayout,
  deleteAppLayout,
  fetchAppLayouts,
  updateAppLayout,
  type AppLayout,
  type AppLayoutWritePayload,
} from "../lib/layoutEditor/api";
import type {
  ContextMenuLayoutPayload,
  ModalLayoutPayload,
  TableLayoutPayload,
  TabsLayoutPayload,
} from "../lib/layoutEditor/types";
import { defaultTabsPayload } from "../lib/layoutEditor/types";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { useTableContextMenu } from "../lib/useTableContextMenu";

type SiteOption = {
  id: string;
  key: string;
  name: string;
  colorHex: string;
};

type SiteDropdownOption = { label: string; value: string };

type PageMode = "list" | "edit" | "table";

type DraftState = {
  key: string;
  name: string;
  siteId: string;
  appKey: string;
  modal: ModalLayoutPayload;
  table: TableLayoutPayload;
  contextMenu: ContextMenuLayoutPayload;
  tabs: TabsLayoutPayload;
  isSystem: boolean;
};

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const deleteActionIcon = "text-red-500";

export function LayoutEditorPage() {
  const { t } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const canEditSystem = user.loginName === "admin";
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const editorRef = useRef<LayoutEditorPanelHandle>(null);

  const [mode, setMode] = useState<PageMode>("list");
  const [rows, setRows] = useState<AppLayout[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AppLayout | null>(null);
  const [editing, setEditing] = useState<AppLayout | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [copyVisible, setCopyVisible] = useState(false);
  const [copySource, setCopySource] = useState<AppLayout | null>(null);
  const [copyKey, setCopyKey] = useState("");
  const [copyName, setCopyName] = useState("");
  const [copySiteId, setCopySiteId] = useState("");
  const [copying, setCopying] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.key, row.name, row.appKey, row.siteKey, row.siteName, row.createdBy]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, searchTerm]);

  useEffect(() => {
    if (mode === "list") {
      setHeaderRowCount(filtered.length);
    } else {
      setHeaderRowCount(null);
    }
    return () => setHeaderRowCount(null);
  }, [filtered.length, mode, setHeaderRowCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [list, sitesRes] = await Promise.all([fetchAppLayouts(), apiFetch("/api/sites")]);
      if (!sitesRes.ok) throw new Error("sites");
      const sitesData = (await sitesRes.json()) as SiteOption[];
      setRows(list);
      setSites(sitesData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("layoutEditor.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openEdit = useCallback((row: AppLayout) => {
    setEditing(row);
    setDraft(null);
    setMode("edit");
  }, []);

  const closeEditor = useCallback(() => {
    setMode("list");
    setEditing(null);
    setDraft(null);
  }, []);

  const openCopy = useCallback(
    (row: AppLayout) => {
      setCopySource(row);
      setCopyKey(`${row.key}-COPY`);
      setCopyName(`${row.name} (${t("layoutEditor.copySuffix")})`);
      setCopySiteId(siteFieldLocked ? user.workingSiteId : row.siteId);
      setCopyVisible(true);
    },
    [siteFieldLocked, t, user.workingSiteId],
  );

  const canMutate = useCallback(
    (row: AppLayout | null) => {
      if (!row) return false;
      if (row.isSystem && !canEditSystem) return false;
      return true;
    },
    [canEditSystem],
  );

  const remove = useCallback(
    (row: AppLayout) => {
      if (!canMutate(row)) {
        toastRef.current?.show({
          severity: "warn",
          summary: t("layoutEditor.systemReadOnly"),
          life: 4000,
        });
        return;
      }
      confirmDialog({
        header: t("layoutEditor.confirmDeleteTitle"),
        message: t("layoutEditor.confirmDelete", { name: row.name }),
        icon: <TriangleAlert className="h-5 w-5 text-amber-500" />,
        acceptLabel: t("layoutEditor.delete"),
        rejectLabel: t("layoutEditor.cancel"),
        acceptClassName: "p-button-danger",
        accept: () => {
          void (async () => {
            try {
              await deleteAppLayout(row.id);
              setSelected((prev) => (prev?.id === row.id ? null : prev));
              toastRef.current?.show({
                severity: "success",
                summary: t("layoutEditor.deleteSuccess"),
                life: 3000,
              });
              await loadData();
            } catch (err) {
              const msg =
                err instanceof Error && err.message === "system_layout_forbidden"
                  ? t("layoutEditor.systemReadOnly")
                  : t("layoutEditor.deleteError");
              toastRef.current?.show({ severity: "error", summary: msg, life: 6000 });
            }
          })();
        },
      });
    },
    [canMutate, loadData, t],
  );

  const save = async (payload: AppLayoutWritePayload) => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await updateAppLayout(editing.id, payload);
      setEditing(updated);
      setMode("list");
      setEditing(null);
      setDraft(null);
      toastRef.current?.show({
        severity: "success",
        summary: t("layoutEditor.saveSuccess"),
        life: 3000,
      });
      await loadData();
    } catch (err) {
      const msg =
        err instanceof Error && err.message === "system_layout_forbidden"
          ? t("layoutEditor.systemReadOnly")
          : err instanceof Error && err.message === "duplicate_key"
            ? t("layoutEditor.duplicateKey")
            : t("layoutEditor.saveError");
      toastRef.current?.show({ severity: "error", summary: msg, life: 6000 });
    } finally {
      setSaving(false);
    }
  };

  const saveFromTableMode = useCallback(async () => {
    if (!editing || !draft) return;
    if (draft.isSystem && !canEditSystem) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("layoutEditor.systemReadOnly"),
        life: 4000,
      });
      return;
    }
    setSaving(true);
    try {
      const updated = await updateAppLayout(editing.id, {
        key: draft.key.trim(),
        name: draft.name.trim(),
        siteId: draft.siteId,
        appKey: draft.appKey,
        modal: draft.modal,
        table: draft.table,
        contextMenu: draft.contextMenu,
        tabs: draft.tabs ?? defaultTabsPayload(),
      });
      setEditing(updated);
      setDraft({
        key: updated.key,
        name: updated.name,
        siteId: updated.siteId,
        appKey: updated.appKey,
        modal: updated.modal,
        table: updated.table,
        contextMenu: updated.contextMenu,
        tabs: updated.tabs ?? defaultTabsPayload(),
        isSystem: updated.isSystem,
      });
      toastRef.current?.show({
        severity: "success",
        summary: t("layoutEditor.saveSuccess"),
        life: 3000,
      });
      await loadData();
    } catch (err) {
      const msg =
        err instanceof Error && err.message === "system_layout_forbidden"
          ? t("layoutEditor.systemReadOnly")
          : t("layoutEditor.saveError");
      toastRef.current?.show({ severity: "error", summary: msg, life: 6000 });
    } finally {
      setSaving(false);
    }
  }, [canEditSystem, draft, editing, loadData, t]);

  const submitCopy = async () => {
    if (!copySource) return;
    const key = copyKey.trim();
    const name = copyName.trim();
    if (!key || !name || !copySiteId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("layoutEditor.validationRequired"),
        life: 4000,
      });
      return;
    }
    setCopying(true);
    try {
      const created = await copyAppLayout(copySource.id, {
        key,
        name,
        siteId: copySiteId,
      });
      setCopyVisible(false);
      setCopySource(null);
      toastRef.current?.show({
        severity: "success",
        summary: t("layoutEditor.copySuccess"),
        life: 3000,
      });
      await loadData();
      openEdit(created);
    } catch (err) {
      const msg =
        err instanceof Error && err.message === "duplicate_key"
          ? t("layoutEditor.duplicateKey")
          : t("layoutEditor.copyError");
      toastRef.current?.show({ severity: "error", summary: msg, life: 6000 });
    } finally {
      setCopying(false);
    }
  };

  const onValidationError = useCallback(
    (messageKey: string) => {
      toastRef.current?.show({
        severity: "warn",
        summary: t(messageKey),
        life: 4000,
      });
    },
    [t],
  );

  const tableCtx = useTableContextMenu<AppLayout>({
    labels: {
      new: t("layoutEditor.copy"),
      edit: t("layoutEditor.edit"),
      delete: t("layoutEditor.delete"),
    },
    handlers: {
      onCreate: () => {
        if (selected) openCopy(selected);
      },
      onEdit: openEdit,
      onDelete: remove,
    },
    selection: selected,
    setSelection: setSelected,
  });

  useEffect(() => {
    if (selected && !rows.some((r) => r.id === selected.id)) {
      setSelected(null);
    }
  }, [rows, selected]);

  useEffect(() => {
    if (mode === "table") {
      setHeaderActions(
        <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
          <li>
            <button
              type="button"
              className={primaryActionNavItem}
              onClick={() => {
                if (draft && editing) {
                  setEditing({
                    ...editing,
                    key: draft.key,
                    name: draft.name,
                    siteId: draft.siteId,
                    appKey: draft.appKey,
                    modal: draft.modal,
                    table: draft.table,
                    contextMenu: draft.contextMenu,
                    tabs: draft.tabs ?? defaultTabsPayload(),
                  });
                }
                setMode("edit");
              }}
              disabled={saving}
            >
              <ArrowLeft className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("layoutEditor.backToLayout")}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={primaryActionNavItem}
              onClick={() => setPreviewVisible(true)}
              disabled={saving || !draft}
            >
              <Eye className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("layoutEditor.preview")}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={createActionNavItem}
              onClick={() => void saveFromTableMode()}
              disabled={saving || (draft?.isSystem && !canEditSystem)}
            >
              <Save className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{saving ? t("layoutEditor.saving") : t("layoutEditor.save")}</span>
            </button>
          </li>
        </ul>,
      );
    } else if (mode === "edit") {
      setHeaderActions(
        <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
          <li>
            <button
              type="button"
              className={primaryActionNavItem}
              onClick={closeEditor}
              disabled={saving}
            >
              <ArrowLeft className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("layoutEditor.backToList")}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={primaryActionNavItem}
              onClick={() => editorRef.current?.openPreview()}
              disabled={saving}
            >
              <Eye className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("layoutEditor.preview")}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={createActionNavItem}
              onClick={() => editorRef.current?.save()}
              disabled={saving || (editing?.isSystem && !canEditSystem)}
            >
              <Save className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{saving ? t("layoutEditor.saving") : t("layoutEditor.save")}</span>
            </button>
          </li>
        </ul>,
      );
    } else {
      setHeaderActions(
        <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
          <li>
            <button
              type="button"
              className={createActionNavItem}
              disabled={!selected}
              onClick={() => {
                if (selected) openCopy(selected);
              }}
            >
              <Copy className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("layoutEditor.copy")}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={primaryActionNavItem}
              disabled={!selected}
              onClick={() => {
                if (selected) openEdit(selected);
              }}
            >
              <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("layoutEditor.edit")}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={deleteActionNavItem}
              disabled={!selected || !canMutate(selected)}
              onClick={() => {
                if (selected) remove(selected);
              }}
            >
              <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("layoutEditor.delete")}</span>
            </button>
          </li>
          <li className="ml-auto">
            <IconField iconPosition="left">
              <LucideInputSearchIcon />
              <InputText
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("layoutEditor.searchPlaceholder")}
                className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
              />
            </IconField>
          </li>
        </ul>,
      );
    }
    return () => setHeaderActions(null);
  }, [
    canEditSystem,
    canMutate,
    closeEditor,
    draft,
    editing,
    mode,
    openCopy,
    openEdit,
    remove,
    saveFromTableMode,
    saving,
    searchTerm,
    selected,
    setHeaderActions,
    t,
  ]);

  const siteColumnBody = useCallback((row: AppLayout) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {row.siteName}
      </span>
    );
  }, []);

  const siteDropdownOptions = useMemo<SiteDropdownOption[]>(
    () => sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
    [sites],
  );

  const renderSiteDropdownOption = useCallback(
    (option: SiteDropdownOption) => {
      const site = sites.find((s) => s.id === option.value);
      const hex = site?.colorHex || DEFAULT_SITE_COLOR_HEX;
      return (
        <span className="truncate" style={{ color: readableSiteColor(hex) }} title={option.label}>
          {option.label}
        </span>
      );
    },
    [sites],
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />

      {mode === "table" && draft ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
          <LayoutTableEditorPanel
            appKey={draft.appKey}
            value={draft.table}
            onChange={(table) => setDraft((prev) => (prev ? { ...prev, table } : prev))}
            readOnly={draft.isSystem && !canEditSystem}
          />
        </div>
      ) : mode === "edit" ? (
        <LayoutEditorPanel
          ref={editorRef}
          editing={editing}
          sites={sites}
          siteFieldLocked={siteFieldLocked}
          workingSiteId={user.workingSiteId}
          saving={saving}
          canEditSystem={canEditSystem}
          onSave={(payload) => void save(payload)}
          onValidationError={onValidationError}
          onOpenTableEditor={(next) => {
            if (!editing) return;
            setDraft(next);
            setMode("table");
          }}
        />
      ) : (
        <>
          {tableCtx.ContextMenuEl}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col" {...tableCtx.wrapperProps}>
            <DataTable
              value={filtered}
              loading={loading}
              selectionMode="single"
              selection={selected}
              onSelectionChange={(e) => setSelected((e.value as AppLayout) ?? null)}
              dataKey="id"
              emptyMessage={t("layoutEditor.empty")}
              onRowDoubleClick={(e) => openEdit(e.data as AppLayout)}
              className="app-data-table w-full min-h-0 flex-1"
              scrollable
              scrollHeight="flex"
              {...tableCtx.tableProps}
              metaKeySelection={false}
            >
              <Column field="key" header={t("layoutEditor.columnKey")} sortable style={{ minWidth: "9rem" }} />
              <Column field="name" header={t("layoutEditor.columnName")} sortable style={{ minWidth: "12rem" }} />
              <Column
                field="appKey"
                header={t("layoutEditor.columnApp")}
                body={(row: AppLayout) => t(`layoutEditor.appKey.${row.appKey}`, { defaultValue: row.appKey })}
                sortable
                style={{ minWidth: "8rem" }}
              />
              <Column
                field="siteName"
                header={t("layoutEditor.columnSite")}
                body={siteColumnBody}
                sortable
                style={{ minWidth: "10rem" }}
              />
              <Column
                field="isSystem"
                header={t("layoutEditor.columnSystem")}
                body={(row: AppLayout) =>
                  row.isSystem ? (
                    <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
                      <LayoutTemplate className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {t("layoutEditor.system")}
                    </span>
                  ) : (
                    <span className="text-xs text-on-surface-variant">{t("layoutEditor.custom")}</span>
                  )
                }
                style={{ minWidth: "7rem" }}
              />
              <Column field="updatedBy" header={t("layoutEditor.columnUpdatedBy")} sortable style={{ minWidth: "8rem" }} />
            </DataTable>
          </div>
        </>
      )}

      <AppDialog
        header={t("layoutEditor.copyTitle")}
        visible={copyVisible}
        style={{ width: "min(28rem, 95vw)" }}
        onHide={() => setCopyVisible(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              label={t("layoutEditor.cancel")}
              severity="secondary"
              outlined
              disabled={copying}
              onClick={() => setCopyVisible(false)}
            />
            <Button
              type="button"
              label={t("layoutEditor.copy")}
              loading={copying}
              onClick={() => void submitCopy()}
            />
          </div>
        }
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        <div className="flex flex-col gap-4 pt-1">
          <p className="m-0 text-sm text-on-surface-variant">
            {t("layoutEditor.copyHelp", { name: copySource?.name ?? "" })}
          </p>
          <div className="space-y-1">
            <label className="block text-[11px] uppercase tracking-wide text-outline">
              {t("layoutEditor.columnKey")}
              <span className="app-required-marker">*</span>
            </label>
            <InputText
              value={copyKey}
              onChange={(e) => setCopyKey(e.target.value)}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] uppercase tracking-wide text-outline">
              {t("layoutEditor.columnName")}
              <span className="app-required-marker">*</span>
            </label>
            <InputText
              value={copyName}
              onChange={(e) => setCopyName(e.target.value)}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] uppercase tracking-wide text-outline">
              {t("layoutEditor.columnSite")}
              <span className="app-required-marker">*</span>
            </label>
            <Dropdown
              value={copySiteId}
              options={siteDropdownOptions}
              onChange={(e) => setCopySiteId(String(e.value ?? ""))}
              className="w-full app-inline-icon-dropdown"
              itemTemplate={renderSiteDropdownOption}
              filter
              disabled={siteFieldLocked}
              appendTo={overlayAppendTo}
            />
          </div>
        </div>
      </AppDialog>

      {draft && (
        <LayoutPreviewDialog
          visible={previewVisible && mode === "table"}
          onHide={() => setPreviewVisible(false)}
          layoutName={draft.name}
          appKey={draft.appKey}
          modal={draft.modal}
          table={draft.table}
          contextMenu={draft.contextMenu}
          sites={sites}
        />
      )}
    </div>
  );
}
