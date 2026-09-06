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
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";
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

type WarehouseOption = {
  id: string;
  key: string;
  name: string;
  siteId: string;
};

type StorageLocation = {
  id: string;
  key: string;
  warehouseId: string;
  warehouseKey: string;
  warehouseName: string;
  maxLoadKg: string;
  heightMm: number;
  widthMm: number;
  depthMm: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type FormState = {
  key: string;
  warehouseId: string;
  maxLoadKg: number;
  heightMm: number;
  widthMm: number;
  depthMm: number;
  isActive: boolean;
};

const emptyForm = (): FormState => ({
  key: "",
  warehouseId: "",
  maxLoadKg: 0,
  heightMm: 0,
  widthMm: 0,
  depthMm: 0,
  isActive: true,
});

export function StorageLocationsPage() {
  const { t, i18n } = useTranslation();
  const crud = useAppCrud("storage-locations");
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [rows, setRows] = useState<StorageLocation[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StorageLocation | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const warehouseDropdownOptions = useMemo(
    () =>
      warehouses.map((wh) => ({
        label: `${wh.key} - ${wh.name}`,
        value: wh.id,
      })),
    [warehouses],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [locRes, whRes] = await Promise.all([
        apiFetch("/api/storage-locations"),
        apiFetch("/api/warehouses"),
      ]);
      if (!locRes.ok || !whRes.ok) throw new Error("load");
      const [locData, whData] = (await Promise.all([
        locRes.json(),
        whRes.json(),
      ])) as [StorageLocation[], WarehouseOption[]];
      setRows(locData);
      setWarehouses(whData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("storageLocations.loadError"),
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
    setEditingId(null);
    setForm(emptyForm());
    setDialogVisible(true);
  }, []);

  const openEdit = useCallback((row: StorageLocation) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      warehouseId: row.warehouseId,
      maxLoadKg: Number(row.maxLoadKg) || 0,
      heightMm: row.heightMm || 0,
      widthMm: row.widthMm || 0,
      depthMm: row.depthMm || 0,
      isActive: row.isActive,
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
    let detail = t("storageLocations.saveError");
    if (code === "duplicate_key") detail = t("storageLocations.duplicateKey");
    if (code === "foreign_key_violation") detail = t("storageLocations.foreignKey");
    if (code === "warehouse_not_found") detail = t("storageLocations.warehouseNotFound");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const warehouseId = form.warehouseId.trim();
    if (!key || !warehouseId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("storageLocations.validationRequired"),
        life: 4000,
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        key,
        warehouseId,
        maxLoadKg: form.maxLoadKg,
        heightMm: form.heightMm,
        widthMm: form.widthMm,
        depthMm: form.depthMm,
        isActive: form.isActive,
      };
      const url = editingId
        ? `/api/storage-locations/${editingId}`
        : "/api/storage-locations";
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
      await loadData();
      toastRef.current?.show({
        severity: "success",
        summary: editingId ? t("storageLocations.saved") : t("storageLocations.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("storageLocations.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/storage-locations/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelected((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("storageLocations.deleted"),
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
          code === "foreign_key_violation"
            ? t("storageLocations.foreignKey")
            : t("storageLocations.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("storageLocations.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: StorageLocation) => {
      confirmDialog({
        message: t("storageLocations.confirmDelete", { key: row.key }),
        header: t("storageLocations.confirmDeleteTitle"),
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
        acceptClassName: "p-button-danger",
        acceptLabel: t("storageLocations.yes"),
        rejectLabel: t("storageLocations.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<StorageLocation>({
    labels: {
      new: t("storageLocations.new"),
      edit: t("storageLocations.edit"),
      delete: t("storageLocations.delete"),
    },
    handlers: {
      onCreate: crud.canCreate ? openCreate : undefined,
      onEdit: crud.canUpdate ? openEdit : undefined,
      onDelete: crud.canDelete ? confirmDelete : undefined,
    },
    canCreate: crud.canCreate,
    canEdit: crud.canUpdate,
    canDelete: crud.canDelete,
    selection: selected,
    setSelection: setSelected,
  });

  useEffect(() => {
    if (selected && !rows.some((r) => r.id === selected.id)) {
      setSelected(null);
    }
  }, [rows, selected]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.key.toLowerCase().includes(q) ||
        row.warehouseKey.toLowerCase().includes(q) ||
        row.warehouseName.toLowerCase().includes(q),
    );
  }, [rows, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filtered.length);
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        {crud.canCreate ? (
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("storageLocations.new")}</span>
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
              if (selected) openEdit(selected);
            }}
          >
            <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("storageLocations.edit")}</span>
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
            <span>{t("storageLocations.delete")}</span>
          </button>
          </li>
        ) : null}
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("storageLocations.searchPlaceholder")}
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
    crud.canCreate,
    crud.canDelete,
    crud.canUpdate,
    filtered.length,
    openCreate,
    openEdit,
    searchTerm,
    selected,
    setHeaderActions,
    setHeaderRowCount,
    t,
  ]);

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

  const formatQty = (value: string | number) => {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "0";
    return new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: 4,
      minimumFractionDigits: 0,
    }).format(n);
  };

  const activeBody = (row: StorageLocation) =>
    row.isActive ? (
      <span className="text-green-600">{t("storageLocations.active")}</span>
    ) : (
      <span className="text-on-surface-variant">{t("storageLocations.inactive")}</span>
    );

  const dialogFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("storageLocations.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("storageLocations.save")}
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
          value={filtered}
          loading={loading}
          dataKey="id"
          selection={selected}
          onSelectionChange={(e) => setSelected(e.value as StorageLocation | null)}
          onRowDoubleClick={(e) => openEdit(e.data as StorageLocation)}
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
          tableStyle={{ minWidth: "72rem" }}
          stateStorage="local"
          stateKey="athene-storage-locations-table"
          emptyMessage={t("storageLocations.empty")}
        >
          <Column field="key" header={t("storageLocations.key")} sortable />
          <Column
            field="warehouseKey"
            header={t("storageLocations.warehouse")}
            body={(row: StorageLocation) => `${row.warehouseKey} - ${row.warehouseName}`}
            sortable
          />
          <Column
            field="maxLoadKg"
            header={t("storageLocations.maxLoadKg")}
            body={(row: StorageLocation) => formatQty(row.maxLoadKg)}
            sortable
            className="text-right tabular-nums"
          />
          <Column field="heightMm" header={t("storageLocations.heightMm")} sortable className="text-right tabular-nums" />
          <Column field="widthMm" header={t("storageLocations.widthMm")} sortable className="text-right tabular-nums" />
          <Column field="depthMm" header={t("storageLocations.depthMm")} sortable className="text-right tabular-nums" />
          <Column
            columnKey="active"
            header={t("storageLocations.active")}
            body={activeBody}
            className="w-28 text-center"
          />
          <Column
            field="updatedAt"
            header={t("storageLocations.updatedAt")}
            body={(row: StorageLocation) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
        </DataTable>
      </div>

      <AppDialog
        header={editingId ? t("storageLocations.editTitle") : t("storageLocations.createTitle")}
        visible={dialogVisible}
        className="app-big-modal-window"
        onHide={() => setDialogVisible(false)}
        footer={dialogFooter}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="storage-location-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("storageLocations.key")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="storage-location-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="storage-location-warehouse"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("storageLocations.warehouse")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <Dropdown
              inputId="storage-location-warehouse"
              value={form.warehouseId || null}
              options={warehouseDropdownOptions}
              onChange={(e) => setForm((f) => ({ ...f, warehouseId: String(e.value ?? "") }))}
              placeholder={t("storageLocations.warehousePlaceholder")}
              className="w-full app-inline-icon-dropdown"
              filter
              appendTo={overlayAppendTo}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="storage-location-max-load"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("storageLocations.maxLoadKg")}
            </label>
            <InputNumber
              inputId="storage-location-max-load"
              value={form.maxLoadKg}
              onValueChange={(e) => setForm((f) => ({ ...f, maxLoadKg: e.value ?? 0 }))}
              min={0}
              className="w-full"
              inputClassName="w-full"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="storage-location-height"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("storageLocations.heightMm")}
            </label>
            <InputNumber
              inputId="storage-location-height"
              value={form.heightMm}
              onValueChange={(e) => setForm((f) => ({ ...f, heightMm: e.value ?? 0 }))}
              min={0}
              className="w-full"
              inputClassName="w-full"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="storage-location-width"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("storageLocations.widthMm")}
            </label>
            <InputNumber
              inputId="storage-location-width"
              value={form.widthMm}
              onValueChange={(e) => setForm((f) => ({ ...f, widthMm: e.value ?? 0 }))}
              min={0}
              className="w-full"
              inputClassName="w-full"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="storage-location-depth"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("storageLocations.depthMm")}
            </label>
            <InputNumber
              inputId="storage-location-depth"
              value={form.depthMm}
              onValueChange={(e) => setForm((f) => ({ ...f, depthMm: e.value ?? 0 }))}
              min={0}
              className="w-full"
              inputClassName="w-full"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <Checkbox
                inputId="storage-location-active"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: Boolean(e.checked) }))}
                className="rounded-none"
              />
              <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
                {t("storageLocations.active")}
              </span>
            </label>
          </div>
        </div>
      </AppDialog>
    </div>
  );
}
