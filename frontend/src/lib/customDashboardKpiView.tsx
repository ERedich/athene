import type { ChartData, ChartOptions } from "chart.js";
import type { TFunction } from "i18next";
import { Gauge, type LucideProps } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import type { DashboardKpiBarChart, DashboardKpiDisplay, DashboardKpiView } from "./dashboardKpiRegistry";
import { buildDashboardBarChartOptions } from "./dashboardCharts";
import type { SparkAccent, SparklineOptions } from "./dashboardSparkCharts";
import { demoSparkSeries } from "./dashboardSparkCharts";
import { readThemeChartColors } from "./workOrderOverviewCharts";
import type { KpiEvaluateEntry, KpiStyle } from "./kpiBuilderApi";

type IconComponent = ComponentType<LucideProps>;

export type DashboardKpiPieChart = {
  type: "pie";
  data: ChartData<"pie">;
  options: ChartOptions<"pie">;
};

export type DashboardKpiChart = DashboardKpiBarChart | DashboardKpiPieChart;

const PIE_COLORS = [
  "rgba(59, 130, 246, 0.9)",
  "rgba(34, 197, 94, 0.9)",
  "rgba(245, 158, 11, 0.9)",
  "rgba(20, 184, 166, 0.9)",
  "rgba(248, 113, 113, 0.9)",
  "rgba(168, 85, 247, 0.9)",
  "rgba(148, 163, 184, 0.75)",
];

function buildPieChart(
  series: { label: string; value: number }[],
  showLegend: boolean,
  showTooltip: boolean,
): DashboardKpiPieChart {
  const theme = readThemeChartColors();
  return {
    type: "pie",
    data: {
      labels: series.map((s) => s.label),
      datasets: [
        {
          data: series.map((s) => s.value),
          backgroundColor: series.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: showLegend,
          position: "bottom",
          labels: { color: theme.text, boxWidth: 10, font: { size: 10 } },
        },
        tooltip: { enabled: showTooltip },
      },
    },
  };
}

function buildBarFromSeries(
  series: { label: string; value: number }[],
  t: TFunction,
  showLegend: boolean,
  showTooltip: boolean,
): DashboardKpiBarChart {
  const base = buildDashboardBarChartOptions();
  return {
    type: "bar",
    data: {
      labels: series.map((s) => s.label),
      datasets: [
        {
          label: t("dashboard.chartCount"),
          data: series.map((s) => s.value),
          backgroundColor: series.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
          borderRadius: 4,
          maxBarThickness: 40,
        },
      ],
    },
    options: {
      ...base,
      plugins: {
        ...base.plugins,
        legend: {
          display: showLegend,
          position: "bottom",
          labels: { boxWidth: 10, font: { size: 10 } },
        },
        tooltip: { enabled: showTooltip },
      },
    },
  };
}

function deeplinkHref(style: KpiStyle | null | undefined): string | undefined {
  const app = style?.deeplink?.app;
  if (!app) return undefined;
  const params = style.deeplink?.params;
  if (!params || Object.keys(params).length === 0) return `/${app}`;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => search.append(k, x));
    else search.set(k, v);
  }
  const q = search.toString();
  return q ? `/${app}?${q}` : `/${app}`;
}

export type CustomDashboardKpiView = Omit<DashboardKpiView, "chart"> & {
  chart?: DashboardKpiChart;
  tableRows?: Record<string, unknown>[];
  sparklineOptions?: SparklineOptions;
};

export function resolveCustomKpiView(
  entry: KpiEvaluateEntry | undefined,
  t: TFunction,
): CustomDashboardKpiView {
  const title = entry?.name || t("dashboard.customKpiFallbackTitle");
  const accent = (entry?.style?.accent ?? "green") as SparkAccent;
  const displayStyle = entry?.style?.display ?? "value";
  const result = entry?.result;
  const href = deeplinkHref(entry?.style);
  const showLegend = entry?.style?.showLegend !== false;
  const showTooltip = entry?.style?.showTooltip === true;
  const showAxes = entry?.style?.showAxes === true;
  const valueSuffix = entry?.style?.valueSuffix?.trim() || undefined;
  const rowLimit = entry?.style?.rowLimit ?? 10;

  if (!entry || entry.error || !result) {
    return {
      title,
      icon: Gauge as IconComponent,
      accent,
      display: "value",
      value: null,
      series: demoSparkSeries(0),
      detail: entry?.error ? t("dashboard.customKpiError") : undefined,
    };
  }

  const series = result.series ?? [];
  const numericSeries = series.map((s) => s.value);
  const seriesLabels = series.map((s) => s.label);

  if (displayStyle === "table") {
    const rows = (result.rows ?? []).slice(0, rowLimit);
    const footer: ReactNode =
      rows.length > 0 ? (
        <div className="max-h-24 overflow-auto text-[10px] text-on-surface-variant">
          {rows.slice(0, Math.min(5, rowLimit)).map((row, i) => (
            <div key={i} className="truncate">
              {Object.values(row)
                .slice(0, 4)
                .map((v) => String(v ?? ""))
                .join(" · ")}
            </div>
          ))}
        </div>
      ) : null;
    return {
      title,
      icon: Gauge as IconComponent,
      accent,
      display: "value",
      value: result.total,
      valueSuffix,
      detail: t("dashboard.customKpiTableDetail", { count: rows.length }),
      series: demoSparkSeries(result.total),
      href,
      tableRows: rows,
      footer,
    };
  }

  if (displayStyle === "value") {
    return {
      title,
      icon: Gauge as IconComponent,
      accent,
      display: "value",
      value: result.total,
      valueSuffix,
      series: demoSparkSeries(result.total),
      href,
    };
  }

  if (displayStyle === "pie" && series.length > 0) {
    return {
      title,
      icon: Gauge as IconComponent,
      accent,
      display: "chart",
      value: result.total,
      valueSuffix,
      series: numericSeries,
      chart: buildPieChart(series, showLegend, showTooltip),
      href,
    };
  }

  if ((displayStyle === "bar" || displayStyle === "pie") && series.length > 0) {
    return {
      title,
      icon: Gauge as IconComponent,
      accent,
      display: "chart",
      value: result.total,
      valueSuffix,
      series: numericSeries,
      chart: buildBarFromSeries(series, t, showLegend, showTooltip),
      href,
    };
  }

  return {
    title,
    icon: Gauge as IconComponent,
    accent,
    display: "chart" as DashboardKpiDisplay,
    value: result.total,
    valueSuffix,
    series: numericSeries.length > 0 ? numericSeries : demoSparkSeries(result.total),
    sparklineOptions: {
      labels: seriesLabels.length > 0 ? seriesLabels : undefined,
      showAxes,
      showTooltip,
    },
    href,
  };
}
