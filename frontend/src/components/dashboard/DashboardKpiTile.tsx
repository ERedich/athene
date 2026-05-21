import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

type Props = {
  title: string;
  description?: string;
  count: number | null;
  locale: string;
  href?: string;
  footer?: ReactNode;
  children: ReactNode;
};

export function DashboardKpiTile({
  title,
  description,
  count,
  locale,
  href,
  footer,
  children,
}: Props) {
  const formattedCount =
    count === null
      ? "—"
      : (() => {
          try {
            return new Intl.NumberFormat(locale).format(count);
          } catch {
            return String(count);
          }
        })();

  const titleEl = href ? (
    <NavLink
      to={href}
      className="app-dashboard-kpi-title hover:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {title}
    </NavLink>
  ) : (
    <h2 className="app-dashboard-kpi-title">{title}</h2>
  );

  return (
    <article className="app-dashboard-kpi">
      <header className="app-dashboard-kpi-header">
        {titleEl}
        {description ? <p className="app-dashboard-kpi-desc">{description}</p> : null}
        <p className="app-dashboard-kpi-value" aria-live="polite">
          {formattedCount}
        </p>
      </header>
      <div className="app-dashboard-kpi-chart">{children}</div>
      {footer ? <footer className="app-dashboard-kpi-footer">{footer}</footer> : null}
    </article>
  );
}
