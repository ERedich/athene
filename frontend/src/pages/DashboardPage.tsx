import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";

import { DashboardGridCell } from "../components/dashboard/DashboardGridCell";
import { useDashboardLayout } from "../hooks/useDashboardLayout";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { DASHBOARD_SLOT_COUNT } from "../lib/dashboardKpiRegistry";

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data, loading, error, refetch } = useDashboardMetrics();
  const { layout, setSlotKpi } = useDashboardLayout();

  if (error) {
    return (
      <div className="app-dashboard-page app-dashboard-page--message min-h-0 flex-1 overflow-auto">
        <div className="app-dashboard-error m-4 rounded-lg bg-surface-container-low p-4 text-sm text-on-surface">
          <p>{t("dashboard.loadError")}</p>
          <Button
            type="button"
            label={t("dashboard.retry")}
            size="small"
            className="mt-3"
            onClick={() => void refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-dashboard-page min-h-0 flex-1 overflow-hidden">
      <div className="app-dashboard-grid" role="list">
        {Array.from({ length: DASHBOARD_SLOT_COUNT }, (_, slotIndex) => (
          <div key={slotIndex} className="app-dashboard-grid-cell" role="listitem">
            <DashboardGridCell
              slotIndex={slotIndex}
              kpiId={layout[slotIndex]}
              metrics={data}
              loading={loading}
              locale={i18n.language}
              onSelectKpi={(id) => setSlotKpi(slotIndex, id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
