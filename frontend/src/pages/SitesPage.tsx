import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { AppDialog } from "../components/AppDialog";
import { AppColorPicker } from "../components/AppColorPicker";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import {
  DEFAULT_PICKER_COLOR_HEX,
  pickerValueFromStored,
  storedFromPickerValue,
} from "../lib/colorHex";
import { readableSiteColor } from "../lib/siteColor";
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

type Site = {
  id: string;
  key: string;
  name: string;
  isPlant: boolean;
  colorHex: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type FormState = {
  key: string;
  name: string;
  isPlant: boolean;
  colorHex: string;
};

const defaultColorHex = DEFAULT_PICKER_COLOR_HEX;

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  isPlant: false,
  colorHex: defaultColorHex,
});


export function SitesPage() {
  const { t, i18n } = useTranslation();
  const crud = useAppCrud("sites");
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredSites = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((site) =>
      [site.key, site.name, site.colorHex, site.createdBy, site.updatedBy].join(" ").toLowerCase().includes(q),
    );
  }, [sites, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filteredSites.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filteredSites.length, setHeaderRowCount]);

  const loadSites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/sites");
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as Site[];
      setSites(data);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("sites.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogVisible(true);
  }, []);

  const openEdit = useCallback((row: Site) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      isPlant: row.isPlant,
      colorHex: storedFromPickerValue(pickerValueFromStored(row.colorHex || defaultColorHex)),
    });
    setDialogVisible(true);
  }, []);

  const showSaveError = async (res: Response) => {
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string };
      code = body.error;
    } catch {
      /* ignore */
    }
    let detail = t("sites.saveError");
    if (code === "duplicate_key") detail = t("sites.duplicateKey");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    if (!key || !name) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("sites.validationRequired"),
        life: 4000,
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        key,
        name,
        isPlant: form.isPlant,
        colorHex: form.colorHex,
      };
      const url = editingId ? `/api/sites/${editingId}` : "/api/sites";
      const res = await apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        await showSaveError(res);
        return;
      }
      setDialogVisible(false);
      await loadSites();
      toastRef.current?.show({
        severity: "success",
        summary: editingId ? t("sites.saved") : t("sites.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("sites.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/sites/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedSite((cur) => (cur?.id === id ? null : cur));
          await loadSites();
          toastRef.current?.show({
            severity: "success",
            summary: t("sites.deleted"),
            life: 3000,
          });
          return;
        }
        let code: string | undefined;
        try {
          const body = (await res.json()) as { error?: string };
          code = body.error;
        } catch {
          /* ignore */
        }
        const detail =
          code === "foreign_key_violation" ? t("sites.foreignKey") : t("sites.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("sites.deleteError"),
          life: 6000,
        });
      }
    },
    [loadSites, t],
  );

  const confirmDelete = useCallback(
    (row: Site) => {
      confirmDialog({
        message: t("sites.confirmDelete", { name: row.name }),
        header: t("sites.confirmDeleteTitle"),
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
        acceptClassName: "p-button-danger",
        acceptLabel: t("sites.yes"),
        rejectLabel: t("sites.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<Site>({
    labels: { new: t("sites.new"), edit: t("sites.edit"), delete: t("sites.delete") },
    handlers: {
      onCreate: crud.canCreate ? openCreate : undefined,
      onEdit: crud.canUpdate ? openEdit : undefined,
      onDelete: crud.canDelete ? confirmDelete : undefined,
    },
    canCreate: crud.canCreate,
    canEdit: crud.canUpdate,
    canDelete: crud.canDelete,
    selection: selectedSite,
    setSelection: setSelectedSite,
  });

  useEffect(() => {
    if (selectedSite && !sites.some((s) => s.id === selectedSite.id)) {
      setSelectedSite(null);
    }
  }, [sites, selectedSite]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        {crud.canCreate ? (
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
              <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("sites.new")}</span>
            </button>
          </li>
        ) : null}
        {crud.canUpdate ? (
          <li>
            <button
              type="button"
              className={primaryActionNavItem}
              disabled={!selectedSite}
              onClick={() => {
                if (selectedSite) openEdit(selectedSite);
              }}
            >
              <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("sites.edit")}</span>
            </button>
          </li>
        ) : null}
        {crud.canDelete ? (
          <li>
            <button
              type="button"
              className={deleteActionNavItem}
              disabled={!selectedSite}
              onClick={() => {
                if (selectedSite) confirmDelete(selectedSite);
              }}
            >
              <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("sites.delete")}</span>
            </button>
          </li>
        ) : null}
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("sites.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [
    confirmDelete,
    crud.canCreate,
    crud.canDelete,
    crud.canUpdate,
    openCreate,
    openEdit,
    searchTerm,
    selectedSite,
    setHeaderActions,
    t,
  ]);

  const plantBody = (row: Site) =>
    row.isPlant ? (
      <Check
        className="h-4 w-4 text-on-surface"
        strokeWidth={1.75}
        aria-label={t("sites.werk")}
      />
    ) : (
      <span className="text-on-surface-variant">—</span>
    );

  const formatShortDt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const colorBody = (row: Site) => {
    const hex = row.colorHex ?? defaultColorHex;
    return (
      <span style={{ color: readableSiteColor(hex) }} title={hex}>
        {hex}
      </span>
    );
  };

  const dialogFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("sites.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("sites.save")}
        icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        loading={saving}
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
          value={filteredSites}
          loading={loading}
          dataKey="id"
          selection={selectedSite}
          onSelectionChange={(e) => setSelectedSite(e.value as Site | null)}
          onRowDoubleClick={(e) => openEdit(e.data as Site)}
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
          tableStyle={{ minWidth: "66rem" }}
          stateStorage="local"
          stateKey="athene-sites-table"
          emptyMessage={t("sites.empty")}
        >
          <Column field="key" header={t("sites.key")} sortable />
          <Column field="name" header={t("sites.name")} sortable />
          <Column columnKey="color" header={t("sites.color")} body={colorBody} className="w-40" />
          <Column
            columnKey="plant"
            header={t("sites.werk")}
            body={plantBody}
            className="w-24 text-center"
          />
          <Column
            field="createdAt"
            header={t("sites.createdAt")}
            body={(row: Site) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("sites.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("sites.updatedAt")}
            body={(row: Site) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("sites.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <AppDialog
        header={editingId ? t("sites.editTitle") : t("sites.createTitle")}
        visible={dialogVisible}
        style={{ width: "min(32rem, 95vw)" }}
        onHide={() => setDialogVisible(false)}
        footer={dialogFooter}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        <div className="flex flex-col gap-4 pt-1">
          <div className="space-y-2">
            <label
              htmlFor="site-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("sites.key")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="site-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="site-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("sites.name")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="site-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="site-colorHex"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("sites.color")}
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <AppColorPicker
                inputId="site-colorHex"
                value={form.colorHex}
                onChange={(colorHex) => setForm((f) => ({ ...f, colorHex }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <Checkbox
              inputId="site-isPlant"
              checked={form.isPlant}
              onChange={(e) => setForm((f) => ({ ...f, isPlant: Boolean(e.checked) }))}
              className="rounded-none"
            />
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
              {t("sites.werk")}
            </span>
          </label>
        </div>
      </AppDialog>
    </div>
  );
}
