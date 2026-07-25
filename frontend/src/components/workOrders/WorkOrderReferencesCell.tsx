import { memo, useCallback, type ReactNode } from "react";
import { CheckSquare, File, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { lucidePrimeBtnIcon } from "../../icons/lucide";
import type { WorkOrder } from "../../lib/workOrderTypes";

type Props = {
  row: WorkOrder;
  onOpenDocuments: (row: WorkOrder) => void;
  onOpenPlanning: (row: WorkOrder) => void;
  onOpenInspectionPoints: (row: WorkOrder) => void;
  /** Monitoring keeps empty badges as a space so column width stays stable. */
  emptyBadgePlaceholder?: boolean;
};

function RefIconButton({
  className,
  badge,
  badgeClassName,
  title,
  disabled,
  onClick,
  children,
}: {
  className: string;
  badge: string | undefined;
  badgeClassName: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`p-button p-component p-button-icon-only h-7 w-7 !rounded-[0.5rem] !p-0 ${className}`}
      onClick={onClick}
      aria-label={title}
      title={title}
      disabled={disabled}
    >
      <span className="p-button-icon p-c">{children}</span>
      {badge != null ? <span className={`p-badge p-component ${badgeClassName}`}>{badge}</span> : null}
    </button>
  );
}

function WorkOrderReferencesCellInner({
  row,
  onOpenDocuments,
  onOpenPlanning,
  onOpenInspectionPoints,
  emptyBadgePlaceholder = true,
}: Props) {
  const { t } = useTranslation();
  const ownDocuments = row.documentCount;
  const assetDocuments = row.assetDocumentCount;
  const totalDocuments = ownDocuments + assetDocuments;
  const hasDocuments = totalDocuments > 0;
  const isAssetOnly = ownDocuments === 0 && assetDocuments > 0;
  const badgeValue = hasDocuments ? String(totalDocuments) : emptyBadgePlaceholder ? " " : undefined;
  const badgeClassName = `!bg-slate-900 !text-white !shadow-none !min-w-[1.1rem] !h-4 !text-[10px] !leading-4 !px-1 !py-0${
    hasDocuments ? "" : " app-ref-badge--placeholder"
  }`;

  const assignedCount = row.assignedEmployeeCount ?? 0;
  const hasAssignments = assignedCount > 0;
  const assignmentsBadge = hasAssignments
    ? String(assignedCount)
    : emptyBadgePlaceholder
      ? " "
      : undefined;
  const assignmentsBadgeClassName = `!bg-slate-900 !text-white !shadow-none !min-w-[1.1rem] !h-4 !text-[10px] !leading-4 !px-1 !py-0${
    hasAssignments ? "" : " app-ref-badge--placeholder"
  }`;
  const assignmentsTitle = hasAssignments
    ? t("workOrders.assignmentsReferenceTitle", { count: assignedCount })
    : t("workOrders.assignmentsReference");
  const documentsTitle = hasDocuments
    ? t("workOrders.references")
    : t("workOrders.referencesOpenDocumentsTab");

  const inspectionPointCount = row.inspectionPointCount ?? 0;
  const checkedInspectionPointCount = row.checkedInspectionPointCount ?? 0;
  const hasInspectionRound = Boolean(row.inspectionRoundId);
  const hasInspectionPoints = inspectionPointCount > 0;
  const inspectionActive = hasInspectionRound || hasInspectionPoints;
  const inspectionBadge = hasInspectionPoints
    ? `${checkedInspectionPointCount}/${inspectionPointCount}`
    : hasInspectionRound
      ? "0"
      : emptyBadgePlaceholder
        ? " "
        : undefined;
  const inspectionBadgeClassName = `!bg-slate-900 !text-white !shadow-none !min-w-[1.1rem] !h-4 !text-[10px] !leading-4 !px-1 !py-0${
    inspectionActive ? "" : " app-ref-badge--placeholder"
  }`;
  const inspectionTitle = hasInspectionPoints
    ? t("workOrders.inspectionPointsReferenceTitle", {
        checked: checkedInspectionPointCount,
        total: inspectionPointCount,
      })
    : t("workOrders.inspectionPointsReference");

  const openDocuments = useCallback(() => onOpenDocuments(row), [onOpenDocuments, row]);
  const openPlanning = useCallback(() => onOpenPlanning(row), [onOpenPlanning, row]);
  const openInspection = useCallback(() => onOpenInspectionPoints(row), [onOpenInspectionPoints, row]);

  return (
    <div className="flex items-center gap-1 overflow-visible py-0.5 pr-1">
      <RefIconButton
        className={
          hasDocuments
            ? isAssetOnly
              ? "app-ref-button--documents-asset"
              : "app-ref-button--documents"
            : "app-ref-button--documents-inactive"
        }
        badge={badgeValue}
        badgeClassName={badgeClassName}
        title={documentsTitle}
        onClick={openDocuments}
      >
        <File className={lucidePrimeBtnIcon} strokeWidth={1.75} />
      </RefIconButton>
      <RefIconButton
        className={hasAssignments ? "app-ref-button--employees" : "app-ref-button--employees-empty"}
        badge={assignmentsBadge}
        badgeClassName={assignmentsBadgeClassName}
        title={assignmentsTitle}
        onClick={openPlanning}
      >
        <UserPlus className={lucidePrimeBtnIcon} strokeWidth={1.75} />
      </RefIconButton>
      <RefIconButton
        className={
          inspectionActive
            ? "app-ref-button--inspection-points"
            : "app-ref-button--inspection-points-empty"
        }
        badge={inspectionBadge}
        badgeClassName={inspectionBadgeClassName}
        title={inspectionTitle}
        disabled={!inspectionActive}
        onClick={openInspection}
      >
        <CheckSquare className={lucidePrimeBtnIcon} strokeWidth={1.75} />
      </RefIconButton>
    </div>
  );
}

export const WorkOrderReferencesCell = memo(WorkOrderReferencesCellInner);
