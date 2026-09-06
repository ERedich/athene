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

type LinkedOption = { label: string; value: string };

type ClassificationOption = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  appliesToAsset: boolean;
};

type CauseOption = {
  id: string;
  key: string;
  name: string;
  siteId: string;
};

type ProblemRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
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
  classificationId: string;
  isActive: boolean;
  causeIds: string[];
};

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  siteId: "",
  classificationId: "",
  isActive: true,
  causeIds: [],
});

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function formatLinkedLabel(key: string, name: string): string {
  return `${key} - ${name}`;
}

export function ProblemePage() {
  const { t, i18n } = useTranslation();
  const crud = useAppCrud("problems");
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [rows, setRows] = useState<ProblemRow[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [classifications, setClassifications] = useState<ClassificationOption[]>([]);
  const [causes, setCauses] = useState<CauseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<ProblemRow | null>(null);
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

  const classificationDropdownOptions = useMemo<LinkedOption[]>(() => {
    if (!form.siteId) return [];
    return classifications
      .filter((entry) => entry.siteId === form.siteId && entry.appliesToAsset)
      .map((entry) => ({ label: formatLinkedLabel(entry.key, entry.name), value: entry.id }));
  }, [classifications, form.siteId]);

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
        return <span className="text-on-surface-variant">{t("probleme.sitePlaceholder")}</span>;
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

  const siteColumnBody = useCallback((row: ProblemRow) => {
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
        row.classificationKey,
        row.classificationName,
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
      const [problemsRes, sitesRes, causesRes, classificationsRes] = await Promise.all([
        apiFetch("/api/problems"),
        apiFetch("/api/sites"),
        apiFetch("/api/causes"),
        apiFetch("/api/classifications"),
      ]);
      if (!problemsRes.ok || !sitesRes.ok || !causesRes.ok || !classificationsRes.ok) throw new Error("load");
      const [problemsData, sitesData, causesData, classificationsData] = (await Promise.all([
        problemsRes.json(),
        sitesRes.json(),
        causesRes.json(),
        classificationsRes.json(),
      ])) as [ProblemRow[], SiteOption[], CauseOption[], ClassificationOption[]];
      setRows(problemsData);
      setSites(sitesData);
      setCauses(causesData);
      setClassifications(classificationsData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("probleme.loadError"),
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

  const openEdit = useCallback((row: ProblemRow) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      siteId: row.siteId,
      classificationId: row.classificationId ?? "",
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
    let detail = t("probleme.saveError");
    if (code === "duplicate_key") detail = t("probleme.duplicateKey");
    if (code === "foreign_key_violation") detail = t("probleme.foreignKey");
    if (code === "invalid_classification") detail = t("probleme.invalidClassification");
    if (code === "cause_site_mismatch") detail = t("probleme.causeSiteMismatch");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !siteId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("probleme.validationRequired"),
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
        classificationId: form.classificationId || null,
        isActive: form.isActive,
        causeIds: uniqueIds(form.causeIds),
      };
      const url = editingId ? `/api/problems/${editingId}` : "/api/problems";
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
        summary: editingId ? t("probleme.saved") : t("probleme.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("probleme.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/problems/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedRow((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("probleme.deleted"),
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
          code === "foreign_key_violation" ? t("probleme.foreignKey") : t("probleme.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("probleme.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: ProblemRow) => {
      confirmDialog({
        message: t("probleme.confirmDelete", { name: row.name }),
        header: t("probleme.confirmDeleteTitle"),
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
        acceptClassName: "p-button-danger",
        acceptLabel: t("probleme.yes"),
        rejectLabel: t("probleme.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<ProblemRow>({
    labels: {
      new: t("probleme.new"),
      edit: t("probleme.edit"),
      delete: t("probleme.delete"),
    },
    handlers: {
      onCreate: crud.canCreate ? openCreate : undefined,
      onEdit: crud.canUpdate ? openEdit : undefined,
      onDelete: crud.canDelete ? confirmDelete : undefined,
    },
    canCreate: crud.canCreate,
    canEdit: crud.canUpdate,
    canDelete: crud.canDelete,
    selection: selectedRow,
    setSelection: setSelectedRow,
    extraItems: (row) => {
      if (!row) return [];
      return [
        {
          label: t("probleme.linkCauses"),
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
        {crud.canCreate ? (
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("probleme.new")}</span>
          </button>
          </li>
        ) : null}
        {crud.canUpdate ? (
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
            <span>{t("probleme.edit")}</span>
          </button>
          </li>
        ) : null}
        {crud.canDelete ? (
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
            <span>{t("probleme.delete")}</span>
          </button>
          </li>
        ) : null}
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("probleme.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, crud.canCreate, crud.canDelete, crud.canUpdate, openCreate, openEdit, searchTerm, selectedRow, setHeaderActions, t]);

  useEffect(() => {
    if (!form.siteId) return;
    setForm((cur) => {
      const validCauseIds = cur.causeIds.filter((id) => {
        const entry = causeLookup.get(id);
        return entry?.siteId === cur.siteId;
      });
      const classificationValid =
        cur.classificationId &&
        classifications.some(
          (entry) =>
            entry.id === cur.classificationId &&
            entry.siteId === cur.siteId &&
            entry.appliesToAsset,
        );
      const nextClassificationId = classificationValid ? cur.classificationId : "";
      if (
        validCauseIds.length === cur.causeIds.length &&
        validCauseIds.every((id, index) => id === cur.causeIds[index]) &&
        nextClassificationId === cur.classificationId
      ) {
        return cur;
      }
      return { ...cur, causeIds: validCauseIds, classificationId: nextClassificationId };
    });
  }, [causeLookup, classifications, form.siteId]);

  const activeBody = (row: ProblemRow) =>
    row.isActive ? (
      <Check
        className="h-4 w-4 text-on-surface"
        strokeWidth={1.75}
        aria-label={t("probleme.active")}
      />
    ) : (
      <span className="text-on-surface-variant">{t("probleme.inactive")}</span>
    );

  const causesCountBody = (row: ProblemRow) => <span>{row.causeIds.length}</span>;

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
        label={t("probleme.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("probleme.save")}
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
          onSelectionChange={(e) => setSelectedRow(e.value as ProblemRow | null)}
          onRowDoubleClick={(e) => openEdit(e.data as ProblemRow)}
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
          stateKey="athene-probleme-table"
          emptyMessage={t("probleme.empty")}
        >
          <Column field="key" header={t("probleme.key")} sortable />
          <Column field="name" header={t("probleme.name")} sortable />
          <Column field="siteName" header={t("probleme.site")} sortable body={siteColumnBody} />
          <Column
            field="classificationName"
            header={t("probleme.classification")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            columnKey="causesCount"
            header={t("probleme.causesCount")}
            body={causesCountBody}
            className="w-32 text-center"
          />
          <Column
            columnKey="active"
            header={t("probleme.active")}
            body={activeBody}
            className="w-28 text-center"
          />
          <Column
            field="createdAt"
            header={t("probleme.createdAt")}
            body={(row: ProblemRow) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("probleme.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("probleme.updatedAt")}
            body={(row: ProblemRow) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("probleme.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <AppDialog
        header={editingId ? t("probleme.editTitle") : t("probleme.createTitle")}
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
              htmlFor="problem-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("probleme.key")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="problem-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="problem-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("probleme.name")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="problem-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="problem-site"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("probleme.site")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <Dropdown
              inputId="problem-site"
              value={form.siteId}
              options={siteDropdownOptions}
              onChange={(e) => setForm((f) => ({ ...f, siteId: String(e.value ?? "") }))}
              placeholder={t("probleme.sitePlaceholder")}
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
              htmlFor="problem-classification"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("probleme.classification")}
            </label>
            <Dropdown
              inputId="problem-classification"
              value={form.classificationId || null}
              options={classificationDropdownOptions}
              onChange={(e) =>
                setForm((f) => ({ ...f, classificationId: e.value ? String(e.value) : "" }))
              }
              placeholder={t("probleme.classificationPlaceholder")}
              className="w-full"
              showClear
              filter
              disabled={!form.siteId}
              appendTo={overlayAppendTo}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="problem-causes"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("probleme.causes")}
            </label>
            <MultiSelect
              inputId="problem-causes"
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
              placeholder={t("probleme.causesPlaceholder")}
              className="w-full"
              filter
              display="comma"
              appendTo={overlayAppendTo}
              disabled={!form.siteId}
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <Checkbox
              inputId="problem-isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: Boolean(e.checked) }))}
              className="rounded-none"
            />
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
              {t("probleme.active")}
            </span>
          </label>
        </div>
      </AppDialog>
    </div>
  );
}
