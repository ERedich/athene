import type { ChartData, ChartOptions } from "chart.js";

import type { DayCount } from "../hooks/useDashboardMetrics";

const SPARK_GREEN = {
  line: "rgb(34, 197, 94)",
  fillTop: "rgba(34, 197, 94, 0.38)",
  fillBottom: "rgba(34, 197, 94, 0)",
  iconBg: "rgb(34, 197, 94)",
};

const SPARK_BLUE = {
  line: "rgb(59, 130, 246)",
  fillTop: "rgba(59, 130, 246, 0.35)",
  fillBottom: "rgba(59, 130, 246, 0)",
  iconBg: "rgb(59, 130, 246)",
};

const SPARK_AMBER = {
  line: "rgb(245, 158, 11)",
  fillTop: "rgba(245, 158, 11, 0.35)",
  fillBottom: "rgba(245, 158, 11, 0)",
  iconBg: "rgb(245, 158, 11)",
};

const SPARK_TEAL = {
  line: "rgb(20, 184, 166)",
  fillTop: "rgba(20, 184, 166, 0.35)",
  fillBottom: "rgba(20, 184, 166, 0)",
  iconBg: "rgb(20, 184, 166)",
};

export type SparkAccent = "green" | "blue" | "amber" | "teal";

const ACCENT_MAP = {
  green: SPARK_GREEN,
  blue: SPARK_BLUE,
  amber: SPARK_AMBER,
  teal: SPARK_TEAL,
} as const;

export function seriesFromByDay(byDay: DayCount[]): number[] {
  return byDay.map((d) => d.count);
}

/** Plausible 7-day trend ending at `endValue` (demo / fallback). */
export function demoSparkSeries(endValue: number, days = 7): number[] {
  if (endValue <= 0) return Array.from({ length: days }, () => 0);
  const out: number[] = [];
  const start = Math.max(0, Math.round(endValue * 0.55));
  for (let i = 0; i < days; i++) {
    const t = days <= 1 ? 1 : i / (days - 1);
    const wave = Math.sin(i * 0.9) * endValue * 0.06;
    const v = Math.round(start + (endValue - start) * t + wave);
    out.push(Math.max(0, v));
  }
  out[days - 1] = endValue;
  return out;
}

export function buildSparklineChart(
  series: number[],
  accent: SparkAccent = "green",
): { data: ChartData<"line">; options: ChartOptions<"line"> } {
  const colors = ACCENT_MAP[accent];
  const labels = series.map((_, i) => String(i + 1));

  return {
    data: {
      labels,
      datasets: [
        {
          data: series,
          borderColor: colors.line,
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return colors.fillTop;
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, colors.fillTop);
            gradient.addColorStop(1, colors.fillBottom);
            return gradient;
          },
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHitRadius: 12,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 4, bottom: 0, left: 0, right: 0 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: { display: false },
        y: {
          display: false,
          min: 0,
          grace: "5%",
        },
      },
      elements: {
        line: { borderCapStyle: "round", borderJoinStyle: "round" },
      },
    },
  };
}
