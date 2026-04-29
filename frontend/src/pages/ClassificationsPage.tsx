import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

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

type Classification = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  appliesToMaterial: boolean;
  appliesToAsset: boolean;
  appliesToWorkOrder: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type FormState = {
  key: string;
  name: string;
  siteId: string;
  appliesToMaterial: boolean;
  appliesToAsset: boolean;
  appliesToWorkOrder: boolean;
};

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  siteId: "",
  appliesToMaterial: false,
  appliesToAsset: false,
  appliesToWorkOrder: false,
});

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const deleteActionIcon = "text-red-500";

export function ClassificationsPage() {
  const { t, i18n } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClassification, setSelectedClassification] = useState<Classification | null>(null);
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
        return <span className="text-on-surface-variant">{t("classifications.sitePlaceholder")}</span>;
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

  const siteColumnBody = useCallback((row: Classification) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {row.siteName}
      </span>
    );
  }, []);

  const filteredClassifications = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return classifications;
    return classifications.filter((row) =>
      [row.key, row.name, row.siteKey, row.siteName, row.createdBy, row.updatedBy].join(" ").toLowerCase().includes(q),
    );
  }, [classifications, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filteredClassifications.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filteredClassifications.length, setHeaderRowCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [classRes, sitesRes] = await Promise.all([
        apiFetch("/api/classifications"),
        apiFetch("/api/sites"),
      ]);
      if (!classRes.ok || !sitesRes.ok) throw new Error("load");
      const [classData, sitesData] = (await Promise.all([classRes.json(), sitesRes.json()])) as [
        Classification[],
        SiteOption[],
      ];
      setClassifications(classData);
      setSites(sitesData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("classifications.loadError"),
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

  const openEdit = useCallback((row: Classification) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      siteId: row.siteId,
      appliesToMaterial: row.appliesToMaterial,
      appliesToAsset: row.appliesToAsset,
      appliesToWorkOrder: row.appliesToWorkOrder,
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
    let detail = t("classifications.saveError");
    if (code === "duplicate_key") detail = t("classifications.duplicateKey");
    if (code === "foreign_key_violation") detail = t("classifications.foreignKey");
    if (code === "classification_scope_required") detail = t("classifications.scopeRequired");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !siteId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("classifications.validationRequired"),
        life: 4000,
      });
      return;
    }
    if (!form.appliesToMaterial && !form.appliesToAsset && !form.appliesToWorkOrder) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("classifications.scopeRequired"),
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
        appliesToMaterial: form.appliesToMaterial,
        appliesToAsset: form.appliesToAsset,
        appliesToWorkOrder: form.appliesToWorkOrder,
      };
      const url = editingId ? `/api/classifications/${editingId}` : "/api/classifications";
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
        summary: editingId ? t("classifications.saved") : t("classifications.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("classifications.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/classifications/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedClassification((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("classifications.deleted"),
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
            ? t("classifications.foreignKey")
            : t("classifications.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("classifications.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: Classification) => {
      confirmDialog({
        message: t("classifications.confirmDelete", { name: row.name }),
        header: t("classifications.confirmDeleteTitle"),
        icon: "pi pi-exclamation-triangle",
        acceptClassName: "p-button-danger",
        acceptLabel: t("classifications.yes"),
        rejectLabel: t("classifications.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<Classification>({
    labels: {
      new: t("classifications.new"),
      edit: t("classifications.edit"),
      delete: t("classifications.delete"),
    },
    handlers: { onCreate: openCreate, onEdit: openEdit, onDelete: confirmDelete },
    selection: selectedClassification,
    setSelection: setSelectedClassification,
  });

  useEffect(() => {
    if (selectedClassification && !classifications.some((c) => c.id === selectedClassification.id)) {
      setSelectedClassification(null);
    }
  }, [classifications, selectedClassification]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <i className={`pi pi-plus ${createActionIcon}`} aria-hidden />
            <span>{t("classifications.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedClassification}
            onClick={() => {
              if (selectedClassification) openEdit(selectedClassification);
            }}
          >
            <i className={`pi pi-pencil ${primaryActionIcon}`} aria-hidden />
            <span>{t("classifications.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedClassification}
            onClick={() => {
              if (selectedClassification) confirmDelete(selectedClassification);
            }}
          >
            <i className={`pi pi-trash ${deleteActionIcon}`} aria-hidden />
            <span>{t("classifications.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <InputIcon className="pi pi-search text-xs text-on-surface-variant" />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("classifications.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, openCreate, openEdit, searchTerm, selectedClassification, setHeaderActions, t]);

  const flagBody = (on: boolean, label: string) =>
    on ? (
      <i className="pi pi-check text-on-surface" aria-label={label} />
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

  const dialogFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("classifications.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("classifications.save")}
        icon="pi pi-check"
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
          value={filteredClassifications}
          loading={loading}
          dataKey="id"
          selection={selectedClassification}
          onSelectionChange={(e) => setSelectedClassification(e.value as Classification | null)}
          onRowDoubleClick={(e) => openEdit(e.data as Classification)}
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
          stateKey="athene-classifications-table"
          emptyMessage={t("classifications.empty")}
        >
          <Column field="key" header={t("classifications.key")} sortable />
          <Column field="name" header={t("classifications.name")} sortable />
          <Column field="siteName" header={t("classifications.site")} sortable body={siteColumnBody} />
          <Column
            columnKey="material"
            header={t("classifications.colMaterial")}
            body={(row: Classification) => flagBody(row.appliesToMaterial, t("classifications.colMaterial"))}
            className="w-24 text-center"
          />
          <Column
            columnKey="asset"
            header={t("classifications.colAsset")}
            body={(row: Classification) => flagBody(row.appliesToAsset, t("classifications.colAsset"))}
            className="w-24 text-center"
          />
          <Column
            columnKey="workOrder"
            header={t("classifications.colWorkOrder")}
            body={(row: Classification) => flagBody(row.appliesToWorkOrder, t("classifications.colWorkOrder"))}
            className="w-24 text-center"
          />
          <Column
            field="createdAt"
            header={t("classifications.createdAt")}
            body={(row: Classification) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("classifications.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("classifications.updatedAt")}
            body={(row: Classification) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("classifications.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <Dialog
        header={editingId ? t("classifications.editTitle") : t("classifications.createTitle")}
        visible={dialogVisible}
        style={{ width: "min(36rem, 95vw)" }}
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
              htmlFor="classification-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("classifications.key")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="classification-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="classification-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("classifications.name")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="classification-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="classification-site"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("classifications.site")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <Dropdown
              inputId="classification-site"
              value={form.siteId}
              options={siteDropdownOptions}
              onChange={(e) => setForm((f) => ({ ...f, siteId: String(e.value ?? "") }))}
              placeholder={t("classifications.sitePlaceholder")}
              className="w-full app-inline-icon-dropdown"
              itemTemplate={renderSiteDropdownOption}
              valueTemplate={renderSiteDropdownValue}
              filter
              disabled={siteFieldLocked}
              appendTo={overlayAppendTo}
            />
          </div>
          <fieldset className="m-0 space-y-3 border-0 p-0">
            <legend className="sr-only">{t("classifications.scopeLegend")}</legend>
            <p className="m-0 text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("classifications.scopeHint")}
            </p>
            <label className="flex items-center gap-3 cursor-pointer group">
              <Checkbox
                inputId="classification-material"
                checked={form.appliesToMaterial}
                onChange={(e) => setForm((f) => ({ ...f, appliesToMaterial: Boolean(e.checked) }))}
                className="rounded-none"
              />
              <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
                {t("classifications.colMaterial")}
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <Checkbox
                inputId="classification-asset"
                checked={form.appliesToAsset}
                onChange={(e) => setForm((f) => ({ ...f, appliesToAsset: Boolean(e.checked) }))}
                className="rounded-none"
              />
              <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
                {t("classifications.colAsset")}
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <Checkbox
                inputId="classification-work-order"
                checked={form.appliesToWorkOrder}
                onChange={(e) => setForm((f) => ({ ...f, appliesToWorkOrder: Boolean(e.checked) }))}
                className="rounded-none"
              />
              <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
                {t("classifications.colWorkOrder")}
              </span>
            </label>
          </fieldset>
        </div>
      </Dialog>
    </div>
  );
}
