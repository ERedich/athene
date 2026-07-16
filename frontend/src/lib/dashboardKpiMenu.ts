import type { TFunction } from "i18next";
import type { MenuItem } from "primereact/menuitem";

import {
  DASHBOARD_KPI_CATEGORIES,
  DASHBOARD_KPI_DEFINITIONS,
  isDashboardKpiId,
  type DashboardKpiCategory,
  type DashboardKpiId,
} from "./dashboardKpiRegistry";
import { customKpiSlotId, type CustomKpi } from "./kpiBuilderApi";
import type { DashboardSlotId } from "../hooks/useDashboardLayout";

const CATEGORY_TITLE_KEYS: Record<DashboardKpiCategory, string> = {
  athene: "dashboard.kpiCategory.athene",
  transactions: "dashboard.kpiCategory.transactions",
  workOrders: "dashboard.kpiCategory.workOrders",
  feedback: "dashboard.kpiCategory.feedback",
  warehouse: "dashboard.kpiCategory.warehouse",
};

function systemKpiMenuItem(
  kpiId: DashboardKpiId,
  activeKpiId: DashboardSlotId,
  onSelectKpi: (kpiId: DashboardSlotId) => void,
  t: TFunction,
): MenuItem {
  const def = DASHBOARD_KPI_DEFINITIONS.find((d) => d.id === kpiId);
  if (!def) throw new Error(`Unknown dashboard KPI: ${kpiId}`);
  return {
    label: t(def.titleKey),
    disabled: kpiId === activeKpiId,
    command: () => {
      if (kpiId !== activeKpiId) onSelectKpi(kpiId);
    },
  };
}

/** PanelMenu / TieredMenu model grouped by dashboard KPI category + custom KPIs. */
export function buildDashboardKpiMenuModel(
  activeKpiId: DashboardSlotId,
  onSelectKpi: (kpiId: DashboardSlotId) => void,
  t: TFunction,
  customKpis: CustomKpi[] = [],
): MenuItem[] {
  const systemGroups = DASHBOARD_KPI_CATEGORIES.map((category) => {
    const kpis = DASHBOARD_KPI_DEFINITIONS.filter((d) => d.category === category);
    const items: MenuItem[] =
      kpis.length > 0
        ? kpis.map((def) => systemKpiMenuItem(def.id, activeKpiId, onSelectKpi, t))
        : [
            {
              label: t("dashboard.kpiCategoryEmpty"),
              disabled: true,
            },
          ];

    return {
      label: t(CATEGORY_TITLE_KEYS[category]),
      items,
    };
  });

  const customItems: MenuItem[] =
    customKpis.length > 0
      ? customKpis.map((kpi) => {
          const slotId = customKpiSlotId(kpi.id) as DashboardSlotId;
          return {
            label: kpi.name,
            disabled: slotId === activeKpiId,
            command: () => {
              if (slotId !== activeKpiId) onSelectKpi(slotId);
            },
          };
        })
      : [
          {
            label: t("dashboard.kpiCategoryEmpty"),
            disabled: true,
          },
        ];

  return [
    ...systemGroups,
    {
      label: t("dashboard.kpiCategory.custom"),
      items: customItems,
    },
  ];
}

export function isSystemDashboardKpiId(id: DashboardSlotId): id is DashboardKpiId {
  return isDashboardKpiId(id);
}
