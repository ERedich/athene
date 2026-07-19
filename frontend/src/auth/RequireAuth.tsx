import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet } from "react-router-dom";
import { AtheneAssistantProvider } from "../assistant/AtheneAssistantContext";
import { MaintenancePlanDialogProvider } from "../maintenancePlans/MaintenancePlanDialogContext";
import { WorkOrderDialogProvider } from "../workOrders/WorkOrderDialogContext";
import { WorkOrderSubscriptionProvider } from "../workOrders/WorkOrderSubscriptionContext";
import { apiFetch } from "../lib/api";
import { applyUiTranslationOverrides } from "../lib/applyUiTranslationOverrides";

import type { AppParameterAssetKeyMode } from "../lib/appParameterKeys";
import type { AssetTypeDisplayConfig } from "../lib/assetTypeDisplay";

import { AuthSessionContext, type AuthUser } from "./AuthContext";
import { POST_LOGIN_ENTER_FALLBACK_KEY } from "./loginNavigation";

type MeResponse = {
  user: AuthUser;
  appParameterBooleans?: Record<string, boolean>;
  appParameterAssetTypes?: AssetTypeDisplayConfig | null;
  appParameterDefaultWorkgroupId?: string | null;
  appParameterDefaultShiftHours?: number;
  appParameterAssetKeyMode?: AppParameterAssetKeyMode;
  appParameterShowAssetKeyPath?: boolean;
  appParameterAssetKeyPathSeparator?: string;
};

type SessionBase = {
  user: AuthUser;
  appParameterBooleans: Record<string, boolean>;
  appParameterAssetTypes: AssetTypeDisplayConfig | null;
  appParameterDefaultWorkgroupId: string | null;
  appParameterDefaultShiftHours: number;
  appParameterAssetKeyMode: AppParameterAssetKeyMode;
  appParameterShowAssetKeyPath: boolean;
  appParameterAssetKeyPathSeparator: string;
};

type ShellEnterPhase = "none" | "initial" | "animate";

export function RequireAuth() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"loading" | "bad" | "ok">("loading");
  const [sessionBase, setSessionBase] = useState<SessionBase | null>(null);
  const [shellEnter, setShellEnter] = useState<ShellEnterPhase>("none");

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/auth/me");
    if (!res.ok) return;
    const data = (await res.json()) as MeResponse;
    await applyUiTranslationOverrides();
    setSessionBase({
      user: data.user,
      appParameterBooleans: data.appParameterBooleans ?? {},
      appParameterAssetTypes: data.appParameterAssetTypes ?? null,
      appParameterDefaultWorkgroupId: data.appParameterDefaultWorkgroupId ?? null,
      appParameterDefaultShiftHours:
        typeof data.appParameterDefaultShiftHours === "number" && data.appParameterDefaultShiftHours > 0
          ? data.appParameterDefaultShiftHours
          : 8,
      appParameterAssetKeyMode: data.appParameterAssetKeyMode ?? "manual",
      appParameterShowAssetKeyPath: data.appParameterShowAssetKeyPath ?? false,
      appParameterAssetKeyPathSeparator: data.appParameterAssetKeyPathSeparator ?? ".",
    });
  }, []);

  useEffect(() => {
    let alive = true;
    void apiFetch("/api/auth/me")
      .then(async (r) => {
        if (!alive) return;
        if (!r.ok) {
          setPhase("bad");
          return;
        }
        const data = (await r.json()) as MeResponse;
        await applyUiTranslationOverrides();
        setSessionBase({
          user: data.user,
          appParameterBooleans: data.appParameterBooleans ?? {},
          appParameterAssetTypes: data.appParameterAssetTypes ?? null,
          appParameterDefaultWorkgroupId: data.appParameterDefaultWorkgroupId ?? null,
          appParameterDefaultShiftHours:
            typeof data.appParameterDefaultShiftHours === "number" && data.appParameterDefaultShiftHours > 0
              ? data.appParameterDefaultShiftHours
              : 8,
          appParameterAssetKeyMode: data.appParameterAssetKeyMode ?? "manual",
          appParameterShowAssetKeyPath: data.appParameterShowAssetKeyPath ?? false,
          appParameterAssetKeyPathSeparator: data.appParameterAssetKeyPathSeparator ?? ".",
        });
        setPhase("ok");
      })
      .catch(() => {
        if (!alive) return;
        setPhase("bad");
      });
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (phase !== "ok") {
      setShellEnter("none");
      return;
    }
    let pending = false;
    try {
      pending = sessionStorage.getItem(POST_LOGIN_ENTER_FALLBACK_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (!pending) {
      setShellEnter("none");
      return;
    }

    setShellEnter("initial");
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => {
        setShellEnter("animate");
        try {
          sessionStorage.removeItem(POST_LOGIN_ENTER_FALLBACK_KEY);
        } catch {
          /* ignore */
        }
      });
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
    };
  }, [phase]);

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-on-surface-variant text-sm">
        {t("auditLog.loadingSession")}
      </div>
    );
  }
  if (phase === "bad" || !sessionBase) {
    return <Navigate to="/" replace />;
  }

  const session = {
    user: sessionBase.user,
    appParameterBooleans: sessionBase.appParameterBooleans,
    appParameterAssetTypes: sessionBase.appParameterAssetTypes,
    appParameterDefaultWorkgroupId: sessionBase.appParameterDefaultWorkgroupId,
    appParameterDefaultShiftHours: sessionBase.appParameterDefaultShiftHours,
    appParameterAssetKeyMode: sessionBase.appParameterAssetKeyMode,
    appParameterShowAssetKeyPath: sessionBase.appParameterShowAssetKeyPath,
    appParameterAssetKeyPathSeparator: sessionBase.appParameterAssetKeyPathSeparator,
    refresh,
  };

  const shellEnterClass =
    shellEnter === "initial"
      ? "app-shell-login-enter-from"
      : shellEnter === "animate"
        ? "app-shell-login-enter-active"
        : "";

  return (
    <AuthSessionContext.Provider value={session}>
      <AtheneAssistantProvider>
        <WorkOrderSubscriptionProvider>
          <WorkOrderDialogProvider>
            <MaintenancePlanDialogProvider>
              <div className={`min-h-screen w-full ${shellEnterClass}`}>
                <Outlet />
              </div>
            </MaintenancePlanDialogProvider>
          </WorkOrderDialogProvider>
        </WorkOrderSubscriptionProvider>
      </AtheneAssistantProvider>
    </AuthSessionContext.Provider>
  );
}
