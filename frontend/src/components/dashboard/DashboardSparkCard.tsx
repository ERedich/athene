import "chart.js/auto";
import { useMemo, type ComponentType, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Chart } from "primereact/chart";
import type { LucideProps } from "lucide-react";

import {
  buildSparklineChart,
  type SparkAccent,
} from "../../lib/dashboardSparkCharts";

type IconComponent = ComponentType<LucideProps>;

type Props = {
  icon: IconComponent;
  title: string;
  value: number | null;
  valueSuffix?: string;
  locale: string;
  href?: string;
  series: number[];
  loading?: boolean;
  accent?: SparkAccent;
  footer?: ReactNode;
};

export function DashboardSparkCard({
  icon: Icon,
  title,
  value,
  valueSuffix = "",
  locale,
  href,
  series,
  loading = false,
  accent = "green",
  footer,
}: Props) {
  const formattedValue =
    value === null
      ? "—"
      : (() => {
          try {
            return new Intl.NumberFormat(locale).format(value);
          } catch {
            return String(value);
          }
        })();

  const { data, options } = useMemo(
    () => buildSparklineChart(series, accent),
    [series, accent],
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
    <article className={`app-dashboard-spark-card app-dashboard-spark-card--${accent}`}>
      <header className="app-dashboard-spark-header">
        <div className="app-dashboard-spark-header-left">
          <span
            className={`app-dashboard-spark-icon app-dashboard-spark-icon--${accent}`}
            aria-hidden
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
          </span>
          {titleEl}
        </div>
        <p className="app-dashboard-spark-value" aria-live="polite">
          {formattedValue}
          {valueSuffix ? (
            <span className="app-dashboard-spark-value-suffix">{valueSuffix}</span>
          ) : null}
        </p>
      </header>
      <div className="app-dashboard-spark-chart">
        {loading ? (
          <div className="app-dashboard-spark-chart-skeleton" aria-hidden />
        ) : (
          <Chart type="line" data={data} options={options} />
        )}
      </div>
      {footer ? <footer className="app-dashboard-spark-footer">{footer}</footer> : null}
    </article>
  );
}
