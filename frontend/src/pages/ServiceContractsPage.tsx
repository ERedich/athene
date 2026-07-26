import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { AppDialog } from "../components/AppDialog";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
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

type BillingModel = "flat" | "timeAndMaterial";

type SiteOption = { id: string; key: string; name: string; colorHex: string };
type CustomerOption = { id: string; key: string; name: string; siteId: string; isActive: boolean };
type AssetOption = { id: string; key: string; name: string; siteId: string };

type ServiceContract = {
  id: string;
  key: string;
  name: string;
  customerId: string;
  customerKey: string;
  customerName: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  validFrom: string;
  validTo: string | null;
  reactionMinutes: number;
  resolutionMinutes: number;
  billingModel: BillingModel;
  hourlyRate: string | null;
  travelRate: string | null;
  materialMarkupPercent: string | null;
  flatRate: string | null;
  isActive: boolean;
  assetIds: string[];
  coveredSiteIds: string[];
};

type FormState = {
  key: string;
  name: string;
  customerId: string;
  siteId: string;
  validFrom: Date | null;
  validTo: Date | null;
  reactionMinutes: string;
  resolutionMinutes: string;
  billingModel: BillingModel;
  hourlyRate: string;
  travelRate: string;
  materialMarkupPercent: string;
  flatRate: string;
  isActive: boolean;
  assetIds: string[];
  coveredSiteIds: string[];
};

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  customerId: "",
  siteId: "",
  validFrom: new Date(),
  validTo: null,
  reactionMinutes: "240",
  resolutionMinutes: "1440",
  billingModel: "timeAndMaterial",
  hourlyRate: "",
  travelRate: "",
  materialMarkupPercent: "",
  flatRate: "",
  isActive: true,
  assetIds: [],
  coveredSiteIds: [],
});

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function ServiceContractsPage() {
  const { t, i18n } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);

  const [rows, setRows] = useState<ServiceContract[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ServiceContract | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const billingModelOptions = useMemo(
    () =>
      (["flat", "timeAndMaterial"] as const).map((value) => ({
        value,
        label: t(`serviceContracts.billingModel.${value}`),
      })),
    [t],
  );

  const siteDropdownOptions = useMemo(
    () => sites.map((s) => ({ label: `${s.key} - ${s.name}`, value: s.id })),
    [sites],
  );

  const customerOptions = useMemo(
    () =>
      customers
        .filter((c) => !form.siteId || c.siteId === form.siteId)
        .map((c) => ({ label: `${c.key} - ${c.name}`, value: c.id })),
    [customers, form.siteId],
  );

  const assetOptions = useMemo(
    () =>
      assets
        .filter((a) => !form.siteId || a.siteId === form.siteId)
        .map((a) => ({ label: `${a.key} - ${a.name}`, value: a.id })),
    [assets, form.siteId],
  );

  const coveredSiteOptions = useMemo(
    () => sites.map((s) => ({ label: `${s.key} - ${s.name}`, value: s.id })),
    [sites],
  );

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.key, row.name, row.customerKey, row.customerName, row.siteKey, row.siteName]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filtered.length);
    return () => setHeaderRowCount(null);
  }, [filtered.length, setHeaderRowCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contractsRes, sitesRes, customersRes, assetsRes] = await Promise.all([
        apiFetch("/api/service-contracts"),
        apiFetch("/api/sites"),
        apiFetch("/api/customers"),
        apiFetch("/api/assets"),
      ]);
      if (!contractsRes.ok || !sitesRes.ok || !customersRes.ok || !assetsRes.ok) throw new Error("load");
      setRows((await contractsRes.json()) as ServiceContract[]);
      setSites((await sitesRes.json()) as SiteOption[]);
      setCustomers((await customersRes.json()) as CustomerOption[]);
      setAssets((await assetsRes.json()) as AssetOption[]);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("serviceContracts.loadError"), life: 6000 });
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

  const openEdit = useCallback((row: ServiceContract) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      customerId: row.customerId,
      siteId: row.siteId,
      validFrom: row.validFrom ? new Date(row.validFrom) : new Date(),
      validTo: row.validTo ? new Date(row.validTo) : null,
      reactionMinutes: String(row.reactionMinutes),
      resolutionMinutes: String(row.resolutionMinutes),
      billingModel: row.billingModel,
      hourlyRate: row.hourlyRate ?? "",
      travelRate: row.travelRate ?? "",
      materialMarkupPercent: row.materialMarkupPercent ?? "",
      flatRate: row.flatRate ?? "",
      isActive: row.isActive,
      assetIds: [...row.assetIds],
      coveredSiteIds: [...row.coveredSiteIds],
    });
    setDialogVisible(true);
  }, []);

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const customerId = form.customerId.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !customerId || !siteId || !form.validFrom) {
      toastRef.current?.show({ severity: "warn", summary: t("serviceContracts.validationRequired"), life: 4000 });
      return;
    }
    const reactionMinutes = Number(form.reactionMinutes);
    const resolutionMinutes = Number(form.resolutionMinutes);
    if (!Number.isFinite(reactionMinutes) || !Number.isFinite(resolutionMinutes)) {
      toastRef.current?.show({ severity: "warn", summary: t("serviceContracts.validationSla"), life: 4000 });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        key,
        name,
        customerId,
        siteId,
        validFrom: form.validFrom.toISOString(),
        validTo: form.validTo ? form.validTo.toISOString() : null,
        reactionMinutes,
        resolutionMinutes,
        billingModel: form.billingModel,
        hourlyRate: parseOptionalNumber(form.hourlyRate),
        travelRate: parseOptionalNumber(form.travelRate),
        materialMarkupPercent: parseOptionalNumber(form.materialMarkupPercent),
        flatRate: parseOptionalNumber(form.flatRate),
        isActive: form.isActive,
        assetIds: form.assetIds,
        coveredSiteIds: form.coveredSiteIds,
      };
      const url = editingId ? `/api/service-contracts/${editingId}` : "/api/service-contracts";
      const res = await apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toastRef.current?.show({ severity: "error", summary: t("serviceContracts.saveError"), life: 6000 });
        return;
      }
      setDialogVisible(false);
      await loadData();
      toastRef.current?.show({
        severity: "success",
        summary: editingId ? t("serviceContracts.saved") : t("serviceContracts.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("serviceContracts.saveError"), life: 6000 });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/service-contracts/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelected((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({ severity: "success", summary: t("serviceContracts.deleted"), life: 3000 });
          return;
        }
        toastRef.current?.show({ severity: "error", summary: t("serviceContracts.deleteError"), life: 6000 });
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("serviceContracts.deleteError"), life: 6000 });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: ServiceContract) => {
      confirmDialog({
        message: t("serviceContracts.confirmDelete", { name: row.name }),
        header: t("serviceContracts.confirmDeleteTitle"),
        icon: <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />,
        acceptClassName: "p-button-danger",
        acceptLabel: t("serviceContracts.yes"),
        rejectLabel: t("serviceContracts.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<ServiceContract>({
    labels: { new: t("serviceContracts.new"), edit: t("serviceContracts.edit"), delete: t("serviceContracts.delete") },
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
            <span>{t("serviceContracts.new")}</span>
          </button>
        </li>
        <li>
          <button type="button" className={primaryActionNavItem} disabled={!selected} onClick={() => selected && openEdit(selected)}>
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            <span>{t("serviceContracts.edit")}</span>
          </button>
        </li>
        <li>
          <button type="button" className={deleteActionNavItem} disabled={!selected} onClick={() => selected && confirmDelete(selected)}>
            <Trash2 className="h-4 w-4 text-red-500" strokeWidth={1.75} aria-hidden />
            <span>{t("serviceContracts.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("serviceContracts.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [confirmDelete, openCreate, openEdit, searchTerm, selected, setHeaderActions, t]);

  const renderSite = (row: ServiceContract) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    return (
      <span style={{ color: readableSiteColor(hex) }}>
        {row.siteKey} - {row.siteName}
      </span>
    );
  };

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(i18n.language);
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
          onSelectionChange={(e) => setSelected((e.value as ServiceContract | null) ?? null)}
          dataKey="id"
          size="small"
          stripedRows
          scrollable
          scrollHeight="flex"
          className="app-data-table app-shell-table"
          emptyMessage={t("serviceContracts.empty")}
          onRowDoubleClick={(e) => openEdit(e.data as ServiceContract)}
          {...tableCtx.tableProps}
        >
        <Column field="key" header={t("serviceContracts.colKey")} sortable />
        <Column field="name" header={t("serviceContracts.colName")} sortable />
        <Column field="customerName" header={t("serviceContracts.colCustomer")} sortable />
        <Column header={t("serviceContracts.colSite")} body={renderSite} sortable sortField="siteKey" />
        <Column
          header={t("serviceContracts.colBillingModel")}
          body={(row: ServiceContract) => t(`serviceContracts.billingModel.${row.billingModel}`)}
          sortable
          sortField="billingModel"
        />
        <Column field="reactionMinutes" header={t("serviceContracts.colReaction")} sortable />
        <Column field="resolutionMinutes" header={t("serviceContracts.colResolution")} sortable />
        <Column header={t("serviceContracts.colValidFrom")} body={(row: ServiceContract) => formatDate(row.validFrom)} sortable sortField="validFrom" />
        <Column header={t("serviceContracts.colValidTo")} body={(row: ServiceContract) => formatDate(row.validTo)} sortable sortField="validTo" />
      </DataTable>
      </div>

      <AppDialog
        header={editingId ? t("serviceContracts.editTitle") : t("serviceContracts.createTitle")}
        visible={dialogVisible}
        className="app-modal-window app-modal-window--wide"
        onHide={() => !saving && setDialogVisible(false)}
        modal
        dismissableMask={!saving}
        closable={!saving}
        draggable={false}
        resizable={false}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldKey")}</label>
            <InputText value={form.key} onChange={(e) => setForm((c) => ({ ...c, key: e.target.value }))} className="w-full" disabled={saving} />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldName")}</label>
            <InputText value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} className="w-full" disabled={saving} />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldSite")}</label>
            <Dropdown
              value={form.siteId || null}
              options={siteDropdownOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e) =>
                setForm((c) => ({
                  ...c,
                  siteId: String(e.value ?? ""),
                  customerId: "",
                  assetIds: [],
                  coveredSiteIds: [],
                }))
              }
              className="w-full"
              disabled={saving || siteFieldLocked}
              filter
              appendTo={overlayAppendTo}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldCustomer")}</label>
            <Dropdown
              value={form.customerId || null}
              options={customerOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => setForm((c) => ({ ...c, customerId: String(e.value ?? "") }))}
              className="w-full"
              disabled={saving || !form.siteId}
              filter
              appendTo={overlayAppendTo}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldValidFrom")}</label>
            <Calendar value={form.validFrom} onChange={(e) => setForm((c) => ({ ...c, validFrom: e.value instanceof Date ? e.value : null }))} className="w-full" disabled={saving} appendTo={overlayAppendTo} />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldValidTo")}</label>
            <Calendar value={form.validTo} onChange={(e) => setForm((c) => ({ ...c, validTo: e.value instanceof Date ? e.value : null }))} className="w-full" disabled={saving} appendTo={overlayAppendTo} />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldReactionMinutes")}</label>
            <InputText value={form.reactionMinutes} onChange={(e) => setForm((c) => ({ ...c, reactionMinutes: e.target.value }))} className="w-full" disabled={saving} />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldResolutionMinutes")}</label>
            <InputText value={form.resolutionMinutes} onChange={(e) => setForm((c) => ({ ...c, resolutionMinutes: e.target.value }))} className="w-full" disabled={saving} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldBillingModel")}</label>
            <Dropdown
              value={form.billingModel}
              options={billingModelOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => setForm((c) => ({ ...c, billingModel: (e.value as BillingModel) ?? "timeAndMaterial" }))}
              className="w-full"
              disabled={saving}
              appendTo={overlayAppendTo}
            />
          </div>
          {form.billingModel === "timeAndMaterial" ? (
            <>
              <div className="space-y-2">
                <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldHourlyRate")}</label>
                <InputText value={form.hourlyRate} onChange={(e) => setForm((c) => ({ ...c, hourlyRate: e.target.value }))} className="w-full" disabled={saving} />
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldTravelRate")}</label>
                <InputText value={form.travelRate} onChange={(e) => setForm((c) => ({ ...c, travelRate: e.target.value }))} className="w-full" disabled={saving} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldMaterialMarkupPercent")}</label>
                <InputText value={form.materialMarkupPercent} onChange={(e) => setForm((c) => ({ ...c, materialMarkupPercent: e.target.value }))} className="w-full" disabled={saving} />
              </div>
            </>
          ) : (
            <div className="space-y-2 md:col-span-2">
              <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldFlatRate")}</label>
              <InputText value={form.flatRate} onChange={(e) => setForm((c) => ({ ...c, flatRate: e.target.value }))} className="w-full" disabled={saving} />
            </div>
          )}
          <div className="space-y-2 md:col-span-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldAssetIds")}</label>
            <MultiSelect
              value={form.assetIds}
              options={assetOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => setForm((c) => ({ ...c, assetIds: (e.value as string[] | null) ?? [] }))}
              className="w-full"
              filter
              display="chip"
              disabled={saving || !form.siteId}
              appendTo={overlayAppendTo}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">{t("serviceContracts.fieldCoveredSiteIds")}</label>
            <MultiSelect
              value={form.coveredSiteIds}
              options={coveredSiteOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => setForm((c) => ({ ...c, coveredSiteIds: (e.value as string[] | null) ?? [] }))}
              className="w-full"
              filter
              display="chip"
              disabled={saving}
              appendTo={overlayAppendTo}
            />
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <Checkbox inputId="contract-active" checked={form.isActive} onChange={(e) => setForm((c) => ({ ...c, isActive: e.checked === true }))} disabled={saving} />
            <label htmlFor="contract-active">{t("serviceContracts.fieldActive")}</label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" label={t("serviceContracts.cancel")} severity="secondary" outlined disabled={saving} onClick={() => setDialogVisible(false)} />
          <Button type="button" label={t("serviceContracts.save")} icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />} loading={saving} onClick={() => void save()} />
        </div>
      </AppDialog>
    </>
  );
}
