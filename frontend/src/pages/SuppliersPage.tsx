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
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";

import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";
import type { AppLayout } from "../lib/layoutEditor/api";
import { fetchActiveAppLayout } from "../lib/layoutEditor/api";
import {
  coerceWidgetValueToStorage,
  formatStorageForTable,
  storageToCheckbox,
  storageToDate,
} from "../lib/layoutEditor/dynamicFieldValue";
import {
  getFieldCatalog,
  normalizeModalPayload,
  resolveColumnWidget,
  SUPPLIER_DYNAMIC_FIELD_KEYS,
  type FieldWidget,
  type ModalColumnDef,
  type ModalLayoutPayload,
  type TableLayoutPayload,
} from "../lib/layoutEditor/types";
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

type SiteDropdownOption = { label: string; value: string };

type DynamicFields = Record<(typeof SUPPLIER_DYNAMIC_FIELD_KEYS)[number], string | null>;

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
} & DynamicFields;

type FormState = {
  key: string;
  name: string;
  siteId: string;
  customerNumber: string;
  address: string;
  phone: string;
  email: string;
  isActive: boolean;
} & Record<(typeof SUPPLIER_DYNAMIC_FIELD_KEYS)[number], string>;

const emptyDynamicFields = (): Record<(typeof SUPPLIER_DYNAMIC_FIELD_KEYS)[number], string> => {
  const out = {} as Record<(typeof SUPPLIER_DYNAMIC_FIELD_KEYS)[number], string>;
  for (const key of SUPPLIER_DYNAMIC_FIELD_KEYS) out[key] = "";
  return out;
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
  ...emptyDynamicFields(),
});

const FALLBACK_MODAL: ModalLayoutPayload = {
  version: 1,
  rows: [
    {
      id: "r-key",
      columns: [
        {
          id: "c-key",
          fieldKey: "key",
          kind: "field",
          label: null,
          widget: null,
          span: 12,
          required: true,
          readonly: false,
          visible: true,
        },
      ],
    },
    {
      id: "r-name",
      columns: [
        {
          id: "c-name",
          fieldKey: "name",
          kind: "field",
          label: null,
          widget: null,
          span: 12,
          required: true,
          readonly: false,
          visible: true,
        },
      ],
    },
    {
      id: "r-customerNumber",
      columns: [
        {
          id: "c-customerNumber",
          fieldKey: "customerNumber",
          kind: "field",
          label: null,
          widget: null,
          span: 12,
          required: false,
          readonly: false,
          visible: true,
        },
      ],
    },
    {
      id: "r-address",
      columns: [
        {
          id: "c-address",
          fieldKey: "address",
          kind: "field",
          label: null,
          widget: null,
          span: 12,
          required: false,
          readonly: false,
          visible: true,
        },
      ],
    },
    {
      id: "r-phone",
      columns: [
        {
          id: "c-phone",
          fieldKey: "phone",
          kind: "field",
          label: null,
          widget: null,
          span: 12,
          required: false,
          readonly: false,
          visible: true,
        },
      ],
    },
    {
      id: "r-email",
      columns: [
        {
          id: "c-email",
          fieldKey: "email",
          kind: "field",
          label: null,
          widget: null,
          span: 12,
          required: false,
          readonly: false,
          visible: true,
        },
      ],
    },
    {
      id: "r-siteId",
      columns: [
        {
          id: "c-siteId",
          fieldKey: "siteId",
          kind: "field",
          label: null,
          widget: null,
          span: 12,
          required: true,
          readonly: false,
          visible: true,
        },
      ],
    },
    {
      id: "r-isActive",
      columns: [
        {
          id: "c-isActive",
          fieldKey: "isActive",
          kind: "field",
          label: null,
          widget: null,
          span: 12,
          required: false,
          readonly: false,
          visible: true,
        },
      ],
    },
  ],
};

const FALLBACK_TABLE: TableLayoutPayload = {
  version: 1,
  columns: [
    { fieldKey: "key", width: null, visible: true, sortable: true, frozen: false },
    { fieldKey: "name", width: null, visible: true, sortable: true, frozen: false },
    { fieldKey: "customerNumber", width: null, visible: true, sortable: true, frozen: false },
    { fieldKey: "phone", width: null, visible: true, sortable: true, frozen: false },
    { fieldKey: "email", width: null, visible: true, sortable: true, frozen: false },
    { fieldKey: "siteName", width: null, visible: true, sortable: true, frozen: false },
    { fieldKey: "isActive", width: null, visible: true, sortable: false, frozen: false },
    { fieldKey: "createdAt", width: null, visible: true, sortable: true, frozen: false },
    { fieldKey: "createdBy", width: null, visible: true, sortable: true, frozen: false },
    { fieldKey: "updatedAt", width: null, visible: true, sortable: true, frozen: false },
    { fieldKey: "updatedBy", width: null, visible: true, sortable: true, frozen: false },
  ],
  sort: [],
  groupBy: [],
};

function findModalColumn(
  modal: ModalLayoutPayload,
  fieldKey: string,
): ModalColumnDef | undefined {
  for (const row of modal.rows) {
    for (const col of row.columns) {
      if (col.fieldKey === fieldKey) return col;
    }
  }
  return undefined;
}

export function SuppliersPage() {
  const { t, i18n } = useTranslation();
  const crud = useAppCrud("suppliers");
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const catalog = useMemo(() => getFieldCatalog("suppliers"), []);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [activeLayout, setActiveLayout] = useState<AppLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const modal = useMemo(
    () => normalizeModalPayload(activeLayout?.modal ?? FALLBACK_MODAL),
    [activeLayout],
  );
  const tableLayout = activeLayout?.table ?? FALLBACK_TABLE;

  const siteDropdownOptions = useMemo<SiteDropdownOption[]>(
    () => sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
    [sites],
  );

  const fieldDisplayLabel = useCallback(
    (fieldKey: string) => {
      const col = findModalColumn(modal, fieldKey);
      const custom = col?.label?.trim();
      if (custom) return custom;
      const def = catalog.find((f) => f.fieldKey === fieldKey);
      return def ? t(def.labelKey) : fieldKey;
    },
    [catalog, modal, t],
  );

  const fieldWidget = useCallback(
    (fieldKey: string): FieldWidget => {
      const col = findModalColumn(modal, fieldKey);
      if (col) return resolveColumnWidget(col, catalog);
      return catalog.find((f) => f.fieldKey === fieldKey)?.widget ?? "text";
    },
    [catalog, modal],
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
    return suppliers.filter((row) => {
      const base = [
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
        ...SUPPLIER_DYNAMIC_FIELD_KEYS.map((k) => row[k as keyof Supplier]),
      ];
      return base
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
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
      const [suppliersRes, sitesRes, layoutResult] = await Promise.all([
        apiFetch("/api/suppliers"),
        apiFetch("/api/sites"),
        fetchActiveAppLayout(user.workingSiteId, "suppliers").catch(() => null),
      ]);
      if (!suppliersRes.ok || !sitesRes.ok) throw new Error("load");
      const [suppliersData, sitesData] = (await Promise.all([
        suppliersRes.json(),
        sitesRes.json(),
      ])) as [Supplier[], SiteOption[]];
      setSuppliers(suppliersData);
      setSites(sitesData);
      setActiveLayout(layoutResult);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("suppliers.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [t, user.workingSiteId]);

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
    const dynamic = emptyDynamicFields();
    for (const key of SUPPLIER_DYNAMIC_FIELD_KEYS) {
      const v = row[key];
      dynamic[key] = v == null ? "" : String(v);
    }
    setForm({
      key: row.key,
      name: row.name,
      siteId: row.siteId,
      customerNumber: row.customerNumber ?? "",
      address: row.address ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      isActive: row.isActive,
      ...dynamic,
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
      const dynamicPayload = {} as DynamicFields;
      for (const fieldKey of SUPPLIER_DYNAMIC_FIELD_KEYS) {
        const widget = fieldWidget(fieldKey);
        dynamicPayload[fieldKey] = coerceWidgetValueToStorage(
          widget,
          form[fieldKey],
        );
      }
      const payload = {
        key,
        name,
        siteId,
        customerNumber: form.customerNumber.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        isActive: form.isActive,
        ...dynamicPayload,
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
    handlers: {
      onCreate: crud.canCreate ? openCreate : undefined,
      onEdit: crud.canUpdate ? openEdit : undefined,
      onDelete: crud.canDelete ? confirmDelete : undefined,
    },
    canCreate: crud.canCreate,
    canEdit: crud.canUpdate,
    canDelete: crud.canDelete,
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
        {crud.canCreate ? (
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("suppliers.new")}</span>
          </button>
          </li>
        ) : null}
        {crud.canUpdate ? (
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
        ) : null}
        {crud.canDelete ? (
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
        ) : null}
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
  }, [confirmDelete, crud.canCreate, crud.canDelete, crud.canUpdate, openCreate, openEdit, searchTerm, selectedSupplier, setHeaderActions, t]);

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

  const setFormField = (fieldKey: string, value: string | boolean) => {
    setForm((f) => ({ ...f, [fieldKey]: value }));
  };

  const renderFormField = (col: ModalColumnDef) => {
    if (!col.fieldKey || !col.visible) return null;
    const fieldKey = col.fieldKey;
    const widget = resolveColumnWidget(col, catalog);
    const label = fieldDisplayLabel(fieldKey);
    const required = col.required || fieldKey === "key" || fieldKey === "name" || fieldKey === "siteId";
    const readonly = col.readonly || (fieldKey === "siteId" && siteFieldLocked);
    const id = `supplier-${fieldKey}`;

    if (widget === "checkbox" || fieldKey === "isActive") {
      const checked =
        fieldKey === "isActive"
          ? form.isActive
          : storageToCheckbox(form[fieldKey as keyof FormState]);
      return (
        <label className="flex cursor-pointer items-center gap-3">
          <Checkbox
            inputId={id}
            checked={checked}
            disabled={readonly}
            onChange={(e) => {
              if (fieldKey === "isActive") {
                setFormField("isActive", Boolean(e.checked));
              } else {
                setFormField(fieldKey, e.checked ? "true" : "false");
              }
            }}
          />
          <span className="text-[11px] uppercase tracking-wide text-on-surface-variant">
            {label}
            {required ? <span className="app-required-marker">*</span> : null}
          </span>
        </label>
      );
    }

    if (widget === "siteDropdown" || fieldKey === "siteId") {
      return (
        <div className="space-y-2">
          <label htmlFor={id} className="block text-[11px] uppercase tracking-[0.1em] text-outline">
            {label}
            {required ? <span className="app-required-marker">*</span> : null}
          </label>
          <Dropdown
            inputId={id}
            value={form.siteId}
            options={siteDropdownOptions}
            onChange={(e) => setFormField("siteId", String(e.value ?? ""))}
            placeholder={t("suppliers.sitePlaceholder")}
            className="w-full app-inline-icon-dropdown"
            itemTemplate={renderSiteDropdownOption}
            valueTemplate={renderSiteDropdownValue}
            filter
            disabled={readonly}
            appendTo={overlayAppendTo}
          />
        </div>
      );
    }

    if (widget === "datetime") {
      return (
        <div className="space-y-2">
          <label htmlFor={id} className="block text-[11px] uppercase tracking-[0.1em] text-outline">
            {label}
            {required ? <span className="app-required-marker">*</span> : null}
          </label>
          <Calendar
            inputId={id}
            value={storageToDate(form[fieldKey as keyof FormState])}
            onChange={(e) => {
              const d = e.value instanceof Date ? e.value : null;
              setFormField(fieldKey, d && !Number.isNaN(d.getTime()) ? d.toISOString() : "");
            }}
            showTime
            hourFormat="24"
            disabled={readonly}
            className="w-full"
            inputClassName="w-full"
            appendTo={overlayAppendTo}
          />
        </div>
      );
    }

    const textValue = String(form[fieldKey as keyof FormState] ?? "");
    return (
      <div className="space-y-2">
        <label htmlFor={id} className="block text-[11px] uppercase tracking-[0.1em] text-outline">
          {label}
          {required ? <span className="app-required-marker">*</span> : null}
        </label>
        <InputText
          id={id}
          value={textValue}
          onChange={(e) => setFormField(fieldKey, e.target.value)}
          className="w-full"
          disabled={readonly}
          type={widget === "email" ? "email" : "text"}
          autoComplete={widget === "email" ? "email" : "off"}
        />
      </div>
    );
  };

  const renderTableBody = (fieldKey: string, row: Supplier) => {
    if (fieldKey === "siteName") return siteColumnBody(row);
    if (fieldKey === "isActive") {
      return row.isActive ? (
        <Check
          className="h-4 w-4 text-on-surface"
          strokeWidth={1.75}
          aria-label={t("suppliers.active")}
        />
      ) : (
        <span className="text-on-surface-variant">{t("suppliers.inactive")}</span>
      );
    }
    if (fieldKey === "createdAt" || fieldKey === "updatedAt") {
      return formatShortDt(String(row[fieldKey as keyof Supplier] ?? ""));
    }
    const widget = fieldWidget(fieldKey);
    const raw = row[fieldKey as keyof Supplier];
    if (SUPPLIER_DYNAMIC_FIELD_KEYS.includes(fieldKey as (typeof SUPPLIER_DYNAMIC_FIELD_KEYS)[number])) {
      return formatStorageForTable(widget, raw, i18n.language);
    }
    if (widget === "checkbox") {
      return formatStorageForTable("checkbox", raw, i18n.language);
    }
    return raw == null ? "" : String(raw);
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

  const visibleTableColumns = tableLayout.columns.filter((c) => c.visible);

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
          {visibleTableColumns.map((col) => (
            <Column
              key={col.fieldKey}
              field={col.fieldKey}
              header={fieldDisplayLabel(col.fieldKey)}
              sortable={col.sortable}
              frozen={Boolean(col.frozen)}
              alignFrozen={col.frozen === "left" || col.frozen === "right" ? col.frozen : undefined}
              style={col.width ? { width: col.width } : undefined}
              body={(row: Supplier) => renderTableBody(col.fieldKey, row)}
              className={
                col.fieldKey === "isActive"
                  ? "w-28 text-center"
                  : col.fieldKey === "createdAt" ||
                      col.fieldKey === "updatedAt" ||
                      col.fieldKey === "createdBy" ||
                      col.fieldKey === "updatedBy"
                    ? "whitespace-nowrap text-on-surface-variant"
                    : undefined
              }
            />
          ))}
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
          {modal.rows.map((row) => {
            const cols = row.columns.filter(
              (c) => c.visible && (c.kind === "spacer" || c.fieldKey),
            );
            if (cols.length === 0) return null;
            return (
              <div key={row.id} className="grid grid-cols-12 gap-3">
                {cols.map((col) => (
                  <div
                    key={col.id}
                    style={{
                      gridColumn: `span ${Math.min(12, Math.max(1, col.span))} / span ${Math.min(12, Math.max(1, col.span))}`,
                    }}
                  >
                    {col.kind === "spacer" ? <div aria-hidden /> : renderFormField(col)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </AppDialog>
    </div>
  );
}
