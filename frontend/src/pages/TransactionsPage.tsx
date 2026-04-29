import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputText } from "primereact/inputtext";
import { Paginator, type PaginatorPageChangeEvent } from "primereact/paginator";
import { Toast } from "primereact/toast";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch, apiUrl } from "../lib/api";

export type TransactionRow = {
  id: string;
  transactionNumber: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  type: string;
  bookedAt: string;
  quantity: string;
  workOrderId: string | null;
  workOrderOrderNumber: string | null;
  remark: string | null;
};

type SiteOption = { id: string; key: string; name: string };

const TX_TYPES = ["IN", "EX", "RM", "RT", "IV"] as const;

function typeBadgeClass(type: string): string {
  switch (type) {
    case "IN":
      return "border-emerald-400/35 bg-emerald-500/15 text-emerald-200";
    case "EX":
      return "border-sky-400/35 bg-sky-500/15 text-sky-200";
    case "RM":
      return "border-amber-400/35 bg-amber-500/15 text-amber-200";
    case "RT":
      return "border-violet-400/35 bg-violet-500/15 text-violet-200";
    case "IV":
      return "border-rose-400/35 bg-rose-500/15 text-rose-200";
    default:
      return "border-white/15 bg-white/10 text-on-surface";
  }
}

export function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);

  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterSiteId, setFilterSiteId] = useState<string | null>(null);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [sites, setSites] = useState<SiteOption[]>([]);
  const [detail, setDetail] = useState<TransactionRow | null>(null);

  const typeLabelKey = useMemo(
    () =>
      ({
        IN: "transactions.typeIN",
        EX: "transactions.typeEX",
        RM: "transactions.typeRM",
        RT: "transactions.typeRT",
        IV: "transactions.typeIV",
      }) as Record<string, string>,
    [],
  );

  const typeOptions = useMemo(
    () => [
      { label: t("transactions.typeAll"), value: null },
      ...TX_TYPES.map((code) => ({
        label: t(typeLabelKey[code] ?? code),
        value: code,
      })),
    ],
    [t, typeLabelKey],
  );

  const siteOptions = useMemo(
    () => [
      { label: t("transactions.filterSiteAll"), value: null },
      ...sites.map((s) => ({
        label: `${s.key} — ${s.name}`,
        value: s.id,
      })),
    ],
    [sites, t],
  );

  useEffect(() => {
    setHeaderRowCount(total);
    return () => {
      setHeaderRowCount(null);
    };
  }, [setHeaderRowCount, total]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch(apiUrl("/api/sites"));
        if (!res.ok) return;
        const data = (await res.json()) as SiteOption[];
        setSites(Array.isArray(data) ? data : []);
      } catch {
        /* ignore; filters still work without site list */
      }
    })();
  }, []);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [
        row.transactionNumber,
        row.siteKey,
        row.siteName,
        row.type,
        row.workOrderOrderNumber ?? "",
        row.remark ?? "",
        row.quantity,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, searchTerm]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page + 1));
    params.set("limit", String(limit));
    if (filterType) params.set("type", filterType);
    if (filterSiteId) params.set("siteId", filterSiteId);
    if (filterFrom.trim()) params.set("from", filterFrom.trim());
    if (filterTo.trim()) params.set("to", filterTo.trim());
    try {
      const res = await apiFetch(apiUrl(`/api/transactions?${params.toString()}`));
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as {
        rows: TransactionRow[];
        total: number;
      };
      setRows(data.rows);
      setTotal(data.total);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("transactions.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterType, filterSiteId, filterFrom, filterTo, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li className="ml-auto">
          <IconField iconPosition="left">
            <InputIcon className="pi pi-search text-xs text-on-surface-variant" />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("transactions.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [searchTerm, setHeaderActions, t]);

  const onPageChange = (e: PaginatorPageChangeEvent) => {
    if (e.rows !== limit) {
      setLimit(e.rows);
      setPage(0);
      return;
    }
    setPage(e.page);
  };

  const formatDt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const formatQty = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    return new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: 4,
      minimumFractionDigits: 0,
    }).format(n);
  };

  const remarkShort = (text: string | null, max = 72) => {
    if (!text) return "—";
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
  };

  const typeBody = (row: TransactionRow) => (
    <span
      className={`inline-flex max-w-[14rem] items-center rounded-sm border px-2 py-0.5 text-[11px] ${typeBadgeClass(row.type)}`}
      title={t(typeLabelKey[row.type] ?? row.type)}
    >
      <span className="truncate">{row.type}</span>
    </span>
  );

  const detailFooter = (
    <div className="flex justify-end">
      <Button
        type="button"
        label={t("transactions.close")}
        severity="secondary"
        outlined
        onClick={() => setDetail(null)}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />
      <p className="m-0 text-sm text-on-surface-variant">{t("transactions.intro")}</p>

      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-white/10 bg-surface-container-low p-3">
        <div className="space-y-1">
          <span className="block text-[10px] uppercase tracking-wider text-outline">{t("transactions.filterType")}</span>
          <Dropdown
            value={filterType}
            options={typeOptions}
            onChange={(e) => {
              setFilterType(e.value as string | null);
              setPage(0);
            }}
            className="min-w-[14rem] text-sm"
          />
        </div>
        <div className="space-y-1">
          <span className="block text-[10px] uppercase tracking-wider text-outline">{t("transactions.filterSite")}</span>
          <Dropdown
            value={filterSiteId}
            options={siteOptions}
            onChange={(e) => {
              setFilterSiteId(e.value as string | null);
              setPage(0);
            }}
            className="min-w-[14rem] text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-outline" htmlFor="tx-from">
            {t("transactions.filterFrom")}
          </label>
          <InputText
            id="tx-from"
            value={filterFrom}
            onChange={(e) => {
              setFilterFrom(e.target.value);
              setPage(0);
            }}
            className="text-sm"
            placeholder="2026-01-01T00:00:00Z"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-outline" htmlFor="tx-to">
            {t("transactions.filterTo")}
          </label>
          <InputText
            id="tx-to"
            value={filterTo}
            onChange={(e) => {
              setFilterTo(e.target.value);
              setPage(0);
            }}
            className="text-sm"
            placeholder="2026-12-31T23:59:59Z"
          />
        </div>
        <Button
          type="button"
          icon="pi pi-refresh"
          label={t("transactions.apply")}
          outlined
          size="small"
          className="ml-auto"
          onClick={() => void load()}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <DataTable
          className="app-data-table w-full"
          value={filteredRows}
          loading={loading}
          dataKey="id"
          stripedRows
          showGridlines
          scrollable
          resizableColumns
          reorderableColumns
          columnResizeMode="expand"
          scrollHeight="flex"
          tableStyle={{ minWidth: "72rem" }}
          stateStorage="local"
          stateKey="athene-transactions-table"
          emptyMessage={t("transactions.empty")}
          onRowClick={(e) => setDetail(e.data as TransactionRow)}
          rowClassName={() => "cursor-pointer"}
        >
          <Column
            field="transactionNumber"
            header={t("transactions.colTransactionNumber")}
            sortable
            className="whitespace-nowrap"
          />
          <Column
            field="siteKey"
            header={t("transactions.colSite")}
            body={(r: TransactionRow) => (
              <span>
                {r.siteKey}
                <span className="text-on-surface-variant"> · {r.siteName}</span>
              </span>
            )}
            sortable
          />
          <Column columnKey="type" header={t("transactions.colType")} body={typeBody} className="w-36" />
          <Column
            field="bookedAt"
            header={t("transactions.colBookedAt")}
            body={(r: TransactionRow) => formatDt(r.bookedAt)}
            sortable
            className="whitespace-nowrap"
          />
          <Column
            field="quantity"
            header={t("transactions.colQuantity")}
            body={(r: TransactionRow) => formatQty(r.quantity)}
            sortable
            className="text-right whitespace-nowrap"
          />
          <Column
            field="workOrderOrderNumber"
            header={t("transactions.colWorkOrder")}
            body={(r: TransactionRow) => (r.workOrderOrderNumber != null ? r.workOrderOrderNumber : "—")}
            sortable
          />
          <Column
            field="remark"
            header={t("transactions.colRemark")}
            body={(r: TransactionRow) => <span className="text-sm">{remarkShort(r.remark)}</span>}
            className="max-w-xs"
          />
        </DataTable>
        <Paginator
          first={page * limit}
          rows={limit}
          totalRecords={total}
          onPageChange={onPageChange}
          template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
          rowsPerPageOptions={[25, 50, 100]}
        />
      </div>

      <Dialog
        header={t("transactions.detailTitle")}
        visible={detail !== null}
        className="app-big-modal-window"
        onHide={() => setDetail(null)}
        footer={detailFooter}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        {detail ? (
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto text-sm">
            <dl className="m-0 grid grid-cols-[10rem_1fr] gap-x-3 gap-y-2">
              <dt className="text-on-surface-variant">{t("transactions.colTransactionNumber")}</dt>
              <dd className="m-0">{detail.transactionNumber}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colSite")}</dt>
              <dd className="m-0">
                {detail.siteKey} — {detail.siteName}
              </dd>
              <dt className="text-on-surface-variant">{t("transactions.colType")}</dt>
              <dd className="m-0">{typeBody(detail)}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colBookedAt")}</dt>
              <dd className="m-0">{formatDt(detail.bookedAt)}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colQuantity")}</dt>
              <dd className="m-0">{formatQty(detail.quantity)}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colWorkOrder")}</dt>
              <dd className="m-0">{detail.workOrderOrderNumber ?? "—"}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colRemark")}</dt>
              <dd className="m-0 whitespace-pre-wrap break-words">{detail.remark ?? "—"}</dd>
            </dl>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
