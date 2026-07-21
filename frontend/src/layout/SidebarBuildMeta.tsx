import { useTranslation } from "react-i18next";

type Props = {
  collapsed: boolean;
};

export function SidebarBuildMeta({ collapsed }: Props) {
  const { i18n, t } = useTranslation();
  const unavailable = t("shell.buildMeta.unavailable");

  const appVersion =
    __APP_VERSION__ && __APP_VERSION__ !== "unavailable" ? __APP_VERSION__ : unavailable;
  const recentCommit =
    __GIT_COMMIT_HASH__ && __GIT_COMMIT_HASH__ !== "unavailable"
      ? __GIT_COMMIT_HASH__
      : unavailable;
  const currentBranch =
    __GIT_BRANCH__ && __GIT_BRANCH__ !== "unavailable" ? __GIT_BRANCH__ : unavailable;

  const commitTimestamp = (() => {
    if (!__GIT_COMMIT_TIMESTAMP__ || __GIT_COMMIT_TIMESTAMP__ === "unavailable") {
      return unavailable;
    }
    const parsed = new Date(__GIT_COMMIT_TIMESTAMP__);
    if (Number.isNaN(parsed.getTime())) return __GIT_COMMIT_TIMESTAMP__;
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  })();

  const tooltip = t("shell.buildMeta.tooltip", {
    version: appVersion,
    commit: recentCommit,
    branch: currentBranch,
    timestamp: commitTimestamp,
  });

  const compactLine = `v${appVersion} · ${recentCommit} · ${currentBranch}`;

  return (
    <div
      className={`app-sidebar-build-meta shrink-0 border-t border-white/5 ${
        collapsed ? "px-2 py-2" : "px-3 py-2"
      }`}
      title={tooltip}
      aria-label={tooltip}
    >
      <p
        className={`font-mono text-on-surface-variant truncate ${
          collapsed ? "text-center text-[9px] leading-tight" : "text-[10px] leading-snug"
        }`}
      >
        {collapsed ? `v${appVersion}` : compactLine}
      </p>
      {!collapsed ? (
        <p className="font-mono text-[10px] leading-snug text-on-surface-variant/80 truncate">
          {commitTimestamp}
        </p>
      ) : null}
    </div>
  );
}
