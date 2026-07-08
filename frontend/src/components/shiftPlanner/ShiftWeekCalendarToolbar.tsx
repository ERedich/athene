import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";

import { lucidePrimeBtnIcon } from "../../icons/lucide";

type Props = {
  periodTitle: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
};

export function ShiftWeekCalendarToolbar({ periodTitle, onPrev, onNext, onToday }: Props) {
  const { t } = useTranslation();

  return (
    <div className="app-shift-planner-toolbar flex min-w-0 flex-wrap items-center gap-2">
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          text
          rounded
          severity="secondary"
          icon={<ChevronLeft className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
          aria-label={t("schichtplaner.prevWeek")}
          onClick={onPrev}
        />
        <Button
          type="button"
          size="small"
          outlined
          label={t("schichtplaner.today")}
          onClick={onToday}
        />
        <Button
          type="button"
          text
          rounded
          severity="secondary"
          icon={<ChevronRight className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
          aria-label={t("schichtplaner.nextWeek")}
          onClick={onNext}
        />
      </div>
      <span className="app-shift-planner-toolbar-title min-w-0 truncate font-medium text-on-surface">
        {periodTitle}
      </span>
    </div>
  );
}
