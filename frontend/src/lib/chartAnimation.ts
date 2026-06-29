import type { ChartOptions } from "chart.js";

const INITIAL_ANIMATION = {
  duration: 650,
  easing: "easeOutQuart" as const,
};

function barBaselineFrom(ctx: {
  chart: {
    scales: Record<string, { getPixelForValue?: (value: number) => number } | undefined>;
    chartArea?: { bottom: number };
  };
}): number {
  const yScale = ctx.chart.scales.y;
  if (yScale?.getPixelForValue) {
    return yScale.getPixelForValue(0);
  }
  return ctx.chart.chartArea?.bottom ?? 0;
}

export function mergeInitialLineChartAnimation(
  options: ChartOptions<"line">,
): ChartOptions<"line"> {
  return {
    ...options,
    animation: INITIAL_ANIMATION,
  };
}

export function mergeInitialBarChartAnimation(
  options: ChartOptions<"bar">,
): ChartOptions<"bar"> {
  return {
    ...options,
    animation: INITIAL_ANIMATION,
    animations: {
      ...options.animations,
      y: {
        ...options.animations?.y,
        from: barBaselineFrom,
      },
    },
  };
}

export function mergeStaticLineChartAnimation(
  options: ChartOptions<"line">,
): ChartOptions<"line"> {
  return {
    ...options,
    animation: false,
  };
}

export function mergeStaticBarChartAnimation(
  options: ChartOptions<"bar">,
): ChartOptions<"bar"> {
  return {
    ...options,
    animation: false,
  };
}
