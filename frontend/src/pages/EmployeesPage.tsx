import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Check, Pencil, Plus, Trash2, TriangleAlert, Upload, User } from "lucide-react";
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

type Employee = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  isShiftPlanning: boolean;
  hasPhoto: boolean;
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
  isShiftPlanning: boolean;
};

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  siteId: "",
  isActive: true,
  isShiftPlanning: false,
});


export function EmployeesPage() {
  const { t, i18n } = useTranslation();
  const crud = useAppCrud("employees");
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoPreviewUrlRef = useRef<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [hasStoredPhoto, setHasStoredPhoto] = useState(false);

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

  const clearPhotoPreview = useCallback(() => {
    if (photoPreviewUrlRef.current) {
      URL.revokeObjectURL(photoPreviewUrlRef.current);
      photoPreviewUrlRef.current = null;
    }
    setPhotoPreviewUrl(null);
  }, []);

  const resetPhotoState = useCallback(() => {
    clearPhotoPreview();
    setPendingPhotoFile(null);
    setPhotoUploading(false);
    setHasStoredPhoto(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [clearPhotoPreview]);

  const closeDialog = useCallback(() => {
    resetPhotoState();
    setDialogVisible(false);
  }, [resetPhotoState]);

  const loadEmployeePhoto = useCallback(
    async (employeeId: string) => {
      clearPhotoPreview();
      try {
        const res = await apiFetch(`/api/employees/${employeeId}/photo`);
        if (!res.ok) return;
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        photoPreviewUrlRef.current = blobUrl;
        setPhotoPreviewUrl(blobUrl);
        setHasStoredPhoto(true);
      } catch {
        /* ignore preview load errors */
      }
    },
    [clearPhotoPreview],
  );

  const uploadEmployeePhoto = useCallback(
    async (employeeId: string, file: File): Promise<boolean> => {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await apiFetch(`/api/employees/${employeeId}/photo`, {
        method: "POST",
        body: fd,
      });
      return res.ok;
    },
    [],
  );

  const removeEmployeePhoto = useCallback(async (employeeId: string): Promise<boolean> => {
    const res = await apiFetch(`/api/employees/${employeeId}/photo`, { method: "DELETE" });
    return res.ok || res.status === 204;
  }, []);

  const openCreate = useCallback(() => {
    resetPhotoState();
    setEditingId(null);
    setForm({
      ...emptyForm(),
      ...(siteFieldLocked ? { siteId: user.workingSiteId } : {}),
    });
    setDialogVisible(true);
  }, [resetPhotoState, siteFieldLocked, user.workingSiteId]);

  const openEdit = useCallback(
    (row: Employee) => {
      resetPhotoState();
      setEditingId(row.id);
      setForm({
        key: row.key,
        name: row.name,
        siteId: row.siteId,
        isActive: row.isActive,
        isShiftPlanning: row.isShiftPlanning,
      });
      setHasStoredPhoto(row.hasPhoto);
      setDialogVisible(true);
      if (row.hasPhoto) {
        void loadEmployeePhoto(row.id);
      }
    },
    [loadEmployeePhoto, resetPhotoState],
  );

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
        isShiftPlanning: form.isShiftPlanning,
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
      const savedEmployee = (await res.json()) as Employee;
      if (pendingPhotoFile) {
        const uploaded = await uploadEmployeePhoto(savedEmployee.id, pendingPhotoFile);
        if (!uploaded) {
          toastRef.current?.show({
            severity: "error",
            summary: t("employees.photoUploadError"),
            life: 6000,
          });
        }
      }
      closeDialog();
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

  const handlePickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toastRef.current?.show({
        severity: "error",
        summary: t("employees.photoUploadError"),
        life: 6000,
      });
      return;
    }

    clearPhotoPreview();
    const previewUrl = URL.createObjectURL(file);
    photoPreviewUrlRef.current = previewUrl;
    setPhotoPreviewUrl(previewUrl);

    if (editingId) {
      setPhotoUploading(true);
      try {
        const uploaded = await uploadEmployeePhoto(editingId, file);
        if (!uploaded) {
          toastRef.current?.show({
            severity: "error",
            summary: t("employees.photoUploadError"),
            life: 6000,
          });
          return;
        }
        setPendingPhotoFile(null);
        setHasStoredPhoto(true);
        toastRef.current?.show({
          severity: "success",
          summary: t("employees.saved"),
          life: 3000,
        });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("employees.photoUploadError"),
          life: 6000,
        });
      } finally {
        setPhotoUploading(false);
      }
      return;
    }

    setPendingPhotoFile(file);
    setHasStoredPhoto(false);
  };

  const handleRemovePhoto = async () => {
    if (editingId && hasStoredPhoto) {
      setPhotoUploading(true);
      try {
        const removed = await removeEmployeePhoto(editingId);
        if (!removed) {
          toastRef.current?.show({
            severity: "error",
            summary: t("employees.photoRemoveError"),
            life: 6000,
          });
          return;
        }
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("employees.photoRemoveError"),
          life: 6000,
        });
        return;
      } finally {
        setPhotoUploading(false);
      }
    }
    resetPhotoState();
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
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
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
    handlers: {
      onCreate: crud.canCreate ? openCreate : undefined,
      onEdit: crud.canUpdate ? openEdit : undefined,
      onDelete: crud.canDelete ? confirmDelete : undefined,
    },
    canCreate: crud.canCreate,
    canEdit: crud.canUpdate,
    canDelete: crud.canDelete,
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
        {crud.canCreate ? (
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("employees.new")}</span>
          </button>
          </li>
        ) : null}
        {crud.canUpdate ? (
          <li>
            <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedEmployee}
            onClick={() => {
              if (selectedEmployee) openEdit(selectedEmployee);
            }}
          >
            <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("employees.edit")}</span>
          </button>
          </li>
        ) : null}
        {crud.canDelete ? (
          <li>
            <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedEmployee}
            onClick={() => {
              if (selectedEmployee) confirmDelete(selectedEmployee);
            }}
          >
            <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("employees.delete")}</span>
          </button>
          </li>
        ) : null}
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
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
  }, [confirmDelete, crud.canCreate, crud.canDelete, crud.canUpdate, openCreate, openEdit, searchTerm, selectedEmployee, setHeaderActions, t]);

  const activeBody = (row: Employee) =>
    row.isActive ? (
      <Check
        className="h-4 w-4 text-on-surface"
        strokeWidth={1.75}
        aria-label={t("employees.active")}
      />
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
        disabled={saving || photoUploading}
        onClick={closeDialog}
      />
      <Button
        type="button"
        label={t("employees.save")}
        icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        loading={saving}
        disabled={photoUploading}
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

      <AppDialog
        header={editingId ? t("employees.editTitle") : t("employees.createTitle")}
        visible={dialogVisible}
        className="app-big-modal-window"
        onHide={closeDialog}
        footer={dialogFooter}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        <div className="flex gap-6 pt-1">
          <div className="flex w-44 shrink-0 flex-col items-stretch gap-3">
            <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm border border-outline-variant bg-surface-container-low">
              {photoPreviewUrl ? (
                <img
                  src={photoPreviewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <User
                  className="h-16 w-16 text-on-surface-variant/40"
                  strokeWidth={1.25}
                  aria-hidden
                />
              )}
            </div>
            <Button
              type="button"
              icon={<Upload className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
              label={t("employees.photoUpload")}
              className="w-full min-w-0 justify-center !h-9 min-h-9 max-h-9 py-0"
              loading={photoUploading}
              disabled={saving}
              onClick={() => fileInputRef.current?.click()}
            />
            {photoPreviewUrl ? (
              <Button
                type="button"
                label={t("employees.photoRemove")}
                severity="secondary"
                outlined
                className="w-full min-w-0 justify-center !h-9 min-h-9 max-h-9 py-0"
                disabled={saving || photoUploading}
                onClick={() => void handleRemovePhoto()}
              />
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handlePickPhoto(e)}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
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
          <label className="flex items-center gap-3 cursor-pointer group">
            <Checkbox
              inputId="employee-isShiftPlanning"
              checked={form.isShiftPlanning}
              onChange={(e) => setForm((f) => ({ ...f, isShiftPlanning: Boolean(e.checked) }))}
              className="rounded-none"
            />
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
              {t("employees.shiftPlanning")}
            </span>
          </label>
          </div>
        </div>
      </AppDialog>
    </div>
  );
}
