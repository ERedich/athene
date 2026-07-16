import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical, Settings } from "lucide-react";
import { OverlayPanel } from "primereact/overlaypanel";
import { PanelMenu } from "primereact/panelmenu";

import type { DashboardMetrics } from "../../hooks/useDashboardMetrics";
import type { DashboardSlotId } from "../../hooks/useDashboardLayout";
import { buildDashboardKpiMenuModel, isSystemDashboardKpiId } from "../../lib/dashboardKpiMenu";
import { resolveKpiView } from "../../lib/dashboardKpiRegistry";
import { resolveCustomKpiView, type DashboardKpiChart } from "../../lib/customDashboardKpiView";
import { parseCustomKpiSlotId, type CustomKpi, type KpiEvaluateEntry } from "../../lib/kpiBuilderApi";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import { lucidePrimeBtnIcon } from "../../icons/lucide";
import { DashboardSparkCard } from "./DashboardSparkCard";
import { AtheneGreetingCard } from "./AtheneGreetingCard";

type Props = {
  slotIndex: number;
  kpiId: DashboardSlotId;
  metrics: DashboardMetrics | null;
  loading: boolean;
  locale: string;
  customCatalog: CustomKpi[];
  customEvaluations: Record<string, KpiEvaluateEntry>;
  customLoading: boolean;
  onSelectKpi: (kpiId: DashboardSlotId) => void;
  onArm: () => void;
};

export function DashboardGridCell({
  slotIndex,
  kpiId,
  metrics,
  loading,
  locale,
  customCatalog,
  customEvaluations,
  customLoading,
  onSelectKpi,
  onArm,
}: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<OverlayPanel>(null);
  const isGreeting = kpiId === "atheneGreeting";

  const customUuid = parseCustomKpiSlotId(kpiId);

  const view = useMemo(() => {
    if (isGreeting) {
      return null;
    }
    if (customUuid) {
      return resolveCustomKpiView(customEvaluations[customUuid], t);
    }
    if (isSystemDashboardKpiId(kpiId)) {
      return resolveKpiView(kpiId, metrics, locale, t);
    }
    return resolveCustomKpiView(undefined, t);
  }, [isGreeting, customUuid, customEvaluations, kpiId, metrics, locale, t]);

  const selectKpi = useCallback(
    (id: DashboardSlotId) => {
      onSelectKpi(id);
      panelRef.current?.hide();
    },
    [onSelectKpi],
  );

  const menuModel = useMemo(
    () => buildDashboardKpiMenuModel(kpiId, selectKpi, t, customCatalog),
    [kpiId, selectKpi, t, customCatalog],
  );

  if (isGreeting) {
    return (
      <AtheneGreetingCard
        slotIndex={slotIndex}
        kpiId={kpiId}
        customCatalog={customCatalog}
        onSelectKpi={onSelectKpi}
        onArm={onArm}
      />
    );
  }

  if (!view) return null;

  const cellLoading = customUuid ? customLoading || loading : loading;

  const dragHandle = (
    <button
      type="button"
      className="app-dashboard-kpi-drag-handle"
      aria-label={t("dashboard.dragKpiAria", { slot: slotIndex + 1 })}
      onPointerDown={onArm}
    >
      <GripVertical className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </button>
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
      dragHandle={dragHandle}
      title={view.title}
      display={view.display}
      value={cellLoading ? null : view.value}
      valueSuffix={view.valueSuffix}
      detail={cellLoading ? undefined : view.detail}
      locale={locale}
      href={view.href}
      series={view.series}
      chart={view.chart as DashboardKpiChart | undefined}
      chartAnimationKey={kpiId}
      loading={cellLoading}
      accent={view.accent}
      sparklineOptions={"sparklineOptions" in view ? view.sparklineOptions : undefined}
      footer={cellLoading ? null : view.footer}
      headerActions={configureButton}
    />
  );
}
