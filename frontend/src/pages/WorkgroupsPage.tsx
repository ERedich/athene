import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
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

type SiteOption = {
  id: string;
  key: string;
  name: string;
  colorHex: string;
};

type EmployeeOption = {
  id: string;
  key: string;
  name: string;
  siteId: string;
};

type SiteDropdownOption = { label: string; value: string };

type Workgroup = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  employeeIds: string[];
  leaderEmployeeIds: string[];
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
  employeeIds: string[];
  leaderEmployeeIds: string[];
};

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  siteId: "",
  isActive: true,
  employeeIds: [],
  leaderEmployeeIds: [],
});

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const deleteActionIcon = "text-red-500";

function hasEmployeeSiteAccess(employee: EmployeeOption, siteId: string): boolean {
  return employee.siteId === siteId;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function WorkgroupsPage() {
  const { t, i18n } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [workgroups, setWorkgroups] = useState<Workgroup[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkgroup, setSelectedWorkgroup] = useState<Workgroup | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const siteLookup = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const employeeLookup = useMemo(() => new Map(employees.map((entry) => [entry.id, entry])), [employees]);

  const siteDropdownOptions = useMemo<SiteDropdownOption[]>(
    () => sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
    [sites],
  );

  const renderSiteDropdownOption = useCallback(
    (option: SiteDropdownOption) => {
      const site = siteLookup.get(option.value);
      const hex = site?.colorHex || DEFAULT_SITE_COLOR_HEX;
      return (
        <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${option.label} (${hex})`}>
          {option.label}
        </span>
      );
    },
    [siteLookup],
  );

  const renderSiteDropdownValue = useCallback(
    (incoming: unknown) => {
      const id =
        typeof incoming === "string"
          ? incoming
          : incoming && typeof incoming === "object" && incoming !== null && "value" in incoming
            ? String((incoming as { value: unknown }).value ?? "")
            : "";
      const site = siteLookup.get(id);
      if (!site) {
        return <span className="text-on-surface-variant">{t("workgroups.sitePlaceholder")}</span>;
      }
      const hex = site.colorHex || DEFAULT_SITE_COLOR_HEX;
      const label = `${site.key} - ${site.name}`;
      return (
        <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
          {label}
        </span>
      );
    },
    [siteLookup, t],
  );

  const eligibleEmployees = useMemo(() => {
    if (!form.siteId) return [];
    return employees.filter((entry) => hasEmployeeSiteAccess(entry, form.siteId));
  }, [employees, form.siteId]);

  const eligibleLeaders = useMemo(
    () => eligibleEmployees.filter((entry) => form.employeeIds.includes(entry.id)),
    [eligibleEmployees, form.employeeIds],
  );

  const filteredWorkgroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return workgroups;
    return workgroups.filter((row) => {
      const memberText = row.employeeIds
        .map((id) => {
          const member = employeeLookup.get(id);
          return member ? `${member.key} ${member.name}` : "";
        })
        .join(" ");
      return [row.key, row.name, row.siteKey, row.siteName, row.createdBy, row.updatedBy, memberText]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [employeeLookup, searchTerm, workgroups]);

  useEffect(() => {
    setHeaderRowCount(filteredWorkgroups.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filteredWorkgroups.length, setHeaderRowCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [workgroupsRes, sitesRes, employeesRes] = await Promise.all([
        apiFetch("/api/workgroups"),
        apiFetch("/api/sites"),
        apiFetch("/api/employees"),
      ]);
      if (!workgroupsRes.ok || !sitesRes.ok || !employeesRes.ok) throw new Error("load");
      const [workgroupsData, sitesData, employeesData] = (await Promise.all([
        workgroupsRes.json(),
        sitesRes.json(),
        employeesRes.json(),
      ])) as [Workgroup[], SiteOption[], EmployeeOption[]];
      setWorkgroups(workgroupsData);
      setSites(sitesData);
      setEmployees(employeesData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("workgroups.loadError"),
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

  const openEdit = useCallback((row: Workgroup) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      siteId: row.siteId,
      isActive: row.isActive,
      employeeIds: uniqueIds(row.employeeIds),
      leaderEmployeeIds: uniqueIds(row.leaderEmployeeIds ?? []),
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
    let detail = t("workgroups.saveError");
    if (code === "duplicate_key") detail = t("workgroups.duplicateKey");
    if (code === "foreign_key_violation") detail = t("workgroups.foreignKey");
    if (code === "member_site_mismatch") detail = t("workgroups.memberSiteMismatch");
    if (code === "leader_not_member") detail = t("workgroups.leaderNotMember");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !siteId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("workgroups.validationRequired"),
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
        employeeIds: uniqueIds(form.employeeIds),
        leaderEmployeeIds: uniqueIds(form.leaderEmployeeIds),
      };
      const url = editingId ? `/api/workgroups/${editingId}` : "/api/workgroups";
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
        summary: editingId ? t("workgroups.saved") : t("workgroups.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("workgroups.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/workgroups/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedWorkgroup((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("workgroups.deleted"),
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
          code === "foreign_key_violation" ? t("workgroups.foreignKey") : t("workgroups.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("workgroups.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: Workgroup) => {
      confirmDialog({
        message: t("workgroups.confirmDelete", { name: row.name }),
        header: t("workgroups.confirmDeleteTitle"),
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
        acceptClassName: "p-button-danger",
        acceptLabel: t("workgroups.yes"),
        rejectLabel: t("workgroups.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<Workgroup>({
    labels: { new: t("workgroups.new"), edit: t("workgroups.edit"), delete: t("workgroups.delete") },
    handlers: { onCreate: openCreate, onEdit: openEdit, onDelete: confirmDelete },
    selection: selectedWorkgroup,
    setSelection: setSelectedWorkgroup,
  });

  useEffect(() => {
    if (selectedWorkgroup && !workgroups.some((entry) => entry.id === selectedWorkgroup.id)) {
      setSelectedWorkgroup(null);
    }
  }, [selectedWorkgroup, workgroups]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("workgroups.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedWorkgroup}
            onClick={() => {
              if (selectedWorkgroup) openEdit(selectedWorkgroup);
            }}
          >
            <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("workgroups.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedWorkgroup}
            onClick={() => {
              if (selectedWorkgroup) confirmDelete(selectedWorkgroup);
            }}
          >
            <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("workgroups.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("workgroups.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, openCreate, openEdit, searchTerm, selectedWorkgroup, setHeaderActions, t]);

  useEffect(() => {
    if (!form.siteId) return;
    setForm((cur) => {
      const filtered = cur.employeeIds.filter((id) => {
        const entry = employeeLookup.get(id);
        return entry ? hasEmployeeSiteAccess(entry, cur.siteId) : false;
      });
      const filteredLeaders = cur.leaderEmployeeIds.filter((id) => filtered.includes(id));
      if (
        filtered.length === cur.employeeIds.length &&
        filteredLeaders.length === cur.leaderEmployeeIds.length &&
        filtered.every((id, index) => id === cur.employeeIds[index]) &&
        filteredLeaders.every((id, index) => id === cur.leaderEmployeeIds[index])
      ) {
        return cur;
      }
      return { ...cur, employeeIds: filtered, leaderEmployeeIds: filteredLeaders };
    });
  }, [employeeLookup, form.siteId]);

  useEffect(() => {
    setForm((cur) => {
      const memberSet = new Set(cur.employeeIds);
      const filteredLeaders = cur.leaderEmployeeIds.filter((id) => memberSet.has(id));
      if (
        filteredLeaders.length === cur.leaderEmployeeIds.length &&
        filteredLeaders.every((id, index) => id === cur.leaderEmployeeIds[index])
      ) {
        return cur;
      }
      return { ...cur, leaderEmployeeIds: filteredLeaders };
    });
  }, [form.employeeIds]);

  const activeBody = (row: Workgroup) =>
    row.isActive ? (
      <Check
        className="h-4 w-4 text-on-surface"
        strokeWidth={1.75}
        aria-label={t("workgroups.active")}
      />
    ) : (
      <span className="text-on-surface-variant">{t("workgroups.inactive")}</span>
    );

  const siteColumnBody = useCallback((row: Workgroup) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {row.siteName}
      </span>
    );
  }, []);

  const membersBody = useCallback(
    (row: Workgroup) => {
      const names = row.employeeIds
        .map((id) => {
          const entry = employeeLookup.get(id);
          return entry ? `${entry.key} - ${entry.name}` : id;
        })
        .join(", ");
      return <span title={names || undefined}>{row.employeeIds.length}</span>;
    },
    [employeeLookup],
  );

  const formatEmployeeOption = (entry: EmployeeOption): string => `${entry.key} - ${entry.name}`;

  const employeeOptionTemplate = (entry: EmployeeOption) => (
    <span className="truncate">{formatEmployeeOption(entry)}</span>
  );

  const selectedEmployeeTemplate = (value: string | EmployeeOption | undefined) => {
    const id =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && typeof value.id === "string"
          ? value.id
          : "";
    const entry = employeeLookup.get(id);
    return <span className="mr-1 truncate text-sm">{entry ? formatEmployeeOption(entry) : id}</span>;
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
        label={t("workgroups.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("workgroups.save")}
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
          value={filteredWorkgroups}
          loading={loading}
          dataKey="id"
          selection={selectedWorkgroup}
          onSelectionChange={(e) => setSelectedWorkgroup(e.value as Workgroup | null)}
          onRowDoubleClick={(e) => openEdit(e.data as Workgroup)}
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
          tableStyle={{ minWidth: "74rem" }}
          stateStorage="local"
          stateKey="athene-workgroups-table"
          emptyMessage={t("workgroups.empty")}
        >
          <Column field="key" header={t("workgroups.key")} sortable />
          <Column field="name" header={t("workgroups.name")} sortable />
          <Column field="siteName" header={t("workgroups.site")} sortable body={siteColumnBody} />
          <Column
            columnKey="members"
            header={t("workgroups.members")}
            body={membersBody}
            className="w-32 text-center"
          />
          <Column
            columnKey="active"
            header={t("workgroups.active")}
            body={activeBody}
            className="w-28 text-center"
          />
          <Column
            field="createdAt"
            header={t("workgroups.createdAt")}
            body={(row: Workgroup) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("workgroups.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("workgroups.updatedAt")}
            body={(row: Workgroup) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("workgroups.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <Dialog
        header={editingId ? t("workgroups.editTitle") : t("workgroups.createTitle")}
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
              htmlFor="workgroup-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("workgroups.key")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="workgroup-key"
              value={form.key}
              onChange={(e) => setForm((cur) => ({ ...cur, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="workgroup-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("workgroups.name")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="workgroup-name"
              value={form.name}
              onChange={(e) => setForm((cur) => ({ ...cur, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="workgroup-site"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("workgroups.site")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <Dropdown
              inputId="workgroup-site"
              value={form.siteId}
              options={siteDropdownOptions}
              onChange={(e) => setForm((cur) => ({ ...cur, siteId: String(e.value ?? "") }))}
              placeholder={t("workgroups.sitePlaceholder")}
              className="w-full app-inline-icon-dropdown"
              itemTemplate={renderSiteDropdownOption}
              valueTemplate={renderSiteDropdownValue}
              filter
              disabled={siteFieldLocked}
              appendTo={overlayAppendTo}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="workgroup-members"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("workgroups.members")}
            </label>
            <MultiSelect
              inputId="workgroup-members"
              value={form.employeeIds}
              options={eligibleEmployees}
              optionLabel="name"
              optionValue="id"
              itemTemplate={employeeOptionTemplate}
              selectedItemTemplate={selectedEmployeeTemplate}
              onChange={(e) =>
                setForm((cur) => ({
                  ...cur,
                  employeeIds: uniqueIds((Array.isArray(e.value) ? e.value : []).map((entry) => String(entry))),
                }))
              }
              placeholder={t("workgroups.membersPlaceholder")}
              className="w-full"
              filter
              display="comma"
              appendTo={overlayAppendTo}
              disabled={!form.siteId}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="workgroup-leadership"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("workgroups.leadership")}
            </label>
            <MultiSelect
              inputId="workgroup-leadership"
              value={form.leaderEmployeeIds}
              options={eligibleLeaders}
              optionLabel="name"
              optionValue="id"
              itemTemplate={employeeOptionTemplate}
              selectedItemTemplate={selectedEmployeeTemplate}
              onChange={(e) =>
                setForm((cur) => ({
                  ...cur,
                  leaderEmployeeIds: uniqueIds((Array.isArray(e.value) ? e.value : []).map((entry) => String(entry))),
                }))
              }
              placeholder={t("workgroups.leadershipPlaceholder")}
              className="w-full"
              filter
              display="comma"
              appendTo={overlayAppendTo}
              disabled={form.employeeIds.length === 0}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-3 group">
            <Checkbox
              inputId="workgroup-is-active"
              checked={form.isActive}
              onChange={(e) => setForm((cur) => ({ ...cur, isActive: Boolean(e.checked) }))}
              className="rounded-none"
            />
            <span className="text-[11px] uppercase tracking-wide text-on-surface-variant">
              {t("workgroups.active")}
            </span>
          </label>
        </div>
      </Dialog>
    </div>
  );
}
