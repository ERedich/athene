import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
import { Password } from "primereact/password";
import { Toast } from "primereact/toast";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";

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
  siteIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type FormState = {
  loginName: string;
  name: string;
  password: string;
  workingSiteId: string;
  additionalSiteIds: string[];
};

const emptyForm = (): FormState => ({
  loginName: "",
  name: "",
  password: "",
  workingSiteId: "",
  additionalSiteIds: [],
});

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const deleteActionIcon = "text-red-500";

function uniqueSiteIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function UsersPage() {
  const { t, i18n } = useTranslation();
  const { setHeaderActions } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const siteLookup = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);

  const workingSiteOptions = useMemo(
    () => sites.filter((site) => site.isPlant),
    [sites],
  );

  const accessSiteOptions = useMemo(
    () => sites.filter((site) => site.id !== form.workingSiteId),
    [sites, form.workingSiteId],
  );

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => {
      const haystack = [
        user.loginName,
        user.name,
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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, sitesRes] = await Promise.all([apiFetch("/api/users"), apiFetch("/api/sites")]);
      if (!usersRes.ok || !sitesRes.ok) throw new Error("load");
      const [usersData, sitesData] = (await Promise.all([
        usersRes.json(),
        sitesRes.json(),
      ])) as [User[], SiteOption[]];
      setUsers(usersData);
      setSites(sitesData);
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
        icon: "pi pi-exclamation-triangle",
        acceptClassName: "p-button-danger",
        acceptLabel: t("users.yes"),
        rejectLabel: t("users.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

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
            <i className={`pi pi-plus ${createActionIcon}`} aria-hidden />
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
            <i className="pi pi-pencil" aria-hidden />
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
            <i className={`pi pi-trash ${deleteActionIcon}`} aria-hidden />
            <span>{t("users.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <InputIcon className="pi pi-search text-xs text-on-surface-variant" />
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
          value={filteredUsers}
          loading={loading}
          dataKey="id"
          selection={selectedUser}
          onSelectionChange={(e) => setSelectedUser(e.value as User | null)}
          onRowDoubleClick={(e) => openEdit(e.data as User)}
          selectionMode="single"
          metaKeySelection={false}
          stripedRows
          showGridlines
          scrollable
          resizableColumns
          columnResizeMode="expand"
          scrollHeight="flex"
          tableStyle={{ minWidth: "72rem" }}
          stateStorage="local"
          stateKey="athene-users-table"
          emptyMessage={t("users.empty")}
        >
          <Column field="loginName" header={t("users.loginName")} sortable />
          <Column field="name" header={t("users.name")} sortable className="min-w-56" />
          <Column field="workingSiteName" header={t("users.primarySite")} body={primarySiteBody} sortable />
          <Column header={t("users.accessSites")} body={accessSitesBody} className="min-w-72" />
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
              onChange={(e) => setForm((f) => ({ ...f, workingSiteId: String(e.value ?? "") }))}
              placeholder={t("users.primarySitePlaceholder")}
              className="w-full"
              filter
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
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
