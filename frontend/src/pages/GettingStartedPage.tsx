import { useMemo } from "react";
import { ArrowLeft, ArrowRight, Check, CircleDot, Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router-dom";

import { useGettingStartedCounts } from "../hooks/useGettingStartedCounts";
import {
  GETTING_STARTED_GUIDES,
  getGettingStartedGuide,
  gettingStartedGuideProgress,
  isGettingStartedGuideComplete,
  isGettingStartedStepComplete,
  type GettingStartedGuide,
} from "../lib/gettingStartedGuides";
import type { GettingStartedCounts } from "../lib/gettingStartedCounts";

function GuideHub({ counts }: { counts: GettingStartedCounts }) {
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
          const complete = isGettingStartedGuideComplete(guide, counts);
          const progress = gettingStartedGuideProgress(guide, counts);
          return (
            <Link
              key={guide.id}
              to={`/getting-started/${guide.id}`}
              role="listitem"
              className={[
                "app-getting-started-tile",
                "app-card-cascade",
                complete ? "app-getting-started-tile--complete" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ ["--app-cascade-index" as string]: index }}
            >
              <span className="app-getting-started-tile-top">
                <span className="app-getting-started-tile-icon" aria-hidden>
                  <Icon size={28} strokeWidth={1.75} />
                </span>
                {complete ? (
                  <span
                    className="app-getting-started-complete-badge"
                    title={t("gettingStarted.complete")}
                  >
                    <Check size={16} strokeWidth={2.5} aria-hidden />
                    <span>{t("gettingStarted.complete")}</span>
                  </span>
                ) : null}
              </span>
              <span className="app-getting-started-tile-title">
                {t(guide.titleKey)}
              </span>
              <span className="app-getting-started-tile-summary">
                {t(guide.summaryKey)}
              </span>
              <span className="app-getting-started-tile-progress">
                {complete
                  ? t("gettingStarted.completeHint")
                  : t("gettingStarted.progress", {
                      done: progress.done,
                      total: progress.total,
                    })}
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

function GuideDetail({
  guide,
  counts,
}: {
  guide: GettingStartedGuide;
  counts: GettingStartedCounts;
}) {
  const { t } = useTranslation();
  const { Icon } = guide;
  const complete = isGettingStartedGuideComplete(guide, counts);
  const progress = gettingStartedGuideProgress(guide, counts);

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

        <header
          className={[
            "app-getting-started-detail-header",
            complete ? "app-getting-started-detail-header--complete" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="app-getting-started-detail-icon" aria-hidden>
            {complete ? <Check size={32} strokeWidth={2.25} /> : <Icon size={32} strokeWidth={1.75} />}
          </span>
          <div className="app-getting-started-detail-titles">
            <p className="app-getting-started-kicker">{t("gettingStarted.kicker")}</p>
            <div className="app-getting-started-detail-title-row">
              <h2 className="app-getting-started-heading">{t(guide.titleKey)}</h2>
              {complete ? (
                <span className="app-getting-started-complete-badge">
                  <Check size={16} strokeWidth={2.5} aria-hidden />
                  <span>{t("gettingStarted.complete")}</span>
                </span>
              ) : null}
            </div>
            <p className="app-getting-started-lead">{t(guide.introKey)}</p>
            <p className="app-getting-started-meta">
              {complete
                ? t("gettingStarted.completeHint")
                : t("gettingStarted.progress", {
                    done: progress.done,
                    total: progress.total,
                  })}
              {" · "}
              {t("gettingStarted.requiredCount", {
                required: requiredCount,
                total: guide.steps.length,
              })}
            </p>
          </div>
        </header>

        <ol className="app-getting-started-steps">
          {guide.steps.map((step, index) => {
            const stepComplete = isGettingStartedStepComplete(step, counts);
            return (
              <li
                key={step.id}
                className={[
                  "app-getting-started-step",
                  "app-card-cascade",
                  stepComplete ? "app-getting-started-step--complete" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ ["--app-cascade-index" as string]: index }}
              >
                <div
                  className={[
                    "app-getting-started-step-index",
                    stepComplete ? "app-getting-started-step-index--complete" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden
                >
                  {stepComplete ? <Check size={16} strokeWidth={2.5} /> : index + 1}
                </div>
                <div className="app-getting-started-step-body">
                  <div className="app-getting-started-step-topline">
                    <h3 className="app-getting-started-step-title">
                      {t(step.titleKey)}
                    </h3>
                    {stepComplete ? (
                      <span className="app-getting-started-badge app-getting-started-badge--complete">
                        {t("gettingStarted.complete")}
                      </span>
                    ) : (
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
                    )}
                  </div>
                  <p className="app-getting-started-step-text">{t(step.bodyKey)}</p>
                  {step.links && step.links.length > 0 ? (
                    <StepLinks links={step.links} />
                  ) : null}
                </div>
              </li>
            );
          })}
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
  const { counts } = useGettingStartedCounts();

  if (!guideId) {
    return <GuideHub counts={counts} />;
  }

  const guide = getGettingStartedGuide(guideId);
  if (!guide) {
    return <Navigate to="/getting-started" replace />;
  }

  return <GuideDetail guide={guide} counts={counts} />;
}
