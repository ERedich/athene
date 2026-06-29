import type { TFunction } from "i18next";

import { readThemeChartColors, readThemePrimaryChartColors } from "./workOrderOverviewCharts";
import type { ChartData, ChartOptions } from "chart.js";

import type { DayCount, OrderTypeCount, StatusCount } from "../hooks/useDashboardMetrics";
import { mergeInitialBarChartAnimation } from "./chartAnimation";

/** Chart bar/doughnut fills aligned with work-order status table colors. */
export const WORK_ORDER_STATUS_CHART_COLORS: Record<string, string> = {
  open: "rgba(203, 213, 225, 0.9)",
  assigned: "rgba(125, 211, 252, 0.9)",
  started: "rgba(59, 130, 246, 0.9)",
  paused: "rgba(251, 146, 60, 0.9)",
  continued: "rgba(45, 212, 191, 0.9)",
  ended: "rgba(74, 222, 128, 0.9)",
  done: "rgba(74, 222, 128, 0.9)",
  cancelled: "rgba(248, 113, 113, 0.9)",
};

export function chartColorForWorkOrderStatus(status: string): string {
  return WORK_ORDER_STATUS_CHART_COLORS[status] ?? "rgba(148, 163, 184, 0.75)";
}

/** Bar fills for work-order type breakdown on the dashboard. */
export const WORK_ORDER_TYPE_CHART_COLORS: Record<string, string> = {
  maintenance: "rgba(59, 130, 246, 0.9)",
  repair: "rgba(245, 158, 11, 0.9)",
  breakdown: "rgba(248, 113, 113, 0.9)",
};

export function chartColorForWorkOrderType(orderType: string): string {
  return WORK_ORDER_TYPE_CHART_COLORS[orderType] ?? "rgba(148, 163, 184, 0.75)";
}

export function orderTypeLabel(t: TFunction, orderType: string): string {
  const key = `workOrders.typeValues.${orderType}`;
  const translated = t(key);
  return translated === key ? orderType : translated;
}

export function buildOrderTypeBarChartData(
  rows: OrderTypeCount[],
  t: TFunction,
): ChartData<"bar"> {
  const labels = rows.map((r) => orderTypeLabel(t, r.orderType));
  return {
    labels,
    datasets: [
      {
        label: t("dashboard.chartCount"),
        data: rows.map((r) => r.count),
        backgroundColor: rows.map((r) => chartColorForWorkOrderType(r.orderType)),
        borderRadius: 4,
        maxBarThickness: 40,
      },
    ],
  };
}

export function buildDashboardBarChartOptions(): ChartOptions<"bar"> {
  const themeColors = readThemeChartColors();
  return mergeInitialBarChartAnimation(
    {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 4, bottom: 0, left: 0, right: 0 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          ticks: { color: themeColors.text, maxRotation: 0, font: { size: 10 } },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: themeColors.text,
            font: { size: 10 },
            precision: 0,
          },
          grid: { color: themeColors.grid },
          beginAtZero: true,
        },
      },
    },
  );
}

export function statusLabel(t: TFunction, status: string): string {
  const key = `workOrders.statusValues.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

export function formatDayLabels(dates: string[], locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "short" });
  return dates.map((iso) => {
    try {
      return fmt.format(new Date(`${iso}T12:00:00`));
    } catch {
      return iso;
    }
  });
}

export function buildStatusBarChartData(
  rows: StatusCount[],
  t: TFunction,
): { labels: string[]; datasets: { label: string; data: number[]; backgroundColor: string[]; borderRadius: number }[] } {
  const labels = rows.map((r) => statusLabel(t, r.status));
  return {
    labels,
    datasets: [
      {
        label: t("dashboard.chartCount"),
        data: rows.map((r) => r.count),
        backgroundColor: rows.map((r) => chartColorForWorkOrderStatus(r.status)),
        borderRadius: 4,
      },
    ],
  };
}

export function buildStatusDoughnutChartData(
  rows: StatusCount[],
  t: TFunction,
): {
  labels: string[];
  datasets: { label?: string; data: number[]; backgroundColor: string[]; borderWidth: number }[];
} {
  const labels = rows.map((r) => statusLabel(t, r.status));
  return {
    labels,
    datasets: [
      {
        label: "",
        data: rows.map((r) => r.count),
        backgroundColor: rows.map((r) => chartColorForWorkOrderStatus(r.status)),
        borderWidth: 0,
      },
    ],
  };
}

export function buildDayBarChartData(
  rows: DayCount[],
  locale: string,
  t: TFunction,
): { labels: string[]; datasets: { label: string; data: number[]; backgroundColor: string; borderRadius: number }[] } {
  const labels = formatDayLabels(
    rows.map((r) => r.date),
    locale,
  );
  const primary = readThemePrimaryChartColors(0.55);
  return {
    labels,
    datasets: [
      {
        label: t("dashboard.chartCount"),
        data: rows.map((r) => r.count),
        backgroundColor: primary.fill,
        borderRadius: 4,
      },
    ],
  };
}

export function buildDayLineChartData(
  rows: DayCount[],
  locale: string,
  t: TFunction,
): {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    fill: boolean;
    tension: number;
    pointRadius: number;
  }[];
} {
  const labels = formatDayLabels(
    rows.map((r) => r.date),
    locale,
  );
  const primary = readThemePrimaryChartColors();
  return {
    labels,
    datasets: [
      {
        label: t("dashboard.chartCount"),
        data: rows.map((r) => r.count),
        borderColor: primary.border,
        backgroundColor: primary.fill,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  };
}

export function buildCartesianChartOptions() {
  const themeColors = readThemeChartColors();
  return {
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
  };
}

export function buildDoughnutChartOptions() {
  const themeColors = readThemeChartColors();
  return {
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
  };
}

export const ACTIVE_WORK_ORDER_STATUSES = [
  "open",
  "assigned",
  "started",
  "paused",
  "continued",
  "ended",
] as const;

export function workOrdersActiveStatusHref(): string {
  const p = new URLSearchParams();
  for (const s of ACTIVE_WORK_ORDER_STATUSES) {
    p.append("status", s);
  }
  const qs = p.toString();
  return qs ? `/monitoring?${qs}` : "/monitoring";
}
