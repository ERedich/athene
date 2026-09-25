import type { ChartData, ChartOptions } from "chart.js";

import type { DayCount } from "../hooks/useDashboardMetrics";
import { mergeInitialLineChartAnimation } from "./chartAnimation";
import { readThemeChartColors } from "./workOrderOverviewCharts";

const SPARK_GREEN = {
  line: "rgb(34, 197, 94)",
};

const SPARK_BLUE = {
  line: "rgb(59, 130, 246)",
};

const SPARK_AMBER = {
  line: "rgb(245, 158, 11)",
};

const SPARK_TEAL = {
  line: "rgb(20, 184, 166)",
};

export type SparkAccent = "green" | "blue" | "amber" | "teal";

const ACCENT_MAP = {
  green: SPARK_GREEN,
  blue: SPARK_BLUE,
  amber: SPARK_AMBER,
  teal: SPARK_TEAL,
} as const;

export type SparklineOptions = {
  labels?: string[];
  /** @deprecated Axes are always shown; kept for stored KPI style compatibility. */
  showAxes?: boolean;
  showTooltip?: boolean;
};

export function seriesFromByDay(byDay: DayCount[]): number[] {
  return byDay.map((d) => d.count);
}

/** Last `days` calendar days ending today as `YYYY-MM-DD` (local). */
export function recentDayIsoDates(days = 7): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

/** Axis labels as `DD.MM` from ISO date strings. */
export function formatDayMonthLabels(dates: string[]): string[] {
  return dates.map((iso) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (match) return `${match[3]}.${match[2]}`;
    try {
      const d = new Date(`${iso}T12:00:00`);
      if (Number.isNaN(d.getTime())) return iso;
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      return `${dd}.${mm}`;
    } catch {
      return iso;
    }
  });
}

export function demoSparkDayLabels(days = 7): string[] {
  return formatDayMonthLabels(recentDayIsoDates(days));
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
  opts: SparklineOptions = {},
): { data: ChartData<"line">; options: ChartOptions<"line"> } {
  const colors = ACCENT_MAP[accent];
  const showTooltip = opts.showTooltip === true;
  const labels =
    opts.labels && opts.labels.length === series.length
      ? opts.labels
      : series.map((_, i) => String(i + 1));
  const theme = readThemeChartColors();

  return {
    data: {
      labels,
      datasets: [
        {
          data: series,
          borderColor: colors.line,
          backgroundColor: colors.line,
          fill: false,
          tension: 0,
          pointRadius: 3,
          pointBackgroundColor: colors.line,
          pointBorderColor: colors.line,
          pointHitRadius: 12,
          borderWidth: 2,
        },
      ],
    },
    options: mergeInitialLineChartAnimation(
      {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 4, bottom: 2, left: 0, right: 0 } },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: showTooltip },
        },
        scales: {
          x: {
            display: true,
            ticks: { color: theme.text, maxRotation: 0, font: { size: 9 }, maxTicksLimit: 7 },
            grid: { color: theme.grid },
          },
          y: {
            display: true,
            min: 0,
            grace: "5%",
            ticks: { color: theme.text, font: { size: 9 }, precision: 0 },
            grid: { color: theme.grid },
          },
        },
        elements: {
          line: { borderCapStyle: "butt", borderJoinStyle: "miter" },
        },
      },
    ),
  };
}
