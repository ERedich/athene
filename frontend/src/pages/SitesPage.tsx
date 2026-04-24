import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { ColorPicker } from "primereact/colorpicker";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import type { AppShellOutletContext } from "../layout/AppShellLayout";

type Site = {
  id: string;
  key: string;
  name: string;
  isPlant: boolean;
  colorHex: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

const apiFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, { ...init, credentials: "include" });

type FormState = {
  key: string;
  name: string;
  isPlant: boolean;
  colorHex: string;
};

const defaultColorHex = "#64748b";

function pickerValueFromStored(hex: string): string {
  return hex.replace(/^#/, "").toLowerCase();
}

function storedFromPickerValue(raw: string): string {
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/i.exec(withHash);
  if (!m) return defaultColorHex;
  let h = m[1]!.toLowerCase();
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return `#${h}`;
}

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  isPlant: false,
  colorHex: defaultColorHex,
});

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10 hover:text-red-500`;

export function SitesPage() {
  const { t, i18n } = useTranslation();
  const { setHeaderActions } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const loadSites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/sites");
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as Site[];
      setSites(data);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("sites.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogVisible(true);
  }, []);

  const openEdit = useCallback((row: Site) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      isPlant: row.isPlant,
      colorHex: storedFromPickerValue(pickerValueFromStored(row.colorHex || defaultColorHex)),
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
    let detail = t("sites.saveError");
    if (code === "duplicate_key") detail = t("sites.duplicateKey");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    if (!key || !name) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("sites.validationRequired"),
        life: 4000,
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        key,
        name,
        isPlant: form.isPlant,
        colorHex: form.colorHex,
      };
      const url = editingId ? `/api/sites/${editingId}` : "/api/sites";
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
      await loadSites();
      toastRef.current?.show({
        severity: "success",
        summary: editingId ? t("sites.saved") : t("sites.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("sites.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/sites/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedSite((cur) => (cur?.id === id ? null : cur));
          await loadSites();
          toastRef.current?.show({
            severity: "success",
            summary: t("sites.deleted"),
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
          code === "foreign_key_violation" ? t("sites.foreignKey") : t("sites.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("sites.deleteError"),
          life: 6000,
        });
      }
    },
    [loadSites, t],
  );

  const confirmDelete = useCallback(
    (row: Site) => {
      confirmDialog({
        message: t("sites.confirmDelete", { name: row.name }),
        header: t("sites.confirmDeleteTitle"),
        icon: "pi pi-exclamation-triangle",
        acceptClassName: "p-button-danger",
        acceptLabel: t("sites.yes"),
        rejectLabel: t("sites.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  useEffect(() => {
    if (selectedSite && !sites.some((s) => s.id === selectedSite.id)) {
      setSelectedSite(null);
    }
  }, [sites, selectedSite]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <i className="pi pi-plus" aria-hidden />
            <span>{t("sites.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedSite}
            onClick={() => {
              if (selectedSite) openEdit(selectedSite);
            }}
          >
            <i className="pi pi-pencil" aria-hidden />
            <span>{t("sites.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedSite}
            onClick={() => {
              if (selectedSite) confirmDelete(selectedSite);
            }}
          >
            <i className="pi pi-trash" aria-hidden />
            <span>{t("sites.delete")}</span>
          </button>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, openCreate, openEdit, selectedSite, setHeaderActions, t]);

  const plantBody = (row: Site) =>
    row.isPlant ? (
      <i className="pi pi-check text-on-surface" aria-label={t("sites.werk")} />
    ) : (
      <span className="text-on-surface-variant">—</span>
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

  const colorBody = (row: Site) => {
    const hex = row.colorHex ?? defaultColorHex;
    return (
      <div className="flex items-center gap-2">
        <span
          className="h-4 w-4 shrink-0 rounded-sm border border-white/15 ring-1 ring-white/5"
          style={{ backgroundColor: hex }}
          aria-hidden
        />
        <span className="font-mono text-xs text-on-surface-variant">{hex}</span>
      </div>
    );
  };

  const dialogFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("sites.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("sites.save")}
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
          className="compact-data-table w-full"
          value={sites}
          loading={loading}
          dataKey="id"
          selection={selectedSite}
          onSelectionChange={(e) => setSelectedSite(e.value as Site | null)}
          selectionMode="single"
          metaKeySelection={false}
          stripedRows
          size="small"
          scrollable
          scrollHeight="flex"
          emptyMessage={t("sites.empty")}
        >
          <Column field="key" header={t("sites.key")} sortable />
          <Column field="name" header={t("sites.name")} sortable />
          <Column
            field="updatedAt"
            header={t("sites.updatedAt")}
            body={(row: Site) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-xs text-on-surface-variant"
          />
          <Column header={t("sites.color")} body={colorBody} className="w-40" />
          <Column header={t("sites.werk")} body={plantBody} className="w-24 text-center" />
        </DataTable>
      </div>

      <Dialog
        header={editingId ? t("sites.editTitle") : t("sites.createTitle")}
        visible={dialogVisible}
        style={{ width: "min(32rem, 95vw)" }}
        onHide={() => setDialogVisible(false)}
        footer={dialogFooter}
        modal
        draggable={false}
        resizable={false}
      >
        <div className="flex flex-col gap-4 pt-1">
          <div className="space-y-2">
            <label
              htmlFor="site-key"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("sites.key")}
            </label>
            <InputText
              id="site-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="site-name"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("sites.name")}
            </label>
            <InputText
              id="site-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="site-colorHex"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("sites.color")}
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <ColorPicker
                inputId="site-colorHex"
                format="hex"
                value={pickerValueFromStored(form.colorHex)}
                onChange={(e) => {
                  const v = e.value;
                  const raw = typeof v === "string" ? v : "";
                  setForm((f) => ({ ...f, colorHex: storedFromPickerValue(raw) }));
                }}
                appendTo={typeof document !== "undefined" ? document.body : undefined}
              />
              <span className="font-mono text-sm text-on-surface-variant">{form.colorHex}</span>
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer group">
            <Checkbox
              inputId="site-isPlant"
              checked={form.isPlant}
              onChange={(e) => setForm((f) => ({ ...f, isPlant: Boolean(e.checked) }))}
              className="rounded-none"
            />
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
              {t("sites.werk")}
            </span>
          </label>
        </div>
      </Dialog>
    </div>
  );
}
