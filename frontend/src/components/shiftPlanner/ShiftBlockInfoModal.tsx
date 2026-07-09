import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "primereact/dialog";

import { formatShiftTimeRange } from "../../lib/shiftPlanner/shiftCalendarExpand";
import type { ShiftCalendarBlock } from "../../lib/shiftPlanner/shiftCalendarTypes";
import {
  fetchShiftBlockKpis,
  type ShiftBlockKpis,
} from "../../lib/shiftPlanner/shiftPlannerApi";
import { ShiftBlockInfoPanel } from "./ShiftBlockInfoPanel";

type Props = {
  block: ShiftCalendarBlock | null;
  onHide: () => void;
};

function formatDurationHours(minutes: number | null, language: string): string {
  if (minutes == null) return "—";
  return `${(minutes / 60).toLocaleString(language, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} h`;
}

export function ShiftBlockInfoModal({ block, onHide }: Props) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [kpis, setKpis] = useState<ShiftBlockKpis | null>(null);

  const timeLabel = block ? formatShiftTimeRange(block.startTime, block.endTime) : "";
  const dateLabel = useMemo(() => {
    if (!block) return "";
    return new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(`${block.date}T12:00:00`));
  }, [block, i18n.language]);

  useEffect(() => {
    if (!block) {
      setLoading(false);
      setError(false);
      setKpis(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setKpis(null);

    void fetchShiftBlockKpis(block)
      .then((data) => {
        if (!cancelled) setKpis(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [block]);

  const header = block ? (
    <div className="app-shift-planner-info-modal__header">
      <div className="min-w-0">
        <div className="text-base font-medium">{t("schichtplaner.shiftInfoTitle")}</div>
        <p className="mt-1 text-sm text-on-surface-variant">
          {t("schichtplaner.assignedEmployeesSubtitle", {
            shift: block.shiftName,
            time: timeLabel,
            date: dateLabel,
          })}
        </p>
      </div>
      {!loading && !error && kpis ? (
        <div className="app-shift-planner-info-modal__duration">
          <span className="app-shift-planner-info-modal__duration-label">
            {t("schichtplaner.shiftInfoTotalDuration")}
          </span>
          <span className="app-shift-planner-info-modal__duration-value">
            {formatDurationHours(kpis.totalPlannedDurationMinutes, i18n.language)}
          </span>
        </div>
      ) : null}
    </div>
  ) : undefined;

  return (
    <Dialog
      visible={block !== null}
      onHide={onHide}
      className="app-shift-planner-info-modal"
      header={header}
      modal
      dismissableMask
      draggable={false}
      resizable={false}
      aria-label={t("schichtplaner.shiftInfoTitle")}
    >
      {block ? (
        <ShiftBlockInfoPanel loading={loading} error={error} kpis={kpis} />
      ) : null}
    </Dialog>
  );
}
