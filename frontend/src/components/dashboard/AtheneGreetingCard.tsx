import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical, Settings } from "lucide-react";
import { OverlayPanel } from "primereact/overlaypanel";
import { PanelMenu } from "primereact/panelmenu";

import { useAuth } from "../../auth/AuthContext";
import { useAtheneBriefing } from "../../hooks/useAtheneBriefing";
import type { DashboardSlotId } from "../../hooks/useDashboardLayout";
import { buildDashboardKpiMenuModel } from "../../lib/dashboardKpiMenu";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import { lucidePrimeBtnIcon } from "../../icons/lucide";
import type { CustomKpi } from "../../lib/kpiBuilderApi";

export type PeriodOfDay = "morning" | "afternoon" | "evening";

export function resolvePeriodOfDay(date: Date = new Date()): PeriodOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

const PERIOD_IMAGE: Record<PeriodOfDay, string> = {
  morning: "/dashboard/greeting/morning.jpg",
  afternoon: "/dashboard/greeting/afternoon.jpg",
  evening: "/dashboard/greeting/night.jpg",
};

/** Stats footer contrast against full-bleed period image. */
const PERIOD_IMAGE_TONE: Record<PeriodOfDay, "light" | "dark"> = {
  morning: "light",
  afternoon: "light",
  evening: "dark",
};

const PERIOD_GREETING_KEY: Record<PeriodOfDay, string> = {
  morning: "dashboard.greetingMorning",
  afternoon: "dashboard.greetingAfternoon",
  evening: "dashboard.greetingEvening",
};

type Props = {
  slotIndex: number;
  kpiId: DashboardSlotId;
  customCatalog: CustomKpi[];
  onSelectKpi: (kpiId: DashboardSlotId) => void;
  onArm: () => void;
};

export function AtheneGreetingCard({
  slotIndex,
  kpiId,
  customCatalog,
  onSelectKpi,
  onArm,
}: Props) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const panelRef = useRef<OverlayPanel>(null);
  const period = useMemo(() => resolvePeriodOfDay(), []);
  const { data, loading, error, refetch } = useAtheneBriefing(true, i18n.language);

  const greeting = t(PERIOD_GREETING_KEY[period], { name: user.name });

  const menuModel = useMemo(
    () =>
      buildDashboardKpiMenuModel(
        kpiId,
        (id) => {
          onSelectKpi(id);
          panelRef.current?.hide();
        },
        t,
        customCatalog,
      ),
    [kpiId, onSelectKpi, t, customCatalog],
  );

  return (
    <article
      className="app-dashboard-greeting-card"
      data-image-tone={PERIOD_IMAGE_TONE[period]}
      style={{ ["--greeting-bg-image" as string]: `url(${PERIOD_IMAGE[period]})` }}
    >
      <div className="app-dashboard-greeting-card__bg" aria-hidden />
      <div className="app-dashboard-greeting-card__gradient" aria-hidden />

      <header className="app-dashboard-greeting-card__header">
        <div className="app-dashboard-greeting-card__header-left" />
        <div className="app-dashboard-greeting-card__header-right">
          <button
            type="button"
            className="app-dashboard-kpi-drag-handle"
            aria-label={t("dashboard.dragKpiAria", { slot: slotIndex + 1 })}
            onPointerDown={onArm}
          >
            <GripVertical className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
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
        </div>
      </header>

      <div className="app-dashboard-greeting-card__body">
        <h2 className="app-dashboard-greeting-card__title">{greeting}</h2>

        {loading ? (
          <div className="app-dashboard-greeting-card__skeleton" aria-busy="true" aria-live="polite">
            <div className="app-dashboard-greeting-card__skeleton-line" />
            <div className="app-dashboard-greeting-card__skeleton-line app-dashboard-greeting-card__skeleton-line--short" />
            <div className="app-dashboard-greeting-card__skeleton-line" />
            <div className="app-dashboard-greeting-card__skeleton-line app-dashboard-greeting-card__skeleton-line--short" />
          </div>
        ) : error ? (
          <div className="app-dashboard-greeting-card__error">
            <p>{t("dashboard.greetingBriefingError")}</p>
            <button type="button" className="app-dashboard-greeting-card__retry" onClick={() => void refetch()}>
              {t("dashboard.retry")}
            </button>
          </div>
        ) : (
          <div className="app-dashboard-greeting-card__sections">
            <section className="app-dashboard-greeting-card__section">
              <h3 className="app-dashboard-greeting-card__section-title">{t("dashboard.greetingNews")}</h3>
              <p className="app-dashboard-greeting-card__summary">{data?.news}</p>
            </section>
            <section className="app-dashboard-greeting-card__section">
              <h3 className="app-dashboard-greeting-card__section-title">{t("dashboard.greetingLookback")}</h3>
              <p className="app-dashboard-greeting-card__summary">{data?.lookback}</p>
            </section>
            <section className="app-dashboard-greeting-card__section">
              <h3 className="app-dashboard-greeting-card__section-title">{t("dashboard.greetingOutlook")}</h3>
              <p className="app-dashboard-greeting-card__summary">{data?.outlook}</p>
            </section>
          </div>
        )}

        {data && !loading && !error ? (
          <dl className="app-dashboard-greeting-card__stats">
            <div>
              <dt>{t("dashboard.greetingStatCreated")}</dt>
              <dd>{data.counts.created24h}</dd>
            </div>
            <div>
              <dt>{t("dashboard.greetingStatCompleted")}</dt>
              <dd>{data.counts.completed24h}</dd>
            </div>
            <div>
              <dt>{t("dashboard.greetingStatBookings")}</dt>
              <dd>{data.counts.bookings24h}</dd>
            </div>
            <div>
              <dt>{t("dashboard.greetingStatMaintenance")}</dt>
              <dd>{data.counts.maintenanceNext48h}</dd>
            </div>
          </dl>
        ) : null}
      </div>
    </article>
  );
}
