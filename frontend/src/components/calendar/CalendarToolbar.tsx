import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  periodTitle: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
};

export function CalendarToolbar({ periodTitle, onPrev, onNext, onToday }: Props) {
  const { t } = useTranslation();

  return (
    <div className="app-calendar-toolbar flex items-center gap-2">
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="app-header-action-nav-item app-header-action-nav-item--icon"
          aria-label={t("kalendar.prev")}
          title={t("kalendar.prev")}
          onClick={onPrev}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
        <button type="button" className="app-header-action-nav-item" onClick={onToday}>
          {t("kalendar.today")}
        </button>
        <button
          type="button"
          className="app-header-action-nav-item app-header-action-nav-item--icon"
          aria-label={t("kalendar.next")}
          title={t("kalendar.next")}
          onClick={onNext}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <span
        className="app-calendar-toolbar-title max-w-[12rem] truncate font-medium text-on-surface"
        title={periodTitle}
      >
        {periodTitle}
      </span>
    </div>
  );
}
