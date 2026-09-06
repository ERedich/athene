import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Paginator, type PaginatorPageChangeEvent } from "primereact/paginator";
import { Button } from "primereact/button";

import { LucideInputSearchIcon } from "../LucideInputSearchIcon";
import { LucideSpinner } from "../../icons/lucide";
import { useAuth } from "../../auth/AuthContext";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../../lib/appParameterKeys";
import { apiFetch } from "../../lib/api";
import type { SparePartLookupResult } from "../../lib/sparePartLookupApi";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../../lib/siteColor";

export type SparePartSelectionRow = SparePartLookupResult & {
  siteKey: string;
  siteName: string;
  siteColorHex: string;
};

const ROWS_PER_PAGE = 50;
const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200];

type SparePartSelectionBrowserProps = {
  onSelect: (sparePart: SparePartLookupResult) => void;
  onCancel: () => void;
  /** When set, only spare parts for this site are listed. */
  siteId?: string;
};

export function SparePartSelectionBrowser({
  onSelect,
  onCancel,
  siteId,
}: SparePartSelectionBrowserProps) {
  const { t, i18n } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [spareParts, setSpareParts] = useState<SparePartSelectionRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<SparePartSelectionRow | null>(null);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(ROWS_PER_PAGE);
  const [sortField, setSortField] = useState<string>("key");
  const [sortOrder, setSortOrder] = useState<1 | -1 | 0>(1);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchTerm), 200);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await apiFetch("/api/spare-parts");
        if (!res.ok) throw new Error("load");
        const data = (await res.json()) as unknown;
        if (cancelled) return;
        const rows = Array.isArray(data)
          ? data
              .map((raw): SparePartSelectionRow | null => {
                if (!raw || typeof raw !== "object") return null;
                const o = raw as Record<string, unknown>;
                const id = typeof o.id === "string" ? o.id : "";
                const key = typeof o.key === "string" ? o.key : "";
                const rowSiteId = typeof o.siteId === "string" ? o.siteId : "";
                if (!id || !key || !rowSiteId) return null;
                if (siteFieldLocked && rowSiteId !== user.workingSiteId) return null;
                if (siteId && rowSiteId !== siteId) return null;
                return {
                  id,
                  key,
                  name: typeof o.name === "string" ? o.name : "",
                  siteId: rowSiteId,
                  siteKey: typeof o.siteKey === "string" ? o.siteKey : "",
                  siteName: typeof o.siteName === "string" ? o.siteName : "",
                  siteColorHex:
                    typeof o.siteColorHex === "string" ? o.siteColorHex : DEFAULT_SITE_COLOR_HEX,
                };
              })
              .filter((r): r is SparePartSelectionRow => r != null)
          : [];
        setSpareParts(rows);
      } catch {
        if (!cancelled) {
          setSpareParts([]);
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteFieldLocked, siteId, user.workingSiteId]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return spareParts;
    return spareParts.filter((row) =>
      [row.key, row.name, row.siteKey, row.siteName].join(" ").toLowerCase().includes(q),
    );
  }, [debouncedSearch, spareParts]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const field = sortField as keyof SparePartSelectionRow;
    arr.sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return String(av).localeCompare(String(bv), i18n.language, { numeric: true }) * (sortOrder || 1);
    });
    return arr;
  }, [filtered, i18n.language, sortField, sortOrder]);

  const paged = useMemo(
    () => sorted.slice(page * limit, page * limit + limit),
    [sorted, page, limit],
  );

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(sorted.length / limit) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [sorted.length, limit, page]);

  const onPageChange = useCallback(
    (e: PaginatorPageChangeEvent) => {
      if (e.rows !== limit) {
        setLimit(e.rows);
        setPage(0);
        return;
      }
      setPage(e.page);
    },
    [limit],
  );

  const confirmSelect = useCallback(
    (row: SparePartSelectionRow | null) => {
      if (!row) return;
      onSelect({
        id: row.id,
        key: row.key,
        name: row.name,
        siteId: row.siteId,
      });
    },
    [onSelect],
  );

  const siteBody = useCallback((row: SparePartSelectionRow) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={label}>
        {row.siteName || row.siteKey}
      </span>
    );
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-solid app-wo-detail-outline-border px-3 py-2">
        <IconField iconPosition="left" className="w-full !h-9 min-h-9 max-h-9">
          <LucideInputSearchIcon />
          <InputText
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(0);
            }}
            placeholder={t("spareParts.searchPlaceholder")}
            className="w-full !h-9"
          />
        </IconField>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-1 pt-1">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-on-surface-variant">
            <LucideSpinner className="h-5 w-5" />
            <span>{t("selItem.sparePart.loading")}</span>
          </div>
        ) : loadError ? (
          <div className="px-3 py-8 text-sm text-red-500">{t("spareParts.loadError")}</div>
        ) : (
          <DataTable
            value={paged}
            dataKey="id"
            selectionMode="single"
            selection={selected}
            onSelectionChange={(e) => setSelected((e.value as SparePartSelectionRow | null) ?? null)}
            onRowDoubleClick={(e) => confirmSelect(e.data as SparePartSelectionRow)}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={(e) => {
              setSortField(String(e.sortField ?? "key"));
              setSortOrder((e.sortOrder as 1 | -1 | 0) || 1);
            }}
            emptyMessage={t("spareParts.empty")}
            className="app-data-table w-full"
          >
            <Column field="key" header={t("spareParts.key")} sortable className="min-w-28" />
            <Column field="name" header={t("spareParts.name")} sortable className="min-w-48" />
            <Column field="siteName" header={t("spareParts.site")} body={siteBody} sortable className="min-w-36" />
          </DataTable>
        )}
      </div>

      <div className="shrink-0 border-t border-solid app-wo-detail-outline-border">
        {!loading && !loadError ? (
          <Paginator
            first={page * limit}
            rows={limit}
            totalRecords={sorted.length}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
            onPageChange={onPageChange}
            className="border-0"
          />
        ) : null}
        <div className="app-wo-search-sidebar-footer flex flex-wrap items-center justify-end gap-2 px-3 py-3">
          <Button type="button" label={t("spareParts.cancel")} className="p-button-text" onClick={onCancel} />
          <Button
            type="button"
            label={t("selItem.sparePart.apply")}
            disabled={!selected}
            onClick={() => confirmSelect(selected)}
          />
        </div>
      </div>
    </div>
  );
}
