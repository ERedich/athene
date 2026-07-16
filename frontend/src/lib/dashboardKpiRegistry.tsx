import type { ChartData, ChartOptions } from "chart.js";
import type { TFunction } from "i18next";
import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Clock,
  Package,
  Receipt,
  Sparkles,
  Timer,
  User,
  type LucideProps,
} from "lucide-react";

import type { DashboardMetrics } from "../hooks/useDashboardMetrics";
import { EMPLOYEE_PSEUDO_ME } from "./workOrderApiFilters";
import {
  buildDashboardBarChartOptions,
  buildOrderTypeBarChartData,
  workOrdersActiveStatusHref,
} from "./dashboardCharts";
import {
  demoSparkSeries,
  seriesFromByDay,
  type SparkAccent,
} from "./dashboardSparkCharts";

export const DASHBOARD_KPI_IDS = [
  "atheneGreeting",
  "openActive",
  "completedLast7Days",
  "myOrders",
  "transactionsLast7Days",
  "ordersByType",
  "delayedOrders",
  "avgDelayHours",
  "topAssetByOrders",
  "transactionsLast24h",
  "transactionsLastMonth",
] as const;

export type DashboardKpiId = (typeof DASHBOARD_KPI_IDS)[number];

export type DashboardKpiCategory =
  | "athene"
  | "transactions"
  | "workOrders"
  | "feedback"
  | "warehouse";

export const DASHBOARD_KPI_CATEGORIES: DashboardKpiCategory[] = [
  "athene",
  "transactions",
  "workOrders",
  "feedback",
  "warehouse",
];

export const DASHBOARD_SLOT_COUNT = 16;

/** Default: Athene greeting (2×2) at slot 0 + remaining normal tiles. */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardKpiId[] = [
  "atheneGreeting",
  "delayedOrders",
  "myOrders",
  "transactionsLast24h",
  "ordersByType",
  "completedLast7Days",
  "avgDelayHours",
  "topAssetByOrders",
  "transactionsLast7Days",
  "transactionsLastMonth",
  "openActive",
  "delayedOrders",
  "myOrders",
  "transactionsLast24h",
  "ordersByType",
  "completedLast7Days",
];

type IconComponent = ComponentType<LucideProps>;

export type DashboardKpiDefinition = {
  id: DashboardKpiId;
  category: DashboardKpiCategory;
  icon: IconComponent;
  accent: SparkAccent;
  titleKey: string;
  descKey: string;
  /** Desktop grid span (logical 4×4). Defaults to 1×1. */
  colSpan?: number;
  rowSpan?: number;
};

export const DASHBOARD_KPI_DEFINITIONS: DashboardKpiDefinition[] = [
  {
    id: "atheneGreeting",
    category: "athene",
    icon: Sparkles,
    accent: "blue",
    titleKey: "dashboard.kpiAtheneGreeting",
    descKey: "dashboard.kpiAtheneGreetingDesc",
    colSpan: 2,
    rowSpan: 2,
  },
  { id: "openActive", category: "workOrders", icon: ClipboardList, accent: "green", titleKey: "dashboard.kpiOpenActive", descKey: "dashboard.kpiOpenActiveDesc" },
  { id: "completedLast7Days", category: "workOrders", icon: CheckCircle2, accent: "teal", titleKey: "dashboard.kpiCompleted7d", descKey: "dashboard.kpiCompleted7dDesc" },
  { id: "myOrders", category: "workOrders", icon: User, accent: "blue", titleKey: "dashboard.kpiMyOrders", descKey: "dashboard.kpiMyOrdersDesc" },
  { id: "transactionsLast7Days", category: "transactions", icon: Receipt, accent: "green", titleKey: "dashboard.kpiTransactions7d", descKey: "dashboard.kpiTransactions7dDesc" },
  { id: "ordersByType", category: "workOrders", icon: BarChart3, accent: "blue", titleKey: "dashboard.kpiOrdersByType", descKey: "dashboard.kpiOrdersByTypeDesc" },
  { id: "delayedOrders", category: "workOrders", icon: AlertTriangle, accent: "amber", titleKey: "dashboard.kpiDelayedOrders", descKey: "dashboard.kpiDelayedOrdersDesc" },
  { id: "avgDelayHours", category: "workOrders", icon: Timer, accent: "amber", titleKey: "dashboard.kpiAvgDelay", descKey: "dashboard.kpiAvgDelayDesc" },
  { id: "topAssetByOrders", category: "workOrders", icon: Package, accent: "teal", titleKey: "dashboard.kpiTopAsset", descKey: "dashboard.kpiTopAssetDesc" },
  { id: "transactionsLast24h", category: "transactions", icon: Clock, accent: "green", titleKey: "dashboard.kpiTransactions24h", descKey: "dashboard.kpiTransactions24hDesc" },
  { id: "transactionsLastMonth", category: "transactions", icon: CalendarRange, accent: "green", titleKey: "dashboard.kpiTransactionsLastMonth", descKey: "dashboard.kpiTransactionsLastMonthDesc" },
];

const KPI_MAP = new Map(DASHBOARD_KPI_DEFINITIONS.map((d) => [d.id, d]));

export function getDashboardKpiSpan(id: DashboardKpiId): { colSpan: number; rowSpan: number } {
  const def = KPI_MAP.get(id);
  return {
    colSpan: def?.colSpan ?? 1,
    rowSpan: def?.rowSpan ?? 1,
  };
}

export function getDashboardKpiDefinition(id: DashboardKpiId): DashboardKpiDefinition {
  const def = KPI_MAP.get(id);
  if (!def) throw new Error(`Unknown dashboard KPI: ${id}`);
  return def;
}

export function isDashboardKpiId(value: unknown): value is DashboardKpiId {
  return typeof value === "string" && DASHBOARD_KPI_IDS.includes(value as DashboardKpiId);
}

export type DashboardKpiBarChart = {
  type: "bar";
  data: ChartData<"bar">;
  options: ChartOptions<"bar">;
};

export type DashboardKpiDisplay = "chart" | "value";

export type DashboardKpiView = {
  title: string;
  icon: IconComponent;
  accent: SparkAccent;
  display: DashboardKpiDisplay;
  value: number | string | null;
  valueSuffix?: string;
  detail?: string;
  series: number[];
  chart?: DashboardKpiBarChart;
  href?: string;
  footer?: ReactNode;
};

function formatAvgDelay(hours: number | null, locale: string): number | string | null {
  if (hours == null) return null;
  try {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(hours);
  } catch {
    return hours.toFixed(1);
  }
}

function workOrdersAssetHref(assetId: string): string {
  const p = new URLSearchParams();
  p.append("assetId", assetId);
  return `/monitoring?${p.toString()}`;
}

export function resolveKpiView(
  kpiId: DashboardKpiId,
  metrics: DashboardMetrics | null,
  locale: string,
  t: TFunction,
): DashboardKpiView {
  const def = getDashboardKpiDefinition(kpiId);
  const title = t(def.titleKey);

  if (!metrics) {
    return {
      title,
      icon: def.icon,
      accent: def.accent,
      display:
        kpiId === "atheneGreeting" ||
        kpiId === "avgDelayHours" ||
        kpiId === "topAssetByOrders" ||
        kpiId === "transactionsLastMonth"
          ? "value"
          : "chart",
      value: null,
      series: demoSparkSeries(0),
    };
  }

  switch (kpiId) {
    case "atheneGreeting":
      return {
        title,
        icon: def.icon,
        accent: def.accent,
        display: "value",
        value: null,
        series: [],
      };

    case "openActive":
      return {
        title,
        icon: def.icon,
        accent: def.accent,
        display: "chart",
        value: metrics.openActive.total,
        series: demoSparkSeries(metrics.openActive.total),
        href: workOrdersActiveStatusHref(),
      };

    case "completedLast7Days":
      return {
        title,
        icon: def.icon,
        accent: def.accent,
        display: "chart",
        value: metrics.completedLast7Days.total,
        series: seriesFromByDay(metrics.completedLast7Days.byDay),
        href: "/monitoring",
      };

    case "myOrders": {
      const myOrdersHref = `/monitoring?employeeId=${encodeURIComponent(EMPLOYEE_PSEUDO_ME)}`;
      return {
        title,
        icon: def.icon,
        accent: def.accent,
        display: "chart",
        value: metrics.myOrders.total,
        series: demoSparkSeries(metrics.myOrders.total),
        href: myOrdersHref,
        footer: !metrics.myOrders.employeeLinked ? (
          <p className="text-xs text-on-surface-variant">{t("dashboard.noEmployee")}</p>
        ) : null,
      };
    }

    case "transactionsLast7Days":
      return {
        title,
        icon: def.icon,
        accent: def.accent,
        display: "chart",
        value: metrics.transactionsLast7Days.total,
        series: seriesFromByDay(metrics.transactionsLast7Days.byDay),
        href: "/transactions",
      };

    case "ordersByType":
      return {
        title,
        icon: def.icon,
        accent: def.accent,
        display: "chart",
        value: metrics.ordersByType.total,
        series: [],
        chart: {
          type: "bar",
          data: buildOrderTypeBarChartData(metrics.ordersByType.byType, t),
          options: buildDashboardBarChartOptions(),
        },
        href: "/monitoring",
      };

    case "delayedOrders":
      return {
        title,
        icon: def.icon,
        accent: def.accent,
        display: "chart",
        value: metrics.delayedOrders.total,
        series: demoSparkSeries(metrics.delayedOrders.total),
        href: "/monitoring?overdue=1",
      };

    case "avgDelayHours":
      return {
        title,
        icon: def.icon,
        accent: def.accent,
        display: "value",
        value: formatAvgDelay(metrics.avgDelayHours.hours, locale),
        valueSuffix: metrics.avgDelayHours.hours != null ? t("dashboard.hoursUnit") : undefined,
        series: [],
        href: "/monitoring",
      };

    case "topAssetByOrders": {
      const { assetId, assetKey, assetName, count } = metrics.topAssetByOrders;
      const label =
        assetKey && assetName ? `${assetKey} – ${assetName}` : assetKey ?? assetName ?? null;
      return {
        title,
        icon: def.icon,
        accent: def.accent,
        display: "value",
        value: label ?? t("dashboard.noTopAsset"),
        detail: count > 0 ? t("dashboard.topAssetOrderCount", { count }) : undefined,
        series: [],
        href: assetId ? workOrdersAssetHref(assetId) : undefined,
      };
    }

    case "transactionsLast24h":
      return {
        title,
        icon: def.icon,
        accent: def.accent,
        display: "chart",
        value: metrics.transactionsLast24h.total,
        series: demoSparkSeries(metrics.transactionsLast24h.total, 1),
        href: "/transactions",
      };

    case "transactionsLastMonth":
      return {
        title,
        icon: def.icon,
        accent: def.accent,
        display: "value",
        value: metrics.transactionsLastMonth.total,
        series: [],
        href: "/transactions",
      };

    default: {
      const _exhaustive: never = kpiId;
      return _exhaustive;
    }
  }
}
