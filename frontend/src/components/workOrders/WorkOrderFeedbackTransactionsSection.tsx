import { useTranslation } from "react-i18next";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";

import type { TransactionRow } from "../../pages/TransactionsPage";

type Props = {
  rows: TransactionRow[];
  loading: boolean;
};

const typeLabelKey: Record<string, string> = {
  IN: "transactions.typeIN",
  EX: "transactions.typeEX",
  RM: "transactions.typeRM",
  RT: "transactions.typeRT",
  IV: "transactions.typeIV",
};

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

export function WorkOrderFeedbackTransactionsSection({ rows, loading }: Props) {
  const { t, i18n } = useTranslation();

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

  const remarkShort = (text: string | null, max = 96) => {
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

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-outline">{t("workOrders.feedbackTransactionsTitle")}</div>
      <DataTable
        className="app-data-table app-wo-feedback-tx-table w-full text-sm"
        value={rows}
        loading={loading}
        dataKey="id"
        stripedRows
        showGridlines
        scrollable
        scrollHeight="220px"
        tableStyle={{ minWidth: "42rem" }}
        emptyMessage={t("transactions.empty")}
      >
        <Column
          field="transactionNumber"
          header={t("transactions.colTransactionNumber")}
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
        />
        <Column columnKey="type" header={t("transactions.colType")} body={typeBody} className="w-36" />
        <Column
          field="bookedAt"
          header={t("transactions.colBookedAt")}
          body={(r: TransactionRow) => formatDt(r.bookedAt)}
          className="whitespace-nowrap"
        />
        <Column
          field="quantity"
          header={t("transactions.colQuantity")}
          body={(r: TransactionRow) => formatQty(r.quantity)}
          className="text-right whitespace-nowrap"
        />
        <Column
          field="remark"
          header={t("transactions.colRemark")}
          body={(r: TransactionRow) => <span className="text-sm">{remarkShort(r.remark)}</span>}
          className="max-w-[14rem]"
        />
      </DataTable>
    </div>
  );
}
