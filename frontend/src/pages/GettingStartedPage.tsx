import { useMemo } from "react";
import { ArrowLeft, ArrowRight, CircleDot, Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router-dom";

import {
  GETTING_STARTED_GUIDES,
  getGettingStartedGuide,
  type GettingStartedGuide,
} from "../lib/gettingStartedGuides";

function GuideHub() {
  const { t } = useTranslation();

  return (
    <div className="app-getting-started-page min-h-0 flex-1 overflow-auto">
      <div className="app-getting-started-intro">
        <p className="app-getting-started-kicker">{t("gettingStarted.kicker")}</p>
        <h2 className="app-getting-started-heading">{t("gettingStarted.hubTitle")}</h2>
        <p className="app-getting-started-lead">{t("gettingStarted.hubLead")}</p>
      </div>

      <div className="app-getting-started-grid" role="list">
        {GETTING_STARTED_GUIDES.map((guide, index) => {
          const { Icon } = guide;
          return (
            <Link
              key={guide.id}
              to={`/getting-started/${guide.id}`}
              role="listitem"
              className="app-getting-started-tile app-card-cascade"
              style={{ ["--app-cascade-index" as string]: index }}
            >
              <span className="app-getting-started-tile-icon" aria-hidden>
                <Icon size={28} strokeWidth={1.75} />
              </span>
              <span className="app-getting-started-tile-title">
                {t(guide.titleKey)}
              </span>
              <span className="app-getting-started-tile-summary">
                {t(guide.summaryKey)}
              </span>
              <span className="app-getting-started-tile-cta">
                {t("gettingStarted.openGuide")}
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StepLinks({
  links,
}: {
  links: NonNullable<GettingStartedGuide["steps"][number]["links"]>;
}) {
  const { t } = useTranslation();

  return (
    <ul className="app-getting-started-step-links">
      {links.map((link) => (
        <li key={`${link.to}-${link.labelKey}`}>
          <Link to={link.to} className="app-getting-started-step-link">
            <Link2 size={14} strokeWidth={2} aria-hidden />
            <span>{t(link.labelKey)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GuideDetail({ guide }: { guide: GettingStartedGuide }) {
  const { t } = useTranslation();
  const { Icon } = guide;

  const requiredCount = useMemo(
    () => guide.steps.filter((step) => step.required).length,
    [guide.steps],
  );

  return (
    <div className="app-getting-started-page min-h-0 flex-1 overflow-auto">
      <div className="app-getting-started-detail">
        <Link to="/getting-started" className="app-getting-started-back">
          <ArrowLeft size={16} strokeWidth={2} aria-hidden />
          <span>{t("gettingStarted.backToHub")}</span>
        </Link>

        <header className="app-getting-started-detail-header">
          <span className="app-getting-started-detail-icon" aria-hidden>
            <Icon size={32} strokeWidth={1.75} />
          </span>
          <div className="app-getting-started-detail-titles">
            <p className="app-getting-started-kicker">{t("gettingStarted.kicker")}</p>
            <h2 className="app-getting-started-heading">{t(guide.titleKey)}</h2>
            <p className="app-getting-started-lead">{t(guide.introKey)}</p>
            <p className="app-getting-started-meta">
              {t("gettingStarted.requiredCount", {
                required: requiredCount,
                total: guide.steps.length,
              })}
            </p>
          </div>
        </header>

        <ol className="app-getting-started-steps">
          {guide.steps.map((step, index) => (
            <li key={step.id} className="app-getting-started-step app-card-cascade"
              style={{ ["--app-cascade-index" as string]: index }}
            >
              <div className="app-getting-started-step-index" aria-hidden>
                {index + 1}
              </div>
              <div className="app-getting-started-step-body">
                <div className="app-getting-started-step-topline">
                  <h3 className="app-getting-started-step-title">
                    {t(step.titleKey)}
                  </h3>
                  <span
                    className={
                      step.required
                        ? "app-getting-started-badge app-getting-started-badge--required"
                        : "app-getting-started-badge app-getting-started-badge--optional"
                    }
                  >
                    {step.required
                      ? t("gettingStarted.required")
                      : t("gettingStarted.optional")}
                  </span>
                </div>
                <p className="app-getting-started-step-text">{t(step.bodyKey)}</p>
                {step.links && step.links.length > 0 ? (
                  <StepLinks links={step.links} />
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <aside className="app-getting-started-tip" aria-label={t("gettingStarted.tipLabel")}>
          <CircleDot size={18} strokeWidth={2} aria-hidden />
          <div>
            <p className="app-getting-started-tip-label">{t("gettingStarted.tipLabel")}</p>
            <p className="app-getting-started-tip-text">{t(guide.tipKey)}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function GettingStartedPage() {
  const { guideId } = useParams<{ guideId?: string }>();

  if (!guideId) {
    return <GuideHub />;
  }

  const guide = getGettingStartedGuide(guideId);
  if (!guide) {
    return <Navigate to="/getting-started" replace />;
  }

  return <GuideDetail guide={guide} />;
}
