import type { TFunction } from "i18next";
import type { MenuItem } from "primereact/menuitem";

import {
  DASHBOARD_KPI_CATEGORIES,
  DASHBOARD_KPI_DEFINITIONS,
  type DashboardKpiCategory,
  type DashboardKpiId,
} from "./dashboardKpiRegistry";

const CATEGORY_TITLE_KEYS: Record<DashboardKpiCategory, string> = {
  transactions: "dashboard.kpiCategory.transactions",
  workOrders: "dashboard.kpiCategory.workOrders",
  feedback: "dashboard.kpiCategory.feedback",
  warehouse: "dashboard.kpiCategory.warehouse",
};

function kpiMenuItem(
  kpiId: DashboardKpiId,
  activeKpiId: DashboardKpiId,
  onSelectKpi: (kpiId: DashboardKpiId) => void,
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

/** PanelMenu / TieredMenu model grouped by dashboard KPI category. */
export function buildDashboardKpiMenuModel(
  activeKpiId: DashboardKpiId,
  onSelectKpi: (kpiId: DashboardKpiId) => void,
  t: TFunction,
): MenuItem[] {
  return DASHBOARD_KPI_CATEGORIES.map((category) => {
    const kpis = DASHBOARD_KPI_DEFINITIONS.filter((d) => d.category === category);
    const items: MenuItem[] =
      kpis.length > 0
        ? kpis.map((def) => kpiMenuItem(def.id, activeKpiId, onSelectKpi, t))
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
}
