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

import type { AppShellOutletContext } from "../layout/AppShellLayout";

type SiteOption = {
  id: string;
  key: string;
  name: string;
};

type CostCenter = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
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

const apiFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, { ...init, credentials: "include" });

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

export function CostCentersPage() {
  const { t, i18n } = useTranslation();
  const { setHeaderActions } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCostCenter, setSelectedCostCenter] = useState<CostCenter | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const siteOptions = useMemo(
    () => sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
    [sites],
  );

  const filteredCostCenters = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return costCenters;
    return costCenters.filter((row) =>
      [row.key, row.name, row.siteKey, row.siteName, row.createdBy, row.updatedBy]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [costCenters, searchTerm]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [costCentersRes, sitesRes] = await Promise.all([
        apiFetch("/api/cost-centers"),
        apiFetch("/api/sites"),
      ]);
      if (!costCentersRes.ok || !sitesRes.ok) throw new Error("load");
      const [costCentersData, sitesData] = (await Promise.all([
        costCentersRes.json(),
        sitesRes.json(),
      ])) as [CostCenter[], SiteOption[]];
      setCostCenters(costCentersData);
      setSites(sitesData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("costCenters.loadError"),
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

  const openEdit = useCallback((row: CostCenter) => {
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
    let detail = t("costCenters.saveError");
    if (code === "duplicate_key") detail = t("costCenters.duplicateKey");
    if (code === "foreign_key_violation") detail = t("costCenters.foreignKey");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !siteId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("costCenters.validationRequired"),
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
      const url = editingId ? `/api/cost-centers/${editingId}` : "/api/cost-centers";
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
        summary: editingId ? t("costCenters.saved") : t("costCenters.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("costCenters.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/cost-centers/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedCostCenter((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("costCenters.deleted"),
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
            ? t("costCenters.foreignKey")
            : t("costCenters.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("costCenters.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: CostCenter) => {
      confirmDialog({
        message: t("costCenters.confirmDelete", { name: row.name }),
        header: t("costCenters.confirmDeleteTitle"),
        icon: "pi pi-exclamation-triangle",
        acceptClassName: "p-button-danger",
        acceptLabel: t("costCenters.yes"),
        rejectLabel: t("costCenters.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  useEffect(() => {
    if (selectedCostCenter && !costCenters.some((cc) => cc.id === selectedCostCenter.id)) {
      setSelectedCostCenter(null);
    }
  }, [costCenters, selectedCostCenter]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <i className={`pi pi-plus ${createActionIcon}`} aria-hidden />
            <span>{t("costCenters.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedCostCenter}
            onClick={() => {
              if (selectedCostCenter) openEdit(selectedCostCenter);
            }}
          >
            <i className={`pi pi-pencil ${primaryActionIcon}`} aria-hidden />
            <span>{t("costCenters.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedCostCenter}
            onClick={() => {
              if (selectedCostCenter) confirmDelete(selectedCostCenter);
            }}
          >
            <i className={`pi pi-trash ${deleteActionIcon}`} aria-hidden />
            <span>{t("costCenters.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <InputIcon className="pi pi-search text-xs text-on-surface-variant" />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("costCenters.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, openCreate, openEdit, searchTerm, selectedCostCenter, setHeaderActions, t]);

  const activeBody = (row: CostCenter) =>
    row.isActive ? (
      <i className="pi pi-check text-on-surface" aria-label={t("costCenters.active")} />
    ) : (
      <span className="text-on-surface-variant">{t("costCenters.inactive")}</span>
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
        label={t("costCenters.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("costCenters.save")}
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

      <div className="flex min-h-0 flex-1 flex-col">
        <DataTable
          className="app-data-table w-full"
          value={filteredCostCenters}
          loading={loading}
          dataKey="id"
          selection={selectedCostCenter}
          onSelectionChange={(e) => setSelectedCostCenter(e.value as CostCenter | null)}
          onRowDoubleClick={(e) => openEdit(e.data as CostCenter)}
          selectionMode="single"
          metaKeySelection={false}
          stripedRows
          showGridlines
          scrollable
          resizableColumns
          columnResizeMode="expand"
          scrollHeight="flex"
          tableStyle={{ minWidth: "68rem" }}
          stateStorage="local"
          stateKey="athene-cost-centers-table"
          emptyMessage={t("costCenters.empty")}
        >
          <Column field="key" header={t("costCenters.key")} sortable />
          <Column field="name" header={t("costCenters.name")} sortable />
          <Column field="siteName" header={t("costCenters.site")} sortable />
          <Column header={t("costCenters.active")} body={activeBody} className="w-28 text-center" />
          <Column
            field="createdAt"
            header={t("costCenters.createdAt")}
            body={(row: CostCenter) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("costCenters.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("costCenters.updatedAt")}
            body={(row: CostCenter) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("costCenters.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <Dialog
        header={editingId ? t("costCenters.editTitle") : t("costCenters.createTitle")}
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
              htmlFor="cost-center-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("costCenters.key")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="cost-center-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="cost-center-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("costCenters.name")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="cost-center-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="cost-center-site"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("costCenters.site")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <Dropdown
              inputId="cost-center-site"
              value={form.siteId}
              options={siteOptions}
              onChange={(e) => setForm((f) => ({ ...f, siteId: String(e.value ?? "") }))}
              placeholder={t("costCenters.sitePlaceholder")}
              className="w-full"
              filter
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <Checkbox
              inputId="cost-center-isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: Boolean(e.checked) }))}
              className="rounded-none"
            />
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
              {t("costCenters.active")}
            </span>
          </label>
        </div>
      </Dialog>
    </div>
  );
}
