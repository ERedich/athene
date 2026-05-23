import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";

import { lucidePrimeBtnIcon } from "../../icons/lucide";
import type { CalendarViewMode } from "../../lib/calendar/calendarTypes";

type Props = {
  periodTitle: string;
  viewMode: CalendarViewMode;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewModeChange: (mode: CalendarViewMode) => void;
};

export function CalendarToolbar({
  periodTitle,
  viewMode,
  onPrev,
  onNext,
  onToday,
  onViewModeChange,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="app-calendar-toolbar flex min-w-0 flex-1 items-center gap-2">
      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          size="small"
          outlined={viewMode !== "month"}
          label={t("kalendar.viewMonth")}
          onClick={() => onViewModeChange("month")}
        />
        <Button
          type="button"
          size="small"
          outlined={viewMode !== "week"}
          label={t("kalendar.viewWeek")}
          onClick={() => onViewModeChange("week")}
        />
        <Button
          type="button"
          size="small"
          outlined={viewMode !== "day"}
          label={t("kalendar.viewDay")}
          onClick={() => onViewModeChange("day")}
        />
      </div>

      <span className="app-calendar-toolbar-divider" aria-hidden />

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          text
          rounded
          severity="secondary"
          className="h-9 w-9 shrink-0"
          icon={<ChevronLeft className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />}
          aria-label={t("kalendar.prev")}
          title={t("kalendar.prev")}
          onClick={onPrev}
        />
        <Button
          type="button"
          text
          rounded
          severity="secondary"
          className="h-9 w-9 shrink-0"
          icon={<ChevronRight className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />}
          aria-label={t("kalendar.next")}
          title={t("kalendar.next")}
          onClick={onNext}
        />
        <Button
          type="button"
          outlined
          severity="secondary"
          size="small"
          label={t("kalendar.today")}
          onClick={onToday}
        />
      </div>

      <span className="min-w-0 truncate px-1 text-sm font-medium text-on-surface" title={periodTitle}>
        {periodTitle}
      </span>
    </div>
  );
}
