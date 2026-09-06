import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2, TriangleAlert, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";
import { Toast } from "primereact/toast";

import { AppDialog } from "../components/AppDialog";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { PermissionGrantMatrix } from "../components/permissions/PermissionGrantMatrix";
import { lucidePrimeBtnIcon } from "../icons/lucide";
import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";
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
  colorHex: string;
};

type TemplateRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  permissionKeys: string[];
};

type FormState = {
  key: string;
  name: string;
  siteId: string;
  permissionKeys: Set<string>;
};

const emptyForm = (siteId: string): FormState => ({
  key: "",
  name: "",
  siteId,
  permissionKeys: new Set(),
});

type Props = {
  /** When false, do not write shell header (inactive tab in parent app). Default true. */
  active?: boolean;
};

export function PermissionTemplatesPage({ active = true }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, permissionCatalog, permissions } = useAuth();
  const crud = useAppCrud("permission-templates");
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toast = useRef<Toast>(null);

  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<TemplateRow | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(user.workingSiteId));
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const grantableKeys = useMemo(() => new Set(permissions), [permissions]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, sitesRes] = await Promise.all([
        apiFetch("/api/permission-templates"),
        apiFetch("/api/users/all-sites"),
      ]);
      if (!tplRes.ok) throw new Error("load");
      const tplData = (await tplRes.json()) as TemplateRow[];
      setRows(tplData);
      if (sitesRes.ok) {
        setSites((await sitesRes.json()) as SiteOption[]);
      }
    } catch {
      toast.current?.show({
        severity: "error",
        summary: t("permissionTemplates.loadError"),
        life: 4000,
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.key, r.name, r.siteKey, r.siteName].some((v) => v.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  useEffect(() => {
    if (!active) return;
    setHeaderRowCount(filtered.length);
    return () => setHeaderRowCount(null);
  }, [active, filtered.length, setHeaderRowCount]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm(user.workingSiteId));
    setActiveTab(0);
    setDialogVisible(true);
  }, [user.workingSiteId]);

  const openEdit = useCallback((row: TemplateRow) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      siteId: row.siteId,
      permissionKeys: new Set(row.permissionKeys ?? []),
    });
    setActiveTab(0);
    setDialogVisible(true);
  }, []);

  const confirmDelete = useCallback(
    (row: TemplateRow) => {
      confirmDialog({
        message: t("permissionTemplates.deleteConfirm", { name: row.name }),
        header: t("permissionTemplates.deleteTitle"),
        icon: <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        acceptClassName: "p-button-danger",
        acceptLabel: t("permissionTemplates.delete"),
        rejectLabel: t("permissionTemplates.cancel"),
        accept: () => {
          void (async () => {
            const res = await apiFetch(`/api/permission-templates/${row.id}`, {
              method: "DELETE",
            });
            if (!res.ok) {
              toast.current?.show({
                severity: "error",
                summary: t("permissionTemplates.deleteError"),
                life: 4000,
              });
              return;
            }
            setSelection(null);
            await load();
          })();
        },
      });
    },
    [load, t],
  );

  const openAssign = useCallback(
    (row: TemplateRow) => {
      navigate(`/zuweisungen/permission-template/${row.id}`);
    },
    [navigate],
  );

  const { ContextMenuEl, tableProps, wrapperProps } = useTableContextMenu<TemplateRow>({
    labels: {
      new: t("permissionTemplates.new"),
      edit: t("permissionTemplates.edit"),
      delete: t("permissionTemplates.delete"),
    },
    handlers: {
      onCreate: crud.canCreate ? openCreate : undefined,
      onEdit: crud.canUpdate ? openEdit : undefined,
      onDelete: crud.canDelete ? confirmDelete : undefined,
    },
    canCreate: crud.canCreate,
    canEdit: crud.canUpdate,
    canDelete: crud.canDelete,
    selection,
    setSelection,
    extraItems: (row) =>
      row
        ? [
            {
              label: t("permissionTemplates.assignUsers"),
              icon: <UserPlus className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
              command: () => openAssign(row),
            },
          ]
        : [],
  });

  useEffect(() => {
    if (!active) return;
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        {crud.canCreate ? (
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
              <Plus className={createActionIcon} strokeWidth={1.75} />
              {t("permissionTemplates.new")}
            </button>
          </li>
        ) : null}
        {crud.canUpdate ? (
          <li>
            <button
              type="button"
              className={primaryActionNavItem}
              disabled={!selection}
              onClick={() => selection && openEdit(selection)}
            >
              <Pencil className={primaryActionIcon} strokeWidth={1.75} />
              {t("permissionTemplates.edit")}
            </button>
          </li>
        ) : null}
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selection}
            onClick={() => selection && openAssign(selection)}
          >
            <UserPlus className={primaryActionIcon} strokeWidth={1.75} />
            {t("permissionTemplates.assignUsers")}
          </button>
        </li>
        {crud.canDelete ? (
          <li>
            <button
              type="button"
              className={deleteActionNavItem}
              disabled={!selection}
              onClick={() => selection && confirmDelete(selection)}
            >
              <Trash2 className={deleteActionIcon} strokeWidth={1.75} />
              {t("permissionTemplates.delete")}
            </button>
          </li>
        ) : null}
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
              placeholder={t("permissionTemplates.searchPlaceholder")}
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [
    active,
    confirmDelete,
    crud.canCreate,
    crud.canDelete,
    crud.canUpdate,
    openAssign,
    openCreate,
    openEdit,
    search,
    selection,
    setHeaderActions,
    t,
  ]);

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    if (!key || !name || !form.siteId) {
      toast.current?.show({
        severity: "warn",
        summary: t("permissionTemplates.validation"),
        life: 3000,
      });
      return;
    }
    setSaving(true);
    try {
      const body = {
        key,
        name,
        siteId: form.siteId,
        permissionKeys: [...form.permissionKeys],
      };
      const res = await apiFetch(
        editingId ? `/api/permission-templates/${editingId}` : "/api/permission-templates",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        toast.current?.show({
          severity: "error",
          summary: t("permissionTemplates.saveError"),
          life: 4000,
        });
        return;
      }
      setDialogVisible(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const siteBody = (row: TemplateRow) => {
    const color = readableSiteColor(row.siteColorHex || DEFAULT_SITE_COLOR_HEX);
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span style={{ color }} title={`${label} (${row.siteColorHex || DEFAULT_SITE_COLOR_HEX})`}>
        {label}
      </span>
    );
  };

  const siteOptions = useMemo(
    () =>
      sites.map((s) => ({
        label: `${s.key} - ${s.name}`,
        value: s.id,
      })),
    [sites],
  );

  return (
    <div className="flex h-full min-h-0 flex-col" {...wrapperProps}>
      <Toast ref={toast} />
      <ConfirmDialog appendTo={overlayAppendTo} />
      {ContextMenuEl}
      <DataTable
        value={filtered}
        loading={loading}
        dataKey="id"
        className="app-data-table"
        selectionMode="single"
        selection={selection}
        onSelectionChange={(e) => setSelection(e.value as TemplateRow | null)}
        onRowDoubleClick={(e) => {
          if (crud.canUpdate) openEdit(e.data as TemplateRow);
        }}
        emptyMessage={t("permissionTemplates.empty")}
        {...tableProps}
      >
        <Column field="key" header={t("permissionTemplates.key")} sortable />
        <Column field="name" header={t("permissionTemplates.name")} sortable />
        <Column
          field="siteName"
          header={t("permissionTemplates.site")}
          body={siteBody}
          sortable
        />
        <Column
          header={t("permissionTemplates.grantCount")}
          body={(row: TemplateRow) =>
            (row.permissionKeys?.length ?? 0).toLocaleString(i18n.language)
          }
        />
      </DataTable>

      <AppDialog
        header={
          editingId
            ? t("permissionTemplates.editTitle")
            : t("permissionTemplates.createTitle")
        }
        visible={dialogVisible}
        className="app-big-modal-window app-tabbed-modal-window"
        onHide={() => setDialogVisible(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              label={t("permissionTemplates.cancel")}
              severity="secondary"
              text
              onClick={() => setDialogVisible(false)}
            />
            <Button
              label={t("permissionTemplates.save")}
              onClick={() => void save()}
              loading={saving}
            />
          </div>
        }
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        <TabView activeIndex={activeTab} onTabChange={(e) => setActiveTab(e.index)}>
          <TabPanel header={t("permissionTemplates.tabMaster")}>
            <div className="flex flex-col gap-4 pt-1">
              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-[0.1em] text-outline">
                  {t("permissionTemplates.key")}
                </label>
                <InputText
                  value={form.key}
                  onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-[0.1em] text-outline">
                  {t("permissionTemplates.name")}
                </label>
                <InputText
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-[0.1em] text-outline">
                  {t("permissionTemplates.site")}
                </label>
                <Dropdown
                  value={form.siteId}
                  options={siteOptions}
                  onChange={(e) => setForm((f) => ({ ...f, siteId: e.value as string }))}
                  className="w-full"
                />
              </div>
            </div>
          </TabPanel>
          <TabPanel header={t("permissionTemplates.tabGrants")}>
            <div className="flex h-[min(55vh,28rem)] flex-col pt-1">
              <PermissionGrantMatrix
                catalog={permissionCatalog}
                selected={form.permissionKeys}
                onChange={(next) => setForm((f) => ({ ...f, permissionKeys: next }))}
                grantableKeys={grantableKeys}
              />
            </div>
          </TabPanel>
        </TabView>
      </AppDialog>
    </div>
  );
}
