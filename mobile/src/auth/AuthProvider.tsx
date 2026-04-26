import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiFetch } from "../lib/api";
import type { AuthUser } from "../types/api";

import { AuthContext } from "./AuthContext";

type MeResponse = {
  user: AuthUser;
  appParameterBooleans?: Record<string, boolean>;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [appParameterBooleans, setAppParameterBooleans] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/auth/me");
      if (!res.ok) {
        setUser(null);
        setAppParameterBooleans({});
        return;
      }
      const data = (await res.json()) as MeResponse;
      setUser(data.user);
      setAppParameterBooleans(data.appParameterBooleans ?? {});
    } catch {
      setUser(null);
      setAppParameterBooleans({});
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      await refresh();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  const signIn = useCallback(async (loginName: string, password: string, remember: boolean) => {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginName, password, remember }),
    });
    if (res.ok) {
      await refresh();
      return { ok: true, status: res.status };
    }
    return { ok: false, status: res.status };
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setUser(null);
    setAppParameterBooleans({});
  }, []);

  const value = useMemo(
    () => ({
      user,
      appParameterBooleans,
      loading,
      refresh,
      signIn,
      signOut,
    }),
    [user, appParameterBooleans, loading, refresh, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
