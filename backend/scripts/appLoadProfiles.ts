export const APP_IDS = [
  "monitoring",
  "workOrders",
  "assets",
  "sites",
  "users",
  "costCenters",
  "classifications",
  "employees",
  "workgroups",
  "warehouses",
  "spareParts",
  "transactions",
  "auditLog",
  "appParameters",
  "translations",
  "tableViewer",
  "searchPresets",
  "dashboard",
] as const;

export type AppId = (typeof APP_IDS)[number];

export type RequestSpec = {
  label: string;
  path: string;
};

export type LoadPhaseSpec =
  | { label: string; mode: "parallel"; requests: RequestSpec[] }
  | { label: string; mode: "sequential"; requests: RequestSpec[] };

export type AppLoadProfile = {
  id: AppId;
  label: string;
  route: string;
  phases: LoadPhaseSpec[];
};

const auditLogDefault = "/api/audit-log?page=1&limit=25";
const transactionsDefault = "/api/transactions?page=1&limit=25";

const workOrderListBundle: RequestSpec[] = [
  { label: "work-orders", path: "/api/work-orders" },
  { label: "assets", path: "/api/assets" },
  { label: "cost-centers", path: "/api/cost-centers" },
  { label: "classifications", path: "/api/classifications" },
  { label: "employees", path: "/api/employees" },
  { label: "workgroups", path: "/api/workgroups" },
  { label: "sites", path: "/api/sites" },
  { label: "users", path: "/api/users" },
];

const searchPresetBootstrap: LoadPhaseSpec[] = [
  {
    label: "search-presets bootstrap",
    mode: "parallel",
    requests: [
      { label: "search-presets", path: "/api/work-order-search-presets" },
      { label: "search-presets/defaults", path: "/api/work-order-search-presets/defaults" },
    ],
  },
];

const tableLayoutBootstrap: LoadPhaseSpec[] = [
  {
    label: "table-layouts bootstrap",
    mode: "parallel",
    requests: [
      { label: "table-layouts", path: "/api/table-layouts?tableKey=monitoring_work_orders" },
      { label: "table-layouts/defaults", path: "/api/table-layouts/defaults" },
    ],
  },
];

export const APP_LOAD_PROFILES: Record<AppId, AppLoadProfile> = {
  monitoring: {
    id: "monitoring",
    label: "Monitoring",
    route: "/monitoring",
    phases: [
      ...searchPresetBootstrap,
      ...tableLayoutBootstrap,
      {
        label: "main data (parallel)",
        mode: "parallel",
        requests: workOrderListBundle,
      },
    ],
  },
  workOrders: {
    id: "workOrders",
    label: "Work orders",
    route: "/workorders",
    phases: [
      ...searchPresetBootstrap,
      {
        label: "main data (parallel)",
        mode: "parallel",
        requests: workOrderListBundle,
      },
    ],
  },
  assets: {
    id: "assets",
    label: "Assets",
    route: "/assets",
    phases: [
      {
        label: "main data (parallel)",
        mode: "parallel",
        requests: [
          { label: "assets", path: "/api/assets" },
          { label: "sites", path: "/api/sites" },
          { label: "cost-centers", path: "/api/cost-centers" },
          { label: "classifications", path: "/api/classifications" },
        ],
      },
    ],
  },
  sites: {
    id: "sites",
    label: "Sites",
    route: "/sites",
    phases: [{ label: "main data", mode: "sequential", requests: [{ label: "sites", path: "/api/sites" }] }],
  },
  users: {
    id: "users",
    label: "Users",
    route: "/users",
    phases: [
      {
        label: "main data (parallel)",
        mode: "parallel",
        requests: [
          { label: "users", path: "/api/users" },
          { label: "sites", path: "/api/sites" },
          { label: "users/all-sites", path: "/api/users/all-sites" },
          { label: "employees", path: "/api/employees" },
        ],
      },
    ],
  },
  costCenters: {
    id: "costCenters",
    label: "Cost centers",
    route: "/cost-centers",
    phases: [
      {
        label: "main data (parallel)",
        mode: "parallel",
        requests: [
          { label: "cost-centers", path: "/api/cost-centers" },
          { label: "sites", path: "/api/sites" },
        ],
      },
    ],
  },
  classifications: {
    id: "classifications",
    label: "Classifications",
    route: "/classifications",
    phases: [
      {
        label: "main data (parallel)",
        mode: "parallel",
        requests: [
          { label: "classifications", path: "/api/classifications" },
          { label: "sites", path: "/api/sites" },
        ],
      },
    ],
  },
  employees: {
    id: "employees",
    label: "Employees",
    route: "/employees",
    phases: [
      {
        label: "main data (parallel)",
        mode: "parallel",
        requests: [
          { label: "employees", path: "/api/employees" },
          { label: "sites", path: "/api/sites" },
        ],
      },
    ],
  },
  workgroups: {
    id: "workgroups",
    label: "Workgroups",
    route: "/workgroups",
    phases: [
      {
        label: "main data (parallel)",
        mode: "parallel",
        requests: [
          { label: "workgroups", path: "/api/workgroups" },
          { label: "sites", path: "/api/sites" },
          { label: "employees", path: "/api/employees" },
        ],
      },
    ],
  },
  warehouses: {
    id: "warehouses",
    label: "Warehouses",
    route: "/warehouses",
    phases: [
      {
        label: "main data (parallel)",
        mode: "parallel",
        requests: [
          { label: "warehouses", path: "/api/warehouses" },
          { label: "sites", path: "/api/sites" },
        ],
      },
    ],
  },
  spareParts: {
    id: "spareParts",
    label: "Spare parts",
    route: "/spare-parts",
    phases: [
      {
        label: "main data (parallel)",
        mode: "parallel",
        requests: [
          { label: "spare-parts", path: "/api/spare-parts" },
          { label: "sites", path: "/api/sites" },
          { label: "classifications", path: "/api/classifications" },
          { label: "warehouses", path: "/api/warehouses" },
        ],
      },
    ],
  },
  transactions: {
    id: "transactions",
    label: "Transactions",
    route: "/transactions",
    phases: [
      {
        label: "main data",
        mode: "sequential",
        requests: [{ label: "transactions", path: transactionsDefault }],
      },
    ],
  },
  auditLog: {
    id: "auditLog",
    label: "Audit log",
    route: "/audit-log",
    phases: [
      {
        label: "main data",
        mode: "sequential",
        requests: [{ label: "audit-log", path: auditLogDefault }],
      },
    ],
  },
  appParameters: {
    id: "appParameters",
    label: "App parameters",
    route: "/app-parameters",
    phases: [
      {
        label: "main data (parallel)",
        mode: "parallel",
        requests: [
          { label: "app-parameters", path: "/api/app-parameters" },
          { label: "workgroups", path: "/api/workgroups" },
        ],
      },
    ],
  },
  translations: {
    id: "translations",
    label: "Translations",
    route: "/translations",
    phases: [
      {
        label: "main data",
        mode: "sequential",
        requests: [{ label: "ui-translation-overrides", path: "/api/ui-translation-overrides" }],
      },
    ],
  },
  tableViewer: {
    id: "tableViewer",
    label: "Table viewer",
    route: "/table-viewer",
    phases: [
      {
        label: "tables list",
        mode: "sequential",
        requests: [{ label: "db-meta/tables", path: "/api/db-meta/tables" }],
      },
    ],
  },
  searchPresets: {
    id: "searchPresets",
    label: "Search presets",
    route: "/suchkonfig",
    phases: [
      ...searchPresetBootstrap,
      {
        label: "reference data (parallel)",
        mode: "parallel",
        requests: workOrderListBundle.filter((r) => r.label !== "work-orders"),
      },
    ],
  },
  dashboard: {
    id: "dashboard",
    label: "Dashboard",
    route: "/dashboard",
    phases: [
      {
        label: "dashboard metrics",
        mode: "parallel",
        requests: [{ label: "metrics", path: "/api/dashboard/metrics" }],
      },
    ],
  },
};

export function isAppId(value: string): value is AppId {
  return (APP_IDS as readonly string[]).includes(value);
}
