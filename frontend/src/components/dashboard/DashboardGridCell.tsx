import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { OverlayPanel } from "primereact/overlaypanel";
import { PanelMenu } from "primereact/panelmenu";

import type { DashboardMetrics } from "../../hooks/useDashboardMetrics";
import { buildDashboardKpiMenuModel } from "../../lib/dashboardKpiMenu";
import { resolveKpiView, type DashboardKpiId } from "../../lib/dashboardKpiRegistry";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import { lucidePrimeBtnIcon } from "../../icons/lucide";
import { DashboardSparkCard } from "./DashboardSparkCard";

type Props = {
  slotIndex: number;
  kpiId: DashboardKpiId;
  metrics: DashboardMetrics | null;
  loading: boolean;
  locale: string;
  onSelectKpi: (kpiId: DashboardKpiId) => void;
};

export function DashboardGridCell({
  slotIndex,
  kpiId,
  metrics,
  loading,
  locale,
  onSelectKpi,
}: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<OverlayPanel>(null);

  const view = useMemo(
    () => resolveKpiView(kpiId, metrics, locale, t),
    [kpiId, metrics, locale, t],
  );

  const selectKpi = useCallback(
    (id: DashboardKpiId) => {
      onSelectKpi(id);
      panelRef.current?.hide();
    },
    [onSelectKpi],
  );

  const menuModel = useMemo(
    () => buildDashboardKpiMenuModel(kpiId, selectKpi, t),
    [kpiId, selectKpi, t],
  );

  const configureButton = (
    <>
      <button
        type="button"
        className="app-dashboard-kpi-config-btn"
        aria-label={t("dashboard.configureKpiAria", { slot: slotIndex + 1 })}
        title={t("dashboard.configureKpi")}
        onClick={(e) => panelRef.current?.toggle(e)}
      >
        <Settings className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
      </button>
      <OverlayPanel
        ref={panelRef}
        appendTo={overlayAppendTo}
        className="app-dashboard-kpi-big-menu"
      >
        <PanelMenu model={menuModel} multiple className="app-dashboard-kpi-panel-menu" />
      </OverlayPanel>
    </>
  );

  return (
    <DashboardSparkCard
      icon={view.icon}
      title={view.title}
      display={view.display}
      value={loading ? null : view.value}
      valueSuffix={view.valueSuffix}
      detail={loading ? undefined : view.detail}
      locale={locale}
      href={view.href}
      series={view.series}
      chart={view.chart}
      loading={loading}
      accent={view.accent}
      footer={loading ? null : view.footer}
      headerActions={configureButton}
    />
  );
}
