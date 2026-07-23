import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  Bell,
  LogOut,
  Moon,
  Star,
  Sun,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "primereact/button";

import { useAtheneAssistant } from "../assistant/AtheneAssistantContext";
import { useAuth } from "../auth/AuthContext";
import { loginBgImage } from "../brandAssets";
import { AtheneWordmark } from "../components/AtheneWordmark";
import { SidebarSweepTimer } from "../components/SidebarSweepTimer";
import { apiFetch } from "../lib/api";
import { fetchActiveAppLayout } from "../lib/layoutEditor/api";
import { defaultTabsPayload } from "../lib/layoutEditor/types";
import { applyTabsLayoutCssVars } from "../lib/tabs";
import { ONBOARDING_ENSURE_SIDEBAR_EVENT } from "../onboarding/onboardingDom";
import { useTableDensity } from "../tableDensity";
import { ThemeLoadingOverlay, useThemeSwitcher } from "../theme";
import { LucideSpinner, lucidePrimeBtnIcon } from "../icons/lucide";
import { useWorkOrderSubscriptions } from "../workOrders/WorkOrderSubscriptionContext";
import { SidebarBuildMeta } from "./SidebarBuildMeta";
import { SidebarNav } from "./SidebarNav";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "athene.sidebar.collapsed";

const chromeBackground = {
  "--app-chrome-bg": `url(${loginBgImage})`,
} as CSSProperties;

/** First URL segment after optional leading slash (works with future basename). */
function headerTitleKey(pathname: string): string {
  const seg = pathname.replace(/\/+$/, "").split("/").filter(Boolean)[0];
  const map: Record<string, string> = {
    dashboard: "dashboard.appName",
    calculator: "calculator.appName",
    feedback: "feedback.appName",
    "stammdaten-manager": "stammdatenManager.appName",
    assets: "assets.appName",
    baumstruktur: "baumstruktur.appName",
    workorders: "workOrders.appName",
    auftragserstellung: "orderCreation.appName",
    kalendar: "kalendar.appName",
    schichtplaner: "schichtplaner.appName",
    monitoring: "monitoring.appName",
    suchkonfig: "suchkonfig.appName",
    "kpi-builder": "kpiBuilder.appName",
    "layout-editor": "layoutEditor.appName",
    transactions: "transactions.appName",
    sites: "sites.appName",
    users: "users.appName",
    workgroups: "workgroups.appName",
    employees: "employees.appName",
    "cost-centers": "costCenters.appName",
    auftragstypen: "auftragstypen.appName",
    probleme: "probleme.appName",
    ursachen: "ursachen.appName",
    massnahmen: "massnahmen.appName",
    "maintenance-plans": "maintenancePlans.appName",
    shifts: "shifts.appName",
    warehouses: "warehouses.appName",
    "storage-locations": "storageLocations.appName",
    "spare-parts": "spareParts.appName",
    suppliers: "suppliers.appName",
    "classifications": "classifications.appName",
    "app-parameters": "appParameters.appName",
    "audit-log": "auditLog.appName",
    "table-viewer": "tableViewer.appName",
    translations: "translations.appName",
    abonnements: "abonnements.appName",
    mitteilungszentrale: "mitteilungszentrale.appName",
  };
  if (!seg) return "dashboard.appName";
  return map[seg.toLowerCase()] ?? "dashboard.appName";
}

/** Passed to child routes via `<Outlet context={…} />` for header actions (e.g. CRUD). */
export type AppShellOutletContext = {
  setHeaderActions: (node: ReactNode) => void;
  /** Optional row/data count rendered next to the page title (e.g. `Assets [234]`). Pass `null` to hide. */
  setHeaderRowCount: (count: number | null) => void;
};

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
  const { user } = useAuth();
  const subscriptions = useWorkOrderSubscriptions();
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const [headerRowCount, setHeaderRowCount] = useState<number | null>(null);
  const { dark, isThemeLoading, toggleTheme } = useThemeSwitcher();
  const { isCompact, toggleDensity } = useTableDensity();
  const athene = useAtheneAssistant();
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    readInitialCollapsed(),
  );

  useEffect(() => {
    applyTabsLayoutCssVars(document.documentElement, defaultTabsPayload());
    let cancelled = false;
    void (async () => {
      try {
        const layout = await fetchActiveAppLayout(user.workingSiteId, "design");
        if (!cancelled && layout.tabs) {
          applyTabsLayoutCssVars(document.documentElement, layout.tabs);
        }
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.workingSiteId]);

  useEffect(() => {
    const onEnsure = () => {
      setCollapsed((prev) => {
        if (!prev) return prev;
        try {
          window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "0");
        } catch {
          /* ignore */
        }
        return false;
      });
    };
    window.addEventListener(ONBOARDING_ENSURE_SIDEBAR_EVENT, onEnsure);
    return () => window.removeEventListener(ONBOARDING_ENSURE_SIDEBAR_EVENT, onEnsure);
  }, []);

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
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        collapsed ? "1" : "0",
      );
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
  const hasUnreadNotifications = subscriptions.unreadCount > 0;
  const notificationBellLabel = hasUnreadNotifications
    ? t("mitteilungszentrale.appNameUnread")
    : t("mitteilungszentrale.appName");

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
            collapsed
              ? "flex flex-col items-center gap-2 px-2 py-3"
              : "flex items-start justify-between gap-2 p-4"
          }`}
        >
          {collapsed ? (
            <div className="flex flex-col items-center font-mono text-lg font-bold leading-none">
              <AtheneWordmark brand="A" />
              <SidebarSweepTimer collapsed />
            </div>
          ) : (
            <div className="min-w-0">
              <div className="font-mono text-lg font-bold tracking-tight">
                <AtheneWordmark brand={t("dashboard.brand")} />
              </div>
              <SidebarSweepTimer collapsed={false} />
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
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            ) : (
              <ChevronsLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
        <nav
          className={`min-h-0 flex-1 overflow-y-auto ${collapsed ? "p-2" : "p-3"}`}
          aria-label={t("dashboard.navAria")}
        >
          <SidebarNav collapsed={collapsed} />
        </nav>
        <SidebarBuildMeta collapsed={collapsed} />
        <div
          className={`mt-auto shrink-0 border-t border-white/5 ${collapsed ? "p-2" : "p-3"}`}
        >
          {collapsed ? null : (
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
              {t("shell.miscSection")}
            </div>
          )}
          <div
            className={`flex items-center gap-2 ${collapsed ? "flex-col" : ""}`}
          >
            <button
              type="button"
              className={toggleBtn}
              aria-label={
                dark
                  ? t("login.themeToggleToLight")
                  : t("login.themeToggleToDark")
              }
              title={dark ? t("login.themeLight") : t("login.themeDark")}
              onClick={toggleTheme}
            >
              {dark ? (
                <Sun className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              ) : (
                <Moon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              )}
            </button>
            <Button
              type="button"
              icon={<Bell className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />}
              aria-label={notificationBellLabel}
              title={notificationBellLabel}
              text
              className="h-9 w-9 !relative !p-0"
              badge={hasUnreadNotifications ? " " : undefined}
              badgeClassName="app-notification-bell-blip"
              onClick={() => navigate("/mitteilungszentrale")}
            />
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
            <button
              type="button"
              data-onboarding="athene"
              className={`${toggleBtn} font-semibold`}
              aria-label={t("assistant.open")}
              title={t("assistant.open")}
              onClick={athene.open}
            >
              {athene.busy ? (
                <LucideSpinner className="h-5 w-5" strokeWidth={1.75} />
              ) : (
                <Star className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              )}
            </button>
            <Button
              type="button"
              icon={<LogOut className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
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
              <span className="app-shell-title__name">
                {t(headerTitleKey(pathname))}
              </span>
              {formattedHeaderRowCount !== null ? (
                <span className="ml-2 font-bold text-on-surface">
                  [
                  <span className="font-normal">{formattedHeaderRowCount}</span>
                  ]
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
          <Outlet
            context={
              {
                setHeaderActions,
                setHeaderRowCount,
              } satisfies AppShellOutletContext
            }
          />
        </main>
      </div>
      <ThemeLoadingOverlay visible={isThemeLoading} />
    </div>
  );
}
