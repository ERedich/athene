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
import { Paginator, type PaginatorPageChangeEvent } from "primereact/paginator";
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

const TRANSLATIONS_TABLE_VIRTUAL_ROW_PX = 72;
const TRANSLATIONS_PAGE_SIZE_DEFAULT = 50;
const TRANSLATIONS_PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debouncedValue;
}

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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(TRANSLATIONS_PAGE_SIZE_DEFAULT);
  const [ctxRow, setCtxRow] = useState<TranslationRow | null>(null);

  const { baselineDeFlat, baselineEnFlat } = useMemo(() => getBuiltInFlattenedBundles(), []);
  const debouncedSearch = useDebouncedValue(searchTerm, 200);

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
      const keys = Array.from(
        new Set([...Object.keys(baselineDeFlat), ...Object.keys(baselineEnFlat)]),
      ).sort((a, b) => a.localeCompare(b));
      setRows(
        keys.map((messageKey) => ({
          messageKey,
          de: nextDe[messageKey] ?? baselineDeFlat[messageKey] ?? "",
          en: nextEn[messageKey] ?? baselineEnFlat[messageKey] ?? "",
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
  }, [baselineDeFlat, baselineEnFlat, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const blob = `${row.messageKey} ${row.de} ${row.en}`.toLowerCase();
      return blob.includes(q);
    });
  }, [rows, debouncedSearch]);

  const paginatedRows = useMemo(() => {
    const start = page * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const virtualScrollerOptions = useMemo(
    () => ({ itemSize: TRANSLATIONS_TABLE_VIRTUAL_ROW_PX, showLoader: true, delay: 0 }),
    [],
  );

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, pageSize]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredRows.length / pageSize) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [filteredRows.length, page, pageSize]);

  useEffect(() => {
    setHeaderRowCount(filteredRows.length);
    return () => setHeaderRowCount(null);
  }, [filteredRows.length, setHeaderRowCount]);

  const onPageChange = useCallback((e: PaginatorPageChangeEvent) => {
    if (e.rows !== pageSize) {
      setPageSize(e.rows);
      setPage(0);
      return;
    }
    setPage(e.page);
  }, [pageSize]);

  const updateRowField = useCallback((messageKey: string, field: "de" | "en", value: string) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.messageKey === messageKey);
      if (idx === -1) return prev;
      const cur = prev[idx]!;
      if (cur[field] === value) return prev;
      const next = prev.slice();
      next[idx] = { ...cur, [field]: value };
      return next;
    });
  }, []);

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
    const bDe = baselineDeFlat;
    const bEn = baselineEnFlat;
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
  }, [baselineDeFlat, baselineEnFlat, patchServer, rows, serverDe, serverEn, t]);

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

  const deBody = useCallback(
    (row: TranslationRow) => (
      <InputTextarea
        value={row.de}
        onChange={(e) => updateRowField(row.messageKey, "de", e.target.value)}
        rows={2}
        className="max-h-14 w-full max-w-[min(100%,28rem)] resize-none overflow-y-auto text-sm"
      />
    ),
    [updateRowField],
  );

  const enBody = useCallback(
    (row: TranslationRow) => (
      <InputTextarea
        value={row.en}
        onChange={(e) => updateRowField(row.messageKey, "en", e.target.value)}
        rows={2}
        className="max-h-14 w-full max-w-[min(100%,28rem)] resize-none overflow-y-auto text-sm"
      />
    ),
    [updateRowField],
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

      <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-on-surface)_12%,transparent)] bg-surface-container-low p-3">
        <DataTable
          value={paginatedRows}
          loading={loading}
          dataKey="messageKey"
          scrollable
          scrollHeight="flex"
          size="small"
          className="app-data-table min-h-0 w-full flex-1 text-sm"
          virtualScrollerOptions={virtualScrollerOptions}
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
        <Paginator
          first={page * pageSize}
          rows={pageSize}
          totalRecords={filteredRows.length}
          onPageChange={onPageChange}
          template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
          rowsPerPageOptions={TRANSLATIONS_PAGE_SIZE_OPTIONS}
        />
      </div>
    </div>
  );
}
