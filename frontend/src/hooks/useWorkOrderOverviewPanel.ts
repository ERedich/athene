import { useCallback, useRef, useState } from "react";
import type { DataTableRowClickEvent } from "primereact/datatable";
import type { OverlayPanel } from "primereact/overlaypanel";

import {
  handleWorkOrderOverviewRowClick,
  type WorkOrderOverviewRow,
} from "../lib/workOrderOverviewPanel";

export function useWorkOrderOverviewPanel() {
  const panelRef = useRef<OverlayPanel | null>(null);
  const [activeOrder, setActiveOrder] = useState<WorkOrderOverviewRow | null>(null);

  const onOpen = useCallback((row: WorkOrderOverviewRow) => {
    setActiveOrder(row);
  }, []);

  const onHide = useCallback(() => {
    setActiveOrder(null);
  }, []);

  const onRowClick = useCallback(
    (e: DataTableRowClickEvent) => {
      handleWorkOrderOverviewRowClick(e, panelRef, onOpen);
    },
    [onOpen],
  );

  return {
    panelRef,
    activeOrder,
    onRowClick,
    onHide,
  };
}
