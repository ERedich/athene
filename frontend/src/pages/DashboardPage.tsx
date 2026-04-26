import { useTranslation } from "react-i18next";

export function DashboardPage() {
  const { i18n, t } = useTranslation();
  const unavailableText = t("dashboard.metaUnavailable");
  const appVersion =
    __APP_VERSION__ && __APP_VERSION__ !== "unavailable"
      ? __APP_VERSION__
      : unavailableText;
  const recentCommit =
    __GIT_COMMIT_HASH__ && __GIT_COMMIT_HASH__ !== "unavailable"
      ? __GIT_COMMIT_HASH__
      : unavailableText;
  const commitTimestamp = (() => {
    if (!__GIT_COMMIT_TIMESTAMP__ || __GIT_COMMIT_TIMESTAMP__ === "unavailable") {
      return unavailableText;
    }

    const parsedTimestamp = new Date(__GIT_COMMIT_TIMESTAMP__);
    if (Number.isNaN(parsedTimestamp.getTime())) {
      return __GIT_COMMIT_TIMESTAMP__;
    }

    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsedTimestamp);
  })();

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <section className="max-w-xl rounded-lg border border-[color-mix(in_srgb,var(--color-on-surface)_16%,transparent)] bg-surface-container-low p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
          {t("dashboard.buildInfoTitle")}
        </h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-on-surface-variant">{t("dashboard.recentCommitLabel")}</dt>
            <dd className="font-mono text-on-surface">{recentCommit}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-on-surface-variant">{t("dashboard.versionLabel")}</dt>
            <dd className="font-mono text-on-surface">{appVersion}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-on-surface-variant">{t("dashboard.commitTimestampLabel")}</dt>
            <dd className="text-on-surface">{commitTimestamp}</dd>
          </div>
        </dl>
      </section>
      <p className="mt-4 max-w-md text-sm text-on-surface-variant">{t("dashboard.empty")}</p>
    </div>
  );
}
