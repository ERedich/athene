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

type Employee = {
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

export function EmployeesPage() {
  const { t, i18n } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
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
        return <span className="text-on-surface-variant">{t("employees.sitePlaceholder")}</span>;
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

  const siteColumnBody = useCallback((row: Employee) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {row.siteName}
      </span>
    );
  }, []);

  const filteredEmployees = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((row) =>
      [row.key, row.name, row.siteKey, row.siteName, row.siteColorHex, row.createdBy, row.updatedBy]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [employees, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filteredEmployees.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filteredEmployees.length, setHeaderRowCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [employeesRes, sitesRes] = await Promise.all([apiFetch("/api/employees"), apiFetch("/api/sites")]);
      if (!employeesRes.ok || !sitesRes.ok) throw new Error("load");
      const [employeesData, sitesData] = (await Promise.all([
        employeesRes.json(),
        sitesRes.json(),
      ])) as [Employee[], SiteOption[]];
      setEmployees(employeesData);
      setSites(sitesData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("employees.loadError"),
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

  const openEdit = useCallback((row: Employee) => {
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
    let detail = t("employees.saveError");
    if (code === "duplicate_key") detail = t("employees.duplicateKey");
    if (code === "foreign_key_violation") detail = t("employees.foreignKey");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !siteId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("employees.validationRequired"),
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
      const url = editingId ? `/api/employees/${editingId}` : "/api/employees";
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
        summary: editingId ? t("employees.saved") : t("employees.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("employees.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/employees/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedEmployee((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("employees.deleted"),
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
          code === "foreign_key_violation" ? t("employees.foreignKey") : t("employees.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("employees.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: Employee) => {
      confirmDialog({
        message: t("employees.confirmDelete", { name: row.name }),
        header: t("employees.confirmDeleteTitle"),
        icon: "pi pi-exclamation-triangle",
        acceptClassName: "p-button-danger",
        acceptLabel: t("employees.yes"),
        rejectLabel: t("employees.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<Employee>({
    labels: { new: t("employees.new"), edit: t("employees.edit"), delete: t("employees.delete") },
    handlers: { onCreate: openCreate, onEdit: openEdit, onDelete: confirmDelete },
    selection: selectedEmployee,
    setSelection: setSelectedEmployee,
  });

  useEffect(() => {
    if (selectedEmployee && !employees.some((e) => e.id === selectedEmployee.id)) {
      setSelectedEmployee(null);
    }
  }, [employees, selectedEmployee]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <i className={`pi pi-plus ${createActionIcon}`} aria-hidden />
            <span>{t("employees.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedEmployee}
            onClick={() => {
              if (selectedEmployee) openEdit(selectedEmployee);
            }}
          >
            <i className={`pi pi-pencil ${primaryActionIcon}`} aria-hidden />
            <span>{t("employees.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedEmployee}
            onClick={() => {
              if (selectedEmployee) confirmDelete(selectedEmployee);
            }}
          >
            <i className={`pi pi-trash ${deleteActionIcon}`} aria-hidden />
            <span>{t("employees.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <InputIcon className="pi pi-search text-xs text-on-surface-variant" />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("employees.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, openCreate, openEdit, searchTerm, selectedEmployee, setHeaderActions, t]);

  const activeBody = (row: Employee) =>
    row.isActive ? (
      <i className="pi pi-check text-on-surface" aria-label={t("employees.active")} />
    ) : (
      <span className="text-on-surface-variant">{t("employees.inactive")}</span>
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
        label={t("employees.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("employees.save")}
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
          value={filteredEmployees}
          loading={loading}
          dataKey="id"
          selection={selectedEmployee}
          onSelectionChange={(e) => setSelectedEmployee(e.value as Employee | null)}
          onRowDoubleClick={(e) => openEdit(e.data as Employee)}
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
          stateKey="athene-employees-table"
          emptyMessage={t("employees.empty")}
        >
          <Column field="key" header={t("employees.key")} sortable />
          <Column field="name" header={t("employees.name")} sortable />
          <Column field="siteName" header={t("employees.site")} sortable body={siteColumnBody} />
          <Column
            columnKey="active"
            header={t("employees.active")}
            body={activeBody}
            className="w-28 text-center"
          />
          <Column
            field="createdAt"
            header={t("employees.createdAt")}
            body={(row: Employee) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("employees.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("employees.updatedAt")}
            body={(row: Employee) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("employees.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <Dialog
        header={editingId ? t("employees.editTitle") : t("employees.createTitle")}
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
              htmlFor="employee-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("employees.key")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="employee-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="employee-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("employees.name")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="employee-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="employee-site"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("employees.site")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <Dropdown
              inputId="employee-site"
              value={form.siteId}
              options={siteDropdownOptions}
              onChange={(e) => setForm((f) => ({ ...f, siteId: String(e.value ?? "") }))}
              placeholder={t("employees.sitePlaceholder")}
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
              inputId="employee-isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: Boolean(e.checked) }))}
              className="rounded-none"
            />
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
              {t("employees.active")}
            </span>
          </label>
        </div>
      </Dialog>
    </div>
  );
}
