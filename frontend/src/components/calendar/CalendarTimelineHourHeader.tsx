import { useTranslation } from "react-i18next";

const HOUR_MARKS = Array.from({ length: 25 }, (_, i) => i);

export function CalendarTimelineHourHeader() {
  const { t } = useTranslation();

  return (
    <div className="app-calendar-timeline-hours" role="row">
      {HOUR_MARKS.map((hour) => (
        <div
          key={hour}
          className="app-calendar-timeline-hour"
          role="columnheader"
          aria-label={t("kalendar.hourLabel", { hour })}
        >
          {hour}
        </div>
      ))}
    </div>
  );
}
