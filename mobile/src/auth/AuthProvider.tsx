import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  apiFetch,
  MOBILE_SESSION_STORAGE_KEY,
  setMobileBearerToken,
} from "../lib/api";
import type { AppParameterAssetKeyMode } from "../lib/appParameterKeys";
import { parseAssetTypeDisplayConfig, type AssetTypeDisplayConfig } from "../lib/assetTypeDisplay";
import type { AuthUser } from "../types/api";

import { AuthContext } from "./AuthContext";

type MeResponse = {
  user: AuthUser;
  appParameterBooleans?: Record<string, boolean>;
  appParameterDefaultWorkgroupId?: string | null;
  appParameterDefaultShiftHours?: number;
  appParameterAssetKeyMode?: AppParameterAssetKeyMode;
  appParameterShowAssetKeyPath?: boolean;
  appParameterAssetKeyPathSeparator?: string;
  appParameterAssetTypes?: AssetTypeDisplayConfig | null;
};

async function clearMobileCredentials(): Promise<void> {
  setMobileBearerToken(null);
  try {
    await AsyncStorage.removeItem(MOBILE_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [appParameterBooleans, setAppParameterBooleans] = useState<Record<string, boolean>>({});
  const [appParameterAssetTypes, setAppParameterAssetTypes] = useState<AssetTypeDisplayConfig | null>(null);
  const [appParameterDefaultWorkgroupId, setAppParameterDefaultWorkgroupId] = useState<string | null>(null);
  const [appParameterDefaultShiftHours, setAppParameterDefaultShiftHours] = useState(8);
  const [appParameterAssetKeyMode, setAppParameterAssetKeyMode] = useState<AppParameterAssetKeyMode>("manual");
  const [appParameterShowAssetKeyPath, setAppParameterShowAssetKeyPath] = useState(false);
  const [appParameterAssetKeyPathSeparator, setAppParameterAssetKeyPathSeparator] = useState(".");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiFetch("/api/auth/me");
      if (!res.ok) {
        await clearMobileCredentials();
        setUser(null);
        setAppParameterBooleans({});
        setAppParameterAssetTypes(null);
        setAppParameterDefaultWorkgroupId(null);
        setAppParameterDefaultShiftHours(8);
        setAppParameterAssetKeyMode("manual");
        setAppParameterShowAssetKeyPath(false);
        setAppParameterAssetKeyPathSeparator(".");
        return false;
      }
      const data = (await res.json()) as MeResponse;
      setUser(data.user);
      setAppParameterBooleans(data.appParameterBooleans ?? {});
      setAppParameterAssetTypes(parseAssetTypeDisplayConfig(data.appParameterAssetTypes));
      setAppParameterDefaultWorkgroupId(data.appParameterDefaultWorkgroupId ?? null);
      setAppParameterDefaultShiftHours(
        typeof data.appParameterDefaultShiftHours === "number" && data.appParameterDefaultShiftHours > 0
          ? data.appParameterDefaultShiftHours
          : 8,
      );
      setAppParameterAssetKeyMode(data.appParameterAssetKeyMode ?? "manual");
      setAppParameterShowAssetKeyPath(data.appParameterShowAssetKeyPath ?? false);
      setAppParameterAssetKeyPathSeparator(data.appParameterAssetKeyPathSeparator ?? ".");
      return true;
    } catch {
      await clearMobileCredentials();
      setUser(null);
      setAppParameterBooleans({});
      setAppParameterAssetTypes(null);
      setAppParameterDefaultWorkgroupId(null);
      setAppParameterDefaultShiftHours(8);
      setAppParameterAssetKeyMode("manual");
      setAppParameterShowAssetKeyPath(false);
      setAppParameterAssetKeyPathSeparator(".");
      return false;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(MOBILE_SESSION_STORAGE_KEY);
        if (stored) setMobileBearerToken(stored);
      } catch {
        /* ignore */
      }
      await refresh();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  const signIn = useCallback(
    async (loginName: string, password: string, remember: boolean) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        // Always request a bearer token: Expo Web runs on a different origin/port than the API,
        // so HttpOnly session cookies are often not sent on fetch; native uses the same header.
        "X-Athene-Mobile-Auth": "1",
      };
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ loginName, password, remember }),
      });
      if (!res.ok) {
        return { ok: false, status: res.status };
      }
      const data = (await res.json()) as { sessionToken?: string };
      if (data.sessionToken) {
        setMobileBearerToken(data.sessionToken);
        try {
          if (remember) {
            await AsyncStorage.setItem(MOBILE_SESSION_STORAGE_KEY, data.sessionToken);
          } else {
            await AsyncStorage.removeItem(MOBILE_SESSION_STORAGE_KEY);
          }
        } catch {
          /* ignore */
        }
      }
      const authed = await refresh();
      return { ok: authed, status: res.status };
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    await clearMobileCredentials();
    setUser(null);
    setAppParameterBooleans({});
    setAppParameterAssetTypes(null);
    setAppParameterDefaultWorkgroupId(null);
    setAppParameterDefaultShiftHours(8);
    setAppParameterAssetKeyMode("manual");
    setAppParameterShowAssetKeyPath(false);
    setAppParameterAssetKeyPathSeparator(".");
  }, []);

  const value = useMemo(
    () => ({
      user,
      appParameterBooleans,
      appParameterAssetTypes,
      appParameterDefaultWorkgroupId,
      appParameterDefaultShiftHours,
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
      appParameterAssetTypes,
      appParameterDefaultWorkgroupId,
      appParameterDefaultShiftHours,
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
