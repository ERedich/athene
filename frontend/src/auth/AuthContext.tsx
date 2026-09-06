import { createContext, useContext } from "react";

import type { AppParameterAssetKeyMode } from "../lib/appParameterKeys";
import type { AssetTypeDisplayConfig } from "../lib/assetTypeDisplay";
import type { PermissionCatalogApp } from "../lib/permissions";

export type AuthUser = {
  id: string;
  loginName: string;
  name: string;
  workingSiteId: string;
  employeeId: string | null;
  employeeKey: string | null;
  employeeName: string | null;
  siteIds: string[];
  workgroups: Array<{ id: string; key: string; name: string; siteId: string }>;
  /** ISO timestamp when first-login tour finished; null = show onboarding. */
  onboardingCompletedAt: string | null;
};

export type AuthSession = {
  user: AuthUser;
  permissions: string[];
  permissionCatalog: PermissionCatalogApp[];
  appParameterBooleans: Record<string, boolean>;
  appParameterAssetTypes: AssetTypeDisplayConfig | null;
  /** WO-DWG: default work group UUID for new work orders, or null if unset. */
  appParameterDefaultWorkgroupId: string | null;
  /** SH-DSH: default shift hours when employee has no shift details. */
  appParameterDefaultShiftHours: number;
  /** WO-CLMD: hide calendar work orders shorter than this many hours (0–100). */
  appParameterCalendarMinDurationHours: number;
  /** GN-AAKG */
  appParameterAssetKeyMode: AppParameterAssetKeyMode;
  /** GN-SAKP */
  appParameterShowAssetKeyPath: boolean;
  appParameterAssetKeyPathSeparator: string;
  /** GN-PRIM: CSS --color-primary hex. */
  appParameterPrimaryColorHex: string;
  refresh: () => Promise<void>;
};

export const AuthSessionContext = createContext<AuthSession | null>(null);

export function useAuth(): AuthSession {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an authenticated route");
  }
  return ctx;
}
