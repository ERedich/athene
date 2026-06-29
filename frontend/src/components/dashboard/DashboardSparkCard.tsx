import "chart.js/auto";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Chart } from "primereact/chart";

import type { DashboardKpiBarChart, DashboardKpiDisplay } from "../../lib/dashboardKpiRegistry";
import { mergeStaticBarChartAnimation, mergeStaticLineChartAnimation } from "../../lib/chartAnimation";
import {
  buildSparklineChart,
  type SparkAccent,
} from "../../lib/dashboardSparkCharts";

type Props = {
  dragHandle?: ReactNode;
  title: string;
  display?: DashboardKpiDisplay;
  value: number | string | null;
  valueSuffix?: string;
  detail?: string;
  locale: string;
  href?: string;
  series: number[];
  chart?: DashboardKpiBarChart;
  chartAnimationKey?: string;
  loading?: boolean;
  accent?: SparkAccent;
  footer?: ReactNode;
  headerActions?: ReactNode;
};

function formatDisplayValue(
  value: number | string | null,
  locale: string,
): string {
  if (value === null) return "—";
  if (typeof value === "string") return value;
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

export function DashboardSparkCard({
  dragHandle,
  title,
  display = "chart",
  value,
  valueSuffix = "",
  detail,
  locale,
  href,
  series,
  chart,
  chartAnimationKey,
  loading = false,
  accent = "green",
  footer,
  headerActions,
}: Props) {
  const isValueOnly = display === "value";
  const formattedValue = formatDisplayValue(value, locale);
  const isTextValue = typeof value === "string" && value.length > 0;
  const isBarChart = !isValueOnly && chart?.type === "bar";
  const showSparkline = !isValueOnly && !isBarChart;
  const showRevealedValue = !loading;

  const animateOnceRef = useRef(true);
  const prevAnimationKeyRef = useRef(chartAnimationKey);

  if (chartAnimationKey !== undefined && prevAnimationKeyRef.current !== chartAnimationKey) {
    prevAnimationKeyRef.current = chartAnimationKey;
    animateOnceRef.current = true;
  }

  const shouldAnimateChart = animateOnceRef.current;

  useEffect(() => {
    if (!loading) {
      animateOnceRef.current = false;
    }
  }, [loading]);

  const sparkline = useMemo(
    () => buildSparklineChart(series, accent),
    [series, accent],
  );

  const barChartOptions = useMemo(() => {
    if (!chart?.options) return undefined;
    return shouldAnimateChart
      ? chart.options
      : mergeStaticBarChartAnimation(chart.options);
  }, [chart?.options, shouldAnimateChart]);

  const sparklineOptions = useMemo(
    () =>
      shouldAnimateChart
        ? sparkline.options
        : mergeStaticLineChartAnimation(sparkline.options),
    [sparkline.options, shouldAnimateChart],
  );

  const titleEl = href ? (
    <NavLink
      to={href}
      className="app-dashboard-spark-title hover:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {title}
    </NavLink>
  ) : (
    <span className="app-dashboard-spark-title">{title}</span>
  );

  return (
    <article
      className={`app-dashboard-spark-card app-dashboard-spark-card--${accent}${isValueOnly ? " app-dashboard-spark-card--value-only" : ""}`}
    >
      <header className="app-dashboard-spark-header">
        <div className="app-dashboard-spark-header-left">
          {dragHandle}
          {titleEl}
        </div>
        <div className="app-dashboard-spark-header-right">
          {headerActions}
          {!isValueOnly ? (
            <p
              className={`app-dashboard-spark-value${isTextValue ? " app-dashboard-spark-value--text" : ""}${showRevealedValue ? " app-dashboard-spark-value--revealed" : ""}`}
              aria-live="polite"
              title={isTextValue ? formattedValue : undefined}
            >
              {formattedValue}
              {valueSuffix ? (
                <span className="app-dashboard-spark-value-suffix">{valueSuffix}</span>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>
      {isValueOnly ? (
        <div className="app-dashboard-spark-value-body" aria-live="polite">
          {loading ? (
            <div className="app-dashboard-spark-value-body-skeleton" aria-hidden />
          ) : (
            <>
              <p
                className={`app-dashboard-spark-value-body__primary${isTextValue ? " app-dashboard-spark-value-body__primary--text" : ""}${showRevealedValue ? " app-dashboard-spark-value-body__primary--revealed" : ""}`}
                title={isTextValue ? formattedValue : undefined}
              >
                {formattedValue}
                {valueSuffix ? (
                  <span className="app-dashboard-spark-value-body__suffix">{valueSuffix}</span>
                ) : null}
              </p>
              {detail ? (
                <p className="app-dashboard-spark-value-body__detail">{detail}</p>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div
          className={`app-dashboard-spark-chart${isBarChart ? " app-dashboard-spark-chart--bar" : ""}`}
        >
          {loading ? (
            <div className="app-dashboard-spark-chart-skeleton" aria-hidden />
          ) : isBarChart && barChartOptions ? (
            <Chart
              key={chartAnimationKey}
              type="bar"
              data={chart.data}
              options={barChartOptions}
            />
          ) : showSparkline ? (
            <Chart
              key={chartAnimationKey}
              type="line"
              data={sparkline.data}
              options={sparklineOptions}
            />
          ) : null}
        </div>
      )}
      {footer ? <footer className="app-dashboard-spark-footer">{footer}</footer> : null}
    </article>
  );
}
