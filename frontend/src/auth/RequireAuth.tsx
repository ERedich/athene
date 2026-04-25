import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet } from "react-router-dom";
import { apiFetch } from "../lib/api";

import { AuthSessionContext, type AuthUser } from "./AuthContext";

type MeResponse = {
  user: AuthUser;
  appParameterBooleans?: Record<string, boolean>;
};

type SessionBase = {
  user: AuthUser;
  appParameterBooleans: Record<string, boolean>;
};

export function RequireAuth() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"loading" | "bad" | "ok">("loading");
  const [sessionBase, setSessionBase] = useState<SessionBase | null>(null);

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/auth/me");
    if (!res.ok) return;
    const data = (await res.json()) as MeResponse;
    setSessionBase({
      user: data.user,
      appParameterBooleans: data.appParameterBooleans ?? {},
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
        setSessionBase({
          user: data.user,
          appParameterBooleans: data.appParameterBooleans ?? {},
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
    refresh,
  };

  return (
    <AuthSessionContext.Provider value={session}>
      <Outlet />
    </AuthSessionContext.Provider>
  );
}
