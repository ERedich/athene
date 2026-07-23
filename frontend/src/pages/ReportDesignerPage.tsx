import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, FileDown, Pencil, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
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
  ReportEditorPanel,
  type ReportEditorPanelHandle,
} from "../components/reportDesigner/ReportEditorPanel";
import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";
import {
  createReport,
  deleteReport,
  downloadReportPdf,
  fetchReportMeta,
  fetchReports,
  updateReport,
  type ReportDefinition,
  type ReportDefinitionWritePayload,
  type ReportMeta,
} from "../lib/reportDesignerApi";
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

export function ReportDesignerPage() {
  const { t } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const editorRef = useRef<ReportEditorPanelHandle>(null);

  const [mode, setMode] = useState<PageMode>("list");
  const [rows, setRows] = useState<ReportDefinition[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReportDefinition | null>(null);
  const [editing, setEditing] = useState<ReportDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.key, row.name, row.siteKey, row.siteName, row.queryDefinition?.entity, row.createdBy]
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
      const [list, sitesRes, reportMeta] = await Promise.all([
        fetchReports(),
        apiFetch("/api/sites"),
        fetchReportMeta(),
      ]);
      if (!sitesRes.ok) throw new Error("sites");
      const sitesData = (await sitesRes.json()) as SiteOption[];
      setRows(list);
      setSites(sitesData);
      setMeta(reportMeta);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("reportDesigner.loadError"),
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

  const openEdit = useCallback((row: ReportDefinition) => {
    setEditing(row);
    setMode("edit");
  }, []);

  const closeEditor = useCallback(() => {
    setMode("list");
    setEditing(null);
  }, []);

  const remove = useCallback(
    (row: ReportDefinition) => {
      confirmDialog({
        header: t("reportDesigner.confirmDeleteTitle"),
        message: t("reportDesigner.confirmDelete", { name: row.name }),
        icon: <TriangleAlert className="h-5 w-5 text-amber-500" />,
        acceptLabel: t("reportDesigner.delete"),
        rejectLabel: t("reportDesigner.cancel"),
        acceptClassName: "p-button-danger",
        accept: () => {
          void (async () => {
            try {
              await deleteReport(row.id);
              setSelected((prev) => (prev?.id === row.id ? null : prev));
              toastRef.current?.show({
                severity: "success",
                summary: t("reportDesigner.deleteSuccess"),
                life: 3000,
              });
              await loadData();
            } catch {
              toastRef.current?.show({
                severity: "error",
                summary: t("reportDesigner.deleteError"),
                life: 6000,
              });
            }
          })();
        },
      });
    },
    [loadData, t],
  );

  const openPdf = useCallback(
    async (row: ReportDefinition) => {
      try {
        const blob = await downloadReportPdf(row.id);
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("reportDesigner.pdfError"),
          life: 6000,
        });
      }
    },
    [t],
  );

  const save = async (payload: ReportDefinitionWritePayload) => {
    setSaving(true);
    try {
      if (editing) {
        await updateReport(editing.id, payload);
      } else {
        await createReport(payload);
      }
      setMode("list");
      setEditing(null);
      toastRef.current?.show({
        severity: "success",
        summary: t("reportDesigner.saveSuccess"),
        life: 3000,
      });
      await loadData();
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("reportDesigner.saveError"),
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

  const tableCtx = useTableContextMenu<ReportDefinition>({
    labels: {
      new: t("reportDesigner.create"),
      edit: t("reportDesigner.edit"),
      delete: t("reportDesigner.delete"),
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
              <span>{t("reportDesigner.backToList")}</span>
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
              <span>{saving ? t("reportDesigner.saving") : t("reportDesigner.save")}</span>
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
                placeholder={t("reportDesigner.searchPlaceholder")}
                className="w-48 app-header-search-input"
              />
            </IconField>
          </li>
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
              <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("reportDesigner.create")}</span>
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
              <span>{t("reportDesigner.edit")}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={primaryActionNavItem}
              disabled={!selected}
              onClick={() => {
                if (selected) void openPdf(selected);
              }}
            >
              <FileDown className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("reportDesigner.openPdf")}</span>
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
              <span>{t("reportDesigner.delete")}</span>
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
    openPdf,
    remove,
    saving,
    searchTerm,
    selected,
    setHeaderActions,
    t,
  ]);

  const siteColumnBody = useCallback((row: ReportDefinition) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {row.siteName}
      </span>
    );
  }, []);

  const activeBody = (row: ReportDefinition) =>
    row.isActive ? <Check className="h-4 w-4 text-green-500" strokeWidth={2} /> : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <Toast ref={toastRef} />
      <ConfirmDialog />

      {mode === "edit" ? (
        <ReportEditorPanel
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
              onSelectionChange={(e) => setSelected((e.value as ReportDefinition) ?? null)}
              dataKey="id"
              emptyMessage={t("reportDesigner.empty")}
              onRowDoubleClick={(e) => openEdit(e.data as ReportDefinition)}
              className="app-data-table w-full min-h-0 flex-1"
              scrollable
              scrollHeight="flex"
              {...tableCtx.tableProps}
              metaKeySelection={false}
            >
              <Column field="key" header={t("reportDesigner.columnKey")} sortable style={{ minWidth: "8rem" }} />
              <Column field="name" header={t("reportDesigner.columnName")} sortable style={{ minWidth: "12rem" }} />
              <Column
                field="siteName"
                header={t("reportDesigner.columnSite")}
                body={siteColumnBody}
                sortable
                style={{ minWidth: "10rem" }}
              />
              <Column
                header={t("reportDesigner.columnEntity")}
                body={(row: ReportDefinition) =>
                  t(`reportDesigner.entity.${row.queryDefinition.entity}`)
                }
                style={{ minWidth: "9rem" }}
              />
              <Column
                header={t("reportDesigner.columnDataMode")}
                body={(row: ReportDefinition) =>
                  t(`reportDesigner.dataMode.${row.layout.dataMode}`)
                }
                style={{ minWidth: "9rem" }}
              />
              <Column
                field="isActive"
                header={t("reportDesigner.columnActive")}
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
