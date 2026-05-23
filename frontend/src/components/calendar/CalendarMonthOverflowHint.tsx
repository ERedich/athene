import { Ellipsis } from "lucide-react";
import { useTranslation } from "react-i18next";

import { laneTopPx } from "../../lib/calendar/calendarEventLayout";
import { CALENDAR_MONTH_OVERFLOW_LANE_INDEX } from "../../lib/calendar/calendarTypes";

type Props = {
  overflowCount: number;
  onClick: () => void;
};

export function CalendarMonthOverflowHint({ overflowCount, onClick }: Props) {
  const { t } = useTranslation();
  const label = t("kalendar.moreOrdersShort", { count: overflowCount });
  const title = t("kalendar.moreOrdersClick", { count: overflowCount });

  return (
    <button
      type="button"
      className="app-calendar-overflow-hint"
      style={{ top: laneTopPx(CALENDAR_MONTH_OVERFLOW_LANE_INDEX) }}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      <Ellipsis className="app-calendar-overflow-hint__icon" aria-hidden />
      <span className="app-calendar-overflow-hint__count">{label}</span>
    </button>
  );
}
