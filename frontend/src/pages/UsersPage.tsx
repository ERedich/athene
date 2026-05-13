import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
import { Password } from "primereact/password";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";
import { useTableContextMenu } from "../lib/useTableContextMenu";

type SiteOption = {
  id: string;
  key: string;
  name: string;
  isPlant: boolean;
  colorHex: string;
};

type User = {
  id: string;
  loginName: string;
  name: string;
  workingSiteId: string;
  workingSiteKey: string;
  workingSiteName: string;
  employeeId: string | null;
  employeeKey: string | null;
  employeeName: string | null;
  employeeSiteKey: string | null;
  employeeSiteName: string | null;
  employeeSiteColorHex: string | null;
  employeeIsActive: boolean | null;
  siteIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type EmployeeOption = {
  id: string;
  key: string;
  name: string;
  siteId: string;
};

type FormState = {
  loginName: string;
  name: string;
  password: string;
  workingSiteId: string;
  additionalSiteIds: string[];
  employeeId: string | null;
};

const emptyForm = (): FormState => ({
  loginName: "",
  name: "",
  password: "",
  workingSiteId: "",
  additionalSiteIds: [],
  employeeId: null,
});

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const createActionIcon = "text-green-500/70";
const deleteActionIcon = "text-red-500";

function uniqueSiteIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** PrimeReact Dropdown may pass `optionValue` (string) or the full option object. */
function resolveEmployeeIdFromDropdownValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === "string" && id.trim().length > 0) return id.trim();
  }
  return null;
}

export function UsersPage() {
  const { t, i18n } = useTranslation();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [users, setUsers] = useState<User[]>([]);
  /** Sites the editor may set as primary (Zugriff des Bearbeiters). */
  const [primarySiteChoices, setPrimarySiteChoices] = useState<SiteOption[]>([]);
  /** Alle Buchungskreise für „Weitere BK“ und Tabellen-Anzeige. */
  const [allSites, setAllSites] = useState<SiteOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const siteLookup = useMemo(() => new Map(allSites.map((site) => [site.id, site])), [allSites]);

  const workingSiteOptions = useMemo(
    () => primarySiteChoices.filter((site) => site.isPlant),
    [primarySiteChoices],
  );

  const accessSiteOptions = useMemo(
    () => allSites.filter((site) => site.id !== form.workingSiteId),
    [allSites, form.workingSiteId],
  );

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => {
      const haystack = [
        user.loginName,
        user.name,
        user.employeeKey ?? "",
        user.employeeName ?? "",
        user.employeeSiteKey ?? "",
        user.employeeSiteName ?? "",
        user.workingSiteKey,
        user.workingSiteName,
        ...user.siteIds
          .map((id) => siteLookup.get(id))
          .filter((site): site is SiteOption => Boolean(site))
          .map((site) => `${site.key} ${site.name}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [users, searchTerm, siteLookup]);

  useEffect(() => {
    setHeaderRowCount(filteredUsers.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filteredUsers.length, setHeaderRowCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, primarySitesRes, allSitesRes, employeesRes] = await Promise.all([
        apiFetch("/api/users"),
        apiFetch("/api/sites"),
        apiFetch("/api/users/all-sites"),
        apiFetch("/api/employees"),
      ]);
      if (!usersRes.ok || !primarySitesRes.ok || !allSitesRes.ok || !employeesRes.ok) {
        throw new Error("load");
      }
      const [usersData, primarySitesData, allSitesData, employeesData] = (await Promise.all([
        usersRes.json(),
        primarySitesRes.json(),
        allSitesRes.json(),
        employeesRes.json(),
      ])) as [User[], SiteOption[], SiteOption[], EmployeeOption[]];
      setUsers(usersData);
      setPrimarySiteChoices(primarySitesData);
      setAllSites(allSitesData);
      setEmployees(employeesData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("users.loadError"),
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

  const openEdit = useCallback((row: User) => {
    setEditingId(row.id);
    setForm({
      loginName: row.loginName,
      name: row.name,
      password: "",
      workingSiteId: row.workingSiteId,
      additionalSiteIds: row.siteIds.filter((id) => id !== row.workingSiteId),
      employeeId: row.employeeId,
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
    let detail = t("users.saveError");
    if (code === "duplicate_login_name") detail = t("users.duplicateLoginName");
    if (code === "invalid_working_site") detail = t("users.invalidWorkingSite");
    if (code === "foreign_key_violation") detail = t("users.foreignKey");
    if (code === "site_mismatch") detail = t("users.errors.site_mismatch");
    if (code === "employee_already_linked") detail = t("users.errors.employee_already_linked");
    if (code === "employee_not_found") detail = t("users.foreignKey");
    if (code === "invalid_site_ids") detail = t("users.invalidSiteIds");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const loginName = form.loginName.trim();
    const name = form.name.trim();
    const workingSiteId = form.workingSiteId.trim();
    if (!loginName || !name || !workingSiteId || (!editingId && !form.password)) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("users.validationRequired"),
        life: 4000,
      });
      return;
    }

    setSaving(true);
    try {
      const siteIds = uniqueSiteIds([...form.additionalSiteIds, workingSiteId]);
      const payload: Record<string, unknown> = {
        loginName,
        name,
        workingSiteId,
        siteIds,
        employeeId: form.employeeId,
      };
      if (!editingId || form.password.length > 0) {
        payload.password = form.password;
      }

      const url = editingId ? `/api/users/${editingId}` : "/api/users";
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
        summary: editingId ? t("users.saved") : t("users.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("users.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedUser((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("users.deleted"),
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
        const detail = code === "foreign_key_violation" ? t("users.foreignKey") : t("users.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("users.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: User) => {
      confirmDialog({
        message: t("users.confirmDelete", { name: row.name }),
        header: t("users.confirmDeleteTitle"),
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
        acceptClassName: "p-button-danger",
        acceptLabel: t("users.yes"),
        rejectLabel: t("users.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<User>({
    labels: { new: t("users.new"), edit: t("users.edit"), delete: t("users.delete") },
    handlers: { onCreate: openCreate, onEdit: openEdit, onDelete: confirmDelete },
    selection: selectedUser,
    setSelection: setSelectedUser,
  });

  useEffect(() => {
    if (selectedUser && !users.some((u) => u.id === selectedUser.id)) {
      setSelectedUser(null);
    }
  }, [users, selectedUser]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("users.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedUser}
            onClick={() => {
              if (selectedUser) openEdit(selectedUser);
            }}
          >
            <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("users.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedUser}
            onClick={() => {
              if (selectedUser) confirmDelete(selectedUser);
            }}
          >
            <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("users.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("users.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, openCreate, openEdit, searchTerm, selectedUser, setHeaderActions, t]);

  const accessSitesBody = (row: User) => {
    const selectedSites = uniqueSiteIds(row.siteIds)
      .map((id) => siteLookup.get(id))
      .filter((site): site is SiteOption => Boolean(site));
    if (selectedSites.length === 0) return <span className="text-on-surface-variant">—</span>;
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {selectedSites.map((site) => {
          const hex = site.colorHex || DEFAULT_SITE_COLOR_HEX;
          const label = `${site.key} - ${site.name}`;
          return (
            <span key={site.id} className="text-xs" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
              {site.name}
            </span>
          );
        })}
      </div>
    );
  };

  const primarySiteBody = (row: User) => {
    const site = siteLookup.get(row.workingSiteId);
    const colorHex = site?.colorHex || DEFAULT_SITE_COLOR_HEX;
    const label = site ? `${site.key} - ${site.name}` : row.workingSiteName;
    return (
      <span className="truncate" style={{ color: readableSiteColor(colorHex) }} title={`${label} (${colorHex})`}>
        {label}
      </span>
    );
  };

  const employeeBody = (row: User) => {
    if (!row.employeeId || !row.employeeName) {
      return <span className="text-on-surface-variant">—</span>;
    }
    return (
      <span title={row.employeeKey ? `${row.employeeKey} - ${row.employeeName}` : row.employeeName}>
        {row.employeeKey ? `${row.employeeKey} - ${row.employeeName}` : row.employeeName}
      </span>
    );
  };

  const employeeSiteBody = (row: User) => {
    if (!row.employeeId || !row.employeeSiteName) {
      return <span className="text-on-surface-variant">—</span>;
    }
    const hex = row.employeeSiteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = row.employeeSiteKey
      ? `${row.employeeSiteKey} - ${row.employeeSiteName}`
      : row.employeeSiteName;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {label}
      </span>
    );
  };

  const employeeActiveBody = (row: User) => {
    if (!row.employeeId) return <span className="text-on-surface-variant">—</span>;
    if (row.employeeIsActive === true) {
      return (
        <Check
          className="h-4 w-4 text-green-500"
          strokeWidth={1.75}
          aria-label={t("employees.active")}
        />
      );
    }
    if (row.employeeIsActive === false) {
      return <span className="text-on-surface-variant">{t("employees.inactive")}</span>;
    }
    return <span className="text-on-surface-variant">—</span>;
  };

  const renderSiteOption = (site: SiteOption) => {
    const hex = site.colorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${site.key} - ${site.name}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {label}
      </span>
    );
  };

  const renderSelectedSiteChip = (value: string | SiteOption | undefined) => {
    const siteId =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && typeof value.id === "string"
          ? value.id
          : "";
    const site = siteLookup.get(siteId);
    if (!site) return <span>{typeof value === "string" ? value : ""}</span>;
    const hex = site.colorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${site.key} - ${site.name}`;
    return (
      <span className="mr-1 truncate text-sm" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {site.name}
      </span>
    );
  };

  const resolveSiteFromDropdownValue = (value: unknown): SiteOption | undefined => {
    if (typeof value === "string") {
      return workingSiteOptions.find((site) => site.id === value);
    }
    if (value && typeof value === "object") {
      const maybe = value as Partial<SiteOption>;
      if (typeof maybe.id === "string") {
        return workingSiteOptions.find((site) => site.id === maybe.id) ?? (maybe as SiteOption);
      }
      if (typeof maybe.key === "string" && typeof maybe.name === "string") {
        return maybe as SiteOption;
      }
    }
    return undefined;
  };

  const linkedEmployeeIds = useMemo(
    () =>
      new Set(
        users
          .filter((user) => user.id !== editingId)
          .map((user) => user.employeeId)
          .filter((employeeId): employeeId is string => Boolean(employeeId)),
      ),
    [users, editingId],
  );

  const employeeOptions = useMemo(
    () =>
      employees.filter(
        (employee) =>
          employee.siteId === form.workingSiteId &&
          (!linkedEmployeeIds.has(employee.id) || employee.id === form.employeeId),
      ),
    [employees, form.workingSiteId, form.employeeId, linkedEmployeeIds],
  );

  /** Selected MA must stay in `options`, otherwise the closed Dropdown shows no label. */
  const employeeDropdownOptions = useMemo(() => {
    const base = employeeOptions;
    const id = form.employeeId;
    if (!id) return base;
    if (base.some((o) => o.id === id)) return base;
    const fromEmployees = employees.find((e) => e.id === id);
    if (fromEmployees) return [fromEmployees, ...base];
    if (editingId) {
      const u = users.find((x) => x.id === editingId);
      if (u?.employeeId === id && (u.employeeName || u.employeeKey)) {
        return [
          {
            id,
            key: u.employeeKey ?? "",
            name: u.employeeName ?? "",
            siteId: form.workingSiteId,
          },
          ...base,
        ];
      }
    }
    return base;
  }, [employeeOptions, form.employeeId, employees, users, editingId, form.workingSiteId]);

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
        label={t("users.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("users.save")}
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
          value={filteredUsers}
          loading={loading}
          dataKey="id"
          selection={selectedUser}
          onSelectionChange={(e) => setSelectedUser(e.value as User | null)}
          onRowDoubleClick={(e) => openEdit(e.data as User)}
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
          tableStyle={{ minWidth: "88rem" }}
          stateStorage="local"
          stateKey="athene-users-table-v3"
          emptyMessage={t("users.empty")}
        >
          <Column field="loginName" header={t("users.loginName")} sortable />
          <Column field="name" header={t("users.name")} sortable className="min-w-56" />
          <Column
            field="employeeName"
            header={t("users.employee.column")}
            body={employeeBody}
            sortable
            className="min-w-56"
          />
          <Column
            field="employeeSiteName"
            header={t("users.employee.siteColumn")}
            body={employeeSiteBody}
            sortable
            className="min-w-48"
          />
          <Column
            field="employeeIsActive"
            header={t("users.employee.activeColumn")}
            body={employeeActiveBody}
            sortable
            className="min-w-28"
          />
          <Column field="workingSiteName" header={t("users.primarySite")} body={primarySiteBody} sortable />
          <Column
            columnKey="accessSites"
            header={t("users.accessSites")}
            body={accessSitesBody}
            className="min-w-72"
          />
          <Column
            field="createdAt"
            header={t("users.createdAt")}
            body={(row: User) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("users.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("users.updatedAt")}
            body={(row: User) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("users.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <Dialog
        header={editingId ? t("users.editTitle") : t("users.createTitle")}
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
              htmlFor="user-login-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("users.loginName")}
            </label>
            <InputText
              id="user-login-name"
              value={form.loginName}
              onChange={(e) => setForm((f) => ({ ...f, loginName: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="user-name" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("users.name")}
            </label>
            <InputText
              id="user-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="user-password"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {editingId ? t("users.passwordOptional") : t("users.password")}
            </label>
            <Password
              inputId="user-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full"
              inputClassName="w-full"
              toggleMask
              feedback={false}
              placeholder={editingId ? t("users.passwordOptionalPlaceholder") : ""}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="user-working-site"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("users.primarySite")}
            </label>
            <Dropdown
              inputId="user-working-site"
              value={form.workingSiteId}
              options={workingSiteOptions}
              optionLabel="name"
              optionValue="id"
              itemTemplate={renderSiteOption}
              valueTemplate={(value) => {
                const selected = resolveSiteFromDropdownValue(value);
                if (!selected) {
                  return (
                    <span className="text-on-surface-variant">{t("users.primarySitePlaceholder")}</span>
                  );
                }
                return renderSiteOption(selected);
              }}
              onChange={(e) => {
                const nextWorkingSiteId = String(e.value ?? "");
                setForm((f) => {
                  const keepEmployee =
                    f.employeeId !== null &&
                    employees.some(
                      (employee) =>
                        employee.id === f.employeeId && employee.siteId === nextWorkingSiteId,
                    );
                  return {
                    ...f,
                    workingSiteId: nextWorkingSiteId,
                    employeeId: keepEmployee ? f.employeeId : null,
                  };
                });
              }}
              placeholder={t("users.primarySitePlaceholder")}
              className="w-full"
              filter
              appendTo={overlayAppendTo}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="user-employee"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("users.employee.label")}
            </label>
            <Dropdown
              inputId="user-employee"
              value={form.employeeId}
              options={employeeDropdownOptions}
              optionLabel="name"
              optionValue="id"
              placeholder={
                form.workingSiteId
                  ? t("users.employee.selectPlaceholder")
                  : t("users.employee.placeholder")
              }
              className="w-full"
              showClear
              disabled={!form.workingSiteId}
              filter
              appendTo={overlayAppendTo}
              itemTemplate={(employee: EmployeeOption) => (
                <span>{employee.key ? `${employee.key} - ${employee.name}` : employee.name}</span>
              )}
              valueTemplate={(value) => {
                const selectedId = resolveEmployeeIdFromDropdownValue(value);
                if (!selectedId) {
                  return (
                    <span className="text-on-surface-variant">
                      {form.workingSiteId
                        ? t("users.employee.selectPlaceholder")
                        : t("users.employee.placeholder")}
                    </span>
                  );
                }
                const selected = employeeDropdownOptions.find((employee) => employee.id === selectedId);
                if (!selected) {
                  return (
                    <span className="text-on-surface-variant">
                      {form.workingSiteId
                        ? t("users.employee.selectPlaceholder")
                        : t("users.employee.placeholder")}
                    </span>
                  );
                }
                return (
                  <span>
                    {selected.key ? `${selected.key} - ${selected.name}` : selected.name}
                  </span>
                );
              }}
              onChange={(e) => {
                const nextId = resolveEmployeeIdFromDropdownValue(e.value);
                setForm((f) => ({ ...f, employeeId: nextId }));
              }}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="user-additional-sites"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("users.additionalSites")}
            </label>
            <MultiSelect
              inputId="user-additional-sites"
              value={form.additionalSiteIds}
              options={accessSiteOptions}
              optionLabel="name"
              optionValue="id"
              itemTemplate={renderSiteOption}
              selectedItemTemplate={renderSelectedSiteChip}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  additionalSiteIds: uniqueSiteIds(
                    (Array.isArray(e.value) ? e.value : []).map((v) => String(v)),
                  ).filter((id) => id !== f.workingSiteId),
                }))
              }
              placeholder={t("users.additionalSitesPlaceholder")}
              className="w-full users-site-multiselect"
              filter
              display="comma"
              appendTo={overlayAppendTo}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
