import { Checkbox } from "primereact/checkbox";
import { LucideSpinner } from "../../icons/lucide";

export type WorkOrderInspectionPointRow = {
  id: string;
  pos: number;
  name: string;
  assetId: string | null;
  assetKey: string | null;
  assetName: string | null;
  inspectionPointId: string | null;
  inspectionPointKey: string | null;
  inspectionPointName: string | null;
  checked: boolean;
  checkedAt: string | null;
  checkedByLoginName: string | null;
};

type Props = {
  rows: WorkOrderInspectionPointRow[];
  loading: boolean;
  togglingId: string | null;
  emptyLabel: string;
  loadingLabel: string;
  posLabel: string;
  nameLabel: string;
  assetLabel: string;
  pointLabel: string;
  formatPos: (pos: number) => string;
  onToggle: (row: WorkOrderInspectionPointRow, checked: boolean) => void;
};

export function WorkOrderInspectionPointsTabContent({
  rows,
  loading,
  togglingId,
  emptyLabel,
  loadingLabel,
  posLabel,
  nameLabel,
  assetLabel,
  pointLabel,
  formatPos,
  onToggle,
}: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 pt-1 text-sm text-on-surface-variant">
        <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
        <span>{loadingLabel}</span>
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="pt-1 text-sm text-on-surface-variant">{emptyLabel}</div>;
  }
  return (
    <div className="space-y-2 pt-1">
      {rows.map((row, index) => {
        const assetLabelText =
          row.assetKey && row.assetName
            ? `${row.assetKey} – ${row.assetName}`
            : row.assetKey || row.assetName || null;
        const pointLabelText =
          row.inspectionPointKey && row.inspectionPointName
            ? `${row.inspectionPointKey} – ${row.inspectionPointName}`
            : row.inspectionPointKey || row.inspectionPointName || null;
        return (
          <label
            key={row.id}
            className="app-card-cascade flex cursor-pointer items-start gap-3 rounded-sm border border-solid border-outline-variant px-3 py-2"
            style={{ ["--app-cascade-index" as string]: index }}
          >
            <Checkbox
              checked={row.checked}
              disabled={togglingId === row.id}
              onChange={(e) => onToggle(row, e.checked === true)}
              inputId={`wo-ip-${row.id}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xs font-medium tabular-nums text-on-surface-variant">
                  {posLabel} {formatPos(row.pos)}
                </span>
                <span className="text-sm font-medium text-on-surface">{row.name}</span>
              </div>
              {assetLabelText ? (
                <div className="mt-0.5 text-xs text-on-surface-variant">
                  {assetLabel}: {assetLabelText}
                </div>
              ) : null}
              {pointLabelText ? (
                <div className="text-xs text-on-surface-variant">
                  {pointLabel}: {pointLabelText}
                </div>
              ) : null}
              {row.checked && row.checkedByLoginName ? (
                <div className="mt-0.5 text-[11px] text-on-surface-variant">
                  {row.checkedByLoginName}
                  {row.checkedAt ? ` · ${new Date(row.checkedAt).toLocaleString()}` : ""}
                </div>
              ) : null}
              <span className="sr-only">{nameLabel}</span>
            </div>
          </label>
        );
      })}
    </div>
  );
}
