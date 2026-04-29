import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiFetch } from "../lib/api";
import type { AppParameterAssetKeyMode } from "../lib/appParameterKeys";
import type { AuthUser } from "../types/api";

import { AuthContext } from "./AuthContext";

type MeResponse = {
  user: AuthUser;
  appParameterBooleans?: Record<string, boolean>;
  appParameterDefaultWorkgroupId?: string | null;
  appParameterAssetKeyMode?: AppParameterAssetKeyMode;
  appParameterShowAssetKeyPath?: boolean;
  appParameterAssetKeyPathSeparator?: string;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [appParameterBooleans, setAppParameterBooleans] = useState<Record<string, boolean>>({});
  const [appParameterDefaultWorkgroupId, setAppParameterDefaultWorkgroupId] = useState<string | null>(null);
  const [appParameterAssetKeyMode, setAppParameterAssetKeyMode] = useState<AppParameterAssetKeyMode>("manual");
  const [appParameterShowAssetKeyPath, setAppParameterShowAssetKeyPath] = useState(false);
  const [appParameterAssetKeyPathSeparator, setAppParameterAssetKeyPathSeparator] = useState(".");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/auth/me");
      if (!res.ok) {
        setUser(null);
        setAppParameterBooleans({});
        setAppParameterDefaultWorkgroupId(null);
        setAppParameterAssetKeyMode("manual");
        setAppParameterShowAssetKeyPath(false);
        setAppParameterAssetKeyPathSeparator(".");
        return;
      }
      const data = (await res.json()) as MeResponse;
      setUser(data.user);
      setAppParameterBooleans(data.appParameterBooleans ?? {});
      setAppParameterDefaultWorkgroupId(data.appParameterDefaultWorkgroupId ?? null);
      setAppParameterAssetKeyMode(data.appParameterAssetKeyMode ?? "manual");
      setAppParameterShowAssetKeyPath(data.appParameterShowAssetKeyPath ?? false);
      setAppParameterAssetKeyPathSeparator(data.appParameterAssetKeyPathSeparator ?? ".");
    } catch {
      setUser(null);
      setAppParameterBooleans({});
      setAppParameterDefaultWorkgroupId(null);
      setAppParameterAssetKeyMode("manual");
      setAppParameterShowAssetKeyPath(false);
      setAppParameterAssetKeyPathSeparator(".");
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
    setAppParameterDefaultWorkgroupId(null);
    setAppParameterAssetKeyMode("manual");
    setAppParameterShowAssetKeyPath(false);
    setAppParameterAssetKeyPathSeparator(".");
  }, []);

  const value = useMemo(
    () => ({
      user,
      appParameterBooleans,
      appParameterDefaultWorkgroupId,
      appParameterAssetKeyMode,
      appParameterShowAssetKeyPath,
      appParameterAssetKeyPathSeparator,
      loading,
      refresh,
      signIn,
      signOut,
    }),
    [
      user,
      appParameterBooleans,
      appParameterDefaultWorkgroupId,
      appParameterAssetKeyMode,
      appParameterShowAssetKeyPath,
      appParameterAssetKeyPathSeparator,
      loading,
      refresh,
      signIn,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
