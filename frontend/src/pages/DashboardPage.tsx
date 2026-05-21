import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Receipt,
  User,
  Wrench,
} from "lucide-react";
import { Button } from "primereact/button";

import { DashboardSparkCard } from "../components/dashboard/DashboardSparkCard";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { EMPLOYEE_PSEUDO_ME } from "../lib/workOrderApiFilters";
import {
  DEMO_SPARK_SERIES,
  demoSparkSeries,
  seriesFromByDay,
} from "../lib/dashboardSparkCharts";
import { workOrdersActiveStatusHref } from "../lib/dashboardCharts";

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data, loading, error, refetch } = useDashboardMetrics();

  const openSeries = useMemo(() => {
    if (!data) return demoSparkSeries(0);
    return demoSparkSeries(data.openActive.total);
  }, [data]);

  const completedSeries = useMemo(
    () => (data ? seriesFromByDay(data.completedLast7Days.byDay) : demoSparkSeries(0)),
    [data],
  );

  const mySeries = useMemo(() => {
    if (!data) return demoSparkSeries(0);
    return demoSparkSeries(data.myOrders.total);
  }, [data]);

  const txSeries = useMemo(
    () => (data ? seriesFromByDay(data.transactionsLast7Days.byDay) : demoSparkSeries(0)),
    [data],
  );

  const myOrdersHref = `/workorders?employeeId=${encodeURIComponent(EMPLOYEE_PSEUDO_ME)}`;

  if (error) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="app-dashboard-error rounded-lg bg-surface-container-low p-4 text-sm text-on-surface">
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
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="app-dashboard-spark-layout">
        <section className="app-dashboard-spark-section" aria-labelledby="dashboard-kpi-heading">
          <h2 id="dashboard-kpi-heading" className="app-dashboard-spark-section-title">
            {t("dashboard.sectionKpis")}
          </h2>
          <div className="app-dashboard-spark-row">
            <DashboardSparkCard
              icon={ClipboardList}
              title={t("dashboard.kpiOpenActive")}
              value={loading ? null : (data?.openActive.total ?? 0)}
              locale={i18n.language}
              href={workOrdersActiveStatusHref()}
              series={openSeries}
              loading={loading}
              accent="green"
            />
            <DashboardSparkCard
              icon={CheckCircle2}
              title={t("dashboard.kpiCompleted7d")}
              value={loading ? null : (data?.completedLast7Days.total ?? 0)}
              locale={i18n.language}
              href="/workorders"
              series={completedSeries}
              loading={loading}
              accent="teal"
            />
            <DashboardSparkCard
              icon={User}
              title={t("dashboard.kpiMyOrders")}
              value={loading ? null : (data?.myOrders.total ?? 0)}
              locale={i18n.language}
              href={myOrdersHref}
              series={mySeries}
              loading={loading}
              accent="blue"
              footer={
                !loading && data && !data.myOrders.employeeLinked ? (
                  <p className="text-xs text-on-surface-variant">{t("dashboard.noEmployee")}</p>
                ) : null
              }
            />
            <DashboardSparkCard
              icon={Receipt}
              title={t("dashboard.kpiTransactions7d")}
              value={loading ? null : (data?.transactionsLast7Days.total ?? 0)}
              locale={i18n.language}
              href="/transactions"
              series={txSeries}
              loading={loading}
              accent="green"
            />
          </div>
        </section>

        <section className="app-dashboard-spark-section" aria-labelledby="dashboard-trends-heading">
          <h2 id="dashboard-trends-heading" className="app-dashboard-spark-section-title">
            {t("dashboard.sectionTrends")}
          </h2>
          <div className="app-dashboard-spark-row">
            <DashboardSparkCard
              icon={Activity}
              title={t("dashboard.sparkMonitoring")}
              value={DEMO_SPARK_SERIES.monitoring[DEMO_SPARK_SERIES.monitoring.length - 1]}
              locale={i18n.language}
              href="/monitoring"
              series={[...DEMO_SPARK_SERIES.monitoring]}
              accent="blue"
            />
            <DashboardSparkCard
              icon={Clock}
              title={t("dashboard.sparkBookingHours")}
              value={DEMO_SPARK_SERIES.bookingHours[DEMO_SPARK_SERIES.bookingHours.length - 1]}
              valueSuffix={t("dashboard.sparkHoursUnit")}
              locale={i18n.language}
              href="/transactions"
              series={[...DEMO_SPARK_SERIES.bookingHours]}
              accent="amber"
            />
            <DashboardSparkCard
              icon={Wrench}
              title={t("dashboard.sparkAssignments")}
              value={DEMO_SPARK_SERIES.newAssignments[DEMO_SPARK_SERIES.newAssignments.length - 1]}
              locale={i18n.language}
              href="/workorders"
              series={[...DEMO_SPARK_SERIES.newAssignments]}
              accent="teal"
            />
            <DashboardSparkCard
              icon={AlertTriangle}
              title={t("dashboard.sparkBreakdown")}
              value={DEMO_SPARK_SERIES.breakdownOrders[DEMO_SPARK_SERIES.breakdownOrders.length - 1]}
              locale={i18n.language}
              href="/workorders"
              series={[...DEMO_SPARK_SERIES.breakdownOrders]}
              accent="amber"
            />
          </div>
          <p className="app-dashboard-spark-demo-hint">{t("dashboard.demoDataHint")}</p>
        </section>
      </div>
    </div>
  );
}
