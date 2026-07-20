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
    case "EX":
    case "RM":
    case "RT":
    case "IV":
      return `app-tx-type-badge app-tx-type-badge--${type}`;
    default:
      return "app-tx-type-badge app-tx-type-badge--unknown";
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
    <span className={typeBadgeClass(row.type)} title={t(typeLabelKey[row.type] ?? row.type)}>
      {row.type}
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
        tableStyle={{ minWidth: "52rem" }}
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
        <Column columnKey="type" header={t("transactions.colType")} body={typeBody} className="w-36 text-center" align="center" alignHeader="center" />
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
          field="employeeKey"
          header={t("transactions.colEmployee")}
          body={(r: TransactionRow) => {
            const parts = [r.employeeKey, r.employeeName]
              .map((x) => (typeof x === "string" ? x.trim() : ""))
              .filter(Boolean);
            return <span className="text-sm">{parts.length ? parts.join(" — ") : "—"}</span>;
          }}
          className="whitespace-nowrap"
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
