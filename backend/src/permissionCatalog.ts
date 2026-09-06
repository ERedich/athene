/**
 * Permission catalog — source of truth for all grantable keys.
 * Effective key: `{appKey}.{action}` e.g. assets.delete, workOrder.start
 */

export type PermissionActionKind = "crud" | "extra";

export type PermissionActionDef = {
  key: string;
  kind: PermissionActionKind;
};

export type AppPermissionDef = {
  appKey: string;
  /** Nav route when this app appears in the sidebar; null for virtual groups. */
  route: string | null;
  labelKey: string;
  actions: PermissionActionDef[];
  /** When true, keys are meta and not granted in the operational seed. */
  meta?: boolean;
};

export const STANDARD_CRUD: PermissionActionDef[] = [
  { key: "view", kind: "crud" },
  { key: "create", kind: "crud" },
  { key: "update", kind: "crud" },
  { key: "delete", kind: "crud" },
];

export const VIEW_ONLY: PermissionActionDef[] = [{ key: "view", kind: "crud" }];

export const VIEW_UPDATE: PermissionActionDef[] = [
  { key: "view", kind: "crud" },
  { key: "update", kind: "crud" },
];

export const WORK_ORDER_ACTIONS: PermissionActionDef[] = [
  { key: "start", kind: "extra" },
  { key: "pause", kind: "extra" },
  { key: "cancel", kind: "extra" },
  { key: "complete", kind: "extra" },
  { key: "feedback", kind: "extra" },
  { key: "assign", kind: "extra" },
  { key: "subscribe", kind: "extra" },
];

/** Meta keys — only seed-admin gets these in migration. */
export const META_PERMISSION_KEYS = [
  "permissions.manage",
  "permission-templates.view",
  "permission-templates.create",
  "permission-templates.update",
  "permission-templates.delete",
  "layout-editor.editSystem",
] as const;

export const PERMISSION_CATALOG: AppPermissionDef[] = [
  // Leaf / hubs
  {
    appKey: "dashboard",
    route: "/dashboard",
    labelKey: "dashboard.appName",
    actions: VIEW_ONLY,
  },
  {
    appKey: "report-designer",
    route: "/report-designer",
    labelKey: "reportDesigner.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "getting-started",
    route: "/getting-started",
    labelKey: "gettingStarted.appName",
    actions: VIEW_ONLY,
  },
  {
    appKey: "feedback",
    route: "/feedback",
    labelKey: "feedback.appName",
    actions: [
      { key: "view", kind: "crud" },
      { key: "create", kind: "crud" },
    ],
  },

  // System
  {
    appKey: "audit-log",
    route: "/audit-log",
    labelKey: "auditLog.appName",
    actions: VIEW_ONLY,
  },
  {
    appKey: "app-parameters",
    route: "/app-parameters",
    labelKey: "appParameters.appName",
    actions: VIEW_UPDATE,
  },
  {
    appKey: "translations",
    route: "/translations",
    labelKey: "translations.appName",
    actions: VIEW_UPDATE,
  },
  {
    appKey: "customize-menu",
    route: "/customize-menu",
    labelKey: "customizeMenu.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "system-tools",
    route: "/systemwerkzeuge",
    labelKey: "systemTools.appName",
    actions: [
      { key: "view", kind: "crud" },
      { key: "execute", kind: "extra" },
    ],
  },

  // Administration
  {
    appKey: "users",
    route: "/users",
    labelKey: "users.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "assignments",
    route: "/zuweisungen",
    labelKey: "assignments.appName",
    actions: [
      { key: "view", kind: "crud" },
      { key: "update", kind: "crud" },
    ],
  },
  {
    appKey: "sites",
    route: "/sites",
    labelKey: "sites.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "kpi-builder",
    route: "/kpi-builder",
    labelKey: "kpiBuilder.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "layout-editor",
    route: "/layout-editor",
    labelKey: "layoutEditor.appName",
    actions: [
      ...STANDARD_CRUD,
      { key: "editSystem", kind: "extra" },
    ],
  },
  {
    appKey: "search-presets",
    route: "/suchkonfig",
    labelKey: "suchkonfig.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "table-viewer",
    route: "/table-viewer",
    labelKey: "tableViewer.appName",
    actions: VIEW_ONLY,
  },
  {
    appKey: "permission-templates",
    route: "/berechtigungswesen",
    labelKey: "berechtigungswesen.appName",
    actions: STANDARD_CRUD,
    meta: true,
  },

  // Stammdaten
  {
    appKey: "stammdaten-manager",
    route: "/stammdaten-manager",
    labelKey: "stammdatenManager.appName",
    actions: VIEW_ONLY,
  },
  {
    appKey: "assets",
    route: "/assets",
    labelKey: "assets.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "baumstruktur",
    route: "/baumstruktur",
    labelKey: "baumstruktur.appName",
    actions: VIEW_ONLY,
  },
  {
    appKey: "employees",
    route: "/employees",
    labelKey: "employees.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "cost-centers",
    route: "/cost-centers",
    labelKey: "costCenters.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "work-order-types",
    route: "/auftragstypen",
    labelKey: "auftragstypen.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "problems",
    route: "/probleme",
    labelKey: "probleme.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "causes",
    route: "/ursachen",
    labelKey: "ursachen.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "remedies",
    route: "/massnahmen",
    labelKey: "massnahmen.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "classifications",
    route: "/classifications",
    labelKey: "classifications.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "workgroups",
    route: "/workgroups",
    labelKey: "workgroups.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "suppliers",
    route: "/suppliers",
    labelKey: "suppliers.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "maintenance-plans",
    route: "/maintenance-plans",
    labelKey: "maintenancePlans.appName",
    actions: [
      ...STANDARD_CRUD,
      { key: "generateDue", kind: "extra" },
    ],
  },
  {
    appKey: "inspection-rounds",
    route: "/inspection-rounds",
    labelKey: "inspectionRounds.appName",
    actions: STANDARD_CRUD,
  },

  // Auftragswesen
  {
    appKey: "work-orders",
    route: "/workorders",
    labelKey: "workOrders.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "order-creation",
    route: "/auftragserstellung",
    labelKey: "orderCreation.appName",
    actions: [
      { key: "view", kind: "crud" },
      { key: "create", kind: "crud" },
    ],
  },
  {
    appKey: "kalendar",
    route: "/kalendar",
    labelKey: "kalendar.appName",
    actions: VIEW_UPDATE,
  },
  {
    appKey: "transactions",
    route: "/transactions",
    labelKey: "transactions.appName",
    actions: [
      { key: "view", kind: "crud" },
      { key: "create", kind: "crud" },
      { key: "delete", kind: "crud" },
    ],
  },
  {
    appKey: "monitoring",
    route: "/monitoring",
    labelKey: "monitoring.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "notification-center",
    route: "/mitteilungszentrale",
    labelKey: "mitteilungszentrale.appName",
    actions: VIEW_ONLY,
  },
  {
    appKey: "subscriptions",
    route: "/abonnements",
    labelKey: "abonnements.appName",
    actions: VIEW_ONLY,
  },

  // Schichten
  {
    appKey: "shifts",
    route: "/shifts",
    labelKey: "shifts.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "shift-planner",
    route: "/schichtplaner",
    labelKey: "schichtplaner.appName",
    actions: VIEW_UPDATE,
  },

  // Lager
  {
    appKey: "warehouses",
    route: "/warehouses",
    labelKey: "warehouses.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "storage-locations",
    route: "/storage-locations",
    labelKey: "storageLocations.appName",
    actions: STANDARD_CRUD,
  },
  {
    appKey: "spare-parts",
    route: "/spare-parts",
    labelKey: "spareParts.appName",
    actions: STANDARD_CRUD,
  },

  // Virtual: shared work-order process actions
  {
    appKey: "workOrder",
    route: null,
    labelKey: "permissions.workOrderActions",
    actions: WORK_ORDER_ACTIONS,
  },

  // Meta: grant management (not a nav app for "permissions" itself)
  {
    appKey: "permissions",
    route: null,
    labelKey: "permissions.manageLabel",
    actions: [{ key: "manage", kind: "extra" }],
    meta: true,
  },
];

export function permissionKey(appKey: string, action: string): string {
  return `${appKey}.${action}`;
}

export function allCatalogKeys(opts?: { includeMeta?: boolean }): string[] {
  const includeMeta = opts?.includeMeta ?? true;
  const keys: string[] = [];
  for (const app of PERMISSION_CATALOG) {
    if (app.meta && !includeMeta) continue;
    for (const action of app.actions) {
      const key = permissionKey(app.appKey, action.key);
      if (!includeMeta && (META_PERMISSION_KEYS as readonly string[]).includes(key)) {
        continue;
      }
      keys.push(key);
    }
  }
  // Also filter editSystem as meta even when app is not fully meta
  if (!includeMeta) {
    return keys.filter((k) => !(META_PERMISSION_KEYS as readonly string[]).includes(k));
  }
  return keys;
}

/** Keys granted to all existing users on migration (today's capabilities). */
export function operationalPermissionKeys(): string[] {
  return allCatalogKeys({ includeMeta: false });
}

export function isKnownPermissionKey(key: string): boolean {
  return allCatalogKeys({ includeMeta: true }).includes(key);
}

export function appKeyForRoute(route: string): string | null {
  const normalized = route.replace(/\/+$/, "") || "/";
  for (const app of PERMISSION_CATALOG) {
    if (app.route && (app.route === normalized || normalized.startsWith(`${app.route}/`))) {
      return app.appKey;
    }
  }
  return null;
}

export function catalogForClient(): Array<{
  appKey: string;
  route: string | null;
  labelKey: string;
  meta?: boolean;
  actions: Array<{ key: string; kind: PermissionActionKind }>;
}> {
  return PERMISSION_CATALOG.map((app) => ({
    appKey: app.appKey,
    route: app.route,
    labelKey: app.labelKey,
    meta: app.meta,
    actions: app.actions.map((a) => ({ key: a.key, kind: a.kind })),
  }));
}
