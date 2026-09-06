import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext";
import { hasPermission, permissionKey } from "../lib/permissions";

/** Map first path segment / known routes to permission appKey. */
const ROUTE_APP_KEY: Record<string, string> = {
  dashboard: "dashboard",
  "report-designer": "report-designer",
  "getting-started": "getting-started",
  feedback: "feedback",
  "audit-log": "audit-log",
  "app-parameters": "app-parameters",
  translations: "translations",
  "customize-menu": "customize-menu",
  systemwerkzeuge: "system-tools",
  users: "users",
  berechtigungswesen: "permission-templates",
  "permission-templates": "permission-templates",
  zuweisungen: "assignments",
  sites: "sites",
  "kpi-builder": "kpi-builder",
  "layout-editor": "layout-editor",
  suchkonfig: "search-presets",
  "table-viewer": "table-viewer",
  "stammdaten-manager": "stammdaten-manager",
  assets: "assets",
  baumstruktur: "baumstruktur",
  employees: "employees",
  "cost-centers": "cost-centers",
  auftragstypen: "work-order-types",
  probleme: "problems",
  ursachen: "causes",
  massnahmen: "remedies",
  classifications: "classifications",
  workgroups: "workgroups",
  suppliers: "suppliers",
  "maintenance-plans": "maintenance-plans",
  "inspection-rounds": "inspection-rounds",
  workorders: "work-orders",
  auftragserstellung: "order-creation",
  kalendar: "kalendar",
  transactions: "transactions",
  monitoring: "monitoring",
  mitteilungszentrale: "notification-center",
  abonnements: "subscriptions",
  shifts: "shifts",
  schichtplaner: "shift-planner",
  warehouses: "warehouses",
  "storage-locations": "storage-locations",
  "spare-parts": "spare-parts",
};

export function appKeyForPathname(pathname: string): string | null {
  const seg = pathname.replace(/\/+$/, "").split("/").filter(Boolean)[0];
  if (!seg) return "dashboard";
  return ROUTE_APP_KEY[seg.toLowerCase()] ?? null;
}

/** Forbidden panel when `{app}.view` is missing. */
export function AppViewForbidden() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-2 p-8 text-on-surface">
      <h2 className="text-lg font-medium">{t("permissions.forbidden")}</h2>
      <p className="text-sm text-on-surface-variant">{t("permissions.forbiddenHint")}</p>
    </div>
  );
}

export function useMissingAppView(): boolean {
  const { pathname } = useLocation();
  const { permissions } = useAuth();
  const appKey = appKeyForPathname(pathname);
  return Boolean(appKey && !hasPermission(permissions, permissionKey(appKey, "view")));
}
