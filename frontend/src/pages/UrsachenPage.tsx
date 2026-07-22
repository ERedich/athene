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

type LinkedEntityOption = {
  id: string;
  key: string;
  name: string;
  siteId: string;
};

type CauseRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  problemIds: string[];
  remedyIds: string[];
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
  problemIds: string[];
  remedyIds: string[];
};

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  siteId: "",
  isActive: true,
  problemIds: [],
  remedyIds: [],
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

export function UrsachenPage() {
  const { t, i18n } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [rows, setRows] = useState<CauseRow[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [problems, setProblems] = useState<LinkedEntityOption[]>([]);
  const [remedies, setRemedies] = useState<LinkedEntityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<CauseRow | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const problemLookup = useMemo(() => new Map(problems.map((entry) => [entry.id, entry])), [problems]);
  const remedyLookup = useMemo(() => new Map(remedies.map((entry) => [entry.id, entry])), [remedies]);

  const siteDropdownOptions = useMemo<SiteDropdownOption[]>(
    () => sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
    [sites],
  );

  const problemMultiSelectOptions = useMemo<LinkedOption[]>(() => {
    if (!form.siteId) return [];
    return problems
      .filter((entry) => entry.siteId === form.siteId)
      .map((entry) => ({ label: formatLinkedLabel(entry.key, entry.name), value: entry.id }));
  }, [form.siteId, problems]);

  const remedyMultiSelectOptions = useMemo<LinkedOption[]>(() => {
    if (!form.siteId) return [];
    return remedies
      .filter((entry) => entry.siteId === form.siteId)
      .map((entry) => ({ label: formatLinkedLabel(entry.key, entry.name), value: entry.id }));
  }, [form.siteId, remedies]);

  const problemOptionLookup = useMemo(
    () => new Map(problemMultiSelectOptions.map((entry) => [entry.value, entry])),
    [problemMultiSelectOptions],
  );

  const remedyOptionLookup = useMemo(
    () => new Map(remedyMultiSelectOptions.map((entry) => [entry.value, entry])),
    [remedyMultiSelectOptions],
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
        return <span className="text-on-surface-variant">{t("ursachen.sitePlaceholder")}</span>;
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

  const siteColumnBody = useCallback((row: CauseRow) => {
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
        String(row.problemIds.length),
        String(row.remedyIds.length),
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
      const [causesRes, sitesRes, problemsRes, remediesRes] = await Promise.all([
        apiFetch("/api/causes"),
        apiFetch("/api/sites"),
        apiFetch("/api/problems"),
        apiFetch("/api/remedies"),
      ]);
      if (!causesRes.ok || !sitesRes.ok || !problemsRes.ok || !remediesRes.ok) throw new Error("load");
      const [causesData, sitesData, problemsData, remediesData] = (await Promise.all([
        causesRes.json(),
        sitesRes.json(),
        problemsRes.json(),
        remediesRes.json(),
      ])) as [CauseRow[], SiteOption[], LinkedEntityOption[], LinkedEntityOption[]];
      setRows(causesData);
      setSites(sitesData);
      setProblems(problemsData);
      setRemedies(remediesData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("ursachen.loadError"),
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

  const openEdit = useCallback((row: CauseRow) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      siteId: row.siteId,
      isActive: row.isActive,
      problemIds: uniqueIds(row.problemIds),
      remedyIds: uniqueIds(row.remedyIds),
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
    let detail = t("ursachen.saveError");
    if (code === "duplicate_key") detail = t("ursachen.duplicateKey");
    if (code === "foreign_key_violation") detail = t("ursachen.foreignKey");
    if (code === "problem_site_mismatch") detail = t("ursachen.problemSiteMismatch");
    if (code === "remedy_site_mismatch") detail = t("ursachen.remedySiteMismatch");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !siteId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("ursachen.validationRequired"),
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
        problemIds: uniqueIds(form.problemIds),
        remedyIds: uniqueIds(form.remedyIds),
      };
      const url = editingId ? `/api/causes/${editingId}` : "/api/causes";
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
        summary: editingId ? t("ursachen.saved") : t("ursachen.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("ursachen.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/causes/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedRow((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("ursachen.deleted"),
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
          code === "foreign_key_violation" ? t("ursachen.foreignKey") : t("ursachen.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("ursachen.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: CauseRow) => {
      confirmDialog({
        message: t("ursachen.confirmDelete", { name: row.name }),
        header: t("ursachen.confirmDeleteTitle"),
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
        acceptClassName: "p-button-danger",
        acceptLabel: t("ursachen.yes"),
        rejectLabel: t("ursachen.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<CauseRow>({
    labels: {
      new: t("ursachen.new"),
      edit: t("ursachen.edit"),
      delete: t("ursachen.delete"),
    },
    handlers: { onCreate: openCreate, onEdit: openEdit, onDelete: confirmDelete },
    selection: selectedRow,
    setSelection: setSelectedRow,
    extraItems: (row) => {
      if (!row) return [];
      return [
        {
          label: t("ursachen.linkProblems"),
          icon: <Link2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
          command: () => openEdit(row),
        },
        {
          label: t("ursachen.linkRemedies"),
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
            <span>{t("ursachen.new")}</span>
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
            <span>{t("ursachen.edit")}</span>
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
            <span>{t("ursachen.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("ursachen.searchPlaceholder")}
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
      const validProblemIds = cur.problemIds.filter((id) => {
        const entry = problemLookup.get(id);
        return entry?.siteId === cur.siteId;
      });
      const validRemedyIds = cur.remedyIds.filter((id) => {
        const entry = remedyLookup.get(id);
        return entry?.siteId === cur.siteId;
      });
      if (
        validProblemIds.length === cur.problemIds.length &&
        validRemedyIds.length === cur.remedyIds.length &&
        validProblemIds.every((id, index) => id === cur.problemIds[index]) &&
        validRemedyIds.every((id, index) => id === cur.remedyIds[index])
      ) {
        return cur;
      }
      return { ...cur, problemIds: validProblemIds, remedyIds: validRemedyIds };
    });
  }, [form.siteId, problemLookup, remedyLookup]);

  const activeBody = (row: CauseRow) =>
    row.isActive ? (
      <Check
        className="h-4 w-4 text-on-surface"
        strokeWidth={1.75}
        aria-label={t("ursachen.active")}
      />
    ) : (
      <span className="text-on-surface-variant">{t("ursachen.inactive")}</span>
    );

  const problemsCountBody = (row: CauseRow) => <span>{row.problemIds.length}</span>;
  const remediesCountBody = (row: CauseRow) => <span>{row.remedyIds.length}</span>;

  const selectedProblemTemplate = (value: string | LinkedOption | undefined) => {
    const id =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && "value" in value
          ? String(value.value ?? "")
          : "";
    const option = problemOptionLookup.get(id);
    return <span className="mr-1 truncate text-sm">{option?.label ?? id}</span>;
  };

  const selectedRemedyTemplate = (value: string | LinkedOption | undefined) => {
    const id =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && "value" in value
          ? String(value.value ?? "")
          : "";
    const option = remedyOptionLookup.get(id);
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
        label={t("ursachen.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("ursachen.save")}
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
          onSelectionChange={(e) => setSelectedRow(e.value as CauseRow | null)}
          onRowDoubleClick={(e) => openEdit(e.data as CauseRow)}
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
          tableStyle={{ minWidth: "78rem" }}
          stateStorage="local"
          stateKey="athene-ursachen-table"
          emptyMessage={t("ursachen.empty")}
        >
          <Column field="key" header={t("ursachen.key")} sortable />
          <Column field="name" header={t("ursachen.name")} sortable />
          <Column field="siteName" header={t("ursachen.site")} sortable body={siteColumnBody} />
          <Column
            columnKey="problemsCount"
            header={t("ursachen.problemsCount")}
            body={problemsCountBody}
            className="w-32 text-center"
          />
          <Column
            columnKey="remediesCount"
            header={t("ursachen.remediesCount")}
            body={remediesCountBody}
            className="w-32 text-center"
          />
          <Column
            columnKey="active"
            header={t("ursachen.active")}
            body={activeBody}
            className="w-28 text-center"
          />
          <Column
            field="createdAt"
            header={t("ursachen.createdAt")}
            body={(row: CauseRow) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("ursachen.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("ursachen.updatedAt")}
            body={(row: CauseRow) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("ursachen.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <AppDialog
        header={editingId ? t("ursachen.editTitle") : t("ursachen.createTitle")}
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
              htmlFor="cause-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("ursachen.key")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="cause-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="cause-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("ursachen.name")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="cause-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="cause-site"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("ursachen.site")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <Dropdown
              inputId="cause-site"
              value={form.siteId}
              options={siteDropdownOptions}
              onChange={(e) => setForm((f) => ({ ...f, siteId: String(e.value ?? "") }))}
              placeholder={t("ursachen.sitePlaceholder")}
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
              htmlFor="cause-problems"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("ursachen.problems")}
            </label>
            <MultiSelect
              inputId="cause-problems"
              value={form.problemIds}
              options={problemMultiSelectOptions}
              optionLabel="label"
              optionValue="value"
              selectedItemTemplate={selectedProblemTemplate}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  problemIds: uniqueIds((Array.isArray(e.value) ? e.value : []).map((entry) => String(entry))),
                }))
              }
              placeholder={t("ursachen.problemsPlaceholder")}
              className="w-full"
              filter
              display="comma"
              appendTo={overlayAppendTo}
              disabled={!form.siteId}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="cause-remedies"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("ursachen.remedies")}
            </label>
            <MultiSelect
              inputId="cause-remedies"
              value={form.remedyIds}
              options={remedyMultiSelectOptions}
              optionLabel="label"
              optionValue="value"
              selectedItemTemplate={selectedRemedyTemplate}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  remedyIds: uniqueIds((Array.isArray(e.value) ? e.value : []).map((entry) => String(entry))),
                }))
              }
              placeholder={t("ursachen.remediesPlaceholder")}
              className="w-full"
              filter
              display="comma"
              appendTo={overlayAppendTo}
              disabled={!form.siteId}
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <Checkbox
              inputId="cause-isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: Boolean(e.checked) }))}
              className="rounded-none"
            />
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
              {t("ursachen.active")}
            </span>
          </label>
        </div>
      </AppDialog>
    </div>
  );
}
