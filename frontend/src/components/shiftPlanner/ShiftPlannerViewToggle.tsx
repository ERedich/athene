import { useTranslation } from "react-i18next";

import type { ShiftPlannerViewMode } from "../../lib/shiftPlanner/shiftPlannerViewMode";

type Props = {
  viewMode: ShiftPlannerViewMode;
  onViewModeChange: (mode: ShiftPlannerViewMode) => void;
};

export function ShiftPlannerViewToggle({ viewMode, onViewModeChange }: Props) {
  const { t } = useTranslation();

  return (
    <>
      <li>
        <button
          type="button"
          className={`app-header-action-nav-item${viewMode === "simple" ? " app-header-action-nav-item--active" : ""}`}
          aria-pressed={viewMode === "simple"}
          onClick={() => onViewModeChange("simple")}
        >
          {t("schichtplaner.viewSimple")}
        </button>
      </li>
      <li>
        <button
          type="button"
          className={`app-header-action-nav-item${viewMode === "complex" ? " app-header-action-nav-item--active" : ""}`}
          aria-pressed={viewMode === "complex"}
          onClick={() => onViewModeChange("complex")}
        >
          {t("schichtplaner.viewComplex")}
        </button>
      </li>
    </>
  );
}
