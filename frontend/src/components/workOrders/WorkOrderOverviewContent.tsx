import "chart.js/auto";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Chart } from "primereact/chart";

import { useWorkOrderOverviewData } from "../../hooks/useWorkOrderOverviewData";
import {
  aggregateStatusHours,
  aggregateTransactionsByDay,
  aggregateTransactionsByType,
  buildScheduleTimelineModel,
  chartColorForStatus,
  chartColorForType,
  readThemeChartColors,
  readThemePrimaryChartColors,
  resolveActualEndAt,
  resolveScheduleAdherence,
  scheduleTimelinePercent,
} from "../../lib/workOrderOverviewCharts";
import type { WorkOrderOverviewRow } from "../../lib/workOrderOverviewPanel";

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

function formatChartHours(hours: number, locale: string): string {
  return `${hours.toLocaleString(locale, { maximumFractionDigits: 2 })} h`;
}

export function WorkOrderOverviewContent({ order }: Props) {
  const { t, i18n } = useTranslation();
  const { assignments, transactions, statusHistory, loading, error } = useWorkOrderOverviewData(order.id);
  const themeColors = useMemo(() => readThemeChartColors(), []);
  const primaryChartColors = useMemo(() => readThemePrimaryChartColors(), []);

  const typeAgg = useMemo(() => aggregateTransactionsByType(transactions), [transactions]);
  const byDay = useMemo(
    () => aggregateTransactionsByDay(transactions, i18n.language),
    [transactions, i18n.language],
  );
  const statusHours = useMemo(() => aggregateStatusHours(statusHistory), [statusHistory]);
  const actualEndAt = useMemo(() => resolveActualEndAt(statusHistory), [statusHistory]);
  const scheduleTimeline = useMemo(
    () => buildScheduleTimelineModel(order.plannedStart, order.plannedEnd, actualEndAt),
    [order.plannedStart, order.plannedEnd, actualEndAt],
  );

  const hasTransactions = transactions.length > 0;
  const hasStatusHours = statusHours.length > 0;

  const statusLabel = (status: string) => t(`workOrders.statusValues.${status}`, status);

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
          borderColor: primaryChartColors.border,
          backgroundColor: primaryChartColors.fill,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: primaryChartColors.border,
          pointBorderColor: primaryChartColors.border,
        },
      ],
    }),
    [byDay, t, primaryChartColors],
  );

  const statusPieData = useMemo(
    () => ({
      labels: statusHours.map((entry) => statusLabel(entry.status)),
      datasets: [
        {
          data: statusHours.map((entry) => entry.hours),
          backgroundColor: statusHours.map((entry) => chartColorForStatus(entry.status)),
          borderWidth: 0,
        },
      ],
    }),
    [statusHours, i18n.language, t],
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
      layout: {
        padding: 4,
      },
      plugins: {
        legend: {
          position: "bottom" as const,
          labels: { color: themeColors.text, boxWidth: 12, font: { size: 11 } },
        },
      },
    }),
    [themeColors],
  );

  const statusPieOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: 4,
      },
      plugins: {
        legend: {
          position: "bottom" as const,
          labels: { color: themeColors.text, boxWidth: 12, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: (ctx: { parsed: number; label?: string }) => {
              const label = ctx.label ?? "";
              return `${label}: ${formatChartHours(ctx.parsed, i18n.language)}`;
            },
          },
        },
      },
    }),
    [themeColors, i18n.language],
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

  const chartsEmpty = !loading && !hasStatusHours && !hasTransactions;

  return (
    <div className="app-wo-overview-layout">
      <div className="app-wo-overview-main space-y-4">
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

        <ScheduleSection
          plannedStart={order.plannedStart}
          plannedEnd={order.plannedEnd}
          actualEndAt={actualEndAt}
          scheduleTimeline={scheduleTimeline}
          formatDt={formatDt}
          locale={i18n.language}
          t={t}
        />

        <dl className="app-wo-overview-details grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <DetailRow
            label={t("workOrders.overview.uuid")}
            value={order.id}
            className="sm:col-span-2"
            valueClassName="font-mono text-xs break-all"
          />
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
          <DetailRow
            label={t("workOrders.orderType")}
            value={t(`workOrders.typeValues.${order.orderType}`, { defaultValue: order.orderType })}
          />
          <DetailRow
            label={t("workOrders.responsible")}
            value={formatKeyName(order.responsibleEmployeeKey, order.responsibleEmployeeName)}
          />
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
      </div>

      <section className="app-wo-overview-charts">
        <h3 className="app-wo-overview-charts-heading">
          {t("workOrders.overview.chartsSection")}
        </h3>
        {chartsEmpty ? (
          <p className="text-sm text-on-surface-variant">{t("workOrders.overview.noCharts")}</p>
        ) : (
          <div className="app-wo-overview-charts-grid">
            {loading && !hasStatusHours && !hasTransactions ? (
              <>
                <div className="app-wo-overview-chart app-wo-overview-chart-skeleton" />
                <div className="app-wo-overview-chart app-wo-overview-chart-skeleton" />
                <div className="app-wo-overview-chart app-wo-overview-chart-skeleton" />
                <div className="app-wo-overview-chart app-wo-overview-chart-skeleton" />
              </>
            ) : null}
            {hasStatusHours ? (
              <ChartBlock title={t("workOrders.overview.chartStatusDuration")}>
                <Chart
                  type="pie"
                  data={statusPieData}
                  options={statusPieOptions}
                  className="h-full w-full"
                  style={{ height: "100%", width: "100%" }}
                />
              </ChartBlock>
            ) : null}
            {hasTransactions ? (
              <>
                <ChartBlock title={t("workOrders.overview.chartByType")}>
                  <Chart
                    type="doughnut"
                    data={donutData}
                    options={donutOptions}
                    className="h-full w-full"
                    style={{ height: "100%", width: "100%" }}
                  />
                </ChartBlock>
                <ChartBlock title={t("workOrders.overview.chartQuantityByType")}>
                  <Chart
                    type="bar"
                    data={barData}
                    options={chartOptions}
                    className="h-full w-full"
                    style={{ height: "100%", width: "100%" }}
                  />
                </ChartBlock>
                {byDay.labels.length > 0 ? (
                  <ChartBlock title={t("workOrders.overview.chartTimeline")}>
                    <Chart
                      type="line"
                      data={lineData}
                      options={chartOptions}
                      className="h-full w-full"
                      style={{ height: "100%", width: "100%" }}
                    />
                  </ChartBlock>
                ) : null}
              </>
            ) : null}
          </div>
        )}
        {!loading && !hasStatusHours && hasTransactions ? (
          <p className="mt-2 text-sm text-on-surface-variant">{t("workOrders.overview.noStatusHistory")}</p>
        ) : null}
        {!loading && !hasTransactions && hasStatusHours ? (
          <p className="mt-2 text-sm text-on-surface-variant">{t("workOrders.overview.noTransactions")}</p>
        ) : null}
      </section>
    </div>
  );
}

function DetailRow({
  label,
  value,
  className = "",
  valueClassName = "",
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] uppercase tracking-wide text-outline">{label}</dt>
      <dd className={`text-on-surface ${valueClassName || "truncate"}`} title={value}>
        {value}
      </dd>
    </div>
  );
}

function ChartBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="app-wo-overview-chart-cell">
      <div className="mb-1 text-xs font-medium text-on-surface-variant">{title}</div>
      <div className="app-wo-overview-chart">{children}</div>
    </div>
  );
}

type ScheduleSectionProps = {
  plannedStart: string;
  plannedEnd: string;
  actualEndAt: string | null;
  scheduleTimeline: ReturnType<typeof buildScheduleTimelineModel>;
  formatDt: (iso: string) => string;
  locale: string;
  t: (key: string, options?: Record<string, unknown>) => string;
};

function ScheduleSection({
  plannedStart,
  plannedEnd,
  actualEndAt,
  scheduleTimeline,
  formatDt,
  locale,
  t,
}: ScheduleSectionProps) {
  const adherence = resolveScheduleAdherence(plannedEnd, actualEndAt);

  const deltaLabel = (() => {
    if (!adherence) return null;
    const { late, deltaHours, isOpen } = adherence;
    const absHours = Math.abs(deltaHours);
    const formatted = absHours.toLocaleString(locale, { maximumFractionDigits: 1 });

    if (isOpen) {
      if (late) return t("workOrders.overview.scheduleOverdue", { hours: formatted });
      if (absHours < 0.05) return t("workOrders.overview.scheduleInTime");
      const remaining = (-deltaHours).toLocaleString(locale, { maximumFractionDigits: 1 });
      return t("workOrders.overview.scheduleRemaining", { hours: remaining });
    }
    if (absHours < 0.05) return t("workOrders.overview.scheduleOnTime");
    return late
      ? t("workOrders.overview.scheduleLate", { hours: formatted })
      : t("workOrders.overview.scheduleEarly", { hours: formatted });
  })();

  const actualTone: ScheduleItemTone = adherence?.late ? "actual-late" : "actual-on-time";
  const actualValue = actualEndAt ? formatDt(actualEndAt) : t("workOrders.overview.scheduleStillOpen");

  const plannedLeft = scheduleTimeline
    ? scheduleTimelinePercent(
        scheduleTimeline.plannedStartMs,
        scheduleTimeline.rangeStartMs,
        scheduleTimeline.rangeEndMs,
      )
    : 0;
  const plannedWidth = scheduleTimeline
    ? Math.max(
        2,
        scheduleTimelinePercent(
          scheduleTimeline.plannedEndMs,
          scheduleTimeline.rangeStartMs,
          scheduleTimeline.rangeEndMs,
        ) - plannedLeft,
      )
    : 0;
  const actualLeft =
    scheduleTimeline?.actualEndMs != null
      ? scheduleTimelinePercent(
          scheduleTimeline.actualEndMs,
          scheduleTimeline.rangeStartMs,
          scheduleTimeline.rangeEndMs,
        )
      : null;
  const nowLeft =
    adherence?.isOpen && scheduleTimeline
      ? scheduleTimelinePercent(
          adherence.referenceMs,
          scheduleTimeline.rangeStartMs,
          scheduleTimeline.rangeEndMs,
        )
      : null;

  return (
    <section className="app-wo-overview-schedule">
      <h3 className="app-wo-overview-section-title">{t("workOrders.overview.scheduleSection")}</h3>
      {scheduleTimeline ? (
        <div className="app-wo-overview-schedule-track" aria-hidden>
          <div
            className="app-wo-overview-schedule-planned"
            style={{ left: `${plannedLeft}%`, width: `${plannedWidth}%` }}
          />
          <div
            className="app-wo-overview-schedule-marker app-wo-overview-schedule-marker--start"
            style={{ left: `${plannedLeft}%` }}
          />
          <div
            className="app-wo-overview-schedule-marker app-wo-overview-schedule-marker--planned-end"
            style={{ left: `${plannedLeft + plannedWidth}%` }}
          />
          {actualLeft != null ? (
            <div
              className={`app-wo-overview-schedule-marker app-wo-overview-schedule-marker--actual-end${
                adherence?.late ? " app-wo-overview-schedule-marker--late" : ""
              }`}
              style={{ left: `${actualLeft}%` }}
            />
          ) : null}
          {nowLeft != null ? (
            <div
              className={`app-wo-overview-schedule-marker app-wo-overview-schedule-marker--now${
                adherence?.late ? " app-wo-overview-schedule-marker--late" : " app-wo-overview-schedule-marker--on-time"
              }`}
              style={{ left: `${nowLeft}%` }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="app-wo-overview-schedule-grid">
        <ScheduleItem label={t("workOrders.plannedStart")} value={formatDt(plannedStart)} tone="planned" />
        <ScheduleItem label={t("workOrders.plannedEnd")} value={formatDt(plannedEnd)} tone="planned" />
        <ScheduleItem
          label={t("workOrders.overview.actualEnd")}
          value={actualValue}
          tone={actualTone}
          hint={deltaLabel}
        />
      </div>
    </section>
  );
}

type ScheduleItemTone = "planned" | "actual-on-time" | "actual-late";

function ScheduleItem({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: ScheduleItemTone;
  hint?: string | null;
}) {
  return (
    <div className={`app-wo-overview-schedule-item app-wo-overview-schedule-item--${tone}`}>
      <span className="app-wo-overview-schedule-label">{label}</span>
      <span className="app-wo-overview-schedule-value" title={value}>
        {value}
      </span>
      {hint ? <span className="app-wo-overview-schedule-hint">{hint}</span> : null}
    </div>
  );
}
