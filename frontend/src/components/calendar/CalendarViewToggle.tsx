import { useTranslation } from "react-i18next";

import type { CalendarViewMode } from "../../lib/calendar/calendarTypes";

type Props = {
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
};

export function CalendarViewToggle({ viewMode, onViewModeChange }: Props) {
  const { t } = useTranslation();

  return (
    <>
      <li>
        <button
          type="button"
          className={`app-header-action-nav-item${viewMode === "month" ? " app-header-action-nav-item--active" : ""}`}
          aria-pressed={viewMode === "month"}
          onClick={() => onViewModeChange("month")}
        >
          {t("kalendar.viewMonth")}
        </button>
      </li>
      <li>
        <button
          type="button"
          className={`app-header-action-nav-item${viewMode === "week" ? " app-header-action-nav-item--active" : ""}`}
          aria-pressed={viewMode === "week"}
          onClick={() => onViewModeChange("week")}
        >
          {t("kalendar.viewWeek")}
        </button>
      </li>
      <li>
        <button
          type="button"
          className={`app-header-action-nav-item${viewMode === "day" ? " app-header-action-nav-item--active" : ""}`}
          aria-pressed={viewMode === "day"}
          onClick={() => onViewModeChange("day")}
        >
          {t("kalendar.viewDay")}
        </button>
      </li>
    </>
  );
}
