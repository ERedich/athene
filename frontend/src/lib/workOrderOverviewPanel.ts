import type { MutableRefObject } from "react";
import type { DataTableRowClickEvent } from "primereact/datatable";
import type { OverlayPanel } from "primereact/overlaypanel";

import type { WorkOrderStatus } from "../components/workOrders/WorkOrderDialogTitle";

export type WorkOrderOverviewRow = {
  id: string;
  orderNumber: number;
  name: string;
  description: string | null;
  siteKey: string;
  siteName: string;
  assetKey: string;
  assetName: string;
  costCenterKey: string;
  costCenterName: string;
  classificationKey: string | null;
  classificationName: string | null;
  workgroupKey: string | null;
  workgroupName: string | null;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationMinutes: number | null;
  orderType: string;
  status: WorkOrderStatus;
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  currentSegmentStartedAt: string | null;
  documentCount: number;
  assetDocumentCount: number;
  assignedEmployeeCount: number;
  transactionCount: number;
};

const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, .p-button, .p-checkbox, .p-radiobutton, [role='button']";

export function isWorkOrderOverviewTriggerClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}

export function handleWorkOrderOverviewRowClick(
  e: DataTableRowClickEvent,
  panelRef: MutableRefObject<OverlayPanel | null>,
  onOpen: (row: WorkOrderOverviewRow) => void,
): boolean {
  const originalEvent = e.originalEvent;
  if (!originalEvent) return false;
  if (!(originalEvent.ctrlKey || originalEvent.metaKey)) return false;
  if (isWorkOrderOverviewTriggerClick(originalEvent.target)) return false;

  const row = e.data as WorkOrderOverviewRow;
  if (!row?.id || row.id.startsWith("preload-")) return false;

  onOpen(row);
  const panel = panelRef.current;
  if (panel && !panel.isVisible()) {
    panel.toggle(originalEvent);
  }
  return true;
}
