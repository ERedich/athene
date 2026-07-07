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
  Truck,
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
  /** Direct navigation without submenu when `items` is empty. */
  to?: string;
  end?: boolean;
};

export const navGroups: NavGroup[] = [
  {
    id: "dashboard",
    labelKey: "dashboard.navDashboard",
    Icon: LayoutGrid,
    items: [],
    to: "/dashboard",
    end: true,
  },
  {
    id: "system",
    labelKey: "shell.navSystem",
    Icon: Settings,
    items: [
      { to: "/audit-log", Icon: History, labelKey: "auditLog.navAudit" },
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
      { to: "/sites", Icon: MapPin, labelKey: "sites.navSites" },
      {
        to: "/tabellen-layouts",
        Icon: Columns3,
        labelKey: "tableLayouts.navTableLayouts",
      },
      {
        to: "/suchkonfig",
        Icon: Share2,
        labelKey: "suchkonfig.navSuchkonfig",
      },
      {
        to: "/table-viewer",
        Icon: Table,
        labelKey: "tableViewer.navTableViewer",
      },
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
      {
        to: "/workgroups",
        Icon: Network,
        labelKey: "workgroups.navWorkgroups",
      },
      {
        to: "/suppliers",
        Icon: Truck,
        labelKey: "suppliers.navSuppliers",
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
      {
        to: "/monitoring",
        Icon: Monitor,
        labelKey: "monitoring.navMonitoring",
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
  if (group.items.length === 0 && group.to) {
    return isNavRouteActive(pathname, group.to, group.end);
  }
  return group.items.some((item) =>
    isNavRouteActive(pathname, item.to, item.end),
  );
}

export function activeNavGroupIds(pathname: string): string[] {
  return navGroups
    .filter((group) => isNavGroupActive(pathname, group))
    .map((group) => group.id);
}
