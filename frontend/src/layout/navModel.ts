import {
  ArrowLeftRight,
  Box,
  Briefcase,
  Calculator,
  CalendarDays,
  History,
  IdCard,
  Languages,
  LayoutGrid,
  MapPin,
  Columns3,
  Monitor,
  Network,
  Package,
  Settings,
  Share2,
  Shield,
  SlidersHorizontal,
  Table,
  Tags,
  type LucideIcon,
  Users,
  Warehouse,
} from "lucide-react";

export type NavRouteItem = {
  to: string;
  end?: boolean;
  Icon: LucideIcon;
  labelKey: string;
};

export type NavGroup = {
  id: string;
  labelKey: string;
  Icon: LucideIcon;
  items: NavRouteItem[];
};

export const navGroups: NavGroup[] = [
  {
    id: "system",
    labelKey: "shell.navSystem",
    Icon: Settings,
    items: [
      {
        to: "/dashboard",
        end: true,
        Icon: LayoutGrid,
        labelKey: "dashboard.navDashboard",
      },
      {
        to: "/monitoring",
        Icon: Monitor,
        labelKey: "monitoring.navMonitoring",
      },
      { to: "/audit-log", Icon: History, labelKey: "auditLog.navAudit" },
      {
        to: "/table-viewer",
        Icon: Table,
        labelKey: "tableViewer.navTableViewer",
      },
      {
        to: "/app-parameters",
        Icon: SlidersHorizontal,
        labelKey: "appParameters.navAppParameters",
      },
      {
        to: "/translations",
        Icon: Languages,
        labelKey: "translations.navTranslations",
      },
      {
        to: "/suchkonfig",
        Icon: Share2,
        labelKey: "suchkonfig.navSuchkonfig",
      },
      {
        to: "/tabellen-layouts",
        Icon: Columns3,
        labelKey: "tableLayouts.navTableLayouts",
      },
      {
        to: "/calculator",
        Icon: Calculator,
        labelKey: "calculator.navCalculator",
      },
    ],
  },
  {
    id: "administration",
    labelKey: "shell.navAdministration",
    Icon: Shield,
    items: [
      { to: "/users", Icon: Users, labelKey: "users.navUsers" },
      {
        to: "/workgroups",
        Icon: Network,
        labelKey: "workgroups.navWorkgroups",
      },
      { to: "/sites", Icon: MapPin, labelKey: "sites.navSites" },
    ],
  },
  {
    id: "stammdaten",
    labelKey: "shell.navStammdaten",
    Icon: Tags,
    items: [
      { to: "/assets", Icon: Package, labelKey: "assets.navAssets" },
      {
        to: "/employees",
        Icon: IdCard,
        labelKey: "employees.navEmployees",
      },
      {
        to: "/cost-centers",
        Icon: Briefcase,
        labelKey: "costCenters.navCostCenters",
      },
      {
        to: "/classifications",
        Icon: Tags,
        labelKey: "classifications.navClassifications",
      },
    ],
  },
  {
    id: "auftragswesen",
    labelKey: "shell.navAuftragswesen",
    Icon: Briefcase,
    items: [
      {
        to: "/workorders",
        Icon: Briefcase,
        labelKey: "workOrders.navOrders",
      },
      {
        to: "/kalendar",
        Icon: CalendarDays,
        labelKey: "kalendar.navKalendar",
      },
      {
        to: "/transactions",
        Icon: ArrowLeftRight,
        labelKey: "transactions.navTransactions",
      },
    ],
  },
  {
    id: "lagerhaltung",
    labelKey: "shell.navLagerhaltung",
    Icon: Warehouse,
    items: [
      {
        to: "/warehouses",
        Icon: Warehouse,
        labelKey: "warehouses.navWarehouses",
      },
      {
        to: "/spare-parts",
        Icon: Box,
        labelKey: "spareParts.navSpareParts",
      },
    ],
  },
];

export function isNavRouteActive(
  pathname: string,
  to: string,
  end?: boolean,
): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const target = to.replace(/\/+$/, "") || "/";
  if (end) {
    return normalized === target;
  }
  return normalized === target || normalized.startsWith(`${target}/`);
}

export function isNavGroupActive(pathname: string, group: NavGroup): boolean {
  return group.items.some((item) =>
    isNavRouteActive(pathname, item.to, item.end),
  );
}

export function activeNavGroupIds(pathname: string): string[] {
  return navGroups
    .filter((group) => isNavGroupActive(pathname, group))
    .map((group) => group.id);
}
