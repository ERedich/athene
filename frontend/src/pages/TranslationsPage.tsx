import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Column } from "primereact/column";
import { ContextMenu } from "primereact/contextmenu";
import { DataTable } from "primereact/datatable";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import type { MenuItem } from "primereact/menuitem";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { applyUiTranslationOverrides, getBuiltInFlattenedBundles } from "../lib/applyUiTranslationOverrides";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";

type TranslationRow = {
  messageKey: string;
  de: string;
  en: string;
};

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";

export function TranslationsPage() {
  const { t } = useTranslation();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const cmRef = useRef<ContextMenu>(null);

  const [rows, setRows] = useState<TranslationRow[]>([]);
  const [serverDe, setServerDe] = useState<Record<string, string>>({});
  const [serverEn, setServerEn] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [ctxRow, setCtxRow] = useState<TranslationRow | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/ui-translation-overrides");
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as {
        overrides?: { messageKey: string; locale: string; value: string }[];
      };
      const nextDe: Record<string, string> = {};
      const nextEn: Record<string, string> = {};
      for (const row of data.overrides ?? []) {
        if (row.locale === "de") nextDe[row.messageKey] = row.value;
        if (row.locale === "en") nextEn[row.messageKey] = row.value;
      }
      setServerDe(nextDe);
      setServerEn(nextEn);
      const { baselineDeFlat: bDe, baselineEnFlat: bEn } = getBuiltInFlattenedBundles();
      const keys = Array.from(
        new Set([...Object.keys(bDe), ...Object.keys(bEn)]),
      ).sort((a, b) => a.localeCompare(b));
      setRows(
        keys.map((messageKey) => ({
          messageKey,
          de: nextDe[messageKey] ?? bDe[messageKey] ?? "",
          en: nextEn[messageKey] ?? bEn[messageKey] ?? "",
        })),
      );
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("translations.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const blob = `${row.messageKey} ${row.de} ${row.en}`.toLowerCase();
      return blob.includes(q);
    });
  }, [rows, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filteredRows.length);
    return () => setHeaderRowCount(null);
  }, [filteredRows.length, setHeaderRowCount]);

  const patchServer = useCallback(
    async (items: { messageKey: string; de?: string | null; en?: string | null }[]) => {
      const res = await apiFetch("/api/ui-translation-overrides", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("patch");
      await applyUiTranslationOverrides();
      await loadData();
    },
    [loadData],
  );

  const resetRowFromCtx = useCallback(async () => {
    if (!ctxRow) return;
    try {
      await patchServer([
        { messageKey: ctxRow.messageKey, de: null, en: null },
      ]);
      toastRef.current?.show({
        severity: "success",
        summary: t("translations.resetRowSuccess"),
        life: 4000,
      });
      setCtxRow(null);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("translations.resetRowError"),
        life: 6000,
      });
    }
  }, [ctxRow, patchServer, t]);

  const ctxMenuItems: MenuItem[] = useMemo(
    () => [
      {
        label: t("translations.ctxCopyKey"),
        icon: <Copy className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !ctxRow,
        command: () => {
          if (!ctxRow) return;
          void navigator.clipboard.writeText(ctxRow.messageKey);
        },
      },
      {
        label: t("translations.ctxResetRow"),
        icon: <Undo2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !ctxRow,
        command: () => void resetRowFromCtx(),
      },
    ],
    [ctxRow, resetRowFromCtx, t],
  );

  const save = useCallback(async () => {
    const { baselineDeFlat: bDe, baselineEnFlat: bEn } = getBuiltInFlattenedBundles();
    const patchMap = new Map<
      string,
      { messageKey: string; de?: string | null; en?: string | null }
    >();
    for (const row of rows) {
      const effDe = serverDe[row.messageKey] ?? bDe[row.messageKey] ?? "";
      const effEn = serverEn[row.messageKey] ?? bEn[row.messageKey] ?? "";
      const baseDeVal = bDe[row.messageKey] ?? "";
      const baseEnVal = bEn[row.messageKey] ?? "";
      if (row.de !== effDe) {
        const p = patchMap.get(row.messageKey) ?? { messageKey: row.messageKey };
        p.de = row.de === baseDeVal ? null : row.de;
        patchMap.set(row.messageKey, p);
      }
      if (row.en !== effEn) {
        const p = patchMap.get(row.messageKey) ?? { messageKey: row.messageKey };
        p.en = row.en === baseEnVal ? null : row.en;
        patchMap.set(row.messageKey, p);
      }
    }
    const items = [...patchMap.values()];
    if (items.length === 0) {
      toastRef.current?.show({
        severity: "info",
        summary: t("translations.noChanges"),
        life: 3000,
      });
      return;
    }
    setSaving(true);
    try {
      await patchServer(items);
      toastRef.current?.show({
        severity: "success",
        summary: t("translations.saveSuccess"),
        life: 4000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("translations.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  }, [patchServer, rows, serverDe, serverEn, t]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={saving || loading}
            onClick={() => void save()}
          >
            <Check className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{saving ? t("translations.saving") : t("translations.save")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("translations.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [loading, save, saving, searchTerm, setHeaderActions, t]);

  const keyBody = (row: TranslationRow) => (
    <span className="font-mono text-xs text-on-surface">{row.messageKey}</span>
  );

  const deBody = (row: TranslationRow) => (
    <InputTextarea
      value={row.de}
      onChange={(e) => {
        const v = e.target.value;
        setRows((prev) =>
          prev.map((r) => (r.messageKey === row.messageKey ? { ...r, de: v } : r)),
        );
      }}
      autoResize
      rows={2}
      className="w-full max-w-[min(100%,28rem)] text-sm"
    />
  );

  const enBody = (row: TranslationRow) => (
    <InputTextarea
      value={row.en}
      onChange={(e) => {
        const v = e.target.value;
        setRows((prev) =>
          prev.map((r) => (r.messageKey === row.messageKey ? { ...r, en: v } : r)),
        );
      }}
      autoResize
      rows={2}
      className="w-full max-w-[min(100%,28rem)] text-sm"
    />
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 p-4">
      <Toast ref={toastRef} appendTo={overlayAppendTo} position="top-right" />
      <ContextMenu
        ref={cmRef}
        model={ctxMenuItems}
        appendTo={overlayAppendTo}
        onHide={() => setCtxRow(null)}
      />

      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-[color-mix(in_srgb,var(--color-on-surface)_12%,transparent)] bg-surface-container-low p-3">
        <DataTable
          value={filteredRows}
          loading={loading}
          dataKey="messageKey"
          scrollable
          scrollHeight="flex"
          size="small"
          className="app-data-table min-h-0 w-full flex-1 text-sm"
          emptyMessage={
            filteredRows.length === 0 && !loading ? t("translations.emptyFilter") : undefined
          }
          selectionMode="single"
          selection={ctxRow ?? undefined}
          onSelectionChange={(e) =>
            setCtxRow((e.value as TranslationRow | null | undefined) ?? null)
          }
          contextMenuSelection={ctxRow ?? undefined}
          onContextMenuSelectionChange={(e) =>
            setCtxRow((e.value as TranslationRow | null | undefined) ?? null)
          }
          onContextMenu={(e) => {
            cmRef.current?.show(e.originalEvent);
          }}
        >
          <Column
            field="messageKey"
            header={t("translations.colKey")}
            body={keyBody}
            style={{ width: "18rem" }}
          />
          <Column field="de" header={t("translations.colDe")} body={deBody} />
          <Column field="en" header={t("translations.colEn")} body={enBody} />
        </DataTable>
      </div>
    </div>
  );
}
