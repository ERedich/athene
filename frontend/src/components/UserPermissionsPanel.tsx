import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { AppDialog } from "./AppDialog";
import { LucideInputSearchIcon } from "./LucideInputSearchIcon";
import { PermissionGrantMatrix } from "./permissions/PermissionGrantMatrix";
import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { primaryActionIcon, primaryActionNavItem } from "../lib/headerActionClasses";
import { usePermission } from "../lib/usePermission";
import { useTableContextMenu } from "../lib/useTableContextMenu";

type UserRow = {
  id: string;
  loginName: string;
  name: string;
  workingSiteKey: string;
  workingSiteName: string;
};

type TemplateOption = {
  id: string;
  key: string;
  name: string;
  permissionKeys: string[];
};

type Props = {
  /** When false, do not write shell header (inactive tab). */
  active: boolean;
};

export function UserPermissionsPanel({ active }: Props) {
  const { t } = useTranslation();
  const { permissionCatalog, permissions } = useAuth();
  const canManage = usePermission("permissions.manage");
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toast = useRef<Toast>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<UserRow | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [permissionKeys, setPermissionKeys] = useState<Set<string>>(new Set());
  const [applyTemplateId, setApplyTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const grantableKeys = useMemo(() => new Set(permissions), [permissions]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, tplRes] = await Promise.all([
        apiFetch("/api/users"),
        apiFetch("/api/permission-templates"),
      ]);
      if (!usersRes.ok) throw new Error("load");
      setUsers((await usersRes.json()) as UserRow[]);
      if (tplRes.ok) {
        setTemplates((await tplRes.json()) as TemplateOption[]);
      } else {
        setTemplates([]);
      }
    } catch {
      toast.current?.show({
        severity: "error",
        summary: t("berechtigungswesen.usersLoadError"),
        life: 4000,
      });
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!active || !canManage) return;
    void load();
  }, [active, canManage, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.loginName, u.name, u.workingSiteKey, u.workingSiteName]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [users, search]);

  const openEdit = useCallback(
    async (row: UserRow) => {
      setEditing(row);
      setApplyTemplateId(null);
      setPermissionKeys(new Set());
      setDialogVisible(true);
      try {
        const res = await apiFetch(`/api/users/${row.id}/permissions`);
        if (res.ok) {
          const body = (await res.json()) as { permissionKeys?: string[] };
          if (Array.isArray(body.permissionKeys)) {
            setPermissionKeys(new Set(body.permissionKeys));
          }
        }
      } catch {
        /* empty matrix */
      }
    },
    [],
  );

  const { ContextMenuEl, tableProps, wrapperProps } = useTableContextMenu<UserRow>({
    labels: {
      new: t("berechtigungswesen.editUser"),
      edit: t("berechtigungswesen.editUser"),
      delete: t("berechtigungswesen.editUser"),
    },
    handlers: {
      onEdit: canManage ? (row) => void openEdit(row) : undefined,
    },
    canCreate: false,
    canEdit: canManage,
    canDelete: false,
    selection,
    setSelection,
  });

  useEffect(() => {
    if (!active) return;
    setHeaderRowCount(filtered.length);
    return () => setHeaderRowCount(null);
  }, [active, filtered.length, setHeaderRowCount]);

  useEffect(() => {
    if (!active) return;
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        {canManage ? (
          <li>
            <button
              type="button"
              className={primaryActionNavItem}
              disabled={!selection}
              onClick={() => selection && void openEdit(selection)}
            >
              <Pencil className={primaryActionIcon} strokeWidth={1.75} />
              {t("berechtigungswesen.editUser")}
            </button>
          </li>
        ) : null}
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
              placeholder={t("berechtigungswesen.usersSearchPlaceholder")}
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [active, canManage, openEdit, search, selection, setHeaderActions, t]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/users/${editing.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionKeys: [...permissionKeys] }),
      });
      if (!res.ok) {
        toast.current?.show({
          severity: "error",
          summary: t("berechtigungswesen.usersSaveError"),
          life: 4000,
        });
        return;
      }
      setDialogVisible(false);
      toast.current?.show({
        severity: "success",
        summary: t("berechtigungswesen.usersSaved"),
        life: 3000,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="flex flex-1 items-start p-6 text-sm text-on-surface-variant">
        {t("berechtigungswesen.usersNoManage")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" {...wrapperProps}>
      <Toast ref={toast} />
      {ContextMenuEl}
      <DataTable
        value={filtered}
        loading={loading}
        dataKey="id"
        className="app-data-table"
        selectionMode="single"
        selection={selection}
        onSelectionChange={(e) => setSelection(e.value as UserRow | null)}
        onRowDoubleClick={(e) => void openEdit(e.data as UserRow)}
        emptyMessage={t("berechtigungswesen.usersEmpty")}
        {...tableProps}
      >
        <Column field="loginName" header={t("users.loginName")} sortable />
        <Column field="name" header={t("users.name")} sortable />
        <Column
          field="workingSiteName"
          header={t("users.primarySite")}
          body={(row: UserRow) => `${row.workingSiteKey} - ${row.workingSiteName}`}
          sortable
        />
      </DataTable>

      <AppDialog
        header={
          editing
            ? t("berechtigungswesen.editUserTitle", { name: editing.name })
            : t("berechtigungswesen.editUser")
        }
        visible={dialogVisible}
        className="app-big-modal-window"
        onHide={() => setDialogVisible(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              label={t("berechtigungswesen.cancel")}
              severity="secondary"
              text
              onClick={() => setDialogVisible(false)}
            />
            <Button
              label={t("berechtigungswesen.save")}
              onClick={() => void save()}
              loading={saving}
            />
          </div>
        }
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        <div className="flex h-[min(70vh,36rem)] flex-col gap-3 pt-1">
          <Dropdown
            value={applyTemplateId}
            options={templates.map((tpl) => ({
              label: `${tpl.key} - ${tpl.name}`,
              value: tpl.id,
            }))}
            onChange={(e) => {
              const id = e.value as string | null;
              setApplyTemplateId(id);
              const tpl = templates.find((x) => x.id === id);
              if (tpl) {
                setPermissionKeys(new Set(tpl.permissionKeys ?? []));
              }
            }}
            placeholder={t("berechtigungswesen.applyTemplatePlaceholder")}
            className="w-full max-w-md"
            showClear
            appendTo={overlayAppendTo}
          />
          <PermissionGrantMatrix
            catalog={permissionCatalog}
            selected={permissionKeys}
            onChange={setPermissionKeys}
            grantableKeys={grantableKeys}
          />
        </div>
      </AppDialog>
    </div>
  );
}
