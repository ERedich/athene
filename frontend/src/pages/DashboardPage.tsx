import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";

import { DashboardGridCell } from "../components/dashboard/DashboardGridCell";
import { useDashboardLayout } from "../hooks/useDashboardLayout";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { DASHBOARD_SLOT_COUNT } from "../lib/dashboardKpiRegistry";

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data, loading, error, refetch } = useDashboardMetrics();
  const { layout, setSlotKpi, swapSlots } = useDashboardLayout();

  const [armedSlot, setArmedSlot] = useState<number | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [dropTargetSlot, setDropTargetSlot] = useState<number | null>(null);

  const resetDrag = useCallback(() => {
    setArmedSlot(null);
    setDraggingSlot(null);
    setDropTargetSlot(null);
  }, []);

  if (error) {
    return (
      <div className="app-dashboard-page app-dashboard-page--message min-h-0 flex-1 overflow-auto">
        <div className="app-dashboard-error m-4 rounded-lg bg-surface-container-low p-4 text-sm text-on-surface">
          <p>{t("dashboard.loadError")}</p>
          <Button
            type="button"
            label={t("dashboard.retry")}
            size="small"
            className="mt-3"
            onClick={() => void refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-dashboard-page min-h-0 flex-1 overflow-hidden">
      <div className="app-dashboard-grid" role="list">
        {Array.from({ length: DASHBOARD_SLOT_COUNT }, (_, slotIndex) => {
          const isDragging = draggingSlot === slotIndex;
          const isDropTarget =
            draggingSlot !== null &&
            draggingSlot !== slotIndex &&
            dropTargetSlot === slotIndex;
          const cellClassName = [
            "app-dashboard-grid-cell",
            "app-card-cascade",
            isDragging ? "app-dashboard-grid-cell--dragging" : "",
            isDropTarget ? "app-dashboard-grid-cell--drop-target" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={slotIndex}
              className={cellClassName}
              style={{ ["--app-cascade-index" as string]: slotIndex }}
              role="listitem"
              draggable={armedSlot === slotIndex}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDraggingSlot(slotIndex);
              }}
              onDragEnd={resetDrag}
              onDragOver={(e) => {
                if (draggingSlot === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDragEnter={() => {
                if (draggingSlot === null || draggingSlot === slotIndex) return;
                setDropTargetSlot(slotIndex);
              }}
              onDrop={(e) => {
                if (draggingSlot === null) return;
                e.preventDefault();
                if (draggingSlot !== slotIndex) {
                  swapSlots(draggingSlot, slotIndex);
                }
                resetDrag();
              }}
            >
              <DashboardGridCell
                slotIndex={slotIndex}
                kpiId={layout[slotIndex]}
                metrics={data}
                loading={loading}
                locale={i18n.language}
                onSelectKpi={(id) => setSlotKpi(slotIndex, id)}
                onArm={() => setArmedSlot(slotIndex)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
