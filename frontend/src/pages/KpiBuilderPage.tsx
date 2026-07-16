import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Pencil, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import {
  KpiEditorPanel,
  type KpiEditorPanelHandle,
} from "../components/kpiBuilder/KpiEditorPanel";
import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";
import {
  createCustomKpi,
  deleteCustomKpi,
  fetchCustomKpis,
  fetchKpiMeta,
  updateCustomKpi,
  type CustomKpi,
  type CustomKpiWritePayload,
  type KpiMeta,
} from "../lib/kpiBuilderApi";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";
import { useTableContextMenu } from "../lib/useTableContextMenu";

type SiteOption = {
  id: string;
  key: string;
  name: string;
  colorHex: string;
};

type PageMode = "list" | "edit";

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const deleteActionIcon = "text-red-500";

export function KpiBuilderPage() {
  const { t } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const editorRef = useRef<KpiEditorPanelHandle>(null);

  const [mode, setMode] = useState<PageMode>("list");
  const [rows, setRows] = useState<CustomKpi[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [meta, setMeta] = useState<KpiMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CustomKpi | null>(null);
  const [editing, setEditing] = useState<CustomKpi | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.key, row.name, row.siteKey, row.siteName, row.definition?.entity, row.style?.display, row.createdBy]
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
      const [list, sitesRes, kpiMeta] = await Promise.all([
        fetchCustomKpis(),
        apiFetch("/api/sites"),
        fetchKpiMeta(),
      ]);
      if (!sitesRes.ok) throw new Error("sites");
      const sitesData = (await sitesRes.json()) as SiteOption[];
      setRows(list);
      setSites(sitesData);
      setMeta(kpiMeta);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("kpiBuilder.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setMode("edit");
  }, []);

  const openEdit = useCallback((row: CustomKpi) => {
    setEditing(row);
    setMode("edit");
  }, []);

  const closeEditor = useCallback(() => {
    setMode("list");
    setEditing(null);
  }, []);

  const remove = useCallback(
    (row: CustomKpi) => {
      confirmDialog({
        header: t("kpiBuilder.confirmDeleteTitle"),
        message: t("kpiBuilder.confirmDelete", { name: row.name }),
        icon: <TriangleAlert className="h-5 w-5 text-amber-500" />,
        acceptLabel: t("kpiBuilder.delete"),
        rejectLabel: t("kpiBuilder.cancel"),
        acceptClassName: "p-button-danger",
        accept: () => {
          void (async () => {
            try {
              await deleteCustomKpi(row.id);
              setSelected((prev) => (prev?.id === row.id ? null : prev));
              toastRef.current?.show({
                severity: "success",
                summary: t("kpiBuilder.deleteSuccess"),
                life: 3000,
              });
              await loadData();
            } catch {
              toastRef.current?.show({
                severity: "error",
                summary: t("kpiBuilder.deleteError"),
                life: 6000,
              });
            }
          })();
        },
      });
    },
    [loadData, t],
  );

  const save = async (payload: CustomKpiWritePayload) => {
    setSaving(true);
    try {
      if (editing) {
        await updateCustomKpi(editing.id, payload);
      } else {
        await createCustomKpi(payload);
      }
      setMode("list");
      setEditing(null);
      toastRef.current?.show({
        severity: "success",
        summary: t("kpiBuilder.saveSuccess"),
        life: 3000,
      });
      await loadData();
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("kpiBuilder.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
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

  const tableCtx = useTableContextMenu<CustomKpi>({
    labels: {
      new: t("kpiBuilder.create"),
      edit: t("kpiBuilder.edit"),
      delete: t("kpiBuilder.delete"),
    },
    handlers: {
      onCreate: openCreate,
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
    if (mode === "edit") {
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
              <span>{t("kpiBuilder.backToList")}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={createActionNavItem}
              onClick={() => editorRef.current?.save()}
              disabled={saving}
            >
              <Save className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{saving ? t("kpiBuilder.saving") : t("kpiBuilder.save")}</span>
            </button>
          </li>
        </ul>,
      );
    } else {
      setHeaderActions(
        <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
          <li>
            <IconField iconPosition="left" className="mr-1">
              <LucideInputSearchIcon />
              <InputText
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("kpiBuilder.searchPlaceholder")}
                className="w-48"
              />
            </IconField>
          </li>
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
              <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("kpiBuilder.create")}</span>
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
              <span>{t("kpiBuilder.edit")}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={deleteActionNavItem}
              disabled={!selected}
              onClick={() => {
                if (selected) remove(selected);
              }}
            >
              <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("kpiBuilder.delete")}</span>
            </button>
          </li>
        </ul>,
      );
    }
    return () => setHeaderActions(null);
  }, [
    closeEditor,
    mode,
    openCreate,
    openEdit,
    remove,
    saving,
    searchTerm,
    selected,
    setHeaderActions,
    t,
  ]);

  const siteColumnBody = useCallback((row: CustomKpi) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {row.siteName}
      </span>
    );
  }, []);

  const activeBody = (row: CustomKpi) =>
    row.isActive ? <Check className="h-4 w-4 text-green-500" strokeWidth={2} /> : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <Toast ref={toastRef} />
      <ConfirmDialog />

      {mode === "edit" ? (
        <KpiEditorPanel
          ref={editorRef}
          editing={editing}
          sites={sites}
          meta={meta}
          siteFieldLocked={siteFieldLocked}
          workingSiteId={user.workingSiteId}
          saving={saving}
          onSave={(payload) => void save(payload)}
          onValidationError={onValidationError}
        />
      ) : (
        <>
          {tableCtx.ContextMenuEl}
          <div className="flex min-h-0 flex-1 flex-col" {...tableCtx.wrapperProps}>
            <DataTable
              value={filtered}
              loading={loading}
              selectionMode="single"
              selection={selected}
              onSelectionChange={(e) => setSelected((e.value as CustomKpi) ?? null)}
              dataKey="id"
              emptyMessage={t("kpiBuilder.empty")}
              onRowDoubleClick={(e) => openEdit(e.data as CustomKpi)}
              className="app-data-table w-full min-h-0 flex-1"
              scrollable
              scrollHeight="flex"
              {...tableCtx.tableProps}
              metaKeySelection={false}
            >
              <Column field="key" header={t("kpiBuilder.columnKey")} sortable style={{ minWidth: "8rem" }} />
              <Column field="name" header={t("kpiBuilder.columnName")} sortable style={{ minWidth: "12rem" }} />
              <Column
                field="siteName"
                header={t("kpiBuilder.columnSite")}
                body={siteColumnBody}
                sortable
                style={{ minWidth: "10rem" }}
              />
              <Column
                header={t("kpiBuilder.columnEntity")}
                body={(row: CustomKpi) => t(`kpiBuilder.entity.${row.definition.entity}`)}
                style={{ minWidth: "9rem" }}
              />
              <Column
                header={t("kpiBuilder.columnDisplay")}
                body={(row: CustomKpi) => t(`kpiBuilder.display.${row.style.display}`)}
                style={{ minWidth: "8rem" }}
              />
              <Column
                field="isActive"
                header={t("kpiBuilder.columnActive")}
                body={activeBody}
                style={{ width: "5rem" }}
              />
            </DataTable>
          </div>
        </>
      )}
    </div>
  );
}
