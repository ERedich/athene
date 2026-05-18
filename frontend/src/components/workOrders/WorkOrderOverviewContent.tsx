import "chart.js/auto";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Chart } from "primereact/chart";

import { useWorkOrderOverviewData } from "../../hooks/useWorkOrderOverviewData";
import {
  aggregateTransactionsByDay,
  aggregateTransactionsByType,
  chartColorForType,
  readThemeChartColors,
} from "../../lib/workOrderOverviewCharts";
import type { WorkOrderOverviewRow } from "../../lib/workOrderOverviewPanel";
import { WorkOrderDialogTitle } from "./WorkOrderDialogTitle";

type Props = {
  order: WorkOrderOverviewRow;
};

function formatKeyName(key: string | null, name: string | null): string {
  if (!key && !name) return "—";
  if (key && name) return `${key} · ${name}`;
  return key ?? name ?? "—";
}

function formatPlannedHours(minutes: number | null, locale: string): string {
  if (minutes == null) return "—";
  const hours = minutes / 60;
  return `${hours.toLocaleString(locale, { maximumFractionDigits: 2 })} h`;
}

export function WorkOrderOverviewContent({ order }: Props) {
  const { t, i18n } = useTranslation();
  const { assignments, transactions, loading, error } = useWorkOrderOverviewData(order.id);
  const themeColors = useMemo(() => readThemeChartColors(), []);

  const typeAgg = useMemo(() => aggregateTransactionsByType(transactions), [transactions]);
  const byDay = useMemo(
    () => aggregateTransactionsByDay(transactions, i18n.language),
    [transactions, i18n.language],
  );

  const hasTransactions = transactions.length > 0;

  const donutData = useMemo(
    () => ({
      labels: typeAgg.map((a) => a.type),
      datasets: [
        {
          data: typeAgg.map((a) => a.count),
          backgroundColor: typeAgg.map((a) => chartColorForType(a.type)),
          borderWidth: 0,
        },
      ],
    }),
    [typeAgg],
  );

  const barData = useMemo(
    () => ({
      labels: typeAgg.map((a) => a.type),
      datasets: [
        {
          label: t("workOrders.overview.chartQuantity"),
          data: typeAgg.map((a) => a.quantitySum),
          backgroundColor: typeAgg.map((a) => chartColorForType(a.type)),
          borderRadius: 4,
        },
      ],
    }),
    [typeAgg, t],
  );

  const lineData = useMemo(
    () => ({
      labels: byDay.labels,
      datasets: [
        {
          label: t("workOrders.overview.chartTimeline"),
          data: byDay.counts,
          borderColor: "var(--color-primary)",
          backgroundColor: "color-mix(in srgb, var(--color-primary) 25%, transparent)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
      ],
    }),
    [byDay, t],
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: themeColors.text, boxWidth: 12, font: { size: 11 } },
        },
      },
      scales: {
        x: {
          ticks: { color: themeColors.text, maxRotation: 45, font: { size: 10 } },
          grid: { color: themeColors.grid },
        },
        y: {
          ticks: { color: themeColors.text, font: { size: 10 } },
          grid: { color: themeColors.grid },
          beginAtZero: true,
        },
      },
    }),
    [themeColors],
  );

  const donutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right" as const,
          labels: { color: themeColors.text, boxWidth: 12, font: { size: 11 } },
        },
      },
    }),
    [themeColors],
  );

  const formatDt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const descriptionShort =
    order.description && order.description.length > 200
      ? `${order.description.slice(0, 200)}…`
      : order.description;

  const showSegment =
    order.currentSegmentStartedAt &&
    (order.status === "started" || order.status === "continued" || order.status === "paused");

  return (
    <div className="app-wo-overview-content space-y-4">
      <div className="app-wo-overview-header border-b border-outline-variant/30 pb-3">
        <div className="text-base font-medium">
          <WorkOrderDialogTitle orderNumber={order.orderNumber} status={order.status} isCreate={false} />
        </div>
        <p className="mt-1 truncate text-sm text-on-surface-variant" title={order.name}>
          {order.name}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="app-wo-overview-kpi">
          <span className="app-wo-overview-kpi-label">{t("workOrders.overview.kpiDocuments")}</span>
          <span className="app-wo-overview-kpi-value">
            {order.documentCount}
            <span className="text-on-surface-variant text-xs font-normal">
              {" "}
              + {order.assetDocumentCount} {t("workOrders.overview.assetDocs")}
            </span>
          </span>
        </div>
        <div className="app-wo-overview-kpi">
          <span className="app-wo-overview-kpi-label">{t("workOrders.overview.kpiAssignments")}</span>
          <span className="app-wo-overview-kpi-value">{order.assignedEmployeeCount}</span>
        </div>
        <div className="app-wo-overview-kpi">
          <span className="app-wo-overview-kpi-label">{t("workOrders.overview.kpiTransactions")}</span>
          <span className="app-wo-overview-kpi-value">{order.transactionCount}</span>
        </div>
        <div className="app-wo-overview-kpi">
          <span className="app-wo-overview-kpi-label">{t("workOrders.overview.kpiPlannedDuration")}</span>
          <span className="app-wo-overview-kpi-value">
            {formatPlannedHours(order.plannedDurationMinutes, i18n.language)}
          </span>
        </div>
      </div>

      <dl className="app-wo-overview-details grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <DetailRow label={t("workOrders.searchPanel.site")} value={formatKeyName(order.siteKey, order.siteName)} />
        <DetailRow label={t("workOrders.asset")} value={formatKeyName(order.assetKey, order.assetName)} />
        <DetailRow label={t("workOrders.costCenter")} value={formatKeyName(order.costCenterKey, order.costCenterName)} />
        <DetailRow
          label={t("workOrders.classification")}
          value={formatKeyName(order.classificationKey, order.classificationName)}
        />
        <DetailRow
          label={t("workOrders.workgroup")}
          value={formatKeyName(order.workgroupKey, order.workgroupName)}
        />
        <DetailRow label={t("workOrders.orderType")} value={t(`workOrders.typeValues.${order.orderType}`)} />
        <DetailRow
          label={t("workOrders.responsible")}
          value={formatKeyName(order.responsibleEmployeeKey, order.responsibleEmployeeName)}
        />
        <DetailRow label={t("workOrders.plannedStart")} value={formatDt(order.plannedStart)} />
        <DetailRow label={t("workOrders.plannedEnd")} value={formatDt(order.plannedEnd)} />
        {showSegment ? (
          <DetailRow
            label={t("workOrders.overview.currentSegment")}
            value={formatDt(order.currentSegmentStartedAt!)}
            className="sm:col-span-2"
          />
        ) : null}
        {descriptionShort ? (
          <DetailRow label={t("workOrders.description")} value={descriptionShort} className="sm:col-span-2" />
        ) : null}
      </dl>

      {loading ? (
        <p className="text-sm text-on-surface-variant">{t("workOrders.overview.loading")}</p>
      ) : error ? (
        <p className="text-sm text-red-400">{t("workOrders.overview.loadError")}</p>
      ) : null}

      {!loading && assignments.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.1em] text-outline">
            {t("workOrders.assignmentsTitle")}
          </h3>
          <ul className="max-h-24 space-y-0.5 overflow-y-auto text-sm">
            {assignments.map((a) => (
              <li key={a.id} className="truncate text-on-surface">
                {a.employeeKey}
                <span className="text-on-surface-variant"> · {a.employeeName}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.1em] text-outline">
          {t("workOrders.overview.chartsSection")}
        </h3>
        {!loading && !hasTransactions ? (
          <p className="text-sm text-on-surface-variant">{t("workOrders.overview.noTransactions")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {hasTransactions ? (
              <>
                <ChartBlock title={t("workOrders.overview.chartByType")}>
                  <Chart type="doughnut" data={donutData} options={donutOptions} className="h-full w-full" />
                </ChartBlock>
                <ChartBlock title={t("workOrders.overview.chartQuantityByType")}>
                  <Chart type="bar" data={barData} options={chartOptions} className="h-full w-full" />
                </ChartBlock>
                {byDay.labels.length > 0 ? (
                  <ChartBlock title={t("workOrders.overview.chartTimeline")}>
                    <Chart type="line" data={lineData} options={chartOptions} className="h-full w-full" />
                  </ChartBlock>
                ) : null}
              </>
            ) : loading ? (
              <div className="app-wo-overview-chart app-wo-overview-chart-skeleton" />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function DetailRow({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] uppercase tracking-wide text-outline">{label}</dt>
      <dd className="truncate text-on-surface" title={value}>
        {value}
      </dd>
    </div>
  );
}

function ChartBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-on-surface-variant">{title}</div>
      <div className="app-wo-overview-chart">{children}</div>
    </div>
  );
}
