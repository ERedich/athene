import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Toast } from "primereact/toast";

import { AppDialog } from "../components/AppDialog";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import { useAppCrud } from "../lib/usePermission";
import {
  createActionIcon,
  createActionNavItem,
} from "../lib/headerActionClasses";

type FeedbackEntry = {
  id: string;
  entryNumber: number;
  body: string;
  createdAt: string;
  createdBy: string;
  loginName: string;
};

const bodyMax = 4000;

export function FeedbackPage() {
  const { t, i18n } = useTranslation();
  const crud = useAppCrud("feedback");
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FeedbackEntry | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((row) =>
      [String(row.entryNumber), row.body, row.loginName].join(" ").toLowerCase().includes(q),
    );
  }, [entries, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filtered.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filtered.length, setHeaderRowCount]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/app-feedback");
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as FeedbackEntry[];
      setEntries(data);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("feedback.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const openCreate = useCallback(() => {
    setBody("");
    setDialogVisible(true);
  }, []);

  const save = async () => {
    const trimmed = body.trim();
    if (!trimmed) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("feedback.validationRequired"),
        life: 4000,
      });
      return;
    }
    if (trimmed.length > bodyMax) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("feedback.validationTooLong"),
        life: 4000,
      });
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/app-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) {
        toastRef.current?.show({
          severity: "error",
          summary: t("feedback.saveError"),
          life: 6000,
        });
        return;
      }
      setDialogVisible(false);
      setBody("");
      await loadEntries();
      toastRef.current?.show({
        severity: "success",
        summary: t("feedback.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("feedback.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (selected && !entries.some((e) => e.id === selected.id)) {
      setSelected(null);
    }
  }, [entries, selected]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        {crud.canCreate ? (
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
              <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("feedback.new")}</span>
            </button>
          </li>
        ) : null}
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("feedback.searchPlaceholder")}
              aria-label={t("feedback.searchPlaceholder")}
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [crud.canCreate, openCreate, searchTerm, setHeaderActions, t]);

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
        label={t("feedback.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("feedback.save")}
        icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        loading={saving}
        onClick={() => void save()}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />

      <div className="flex min-h-0 flex-1 flex-col">
        <DataTable
          className="app-data-table w-full"
          value={filtered}
          loading={loading}
          dataKey="id"
          selection={selected}
          onSelectionChange={(e) => setSelected(e.value as FeedbackEntry | null)}
          selectionMode="single"
          metaKeySelection={false}
          stripedRows
          showGridlines
          scrollable
          resizableColumns
          reorderableColumns
          columnResizeMode="expand"
          scrollHeight="flex"
          tableStyle={{ minWidth: "48rem" }}
          stateStorage="local"
          stateKey="athene-feedback-table"
          emptyMessage={t("feedback.empty")}
        >
          <Column
            field="entryNumber"
            header={t("feedback.colNumber")}
            sortable
            className="w-24 whitespace-nowrap"
          />
          <Column
            field="body"
            header={t("feedback.colBody")}
            sortable
            style={{ maxWidth: "36rem" }}
            body={(row: FeedbackEntry) => (
              <span className="whitespace-pre-wrap break-words">{row.body}</span>
            )}
          />
          <Column
            field="loginName"
            header={t("feedback.colUser")}
            sortable
            className="w-40 whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdAt"
            header={t("feedback.colCreatedAt")}
            body={(row: FeedbackEntry) => formatShortDt(row.createdAt)}
            sortable
            className="w-44 whitespace-nowrap text-on-surface-variant"
          />
        </DataTable>
      </div>

      <AppDialog
        header={t("feedback.createTitle")}
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
              htmlFor="feedback-body"
              className="block text-[11px] text-outline uppercase tracking-[0.1em]"
            >
              {t("feedback.colBody")}
              <span className="app-required-marker" aria-hidden>
                *
              </span>
            </label>
            <InputTextarea
              id="feedback-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full"
              rows={8}
              autoResize
              maxLength={bodyMax}
            />
          </div>
        </div>
      </AppDialog>
    </div>
  );
}
