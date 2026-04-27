import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "primereact/button";

import { loginBgImage } from "../brandAssets";
import { AtheneWordmark } from "../components/AtheneWordmark";
import { apiFetch } from "../lib/api";
import { useTableDensity } from "../tableDensity";
import { ThemeLoadingOverlay, useThemeSwitcher } from "../theme";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "athene.sidebar.collapsed";

const navBtnBase =
  "w-full flex items-center text-left text-sm text-on-surface-variant rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const navBtnExpanded = "gap-3 px-3 py-2.5";
const navBtnCollapsed = "justify-center px-0 py-2.5";

const activeNavBtn =
  "bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)] text-[var(--color-primary)]";

const chromeBackground = {
  "--app-chrome-bg": `url(${loginBgImage})`,
} as CSSProperties;

function headerTitleKey(pathname: string): string {
  if (pathname.startsWith("/assets")) return "assets.appName";
  if (pathname.startsWith("/workorders")) return "workOrders.appName";
  if (pathname.startsWith("/sites")) return "sites.appName";
  if (pathname.startsWith("/users")) return "users.appName";
  if (pathname.startsWith("/workgroups")) return "workgroups.appName";
  if (pathname.startsWith("/employees")) return "employees.appName";
  if (pathname.startsWith("/cost-centers")) return "costCenters.appName";
  if (pathname.startsWith("/app-parameters")) return "appParameters.appName";
  if (pathname.startsWith("/audit-log")) return "auditLog.appName";
  if (pathname.startsWith("/table-viewer")) return "tableViewer.appName";
  return "dashboard.appName";
}

/** Passed to child routes via `<Outlet context={…} />` for header actions (e.g. CRUD). */
export type AppShellOutletContext = {
  setHeaderActions: (node: ReactNode) => void;
  /** Optional row/data count rendered next to the page title (e.g. `Assets [234]`). Pass `null` to hide. */
  setHeaderRowCount: (count: number | null) => void;
};

type NavItem = {
  to: string;
  end?: boolean;
  icon: string;
  labelKey: string;
};

const navItems: NavItem[] = [
  { to: "/dashboard", end: true, icon: "pi pi-th-large", labelKey: "dashboard.navDashboard" },
  { to: "/assets", icon: "pi pi-box", labelKey: "assets.navAssets" },
  { to: "/workorders", icon: "pi pi-briefcase", labelKey: "workOrders.navOrders" },
  { to: "/sites", icon: "pi pi-map-marker", labelKey: "sites.navSites" },
  { to: "/users", icon: "pi pi-users", labelKey: "users.navUsers" },
  { to: "/workgroups", icon: "pi pi-sitemap", labelKey: "workgroups.navWorkgroups" },
  { to: "/employees", icon: "pi pi-id-card", labelKey: "employees.navEmployees" },
  { to: "/cost-centers", icon: "pi pi-briefcase", labelKey: "costCenters.navCostCenters" },
  { to: "/app-parameters", icon: "pi pi-sliders-h", labelKey: "appParameters.navAppParameters" },
  { to: "/audit-log", icon: "pi pi-history", labelKey: "auditLog.navAudit" },
  { to: "/table-viewer", icon: "pi pi-table", labelKey: "tableViewer.navTableViewer" },
];

function readInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShellLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const [headerRowCount, setHeaderRowCount] = useState<number | null>(null);
  const { dark, isThemeLoading, toggleTheme } = useThemeSwitcher();
  const { isCompact, toggleDensity } = useTableDensity();
  const [collapsed, setCollapsed] = useState<boolean>(() => readInitialCollapsed());

  useEffect(() => {
    setHeaderRowCount(null);
  }, [pathname]);

  const formattedHeaderRowCount = (() => {
    if (headerRowCount === null) return null;
    try {
      return new Intl.NumberFormat(i18n.language).format(headerRowCount);
    } catch {
      return String(headerRowCount);
    }
  })();

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const toggleBtn =
    "inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-sm text-on-surface-variant transition-colors hover:text-[var(--color-primary)] focus-visible:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  const collapseLabel = collapsed
    ? t("shell.sidebarExpand")
    : t("shell.sidebarCollapse");
  const densityToggleTitle = isCompact
    ? t("shell.tableDensityComfortable")
    : t("shell.tableDensityCompact");

  return (
    <div
      className="text-on-surface flex h-screen min-h-0 overflow-hidden bg-surface"
      style={{ fontFamily: "var(--font-family)" }}
    >
      <aside
        className={`app-chrome-bg flex h-screen min-h-0 shrink-0 flex-col overflow-hidden border-r border-[color-mix(in_srgb,var(--color-on-surface)_20%,transparent)] bg-surface-container-low transition-[width] duration-200 ease-out ${
          collapsed ? "w-[68px]" : "w-[260px]"
        }`}
        aria-label={t("dashboard.navAria")}
        style={chromeBackground}
      >
        <div
          className={`shrink-0 border-b border-white/5 ${
            collapsed ? "flex flex-col items-center gap-2 px-2 py-3" : "flex items-start justify-between gap-2 p-4"
          }`}
        >
          {collapsed ? (
            <div className="font-mono text-lg font-bold leading-none">
              <AtheneWordmark brand="A" />
            </div>
          ) : (
            <div className="min-w-0">
              <div className="font-mono text-lg font-bold tracking-tight">
                <AtheneWordmark brand={t("dashboard.brand")} />
              </div>
              <div className="text-[11px] uppercase tracking-widest text-on-surface-variant mt-1">
                {t("shell.product")}
              </div>
            </div>
          )}
          <button
            type="button"
            className={toggleBtn}
            aria-label={collapseLabel}
            aria-expanded={!collapsed}
            title={collapseLabel}
            onClick={() => setCollapsed((v) => !v)}
          >
            <i
              className={`pi text-base ${collapsed ? "pi-angle-double-right" : "pi-angle-double-left"}`}
              aria-hidden
            />
          </button>
        </div>
        <nav
          className={`shrink-0 space-y-1 ${collapsed ? "p-2" : "p-3"}`}
          aria-label={t("dashboard.navAria")}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? t(item.labelKey) : undefined}
              aria-label={collapsed ? t(item.labelKey) : undefined}
              className={({ isActive }) =>
                `${navBtnBase} ${collapsed ? navBtnCollapsed : navBtnExpanded} ${
                  isActive ? activeNavBtn : ""
                }`
              }
            >
              <i className={item.icon} aria-hidden />
              {collapsed ? null : <span className="truncate">{t(item.labelKey)}</span>}
            </NavLink>
          ))}
        </nav>
        <div
          className={`mt-auto shrink-0 border-t border-white/5 ${collapsed ? "p-2" : "p-3"}`}
        >
          {collapsed ? null : (
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
              Misc
            </div>
          )}
          <div
            className={`flex items-center gap-2 ${collapsed ? "flex-col" : ""}`}
          >
            <button
              type="button"
              className={toggleBtn}
              aria-label={dark ? t("login.themeToggleToLight") : t("login.themeToggleToDark")}
              title={dark ? t("login.themeLight") : t("login.themeDark")}
              onClick={toggleTheme}
            >
              <i className={`pi text-lg ${dark ? "pi-sun" : "pi-moon"}`} aria-hidden />
            </button>
            <button
              type="button"
              className={`${toggleBtn} font-semibold`}
              aria-label={t("shell.tableDensityToggle")}
              title={`${t("shell.tableDensityToggle")} (${densityToggleTitle})`}
              onClick={toggleDensity}
            >
              <span className={isCompact ? "text-xs" : "text-base"} aria-hidden>
                Aa
              </span>
            </button>
            <Button
              type="button"
              icon="pi pi-sign-out"
              aria-label={t("dashboard.signOut")}
              title={t("dashboard.signOut")}
              outlined
              size="small"
              className="h-9 w-9"
              onClick={() => {
                void (async () => {
                  try {
                    await apiFetch("/api/auth/logout", { method: "POST" });
                  } catch {
                    /* ignore */
                  }
                  navigate("/", { replace: true });
                })();
              }}
            />
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header
          className="app-chrome-bg h-14 shrink-0 flex items-center justify-between gap-4 pl-[15px] pr-4 border-b border-white/5 bg-surface-container-low"
          style={chromeBackground}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <h1 className="app-shell-title font-mono w-[200px] shrink-0 truncate text-base font-semibold tracking-tight text-on-surface">
              <span className="app-shell-title__name">{t(headerTitleKey(pathname))}</span>
              {formattedHeaderRowCount !== null ? (
                <span className="ml-2 font-bold text-on-surface">
                  [<span className="font-normal">{formattedHeaderRowCount}</span>]
                </span>
              ) : null}
            </h1>
            {headerActions ? (
              <>
                <span
                  className="h-6 w-px shrink-0 bg-[color-mix(in_srgb,var(--color-on-surface)_20%,transparent)]"
                  aria-hidden
                />
                <nav
                  aria-label={t("shell.actionsNavAria")}
                  className="flex min-w-0 flex-1 items-center"
                >
                  {headerActions}
                </nav>
              </>
            ) : null}
          </div>
        </header>
        <main className="flex flex-1 min-h-0 flex-col overflow-hidden bg-surface p-px">
          <Outlet context={{ setHeaderActions, setHeaderRowCount } satisfies AppShellOutletContext} />
        </main>
      </div>
      <ThemeLoadingOverlay visible={isThemeLoading} />
    </div>
  );
}

