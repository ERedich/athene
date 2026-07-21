import {
  ArrowLeftRight,
  Box,
  Briefcase,
  Calculator,
  CalendarDays,
  CalendarClock,
  ClipboardCheck,
  Clock,
  FilePlus,
  History,
  IdCard,
  Languages,
  LayoutGrid,
  MapPin,
  MessageSquare,
  FolderTree,
  Gauge,
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
  Warehouse,
  Wrench,
  type LucideIcon,
  Users,
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
        to: "/kpi-builder",
        Icon: Gauge,
        labelKey: "kpiBuilder.navKpiBuilder",
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
        to: "/baumstruktur",
        Icon: FolderTree,
        labelKey: "baumstruktur.navBaumstruktur",
      },
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
      {
        to: "/maintenance-plans",
        Icon: Wrench,
        labelKey: "maintenancePlans.navMaintenancePlans",
      },
      {
        to: "/inspection-rounds",
        Icon: ClipboardCheck,
        labelKey: "inspectionRounds.navInspectionRounds",
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
        to: "/auftragserstellung",
        Icon: FilePlus,
        labelKey: "orderCreation.navOrderCreation",
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
      {
        to: "/mitteilungszentrale",
        Icon: MessageSquare,
        labelKey: "mitteilungszentrale.navMitteilungszentrale",
      },
    ],
  },
  {
    id: "schichten",
    labelKey: "shell.navSchichten",
    Icon: Clock,
    items: [
      {
        to: "/shifts",
        Icon: Clock,
        labelKey: "shifts.navShifts",
      },
      {
        to: "/schichtplaner",
        Icon: CalendarClock,
        labelKey: "schichtplaner.nav",
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
        to: "/storage-locations",
        Icon: Package,
        labelKey: "storageLocations.navStorageLocations",
      },
      {
        to: "/spare-parts",
        Icon: Box,
        labelKey: "spareParts.navSpareParts",
      },
    ],
  },
  {
    id: "feedback",
    labelKey: "feedback.navFeedback",
    Icon: MessageSquare,
    items: [],
    to: "/feedback",
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
