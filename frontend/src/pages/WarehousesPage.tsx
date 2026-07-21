import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, MessageCircle, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
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
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { LucideSpinner, lucidePrimeBtnIcon } from "../icons/lucide";

import { useAtheneAssistant } from "../assistant/AtheneAssistantContext";
import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";
import { useTableContextMenu } from "../lib/useTableContextMenu";

type SiteOption = {
  id: string;
  key: string;
  name: string;
  colorHex: string;
};

type SiteDropdownOption = { label: string; value: string };

type Warehouse = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type FormState = {
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
};

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  siteId: "",
  isActive: true,
});

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const deleteActionIcon = "text-red-500";

export function WarehousesPage() {
  const { t, i18n } = useTranslation();
  const athene = useAtheneAssistant();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const siteDropdownOptions = useMemo<SiteDropdownOption[]>(
    () => sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
    [sites],
  );

  const renderSiteDropdownOption = useCallback(
    (option: SiteDropdownOption) => {
      const site = sites.find((s) => s.id === option.value);
      const hex = site?.colorHex || DEFAULT_SITE_COLOR_HEX;
      return (
        <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${option.label} (${hex})`}>
          {option.label}
        </span>
      );
    },
    [sites],
  );

  const renderSiteDropdownValue = useCallback(
    (incoming: unknown) => {
      const id =
        typeof incoming === "string"
          ? incoming
          : incoming && typeof incoming === "object" && incoming !== null && "value" in incoming
            ? String((incoming as { value: unknown }).value ?? "")
            : "";
      const site = sites.find((s) => s.id === id);
      if (!site) {
        return <span className="text-on-surface-variant">{t("warehouses.sitePlaceholder")}</span>;
      }
      const hex = site.colorHex || DEFAULT_SITE_COLOR_HEX;
      const label = `${site.key} - ${site.name}`;
      return (
        <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
          {label}
        </span>
      );
    },
    [sites, t],
  );

  const siteColumnBody = useCallback((row: Warehouse) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {row.siteName}
      </span>
    );
  }, []);

  const filteredWarehouses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return warehouses;
    return warehouses.filter((row) =>
      [row.key, row.name, row.siteKey, row.siteName, row.siteColorHex, row.createdBy, row.updatedBy]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [warehouses, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filteredWarehouses.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filteredWarehouses.length, setHeaderRowCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [warehousesRes, sitesRes] = await Promise.all([
        apiFetch("/api/warehouses"),
        apiFetch("/api/sites"),
      ]);
      if (!warehousesRes.ok || !sitesRes.ok) throw new Error("load");
      const [warehousesData, sitesData] = (await Promise.all([
        warehousesRes.json(),
        sitesRes.json(),
      ])) as [Warehouse[], SiteOption[]];
      setWarehouses(warehousesData);
      setSites(sitesData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("warehouses.loadError"),
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
    setForm({
      ...emptyForm(),
      ...(siteFieldLocked ? { siteId: user.workingSiteId } : {}),
    });
    setDialogVisible(true);
  }, [siteFieldLocked, user.workingSiteId]);

  const openEdit = useCallback((row: Warehouse) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      siteId: row.siteId,
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
    let detail = t("warehouses.saveError");
    if (code === "duplicate_key") detail = t("warehouses.duplicateKey");
    if (code === "foreign_key_violation") detail = t("warehouses.foreignKey");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !siteId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("warehouses.validationRequired"),
        life: 4000,
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        key,
        name,
        siteId,
        isActive: form.isActive,
      };
      const url = editingId ? `/api/warehouses/${editingId}` : "/api/warehouses";
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
        summary: editingId ? t("warehouses.saved") : t("warehouses.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("warehouses.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/warehouses/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedWarehouse((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("warehouses.deleted"),
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
            ? t("warehouses.foreignKey")
            : t("warehouses.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("warehouses.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: Warehouse) => {
      confirmDialog({
        message: t("warehouses.confirmDelete", { name: row.name }),
        header: t("warehouses.confirmDeleteTitle"),
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
        acceptClassName: "p-button-danger",
        acceptLabel: t("warehouses.yes"),
        rejectLabel: t("warehouses.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const atheneContextMenuItems = useCallback(
    (row: Warehouse | null) => [
      {
        label: t("assistant.askAthene"),
        className: "app-context-menu-athene",
        icon: athene.busy ? (
          <LucideSpinner className={lucidePrimeBtnIcon} strokeWidth={1.75} />
        ) : (
          <MessageCircle className={lucidePrimeBtnIcon} strokeWidth={1.75} />
        ),
        disabled: !row || athene.busy,
        command: () => {
          if (!row) return;
          athene.openWithContext({
            type: "warehouse",
            id: row.id,
            label: `${row.key} - ${row.name}`,
            data: {
              key: row.key,
              name: row.name,
              siteKey: row.siteKey,
              isActive: row.isActive,
            },
          });
        },
      },
    ],
    [athene, t],
  );

  const tableCtx = useTableContextMenu<Warehouse>({
    labels: { new: t("warehouses.new"), edit: t("warehouses.edit"), delete: t("warehouses.delete") },
    handlers: { onCreate: openCreate, onEdit: openEdit, onDelete: confirmDelete },
    selection: selectedWarehouse,
    setSelection: setSelectedWarehouse,
    leadingItems: atheneContextMenuItems,
  });

  useEffect(() => {
    if (selectedWarehouse && !warehouses.some((cc) => cc.id === selectedWarehouse.id)) {
      setSelectedWarehouse(null);
    }
  }, [warehouses, selectedWarehouse]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("warehouses.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedWarehouse}
            onClick={() => {
              if (selectedWarehouse) openEdit(selectedWarehouse);
            }}
          >
            <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("warehouses.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedWarehouse}
            onClick={() => {
              if (selectedWarehouse) confirmDelete(selectedWarehouse);
            }}
          >
            <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("warehouses.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("warehouses.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, openCreate, openEdit, searchTerm, selectedWarehouse, setHeaderActions, t]);

  const activeBody = (row: Warehouse) =>
    row.isActive ? (
      <Check
        className="h-4 w-4 text-on-surface"
        strokeWidth={1.75}
        aria-label={t("warehouses.active")}
      />
    ) : (
      <span className="text-on-surface-variant">{t("warehouses.inactive")}</span>
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

  const dialogFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("warehouses.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("warehouses.save")}
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
          value={filteredWarehouses}
          loading={loading}
          dataKey="id"
          selection={selectedWarehouse}
          onSelectionChange={(e) => setSelectedWarehouse(e.value as Warehouse | null)}
          onRowDoubleClick={(e) => openEdit(e.data as Warehouse)}
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
          tableStyle={{ minWidth: "68rem" }}
          stateStorage="local"
          stateKey="athene-warehouses-table"
          emptyMessage={t("warehouses.empty")}
        >
          <Column field="key" header={t("warehouses.key")} sortable />
          <Column field="name" header={t("warehouses.name")} sortable />
          <Column field="siteName" header={t("warehouses.site")} sortable body={siteColumnBody} />
          <Column
            columnKey="active"
            header={t("warehouses.active")}
            body={activeBody}
            className="w-28 text-center"
          />
          <Column
            field="createdAt"
            header={t("warehouses.createdAt")}
            body={(row: Warehouse) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("warehouses.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("warehouses.updatedAt")}
            body={(row: Warehouse) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("warehouses.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <AppDialog
        header={editingId ? t("warehouses.editTitle") : t("warehouses.createTitle")}
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
              htmlFor="warehouse-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("warehouses.key")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="warehouse-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="warehouse-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("warehouses.name")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="warehouse-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="warehouse-site"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("warehouses.site")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <Dropdown
              inputId="warehouse-site"
              value={form.siteId}
              options={siteDropdownOptions}
              onChange={(e) => setForm((f) => ({ ...f, siteId: String(e.value ?? "") }))}
              placeholder={t("warehouses.sitePlaceholder")}
              className="w-full app-inline-icon-dropdown"
              itemTemplate={renderSiteDropdownOption}
              valueTemplate={renderSiteDropdownValue}
              filter
              disabled={siteFieldLocked}
              appendTo={overlayAppendTo}
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <Checkbox
              inputId="warehouse-isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: Boolean(e.checked) }))}
              className="rounded-none"
            />
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
              {t("warehouses.active")}
            </span>
          </label>
        </div>
      </AppDialog>
    </div>
  );
}
