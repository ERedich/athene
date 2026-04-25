import { useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "primereact/button";

import { loginBgImage } from "../brandAssets";
import { AtheneWordmark } from "../components/AtheneWordmark";
import { apiFetch } from "../lib/api";
import { ThemeLoadingOverlay, useThemeSwitcher } from "../theme";

const navBtn =
  "w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-on-surface-variant rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const activeNavBtn =
  "bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)] text-[var(--color-primary)]";

const chromeBackground = {
  "--app-chrome-bg": `url(${loginBgImage})`,
} as CSSProperties;

function headerTitleKey(pathname: string): string {
  if (pathname.startsWith("/assets")) return "assets.appName";
  if (pathname.startsWith("/sites")) return "sites.appName";
  if (pathname.startsWith("/users")) return "users.appName";
  if (pathname.startsWith("/cost-centers")) return "costCenters.appName";
  if (pathname.startsWith("/app-parameters")) return "appParameters.appName";
  if (pathname.startsWith("/audit-log")) return "auditLog.appName";
  return "dashboard.appName";
}

/** Passed to child routes via `<Outlet context={…} />` for header actions (e.g. CRUD). */
export type AppShellOutletContext = {
  setHeaderActions: (node: ReactNode) => void;
};

export function AppShellLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const { dark, isThemeLoading, toggleTheme } = useThemeSwitcher();

  const toggleBtn =
    "inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-sm text-on-surface-variant transition-colors hover:text-[var(--color-primary)] focus-visible:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <div
      className="text-on-surface min-h-screen flex bg-surface"
      style={{ fontFamily: "var(--font-family)" }}
    >
      <aside
        className="app-chrome-bg w-[260px] shrink-0 flex flex-col border-r border-[color-mix(in_srgb,var(--color-on-surface)_20%,transparent)] bg-surface-container-low"
        aria-label={t("dashboard.navAria")}
        style={chromeBackground}
      >
        <div className="p-4 border-b border-white/5">
          <div className="font-headline text-lg font-bold tracking-tight">
            <AtheneWordmark brand={t("dashboard.brand")} />
          </div>
          <div className="text-[11px] uppercase tracking-widest text-on-surface-variant mt-1">
            {t("shell.product")}
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavLink
            to="/dashboard"
            end
            className={({ isActive }) =>
              `${navBtn} ${isActive ? activeNavBtn : ""}`
            }
          >
            <i className="pi pi-th-large" aria-hidden />
            {t("dashboard.navDashboard")}
          </NavLink>
          <NavLink
            to="/assets"
            className={({ isActive }) =>
              `${navBtn} ${isActive ? activeNavBtn : ""}`
            }
          >
            <i className="pi pi-box" aria-hidden />
            {t("assets.navAssets")}
          </NavLink>
          <NavLink
            to="/sites"
            className={({ isActive }) =>
              `${navBtn} ${isActive ? activeNavBtn : ""}`
            }
          >
            <i className="pi pi-map-marker" aria-hidden />
            {t("sites.navSites")}
          </NavLink>
          <NavLink
            to="/users"
            className={({ isActive }) =>
              `${navBtn} ${isActive ? activeNavBtn : ""}`
            }
          >
            <i className="pi pi-users" aria-hidden />
            {t("users.navUsers")}
          </NavLink>
          <NavLink
            to="/cost-centers"
            className={({ isActive }) =>
              `${navBtn} ${isActive ? activeNavBtn : ""}`
            }
          >
            <i className="pi pi-briefcase" aria-hidden />
            {t("costCenters.navCostCenters")}
          </NavLink>
          <NavLink
            to="/app-parameters"
            className={({ isActive }) =>
              `${navBtn} ${isActive ? activeNavBtn : ""}`
            }
          >
            <i className="pi pi-sliders-h" aria-hidden />
            {t("appParameters.navAppParameters")}
          </NavLink>
          <NavLink
            to="/audit-log"
            className={({ isActive }) =>
              `${navBtn} ${isActive ? activeNavBtn : ""}`
            }
          >
            <i className="pi pi-history" aria-hidden />
            {t("auditLog.navAudit")}
          </NavLink>
        </nav>
        <div className="p-3 border-t border-white/5">
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Misc
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={toggleBtn}
              aria-label={dark ? t("login.themeToggleToLight") : t("login.themeToggleToDark")}
              title={dark ? t("login.themeLight") : t("login.themeDark")}
              onClick={toggleTheme}
            >
              <i className={`pi text-lg ${dark ? "pi-sun" : "pi-moon"}`} aria-hidden />
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
            <h1 className="app-shell-title font-headline w-[200px] shrink-0 truncate text-base font-semibold tracking-tight text-on-surface">
              {t(headerTitleKey(pathname))}
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
          <Outlet context={{ setHeaderActions } satisfies AppShellOutletContext} />
        </main>
      </div>
      <ThemeLoadingOverlay visible={isThemeLoading} />
    </div>
  );
}
