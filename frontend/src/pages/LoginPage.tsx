import { useCallback, useEffect, useState } from "react";
import { Key, Moon, Sun, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { InputText } from "primereact/inputtext";
import { Password } from "primereact/password";

import { AtheneWordmark } from "../components/AtheneWordmark";
import { LoginBackground } from "../components/LoginBackground";
import { navigateFromLoginToApp } from "../auth/loginNavigation";
import { apiFetch } from "../lib/api";
import { ThemeLoadingOverlay, useThemeSwitcher } from "../theme";

const logoSrc =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDnDKENTaCHFOqAdjN14UnFa-vZmQPHcl4v3LF3e1drOvbl2kZqYu2ezKY4fgPmcQB1z6SXjYvMVL_JUG2qhgUoJzxU5FM2_giekynnoc6LnHcCEP0S-iOgCGpT2ktK_tqcYoxKnrQaayIvjB4dA-FMHSJjC98H-x9tK0Fgu_2KHobc5jvubRlozy-q6tzipOESW7d7IXtyqzNgSmDnMJ5w2EDvGjHYWnVT5G-_rFeUvOyEMHNR1gIN8S09jo_t8vmp_d7JWv7ePYSn";

type LoginKpis = {
  openActive: number | null;
  completedLast24h: number | null;
};

function formatKpiValue(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString();
}

function LoginKpiSquare({
  label,
  value,
  animationDelayMs,
  className = "",
}: {
  label: string;
  value: number | null;
  animationDelayMs: number;
  className?: string;
}) {
  return (
    <div
      className={`login-panel-enter min-h-0 ${className}`}
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <div
        className="professional-panel flex h-full min-h-0 flex-col justify-between p-5 opacity-80"
        aria-label={`${label}: ${formatKpiValue(value)}`}
      >
        <p className="font-headline text-[10px] uppercase leading-snug tracking-[0.08em] text-outline sm:text-[11px]">
          {label}
        </p>
        <p className="font-headline text-4xl font-medium tracking-tight text-on-surface tabular-nums sm:text-5xl">
          {formatKpiValue(value)}
        </p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { dark, isThemeLoading, toggleTheme } = useThemeSwitcher();
  const [remember, setRemember] = useState(false);
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginToAppExit, setLoginToAppExit] = useState(false);
  const [kpis, setKpis] = useState<LoginKpis>({
    openActive: null,
    completedLast24h: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/public/login-kpis");
        if (!res.ok) return;
        const data = (await res.json()) as {
          openActive?: unknown;
          completedLast24h?: unknown;
        };
        if (cancelled) return;
        setKpis({
          openActive: typeof data.openActive === "number" ? data.openActive : 0,
          completedLast24h:
            typeof data.completedLast24h === "number" ? data.completedLast24h : 0,
        });
      } catch {
        // Login remains usable; squares keep placeholder.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const prepareCssFallbackExit = useCallback(() => {
    setLoginToAppExit(true);
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.setTimeout(resolve, 540);
        });
      });
    });
  }, []);

  const activeLang = i18n.language.startsWith("de") ? "de" : "en";

  const toggleBtn =
    "inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-sm text-on-surface-variant transition-colors hover:text-[var(--color-primary)] focus-visible:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  const textLinkInteractive =
    "transition-colors hover:text-[var(--color-primary)] focus-visible:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <div
      className={`font-body text-on-surface min-h-screen flex flex-col overflow-hidden selection:bg-primary/30 ${
        loginToAppExit ? "login-to-app-fallback-exit pointer-events-none" : ""
      }`}
    >
      <div className="fixed inset-0 z-[-2] overflow-hidden bg-surface">
        <LoginBackground dark={dark} />
        <div className="absolute top-[20%] right-[10%] w-[40%] h-[40%] orange-glow animate-pulse-slow" />
        <div
          className="absolute bottom-[20%] left-[10%] w-[30%] h-[40%] orange-glow animate-pulse-slow"
          style={{ animationDelay: "-3s" }}
        />
      </div>

      <header className="fixed top-0 z-50 w-full bg-transparent px-8 md:px-12 pb-6 md:pb-8">
        <div className="mt-[20px] flex w-full items-center justify-between">
          <div className="text-xl md:text-2xl font-bold tracking-tight text-on-surface flex items-center gap-3 md:gap-4 font-headline">
            <img
              alt="Athene"
              className="w-9 h-9 md:w-10 md:h-10 object-contain opacity-90 dark:brightness-0 dark:invert"
              src={logoSrc}
            />
            <AtheneWordmark brand={t("login.brand")} />
          </div>
          <div className="flex flex-nowrap items-center justify-end gap-2 md:gap-3 shrink-0">
            <span className="sr-only">{t("login.themeLabel")}</span>
            <button
              type="button"
              className={`${toggleBtn} w-9`}
              aria-label={dark ? t("login.themeToggleToLight") : t("login.themeToggleToDark")}
              title={dark ? t("login.themeLight") : t("login.themeDark")}
              onClick={toggleTheme}
            >
              {dark ? (
                <Sun className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              ) : (
                <Moon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              )}
            </button>
            <button
              type="button"
              className={`${toggleBtn} font-headline text-xs font-semibold tracking-widest`}
              aria-label={t("login.langToggleAria")}
              title={t("login.langToggleAria")}
              onClick={() => void i18n.changeLanguage(activeLang === "de" ? "en" : "de")}
            >
              <span className="select-none" aria-hidden>
                {activeLang === "de" ? "DE" : "EN"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center relative px-6 pt-24 pb-28 md:px-8">
        <div className="relative z-10 flex w-full min-w-0 items-center justify-center">
          <div className="pointer-events-none absolute left-[5vw] top-1/2 hidden max-w-xl -translate-y-1/2 space-y-8 md:block lg:left-[6vw]">
            <h1 className="text-7xl lg:text-8xl xl:text-9xl font-bold font-headline leading-none tracking-tighter">
              <AtheneWordmark brand={t("login.brand")} />
            </h1>
            <p className="text-on-surface-variant max-w-sm text-lg xl:text-xl leading-relaxed font-light">
              {t("login.tagline")}
            </p>
          </div>

          <div className="grid w-full min-w-0 max-w-md grid-cols-1 gap-3 sm:gap-4 lg:w-auto lg:max-w-none lg:translate-x-[18vw] lg:grid-cols-[auto_minmax(22rem,34rem)] lg:grid-rows-2 lg:gap-5">
            <LoginKpiSquare
              className="max-lg:hidden aspect-square lg:col-start-1 lg:row-start-1 lg:h-full lg:w-auto lg:min-h-0 lg:aspect-square"
              label={t("login.kpiOpenActive")}
              value={kpis.openActive}
              animationDelayMs={0}
            />
            <LoginKpiSquare
              className="max-lg:hidden aspect-square lg:col-start-1 lg:row-start-2 lg:h-full lg:w-auto lg:min-h-0 lg:aspect-square"
              label={t("login.kpiCompletedLast24h")}
              value={kpis.completedLast24h}
              animationDelayMs={80}
            />
            <div
              className="professional-panel login-panel-enter min-w-0 p-6 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1"
              style={{ animationDelay: "160ms" }}
            >
              <div className="space-y-8">
                <div className="space-y-2 border-b border-white/5 pb-6">
                  <h2 className="text-2xl font-headline font-medium text-on-surface tracking-tight">
                    {t("login.systemAccess")}
                  </h2>
                </div>
                <form
                  className="space-y-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void (async () => {
                      setError(null);
                      const name = loginName.trim();
                      if (!name || !password) {
                        setError(t("login.errorRequired"));
                        return;
                      }
                      setSubmitting(true);
                      try {
                        const res = await apiFetch("/api/auth/login", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            loginName: name,
                            password,
                            remember,
                          }),
                        });
                        if (!res.ok) {
                          setError(
                            res.status === 401
                              ? t("login.errorInvalid")
                              : t("login.errorGeneric"),
                          );
                          return;
                        }
                        await navigateFromLoginToApp(navigate, prepareCssFallbackExit);
                      } catch {
                        setError(t("login.errorGeneric"));
                      } finally {
                        setSubmitting(false);
                      }
                    })();
                  }}
                >
                  <div className="space-y-2">
                    <label className="block text-[11px] font-headline text-outline uppercase tracking-[0.1em] px-0.5">
                      {t("login.operatorId")}
                      <span className="app-required-marker" aria-hidden>
                        *
                      </span>
                    </label>
                    <InputText
                      value={loginName}
                      onChange={(e) => setLoginName(e.target.value)}
                      placeholder={t("login.operatorPlaceholder")}
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-headline text-outline uppercase tracking-[0.1em] px-0.5">
                      {t("login.password")}
                      <span className="app-required-marker" aria-hidden>
                        *
                      </span>
                    </label>
                    <Password
                      inputClassName="p-password-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("login.passwordPlaceholder")}
                      feedback={false}
                      toggleMask
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <Checkbox
                        inputId="remember"
                        checked={remember}
                        onChange={(e) => setRemember(Boolean(e.checked))}
                        className="rounded-none"
                      />
                      <span className="text-[11px] font-headline text-on-surface-variant uppercase tracking-wide transition-colors group-hover:text-[var(--color-primary)]">
                        {t("login.remember")}
                      </span>
                    </label>
                  </div>
                  {error ? (
                    <div
                      className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                      role="alert"
                    >
                      {error}
                    </div>
                  ) : null}
                  <Button
                    type="submit"
                    label={t("login.submit")}
                    loading={submitting}
                    disabled={submitting}
                    className="action-button w-full py-4 justify-center gap-2"
                  />
                </form>
                <div className="flex flex-col gap-4 pt-6 border-t border-white/5">
                  <a
                    className={`text-[11px] font-headline text-outline tracking-wide uppercase flex items-center gap-2 rounded-sm ${textLinkInteractive}`}
                    href="#"
                  >
                    <UserPlus className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                    {t("login.requestAccess")}
                  </a>
                  <a
                    className={`text-[11px] font-headline text-outline tracking-wide uppercase flex items-center gap-2 rounded-sm ${textLinkInteractive}`}
                    href="#"
                  >
                    <Key className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                    {t("login.recovery")}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 w-full flex flex-col md:flex-row justify-between items-center px-8 md:px-12 py-5 md:py-6 z-50 bg-black/40 backdrop-blur-sm border-t border-white/5">
        <div className="font-headline text-[10px] tracking-wider uppercase text-slate-400 text-center md:text-left">
          {t("login.footerCopy")}
        </div>
        <div className="flex gap-8 mt-3 md:mt-0 text-slate-400">
          <a
            className={`font-headline text-[10px] tracking-wider uppercase text-slate-400 rounded-sm ${textLinkInteractive}`}
            href="#"
          >
            {t("login.support")}
          </a>
          <a
            className={`font-headline text-[10px] tracking-wider uppercase text-slate-400 rounded-sm ${textLinkInteractive}`}
            href="#"
          >
            {t("login.legal")}
          </a>
          <a
            className={`font-headline text-[10px] tracking-wider uppercase text-slate-400 rounded-sm ${textLinkInteractive}`}
            href="#"
          >
            {t("login.networkStatus")}
          </a>
        </div>
      </footer>
      <ThemeLoadingOverlay visible={isThemeLoading} />
    </div>
  );
}
