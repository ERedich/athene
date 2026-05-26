import type { CSSProperties } from "react";

export const TABLE_KEY_MONITORING_WORK_ORDERS = "monitoring_work_orders";

export const STANDARD_MONITORING_LAYOUT_NAME = "Standard Monitoring";

export function isStandardMonitoringLayoutName(name: string | null | undefined): boolean {
  return (name ?? "").trim() === STANDARD_MONITORING_LAYOUT_NAME;
}

export type TableLayoutPayloadV1 = {
  version: 1;
  columnOrder: string[];
  sort: { field: string; order: 1 | -1 }[];
  columnWidths: Record<string, number>;
  frozenLeft: string[];
  frozenRight: string[];
  hiddenColumns: string[];
};

export type MonitoringColumnId =
  | "orderNumber"
  | "originalWoOrderNumber"
  | "name"
  | "status"
  | "assetName"
  | "costCenterName"
  | "classificationName"
  | "workgroupKey"
  | "documentCount"
  | "orderType"
  | "plannedStart"
  | "plannedEnd"
  | "plannedDuration"
  | "startStop";

export const MONITORING_WORK_ORDERS_COLUMN_IDS: MonitoringColumnId[] = [
  "orderNumber",
  "originalWoOrderNumber",
  "name",
  "status",
  "assetName",
  "costCenterName",
  "classificationName",
  "workgroupKey",
  "documentCount",
  "orderType",
  "plannedStart",
  "plannedEnd",
  "plannedDuration",
  "startStop",
];

export type MonitoringColumnDef = {
  id: MonitoringColumnId;
  field?: string;
  columnKey?: string;
  headerKey: string;
  sortable: boolean;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  frozenAllowed: boolean;
};

export const MONITORING_WORK_ORDERS_COLUMNS: MonitoringColumnDef[] = [
  { id: "orderNumber", field: "orderNumber", headerKey: "workOrders.orderNumber", sortable: true, frozenAllowed: true },
  {
    id: "originalWoOrderNumber",
    field: "originalWoOrderNumber",
    headerKey: "workOrders.originalWo",
    sortable: true,
    defaultWidth: 112,
    minWidth: 112,
    maxWidth: 112,
    frozenAllowed: true,
  },
  { id: "name", field: "name", headerKey: "workOrders.name", sortable: true, frozenAllowed: true },
  { id: "status", field: "status", headerKey: "workOrders.status", sortable: true, frozenAllowed: true },
  { id: "assetName", field: "assetName", headerKey: "workOrders.asset", sortable: true, frozenAllowed: false },
  { id: "costCenterName", field: "costCenterName", headerKey: "workOrders.costCenter", sortable: true, frozenAllowed: false },
  {
    id: "classificationName",
    field: "classificationName",
    headerKey: "workOrders.classification",
    sortable: true,
    frozenAllowed: false,
  },
  { id: "workgroupKey", field: "workgroupKey", headerKey: "workOrders.workgroup", sortable: true, frozenAllowed: false },
  {
    id: "documentCount",
    field: "documentCount",
    headerKey: "workOrders.references",
    sortable: true,
    defaultWidth: 112,
    minWidth: 112,
    maxWidth: 112,
    frozenAllowed: false,
  },
  { id: "orderType", field: "orderType", headerKey: "workOrders.orderType", sortable: true, frozenAllowed: false },
  {
    id: "plannedStart",
    field: "plannedStart",
    headerKey: "workOrders.plannedStart",
    sortable: true,
    frozenAllowed: false,
  },
  { id: "plannedEnd", field: "plannedEnd", headerKey: "workOrders.plannedEnd", sortable: true, frozenAllowed: false },
  {
    id: "plannedDuration",
    columnKey: "plannedDuration",
    headerKey: "workOrders.plannedDuration",
    sortable: false,
    frozenAllowed: false,
  },
  {
    id: "startStop",
    columnKey: "startStop",
    headerKey: "workOrders.startStop",
    sortable: false,
    defaultWidth: 120,
    minWidth: 120,
    frozenAllowed: false,
  },
];

const columnDefById = new Map(MONITORING_WORK_ORDERS_COLUMNS.map((c) => [c.id, c]));

export function getMonitoringColumnDef(id: string): MonitoringColumnDef | undefined {
  return columnDefById.get(id as MonitoringColumnId);
}

/** Matches Monitoring DataTable before the layout editor (incl. fixed column widths). */
export function originalMonitoringTableLayoutPayload(): TableLayoutPayloadV1 {
  return {
    version: 1,
    columnOrder: [...MONITORING_WORK_ORDERS_COLUMN_IDS],
    sort: [],
    columnWidths: {
      originalWoOrderNumber: 112,
      documentCount: 112,
      startStop: 120,
    },
    frozenLeft: [],
    frozenRight: [],
    hiddenColumns: [],
  };
}

export function defaultMonitoringTableLayoutPayload(): TableLayoutPayloadV1 {
  return originalMonitoringTableLayoutPayload();
}

export function visibleColumnIdsFromPayload(payload: TableLayoutPayloadV1): string[] {
  const hidden = new Set(payload.hiddenColumns);
  return payload.columnOrder.filter((id) => !hidden.has(id));
}

export function hasVisibleLayoutColumns(payload: TableLayoutPayloadV1): boolean {
  return visibleColumnIdsFromPayload(payload).length > 0;
}

const MIN_LAYOUT_COLUMN_WIDTH = 40;
const MAX_LAYOUT_COLUMN_WIDTH = 800;

/** Ensures at least one visible column and sane widths (fixes empty/corrupt layouts). */
export function sanitizeMonitoringTableLayoutPayload(payload: TableLayoutPayloadV1): TableLayoutPayloadV1 {
  const hidden = new Set(
    payload.hiddenColumns.filter((id) => MONITORING_WORK_ORDERS_COLUMN_IDS.includes(id as MonitoringColumnId)),
  );
  const order: MonitoringColumnId[] = [];
  for (const id of payload.columnOrder) {
    if (!MONITORING_WORK_ORDERS_COLUMN_IDS.includes(id as MonitoringColumnId)) continue;
    if (order.includes(id as MonitoringColumnId)) continue;
    order.push(id as MonitoringColumnId);
  }
  for (const id of MONITORING_WORK_ORDERS_COLUMN_IDS) {
    if (!order.includes(id)) order.push(id);
  }
  const visible = order.filter((id) => !hidden.has(id));
  if (visible.length === 0) {
    return originalMonitoringTableLayoutPayload();
  }

  const columnWidths: Record<string, number> = {};
  const originalWidths = originalMonitoringTableLayoutPayload().columnWidths;
  for (const id of visible) {
    const raw = payload.columnWidths[id] ?? originalWidths[id as MonitoringColumnId];
    if (raw == null) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    columnWidths[id] = Math.min(MAX_LAYOUT_COLUMN_WIDTH, Math.max(MIN_LAYOUT_COLUMN_WIDTH, Math.round(raw)));
  }

  const frozenLeft = payload.frozenLeft.filter((id) => visible.includes(id as MonitoringColumnId));
  const frozenRight = payload.frozenRight.filter(
    (id) => visible.includes(id as MonitoringColumnId) && !frozenLeft.includes(id),
  );

  const sort = payload.sort.filter((s) => {
    const def = MONITORING_WORK_ORDERS_COLUMNS.find(
      (c) => c.field === s.field || c.id === s.field || c.columnKey === s.field,
    );
    return Boolean(def && visible.includes(def.id) && (s.order === 1 || s.order === -1));
  });

  return {
    version: 1,
    columnOrder: order,
    sort,
    columnWidths,
    frozenLeft,
    frozenRight,
    hiddenColumns: [...hidden],
  };
}

export function columnStyleFromPayload(
  payload: TableLayoutPayloadV1,
  columnId: string,
  def: MonitoringColumnDef,
): CSSProperties | undefined {
  const raw = payload.columnWidths[columnId] ?? def.defaultWidth;
  if (raw == null) return undefined;
  const w = Math.min(MAX_LAYOUT_COLUMN_WIDTH, Math.max(MIN_LAYOUT_COLUMN_WIDTH, raw));
  const min = Math.max(MIN_LAYOUT_COLUMN_WIDTH, def.minWidth ?? w);
  const max = Math.max(min, def.maxWidth ?? w);
  return { width: `${w}px`, minWidth: `${min}px`, maxWidth: `${max}px` };
}

export function frozenAlignForColumn(
  payload: TableLayoutPayloadV1,
  columnId: string,
): "left" | "right" | undefined {
  if (payload.frozenLeft.includes(columnId)) return "left";
  if (payload.frozenRight.includes(columnId)) return "right";
  return undefined;
}

export function sortFieldForColumn(def: MonitoringColumnDef): string | undefined {
  return def.field;
}
