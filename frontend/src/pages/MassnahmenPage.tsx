import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Link2, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
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

type SiteDropdownOption = { label: string; value: string };

type LinkedOption = { label: string; value: string };

type CauseOption = {
  id: string;
  key: string;
  name: string;
  siteId: string;
};

type RemedyRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  causeIds: string[];
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
  causeIds: string[];
};

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  siteId: "",
  isActive: true,
  causeIds: [],
});

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const deleteActionIcon = "text-red-500";

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function formatLinkedLabel(key: string, name: string): string {
  return `${key} - ${name}`;
}

export function MassnahmenPage() {
  const { t, i18n } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [rows, setRows] = useState<RemedyRow[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [causes, setCauses] = useState<CauseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<RemedyRow | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const causeLookup = useMemo(() => new Map(causes.map((entry) => [entry.id, entry])), [causes]);

  const siteDropdownOptions = useMemo<SiteDropdownOption[]>(
    () => sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
    [sites],
  );

  const causeMultiSelectOptions = useMemo<LinkedOption[]>(() => {
    if (!form.siteId) return [];
    return causes
      .filter((entry) => entry.siteId === form.siteId)
      .map((entry) => ({ label: formatLinkedLabel(entry.key, entry.name), value: entry.id }));
  }, [causes, form.siteId]);

  const causeOptionLookup = useMemo(
    () => new Map(causeMultiSelectOptions.map((entry) => [entry.value, entry])),
    [causeMultiSelectOptions],
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
        return <span className="text-on-surface-variant">{t("massnahmen.sitePlaceholder")}</span>;
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

  const siteColumnBody = useCallback((row: RemedyRow) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {row.siteName}
      </span>
    );
  }, []);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [
        row.key,
        row.name,
        row.siteKey,
        row.siteName,
        String(row.causeIds.length),
        row.createdBy,
        row.updatedBy,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filteredRows.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filteredRows.length, setHeaderRowCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [remediesRes, sitesRes, causesRes] = await Promise.all([
        apiFetch("/api/remedies"),
        apiFetch("/api/sites"),
        apiFetch("/api/causes"),
      ]);
      if (!remediesRes.ok || !sitesRes.ok || !causesRes.ok) throw new Error("load");
      const [remediesData, sitesData, causesData] = (await Promise.all([
        remediesRes.json(),
        sitesRes.json(),
        causesRes.json(),
      ])) as [RemedyRow[], SiteOption[], CauseOption[]];
      setRows(remediesData);
      setSites(sitesData);
      setCauses(causesData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("massnahmen.loadError"),
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

  const openEdit = useCallback((row: RemedyRow) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      siteId: row.siteId,
      isActive: row.isActive,
      causeIds: uniqueIds(row.causeIds),
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
    let detail = t("massnahmen.saveError");
    if (code === "duplicate_key") detail = t("massnahmen.duplicateKey");
    if (code === "foreign_key_violation") detail = t("massnahmen.foreignKey");
    if (code === "cause_site_mismatch") detail = t("massnahmen.causeSiteMismatch");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !siteId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("massnahmen.validationRequired"),
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
        causeIds: uniqueIds(form.causeIds),
      };
      const url = editingId ? `/api/remedies/${editingId}` : "/api/remedies";
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
        summary: editingId ? t("massnahmen.saved") : t("massnahmen.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("massnahmen.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/remedies/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedRow((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("massnahmen.deleted"),
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
          code === "foreign_key_violation" ? t("massnahmen.foreignKey") : t("massnahmen.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("massnahmen.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: RemedyRow) => {
      confirmDialog({
        message: t("massnahmen.confirmDelete", { name: row.name }),
        header: t("massnahmen.confirmDeleteTitle"),
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
        acceptClassName: "p-button-danger",
        acceptLabel: t("massnahmen.yes"),
        rejectLabel: t("massnahmen.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<RemedyRow>({
    labels: {
      new: t("massnahmen.new"),
      edit: t("massnahmen.edit"),
      delete: t("massnahmen.delete"),
    },
    handlers: { onCreate: openCreate, onEdit: openEdit, onDelete: confirmDelete },
    selection: selectedRow,
    setSelection: setSelectedRow,
    extraItems: (row) => {
      if (!row) return [];
      return [
        {
          label: t("massnahmen.linkCauses"),
          icon: <Link2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
          command: () => openEdit(row),
        },
      ];
    },
  });

  useEffect(() => {
    if (selectedRow && !rows.some((r) => r.id === selectedRow.id)) {
      setSelectedRow(null);
    }
  }, [rows, selectedRow]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("massnahmen.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedRow}
            onClick={() => {
              if (selectedRow) openEdit(selectedRow);
            }}
          >
            <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("massnahmen.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedRow}
            onClick={() => {
              if (selectedRow) confirmDelete(selectedRow);
            }}
          >
            <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("massnahmen.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("massnahmen.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, openCreate, openEdit, searchTerm, selectedRow, setHeaderActions, t]);

  useEffect(() => {
    if (!form.siteId) return;
    setForm((cur) => {
      const validCauseIds = cur.causeIds.filter((id) => {
        const entry = causeLookup.get(id);
        return entry?.siteId === cur.siteId;
      });
      if (
        validCauseIds.length === cur.causeIds.length &&
        validCauseIds.every((id, index) => id === cur.causeIds[index])
      ) {
        return cur;
      }
      return { ...cur, causeIds: validCauseIds };
    });
  }, [causeLookup, form.siteId]);

  const activeBody = (row: RemedyRow) =>
    row.isActive ? (
      <Check
        className="h-4 w-4 text-on-surface"
        strokeWidth={1.75}
        aria-label={t("massnahmen.active")}
      />
    ) : (
      <span className="text-on-surface-variant">{t("massnahmen.inactive")}</span>
    );

  const causesCountBody = (row: RemedyRow) => <span>{row.causeIds.length}</span>;

  const selectedCauseTemplate = (value: string | LinkedOption | undefined) => {
    const id =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && "value" in value
          ? String(value.value ?? "")
          : "";
    const option = causeOptionLookup.get(id);
    return <span className="mr-1 truncate text-sm">{option?.label ?? id}</span>;
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
        label={t("massnahmen.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("massnahmen.save")}
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
          value={filteredRows}
          loading={loading}
          dataKey="id"
          selection={selectedRow}
          onSelectionChange={(e) => setSelectedRow(e.value as RemedyRow | null)}
          onRowDoubleClick={(e) => openEdit(e.data as RemedyRow)}
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
          stateKey="athene-massnahmen-table"
          emptyMessage={t("massnahmen.empty")}
        >
          <Column field="key" header={t("massnahmen.key")} sortable />
          <Column field="name" header={t("massnahmen.name")} sortable />
          <Column field="siteName" header={t("massnahmen.site")} sortable body={siteColumnBody} />
          <Column
            columnKey="causesCount"
            header={t("massnahmen.causesCount")}
            body={causesCountBody}
            className="w-32 text-center"
          />
          <Column
            columnKey="active"
            header={t("massnahmen.active")}
            body={activeBody}
            className="w-28 text-center"
          />
          <Column
            field="createdAt"
            header={t("massnahmen.createdAt")}
            body={(row: RemedyRow) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("massnahmen.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("massnahmen.updatedAt")}
            body={(row: RemedyRow) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("massnahmen.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <AppDialog
        header={editingId ? t("massnahmen.editTitle") : t("massnahmen.createTitle")}
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
              htmlFor="remedy-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("massnahmen.key")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="remedy-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="remedy-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("massnahmen.name")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="remedy-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="remedy-site"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("massnahmen.site")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <Dropdown
              inputId="remedy-site"
              value={form.siteId}
              options={siteDropdownOptions}
              onChange={(e) => setForm((f) => ({ ...f, siteId: String(e.value ?? "") }))}
              placeholder={t("massnahmen.sitePlaceholder")}
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
              htmlFor="remedy-causes"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("massnahmen.causes")}
            </label>
            <MultiSelect
              inputId="remedy-causes"
              value={form.causeIds}
              options={causeMultiSelectOptions}
              optionLabel="label"
              optionValue="value"
              selectedItemTemplate={selectedCauseTemplate}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  causeIds: uniqueIds((Array.isArray(e.value) ? e.value : []).map((entry) => String(entry))),
                }))
              }
              placeholder={t("massnahmen.causesPlaceholder")}
              className="w-full"
              filter
              display="comma"
              appendTo={overlayAppendTo}
              disabled={!form.siteId}
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <Checkbox
              inputId="remedy-isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: Boolean(e.checked) }))}
              className="rounded-none"
            />
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
              {t("massnahmen.active")}
            </span>
          </label>
        </div>
      </AppDialog>
    </div>
  );
}
