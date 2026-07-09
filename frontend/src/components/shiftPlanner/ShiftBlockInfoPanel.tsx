import { useTranslation } from "react-i18next";

import type { ShiftBlockKpis } from "../../lib/shiftPlanner/shiftPlannerApi";

type Props = {
  loading: boolean;
  error: boolean;
  kpis: ShiftBlockKpis | null;
};

function formatDurationHours(minutes: number | null, language: string): string {
  if (minutes == null) return "—";
  return `${(minutes / 60).toLocaleString(language, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} h`;
}

function WorkgroupList({
  workgroups,
  countKey,
}: {
  workgroups: ShiftBlockKpis["requestedWorkgroups"];
  countKey: "orderCount" | "employeeCount";
}) {
  const { t } = useTranslation();

  if (workgroups.length === 0) {
    return <p className="app-shift-planner-info-modal__empty">{t("schichtplaner.shiftInfoNoWorkgroups")}</p>;
  }

  return (
    <ul className="app-shift-planner-info-modal__workgroups">
      {workgroups.map((wg) => (
        <li key={wg.id} className="app-shift-planner-info-modal__workgroup">
          <span className="app-shift-planner-info-modal__workgroup-key">{wg.key}</span>
          <span className="app-shift-planner-info-modal__workgroup-name">{wg.name}</span>
          <span className="app-shift-planner-info-modal__workgroup-count">
            {countKey === "orderCount"
              ? t("schichtplaner.shiftInfoOrderCount", { count: wg.orderCount ?? 0 })
              : t("schichtplaner.shiftInfoEmployeeCount", { count: wg.employeeCount ?? 0 })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ShiftBlockInfoPanel({ loading, error, kpis }: Props) {
  const { t, i18n } = useTranslation();

  if (loading) {
    return <p className="app-shift-planner-info-modal__status">{t("schichtplaner.shiftInfoLoading")}</p>;
  }

  if (error) {
    return (
      <p className="app-shift-planner-info-modal__status app-shift-planner-info-modal__status--error">
        {t("schichtplaner.shiftInfoLoadError")}
      </p>
    );
  }

  if (!kpis) return null;

  return (
    <div className="app-shift-planner-info-modal__grid">
      <section className="app-shift-planner-info-modal__section">
        <h3 className="app-shift-planner-info-modal__section-title">
          {t("schichtplaner.shiftInfoOrders")}
        </h3>
        {kpis.workOrders.length === 0 ? (
          <p className="app-shift-planner-info-modal__empty">{t("schichtplaner.shiftInfoNoOrders")}</p>
        ) : (
          <ul className="app-shift-planner-info-modal__orders">
            {kpis.workOrders.map((order) => (
              <li key={order.id} className="app-shift-planner-info-modal__order">
                <span className="app-shift-planner-info-modal__order-label">
                  #{order.orderNumber} {order.name}
                </span>
                <span className="app-shift-planner-info-modal__order-duration">
                  {formatDurationHours(order.plannedDurationMinutes, i18n.language)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="app-shift-planner-info-modal__divider-v" aria-hidden />

      <section className="app-shift-planner-info-modal__section">
        <h3 className="app-shift-planner-info-modal__section-title">
          {t("schichtplaner.shiftInfoRequestedWorkgroups")}
        </h3>
        <WorkgroupList workgroups={kpis.requestedWorkgroups} countKey="orderCount" />
      </section>

      <div className="app-shift-planner-info-modal__divider-v" aria-hidden />

      <section className="app-shift-planner-info-modal__section">
        <h3 className="app-shift-planner-info-modal__section-title">
          {t("schichtplaner.shiftInfoAvailableWorkgroups")}
        </h3>
        <WorkgroupList workgroups={kpis.availableWorkgroups} countKey="employeeCount" />
        {kpis.employeesWithoutWorkgroupCount > 0 ? (
          <p className="app-shift-planner-info-modal__hint">
            {t("schichtplaner.shiftInfoEmployeesWithoutWorkgroup", {
              count: kpis.employeesWithoutWorkgroupCount,
            })}
          </p>
        ) : null}
      </section>
    </div>
  );
}
