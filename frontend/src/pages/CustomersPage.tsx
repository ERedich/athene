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

type SiteOption = { id: string; key: string; name: string; colorHex: string };
type SiteDropdownOption = { label: string; value: string };

type Customer = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
};

type FormState = {
  key: string;
  name: string;
  siteId: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  contactName: string;
  phone: string;
  email: string;
  isActive: boolean;
};

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  siteId: "",
  street: "",
  zip: "",
  city: "",
  country: "",
  contactName: "",
  phone: "",
  email: "",
  isActive: true,
});

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;

export function CustomersPage() {
  const { t } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const siteLookup = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const siteDropdownOptions = useMemo<SiteDropdownOption[]>(
    () => sites.map((s) => ({ label: `${s.key} - ${s.name}`, value: s.id })),
    [sites],
  );

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((row) =>
      [row.key, row.name, row.siteKey, row.siteName, row.city, row.email, row.contactName]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [customers, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filtered.length);
    return () => setHeaderRowCount(null);
  }, [filtered.length, setHeaderRowCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [customersRes, sitesRes] = await Promise.all([apiFetch("/api/customers"), apiFetch("/api/sites")]);
      if (!customersRes.ok || !sitesRes.ok) throw new Error("load");
      setCustomers((await customersRes.json()) as Customer[]);
      setSites((await sitesRes.json()) as SiteOption[]);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("customers.loadError"), life: 6000 });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm({ ...emptyForm(), ...(siteFieldLocked ? { siteId: user.workingSiteId } : {}) });
    setDialogVisible(true);
  }, [siteFieldLocked, user.workingSiteId]);

  const openEdit = useCallback((row: Customer) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      siteId: row.siteId,
      street: row.street ?? "",
      zip: row.zip ?? "",
      city: row.city ?? "",
      country: row.country ?? "",
      contactName: row.contactName ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      isActive: row.isActive,
    });
    setDialogVisible(true);
  }, []);

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !siteId) {
      toastRef.current?.show({ severity: "warn", summary: t("customers.validationRequired"), life: 4000 });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        key,
        name,
        siteId,
        street: form.street.trim() || null,
        zip: form.zip.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        contactName: form.contactName.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        isActive: form.isActive,
      };
      const url = editingId ? `/api/customers/${editingId}` : "/api/customers";
      const res = await apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toastRef.current?.show({ severity: "error", summary: t("customers.saveError"), life: 6000 });
        return;
      }
      setDialogVisible(false);
      await loadData();
      toastRef.current?.show({
        severity: "success",
        summary: editingId ? t("customers.saved") : t("customers.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("customers.saveError"), life: 6000 });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelected((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({ severity: "success", summary: t("customers.deleted"), life: 3000 });
          return;
        }
        toastRef.current?.show({ severity: "error", summary: t("customers.deleteError"), life: 6000 });
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("customers.deleteError"), life: 6000 });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: Customer) => {
      confirmDialog({
        message: t("customers.confirmDelete", { name: row.name }),
        header: t("customers.confirmDeleteTitle"),
        icon: <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />,
        acceptClassName: "p-button-danger",
        acceptLabel: t("customers.yes"),
        rejectLabel: t("customers.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<Customer>({
    labels: { new: t("customers.new"), edit: t("customers.edit"), delete: t("customers.delete") },
    handlers: { onCreate: openCreate, onEdit: openEdit, onDelete: confirmDelete },
    selection: selected,
    setSelection: setSelected,
  });

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className="h-4 w-4 text-green-500/70" strokeWidth={1.75} aria-hidden />
            <span>{t("customers.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selected}
            onClick={() => selected && openEdit(selected)}
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            <span>{t("customers.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selected}
            onClick={() => selected && confirmDelete(selected)}
          >
            <Trash2 className="h-4 w-4 text-red-500" strokeWidth={1.75} aria-hidden />
            <span>{t("customers.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("customers.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [confirmDelete, openCreate, openEdit, searchTerm, selected, setHeaderActions, t]);

  const renderSite = (row: Customer) => {
    const hex = row.siteColorHex || siteLookup.get(row.siteId)?.colorHex || DEFAULT_SITE_COLOR_HEX;
    return (
      <span style={{ color: readableSiteColor(hex) }}>
        {row.siteKey} - {row.siteName}
      </span>
    );
  };

  return (
    <>
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />
      {tableCtx.ContextMenuEl}
      <div className="flex min-h-0 flex-1 flex-col" {...tableCtx.wrapperProps}>
        <DataTable
          value={filtered}
          loading={loading}
          selectionMode="single"
          selection={selected}
          onSelectionChange={(e) => setSelected((e.value as Customer | null) ?? null)}
          dataKey="id"
          size="small"
          stripedRows
          scrollable
          scrollHeight="flex"
          className="app-data-table app-shell-table"
          emptyMessage={t("customers.empty")}
          onRowDoubleClick={(e) => openEdit(e.data as Customer)}
          {...tableCtx.tableProps}
        >
        <Column field="key" header={t("customers.colKey")} sortable />
        <Column field="name" header={t("customers.colName")} sortable />
        <Column header={t("customers.colSite")} body={renderSite} sortable sortField="siteKey" />
        <Column field="city" header={t("customers.colCity")} sortable />
        <Column field="contactName" header={t("customers.colContact")} sortable />
        <Column field="phone" header={t("customers.colPhone")} />
        <Column field="email" header={t("customers.colEmail")} />
        <Column
          field="isActive"
          header={t("customers.colActive")}
          body={(row: Customer) => (row.isActive ? t("customers.activeYes") : t("customers.activeNo"))}
          sortable
        />
      </DataTable>
      </div>

      <AppDialog
        header={editingId ? t("customers.editTitle") : t("customers.createTitle")}
        visible={dialogVisible}
        className="app-modal-window"
        onHide={() => !saving && setDialogVisible(false)}
        modal
        dismissableMask={!saving}
        closable={!saving}
        draggable={false}
        resizable={false}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("customers.fieldKey")}</label>
            <InputText value={form.key} onChange={(e) => setForm((c) => ({ ...c, key: e.target.value }))} className="w-full" disabled={saving} />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("customers.fieldName")}</label>
            <InputText value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} className="w-full" disabled={saving} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("customers.fieldSite")}</label>
            <Dropdown
              value={form.siteId || null}
              options={siteDropdownOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => setForm((c) => ({ ...c, siteId: String(e.value ?? "") }))}
              className="w-full"
              disabled={saving || siteFieldLocked}
              filter
              appendTo={overlayAppendTo}
            />
          </div>
          {(["street", "zip", "city", "country", "contactName", "phone", "email"] as const).map((field) => (
            <div key={field} className="space-y-2">
              <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                {t(`customers.field${field.charAt(0).toUpperCase()}${field.slice(1)}`)}
              </label>
              <InputText
                value={form[field]}
                onChange={(e) => setForm((c) => ({ ...c, [field]: e.target.value }))}
                className="w-full"
                disabled={saving}
              />
            </div>
          ))}
          <div className="flex items-center gap-2 md:col-span-2">
            <Checkbox
              inputId="customer-active"
              checked={form.isActive}
              onChange={(e) => setForm((c) => ({ ...c, isActive: e.checked === true }))}
              disabled={saving}
            />
            <label htmlFor="customer-active">{t("customers.fieldActive")}</label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" label={t("customers.cancel")} severity="secondary" outlined disabled={saving} onClick={() => setDialogVisible(false)} />
          <Button type="button" label={t("customers.save")} icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />} loading={saving} onClick={() => void save()} />
        </div>
      </AppDialog>
    </>
  );
}
