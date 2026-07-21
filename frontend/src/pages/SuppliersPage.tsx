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
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";

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

type Supplier = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  customerNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
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
  customerNumber: string;
  address: string;
  phone: string;
  email: string;
  isActive: boolean;
};

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  siteId: "",
  customerNumber: "",
  address: "",
  phone: "",
  email: "",
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

export function SuppliersPage() {
  const { t, i18n } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
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
        return <span className="text-on-surface-variant">{t("suppliers.sitePlaceholder")}</span>;
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

  const siteColumnBody = useCallback((row: Supplier) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {row.siteName}
      </span>
    );
  }, []);

  const filteredSuppliers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((row) =>
      [
        row.key,
        row.name,
        row.customerNumber,
        row.address,
        row.phone,
        row.email,
        row.siteKey,
        row.siteName,
        row.siteColorHex,
        row.createdBy,
        row.updatedBy,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [suppliers, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filteredSuppliers.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filteredSuppliers.length, setHeaderRowCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [suppliersRes, sitesRes] = await Promise.all([
        apiFetch("/api/suppliers"),
        apiFetch("/api/sites"),
      ]);
      if (!suppliersRes.ok || !sitesRes.ok) throw new Error("load");
      const [suppliersData, sitesData] = (await Promise.all([
        suppliersRes.json(),
        sitesRes.json(),
      ])) as [Supplier[], SiteOption[]];
      setSuppliers(suppliersData);
      setSites(sitesData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("suppliers.loadError"),
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

  const openEdit = useCallback((row: Supplier) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      siteId: row.siteId,
      customerNumber: row.customerNumber ?? "",
      address: row.address ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
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
    let detail = t("suppliers.saveError");
    if (code === "duplicate_key") detail = t("suppliers.duplicateKey");
    if (code === "foreign_key_violation") detail = t("suppliers.foreignKey");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !siteId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("suppliers.validationRequired"),
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
        customerNumber: form.customerNumber.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        isActive: form.isActive,
      };
      const url = editingId ? `/api/suppliers/${editingId}` : "/api/suppliers";
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
        summary: editingId ? t("suppliers.saved") : t("suppliers.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("suppliers.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/suppliers/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedSupplier((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("suppliers.deleted"),
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
            ? t("suppliers.foreignKey")
            : t("suppliers.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("suppliers.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: Supplier) => {
      confirmDialog({
        message: t("suppliers.confirmDelete", { name: row.name }),
        header: t("suppliers.confirmDeleteTitle"),
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
        acceptClassName: "p-button-danger",
        acceptLabel: t("suppliers.yes"),
        rejectLabel: t("suppliers.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<Supplier>({
    labels: { new: t("suppliers.new"), edit: t("suppliers.edit"), delete: t("suppliers.delete") },
    handlers: { onCreate: openCreate, onEdit: openEdit, onDelete: confirmDelete },
    selection: selectedSupplier,
    setSelection: setSelectedSupplier,
  });

  useEffect(() => {
    if (selectedSupplier && !suppliers.some((s) => s.id === selectedSupplier.id)) {
      setSelectedSupplier(null);
    }
  }, [suppliers, selectedSupplier]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("suppliers.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedSupplier}
            onClick={() => {
              if (selectedSupplier) openEdit(selectedSupplier);
            }}
          >
            <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("suppliers.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedSupplier}
            onClick={() => {
              if (selectedSupplier) confirmDelete(selectedSupplier);
            }}
          >
            <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("suppliers.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("suppliers.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, openCreate, openEdit, searchTerm, selectedSupplier, setHeaderActions, t]);

  const activeBody = (row: Supplier) =>
    row.isActive ? (
      <Check
        className="h-4 w-4 text-on-surface"
        strokeWidth={1.75}
        aria-label={t("suppliers.active")}
      />
    ) : (
      <span className="text-on-surface-variant">{t("suppliers.inactive")}</span>
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
        label={t("suppliers.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("suppliers.save")}
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
          value={filteredSuppliers}
          loading={loading}
          dataKey="id"
          selection={selectedSupplier}
          onSelectionChange={(e) => setSelectedSupplier(e.value as Supplier | null)}
          onRowDoubleClick={(e) => openEdit(e.data as Supplier)}
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
          tableStyle={{ minWidth: "80rem" }}
          stateStorage="local"
          stateKey="athene-suppliers-table"
          emptyMessage={t("suppliers.empty")}
        >
          <Column field="key" header={t("suppliers.key")} sortable />
          <Column field="name" header={t("suppliers.name")} sortable />
          <Column field="customerNumber" header={t("suppliers.customerNumber")} sortable />
          <Column field="phone" header={t("suppliers.phone")} sortable />
          <Column field="email" header={t("suppliers.email")} sortable />
          <Column field="siteName" header={t("suppliers.site")} sortable body={siteColumnBody} />
          <Column
            columnKey="active"
            header={t("suppliers.active")}
            body={activeBody}
            className="w-28 text-center"
          />
          <Column
            field="createdAt"
            header={t("suppliers.createdAt")}
            body={(row: Supplier) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("suppliers.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("suppliers.updatedAt")}
            body={(row: Supplier) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("suppliers.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <AppDialog
        header={editingId ? t("suppliers.editTitle") : t("suppliers.createTitle")}
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
              htmlFor="supplier-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("suppliers.key")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="supplier-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="supplier-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("suppliers.name")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="supplier-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="supplier-customer-number"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("suppliers.customerNumber")}
            </label>
            <InputText
              id="supplier-customer-number"
              value={form.customerNumber}
              onChange={(e) => setForm((f) => ({ ...f, customerNumber: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="supplier-address"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("suppliers.address")}
            </label>
            <InputText
              id="supplier-address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="supplier-phone"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("suppliers.phone")}
            </label>
            <InputText
              id="supplier-phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="supplier-email"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("suppliers.email")}
            </label>
            <InputText
              id="supplier-email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="supplier-site"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("suppliers.site")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <Dropdown
              inputId="supplier-site"
              value={form.siteId}
              options={siteDropdownOptions}
              onChange={(e) => setForm((f) => ({ ...f, siteId: String(e.value ?? "") }))}
              placeholder={t("suppliers.sitePlaceholder")}
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
              inputId="supplier-isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: Boolean(e.checked) }))}
              className="rounded-none"
            />
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
              {t("suppliers.active")}
            </span>
          </label>
        </div>
      </AppDialog>
    </div>
  );
}
