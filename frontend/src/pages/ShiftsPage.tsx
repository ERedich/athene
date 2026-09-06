import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { AppDialog } from "../components/AppDialog";
import { AppColorPicker } from "../components/AppColorPicker";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";

import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";
import {
  DEFAULT_PICKER_COLOR_HEX,
  pickerValueFromStored,
  storedFromPickerValue,
} from "../lib/colorHex";
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

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type WeekdayKey = (typeof WEEKDAY_KEYS)[number];
type WeekdayOption = { label: string; value: WeekdayKey };

type Shift = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  shortCode: string;
  colorHex: string;
  startTime: string;
  endTime: string;
  breakHours: string;
  weekdays: WeekdayKey[];
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
  shortCode: string;
  colorHex: string;
  startTime: string;
  endTime: string;
  breakHours: number;
  weekdays: WeekdayKey[];
  isActive: boolean;
};

const defaultColorHex = DEFAULT_PICKER_COLOR_HEX;

function timeStringToDate(time: string): Date | null {
  const trimmed = time.trim();
  if (!trimmed) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(trimmed);
  if (!m) return null;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

function dateToTimeString(date: Date | null | undefined): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  siteId: "",
  shortCode: "",
  colorHex: defaultColorHex,
  startTime: "",
  endTime: "",
  breakHours: 0,
  weekdays: [],
  isActive: true,
});

export function ShiftsPage() {
  const { t, i18n } = useTranslation();
  const crud = useAppCrud("shifts");
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const siteDropdownOptions = useMemo<SiteDropdownOption[]>(
    () => sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
    [sites],
  );

  const weekdayOptions = useMemo<WeekdayOption[]>(
    () =>
      WEEKDAY_KEYS.map((key) => ({
        value: key,
        label: t(`kalendar.weekdays.${key}`),
      })),
    [t],
  );

  const formatWeekdays = useCallback(
    (weekdays: WeekdayKey[] | undefined) => {
      if (!weekdays?.length) return "—";
      return weekdays.map((key) => t(`kalendar.weekdays.${key}`)).join(", ");
    },
    [t],
  );

  const weekdaysColumnBody = useCallback(
    (row: Shift) => formatWeekdays(row.weekdays),
    [formatWeekdays],
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
        return <span className="text-on-surface-variant">{t("shifts.sitePlaceholder")}</span>;
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

  const siteColumnBody = useCallback((row: Shift) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {row.siteName}
      </span>
    );
  }, []);

  const colorColumnBody = useCallback((row: Shift) => {
    const hex = row.colorHex || defaultColorHex;
    return (
      <span className="inline-flex items-center gap-2">
        <span
          className="inline-block h-4 w-4 shrink-0 rounded-sm border border-outline-variant"
          style={{ backgroundColor: hex }}
          aria-hidden
        />
        <span className="font-mono text-sm text-on-surface-variant">{hex}</span>
      </span>
    );
  }, []);

  const breakHoursColumnBody = useCallback(
    (row: Shift) => {
      const n = Number(row.breakHours);
      if (!Number.isFinite(n)) return row.breakHours;
      return `${n} ${t("shifts.breakHoursUnit")}`;
    },
    [t],
  );

  const filteredShifts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return shifts;
    return shifts.filter((row) =>
      [
        row.key,
        row.name,
        row.shortCode,
        row.colorHex,
        row.startTime,
        row.endTime,
        row.breakHours,
        ...(row.weekdays ?? []),
        row.siteKey,
        row.siteName,
        row.siteColorHex,
        row.createdBy,
        row.updatedBy,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [shifts, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filteredShifts.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filteredShifts.length, setHeaderRowCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftsRes, sitesRes] = await Promise.all([apiFetch("/api/shifts"), apiFetch("/api/sites")]);
      if (!shiftsRes.ok || !sitesRes.ok) throw new Error("load");
      const [shiftsData, sitesData] = (await Promise.all([
        shiftsRes.json(),
        sitesRes.json(),
      ])) as [Shift[], SiteOption[]];
      setShifts(shiftsData);
      setSites(sitesData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("shifts.loadError"),
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

  const openEdit = useCallback((row: Shift) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      siteId: row.siteId,
      shortCode: row.shortCode,
      colorHex: storedFromPickerValue(pickerValueFromStored(row.colorHex || defaultColorHex)),
      startTime: row.startTime,
      endTime: row.endTime,
      breakHours: Number(row.breakHours) || 0,
      weekdays: [...(row.weekdays ?? [])],
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
    let detail = t("shifts.saveError");
    if (code === "duplicate_key") detail = t("shifts.duplicateKey");
    if (code === "duplicate_short_code") detail = t("shifts.duplicateShortCode");
    if (code === "foreign_key_violation") detail = t("shifts.foreignKey");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    const shortCode = form.shortCode.trim();
    const startTime = form.startTime.trim();
    const endTime = form.endTime.trim();
    if (!key || !name || !siteId || !shortCode || !startTime || !endTime) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("shifts.validationRequired"),
        life: 4000,
      });
      return;
    }
    if (shortCode.length > 5) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("shifts.validationShortCode"),
        life: 4000,
      });
      return;
    }
    if (form.breakHours < 0 || !Number.isFinite(form.breakHours)) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("shifts.validationBreakHours"),
        life: 4000,
      });
      return;
    }
    if (form.weekdays.length === 0) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("shifts.validationWeekdays"),
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
        shortCode,
        colorHex: form.colorHex,
        startTime,
        endTime,
        breakHours: form.breakHours,
        weekdays: form.weekdays,
        isActive: form.isActive,
      };
      const url = editingId ? `/api/shifts/${editingId}` : "/api/shifts";
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
        summary: editingId ? t("shifts.saved") : t("shifts.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("shifts.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/shifts/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedShift((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("shifts.deleted"),
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
          code === "foreign_key_violation" ? t("shifts.foreignKey") : t("shifts.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("shifts.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: Shift) => {
      confirmDialog({
        message: t("shifts.confirmDelete", { name: row.name }),
        header: t("shifts.confirmDeleteTitle"),
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
        acceptClassName: "p-button-danger",
        acceptLabel: t("shifts.yes"),
        rejectLabel: t("shifts.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<Shift>({
    labels: { new: t("shifts.new"), edit: t("shifts.edit"), delete: t("shifts.delete") },
    handlers: {
      onCreate: crud.canCreate ? openCreate : undefined,
      onEdit: crud.canUpdate ? openEdit : undefined,
      onDelete: crud.canDelete ? confirmDelete : undefined,
    },
    canCreate: crud.canCreate,
    canEdit: crud.canUpdate,
    canDelete: crud.canDelete,
    selection: selectedShift,
    setSelection: setSelectedShift,
  });

  useEffect(() => {
    if (selectedShift && !shifts.some((s) => s.id === selectedShift.id)) {
      setSelectedShift(null);
    }
  }, [shifts, selectedShift]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        {crud.canCreate ? (
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("shifts.new")}</span>
          </button>
          </li>
        ) : null}
        {crud.canUpdate ? (
          <li>
            <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedShift}
            onClick={() => {
              if (selectedShift) openEdit(selectedShift);
            }}
          >
            <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("shifts.edit")}</span>
          </button>
          </li>
        ) : null}
        {crud.canDelete ? (
          <li>
            <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedShift}
            onClick={() => {
              if (selectedShift) confirmDelete(selectedShift);
            }}
          >
            <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("shifts.delete")}</span>
          </button>
          </li>
        ) : null}
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("shifts.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, crud.canCreate, crud.canDelete, crud.canUpdate, openCreate, openEdit, searchTerm, selectedShift, setHeaderActions, t]);

  const activeBody = (row: Shift) =>
    row.isActive ? (
      <Check
        className="h-4 w-4 text-on-surface"
        strokeWidth={1.75}
        aria-label={t("shifts.active")}
      />
    ) : (
      <span className="text-on-surface-variant">{t("shifts.inactive")}</span>
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
        label={t("shifts.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("shifts.save")}
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
          value={filteredShifts}
          loading={loading}
          dataKey="id"
          selection={selectedShift}
          onSelectionChange={(e) => setSelectedShift(e.value as Shift | null)}
          onRowDoubleClick={(e) => openEdit(e.data as Shift)}
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
          tableStyle={{ minWidth: "80rem" }}
          stateStorage="local"
          stateKey="athene-shifts-table"
          emptyMessage={t("shifts.empty")}
        >
          <Column field="key" header={t("shifts.key")} sortable />
          <Column field="name" header={t("shifts.name")} sortable />
          <Column field="shortCode" header={t("shifts.shortCode")} sortable className="w-28" />
          <Column
            field="colorHex"
            header={t("shifts.colorHex")}
            sortable
            body={colorColumnBody}
            className="w-40"
          />
          <Column field="startTime" header={t("shifts.startTime")} sortable className="w-28" />
          <Column field="endTime" header={t("shifts.endTime")} sortable className="w-28" />
          <Column
            field="breakHours"
            header={t("shifts.breakHours")}
            sortable
            body={breakHoursColumnBody}
            className="w-28"
          />
          <Column
            field="weekdays"
            header={t("shifts.weekdays")}
            sortable
            body={weekdaysColumnBody}
            className="min-w-[8rem]"
          />
          <Column field="siteName" header={t("shifts.site")} sortable body={siteColumnBody} />
          <Column
            columnKey="active"
            header={t("shifts.active")}
            body={activeBody}
            className="w-28 text-center"
          />
          <Column
            field="createdAt"
            header={t("shifts.createdAt")}
            body={(row: Shift) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("shifts.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("shifts.updatedAt")}
            body={(row: Shift) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("shifts.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <AppDialog
        header={editingId ? t("shifts.editTitle") : t("shifts.createTitle")}
        visible={dialogVisible}
        style={{ width: "min(32rem, 95vw)" }}
        contentClassName="app-atyp-dialog"
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
              htmlFor="shift-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("shifts.key")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="shift-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="shift-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("shifts.name")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="shift-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="shift-shortCode"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("shifts.shortCode")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputText
              id="shift-shortCode"
              value={form.shortCode}
              onChange={(e) => setForm((f) => ({ ...f, shortCode: e.target.value }))}
              className="w-full"
              maxLength={5}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="shift-colorHex"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("shifts.colorHex")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <AppColorPicker
                inputId="shift-colorHex"
                value={form.colorHex}
                onChange={(colorHex) => setForm((f) => ({ ...f, colorHex }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label
                htmlFor="shift-startTime"
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("shifts.startTime")}
                <span className="app-required-marker" aria-hidden>
                  *
                </span>
              </label>
              <Calendar
                inputId="shift-startTime"
                value={timeStringToDate(form.startTime)}
                onChange={(e) => {
                  const next = e.value instanceof Date ? e.value : null;
                  setForm((f) => ({ ...f, startTime: dateToTimeString(next) }));
                }}
                timeOnly
                hourFormat="24"
                className="w-full"
                appendTo={overlayAppendTo}
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="shift-endTime"
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("shifts.endTime")}
                <span className="app-required-marker" aria-hidden>
                  *
                </span>
              </label>
              <Calendar
                inputId="shift-endTime"
                value={timeStringToDate(form.endTime)}
                onChange={(e) => {
                  const next = e.value instanceof Date ? e.value : null;
                  setForm((f) => ({ ...f, endTime: dateToTimeString(next) }));
                }}
                timeOnly
                hourFormat="24"
                className="w-full"
                appendTo={overlayAppendTo}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="shift-breakHours"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("shifts.breakHours")}
            </label>
            <InputNumber
              inputId="shift-breakHours"
              value={form.breakHours}
              onValueChange={(e) => setForm((f) => ({ ...f, breakHours: e.value ?? 0 }))}
              min={0}
              minFractionDigits={0}
              maxFractionDigits={2}
              suffix={` ${t("shifts.breakHoursUnit")}`}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="shift-weekdays"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("shifts.weekdays")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <MultiSelect
              inputId="shift-weekdays"
              value={form.weekdays}
              options={weekdayOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  weekdays: (Array.isArray(e.value) ? e.value : []).filter((entry): entry is WeekdayKey =>
                    WEEKDAY_KEYS.includes(entry as WeekdayKey),
                  ),
                }))
              }
              placeholder={t("shifts.weekdaysPlaceholder")}
              className="w-full"
              display="comma"
              appendTo={overlayAppendTo}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="shift-site"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("shifts.site")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <Dropdown
              inputId="shift-site"
              value={form.siteId}
              options={siteDropdownOptions}
              onChange={(e) => setForm((f) => ({ ...f, siteId: String(e.value ?? "") }))}
              placeholder={t("shifts.sitePlaceholder")}
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
              inputId="shift-isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: Boolean(e.checked) }))}
              className="rounded-none"
            />
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
              {t("shifts.active")}
            </span>
          </label>
        </div>
      </AppDialog>
    </div>
  );
}
