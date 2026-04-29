import { createContext, useContext } from "react";

import type { AppParameterAssetKeyMode } from "../lib/appParameterKeys";
import type { AuthUser } from "../types/api";

export type AuthSession = {
  user: AuthUser | null;
  appParameterBooleans: Record<string, boolean>;
  appParameterDefaultWorkgroupId: string | null;
  appParameterAssetKeyMode: AppParameterAssetKeyMode;
  appParameterShowAssetKeyPath: boolean;
  appParameterAssetKeyPathSeparator: string;
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: (loginName: string, password: string, remember: boolean) => Promise<{ ok: boolean; status: number }>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthSession | null>(null);

export function useAuth(): AuthSession {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
