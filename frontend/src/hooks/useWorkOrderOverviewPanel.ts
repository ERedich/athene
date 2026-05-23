import { useCallback, useState } from "react";
import type { DataTableRowClickEvent } from "primereact/datatable";

import {
  handleWorkOrderOverviewRowClick,
  type WorkOrderOverviewRow,
} from "../lib/workOrderOverviewPanel";

export function useWorkOrderOverviewPanel() {
  const [activeOrder, setActiveOrder] = useState<WorkOrderOverviewRow | null>(null);

  const onOpen = useCallback((row: WorkOrderOverviewRow) => {
    setActiveOrder(row);
  }, []);

  const onHide = useCallback(() => {
    setActiveOrder(null);
  }, []);

  const onRowClick = useCallback(
    (e: DataTableRowClickEvent) => {
      handleWorkOrderOverviewRowClick(e, onOpen);
    },
    [onOpen],
  );

  return {
    activeOrder,
    onOpen,
    onRowClick,
    onHide,
  };
}
