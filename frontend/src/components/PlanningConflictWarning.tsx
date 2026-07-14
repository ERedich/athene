import { useTranslation } from "react-i18next";

import type { WorkOrderPlanningConflict } from "../lib/workOrderApi";

type Props = {
  assetKey: string;
  assetName: string;
  conflicts: WorkOrderPlanningConflict[];
  sameDayConflict: boolean;
};

export function PlanningConflictWarning({
  assetKey,
  assetName,
  conflicts,
  sameDayConflict,
}: Props) {
  const { t } = useTranslation();

  if (conflicts.length === 0) return null;

  return (
    <div className="app-planning-conflict-warning rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-on-surface">
      <p className="m-0">
        {sameDayConflict
          ? t("kalendar.moveAssetConflictSameDay", { assetKey, assetName })
          : t("kalendar.moveAssetConflictOverlap", { assetKey, assetName })}
      </p>
      <ul className="mb-0 mt-2 list-inside list-disc text-xs text-on-surface-variant">
        {conflicts.map((c) => (
          <li key={c.id}>
            #{c.orderNumber} {c.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
