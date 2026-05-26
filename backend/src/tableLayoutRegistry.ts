export const TABLE_KEY_MONITORING_WORK_ORDERS = "monitoring_work_orders";

export const LAYOUT_CONTEXT_MONITORING = "monitoring";

export const STANDARD_MONITORING_LAYOUT_NAME = "Standard Monitoring";

const MONITORING_COLUMN_IDS = [
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
] as const;

export type MonitoringColumnId = (typeof MONITORING_COLUMN_IDS)[number];

const ALLOWED_TABLE_KEYS: Record<string, readonly string[]> = {
  [TABLE_KEY_MONITORING_WORK_ORDERS]: MONITORING_COLUMN_IDS,
};

export function allowedColumnIdsForTableKey(tableKey: string): readonly string[] | null {
  return ALLOWED_TABLE_KEYS[tableKey] ?? null;
}

export function isAllowedTableKey(tableKey: string): boolean {
  return tableKey in ALLOWED_TABLE_KEYS;
}

/** Matches Monitoring DataTable before the layout editor (incl. fixed column widths). */
export function originalMonitoringWorkOrdersPayload(): TableLayoutPayloadV1 {
  return {
    version: 1,
    columnOrder: [...MONITORING_COLUMN_IDS],
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

/** @deprecated Use originalMonitoringWorkOrdersPayload */
export function defaultMonitoringPayload(): TableLayoutPayloadV1 {
  return originalMonitoringWorkOrdersPayload();
}

export function visibleColumnIdsFromPayload(payload: TableLayoutPayloadV1): string[] {
  const hidden = new Set(payload.hiddenColumns);
  return payload.columnOrder.filter((id) => !hidden.has(id));
}

export function hasVisibleLayoutColumns(payload: TableLayoutPayloadV1): boolean {
  return visibleColumnIdsFromPayload(payload).length > 0;
}

export function normalizeMonitoringPayload(payload: TableLayoutPayloadV1): TableLayoutPayloadV1 {
  const hidden = new Set(
    payload.hiddenColumns.filter((id) => MONITORING_COLUMN_IDS.includes(id as MonitoringColumnId)),
  );
  const order: MonitoringColumnId[] = [];
  for (const id of payload.columnOrder) {
    if (!MONITORING_COLUMN_IDS.includes(id as MonitoringColumnId)) continue;
    if (order.includes(id as MonitoringColumnId)) continue;
    order.push(id as MonitoringColumnId);
  }
  for (const id of MONITORING_COLUMN_IDS) {
    if (!order.includes(id)) order.push(id);
  }
  const visible = order.filter((id) => !hidden.has(id));
  if (visible.length === 0) {
    return originalMonitoringWorkOrdersPayload();
  }

  const columnWidths: Record<string, number> = {};
  const originalWidths = originalMonitoringWorkOrdersPayload().columnWidths;
  for (const id of visible) {
    const raw = payload.columnWidths[id] ?? originalWidths[id];
    if (raw == null) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    columnWidths[id] = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(raw)));
  }

  const frozenLeft = payload.frozenLeft.filter((id) => visible.includes(id as MonitoringColumnId));
  const frozenRight = payload.frozenRight.filter(
    (id) => visible.includes(id as MonitoringColumnId) && !frozenLeft.includes(id),
  );

  const sortFiltered = payload.sort.filter((s) => {
    if (s.order !== 1 && s.order !== -1) return false;
    return visible.some((vid) => vid === s.field);
  });

  return {
    version: 1,
    columnOrder: order,
    sort: sortFiltered,
    columnWidths,
    frozenLeft,
    frozenRight,
    hiddenColumns: [...hidden],
  };
}

export function resolveMonitoringPayload(raw: unknown): TableLayoutPayloadV1 {
  const parsed = parseTableLayoutPayload(raw, TABLE_KEY_MONITORING_WORK_ORDERS);
  if (!parsed) return originalMonitoringWorkOrdersPayload();
  return normalizeMonitoringPayload(parsed);
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

const MIN_WIDTH = 40;
const MAX_WIDTH = 800;
const MAX_SORT_ENTRIES = 8;

/** Ensures every hidden column id is listed in columnOrder (required by parseTableLayoutPayload). */
export function repairMonitoringPayloadRaw(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return raw;
  if (!Array.isArray(o.columnOrder) || !Array.isArray(o.hiddenColumns)) return raw;

  const order: string[] = [];
  const seen = new Set<string>();
  for (const x of o.columnOrder) {
    if (typeof x !== "string" || seen.has(x)) continue;
    seen.add(x);
    order.push(x);
  }
  for (const x of o.hiddenColumns) {
    if (typeof x !== "string" || seen.has(x)) continue;
    seen.add(x);
    order.push(x);
  }
  return { ...o, columnOrder: order };
}

export function parseTableLayoutPayload(raw: unknown, tableKey: string): TableLayoutPayloadV1 | null {
  const input = tableKey === TABLE_KEY_MONITORING_WORK_ORDERS ? repairMonitoringPayloadRaw(raw) : raw;
  if (input === null || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (o.version !== 1) return null;

  const allowed = allowedColumnIdsForTableKey(tableKey);
  if (!allowed) return null;
  const allowedSet = new Set(allowed);

  if (!Array.isArray(o.columnOrder) || o.columnOrder.length === 0 || o.columnOrder.length > allowed.length) {
    return null;
  }
  const columnOrder: string[] = [];
  const seenOrder = new Set<string>();
  for (const x of o.columnOrder) {
    if (typeof x !== "string" || !allowedSet.has(x) || seenOrder.has(x)) return null;
    seenOrder.add(x);
    columnOrder.push(x);
  }

  const hiddenColumns: string[] = [];
  if (o.hiddenColumns !== undefined) {
    if (!Array.isArray(o.hiddenColumns)) return null;
    const seenHidden = new Set<string>();
    for (const x of o.hiddenColumns) {
      if (typeof x !== "string" || !allowedSet.has(x) || seenHidden.has(x)) return null;
      if (!seenOrder.has(x)) return null;
      seenHidden.add(x);
      hiddenColumns.push(x);
    }
  }

  const visibleCount = columnOrder.filter((id) => !hiddenColumns.includes(id)).length;
  if (visibleCount < 1) return null;

  const sort: { field: string; order: 1 | -1 }[] = [];
  if (o.sort !== undefined) {
    if (!Array.isArray(o.sort) || o.sort.length > MAX_SORT_ENTRIES) return null;
    const seenSort = new Set<string>();
    for (const entry of o.sort) {
      if (entry === null || typeof entry !== "object") return null;
      const e = entry as Record<string, unknown>;
      const field = e.field;
      const order = e.order;
      if (typeof field !== "string" || !allowedSet.has(field) || seenSort.has(field)) return null;
      if (hiddenColumns.includes(field)) return null;
      if (order !== 1 && order !== -1) return null;
      seenSort.add(field);
      sort.push({ field, order });
    }
  }

  const columnWidths: Record<string, number> = {};
  if (o.columnWidths !== undefined) {
    if (o.columnWidths === null || typeof o.columnWidths !== "object" || Array.isArray(o.columnWidths)) {
      return null;
    }
    for (const [key, val] of Object.entries(o.columnWidths as Record<string, unknown>)) {
      if (!allowedSet.has(key) || hiddenColumns.includes(key)) return null;
      if (typeof val !== "number" || !Number.isFinite(val) || val < MIN_WIDTH || val > MAX_WIDTH) return null;
      columnWidths[key] = Math.round(val);
    }
  }

  const parseFrozen = (rawFrozen: unknown): string[] => {
    if (rawFrozen === undefined || rawFrozen === null) return [];
    if (!Array.isArray(rawFrozen)) throw new Error("invalid");
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of rawFrozen) {
      if (typeof x !== "string" || !allowedSet.has(x) || seen.has(x)) throw new Error("invalid");
      if (hiddenColumns.includes(x)) throw new Error("invalid");
      seen.add(x);
      out.push(x);
    }
    return out;
  };

  let frozenLeft: string[];
  let frozenRight: string[];
  try {
    frozenLeft = parseFrozen(o.frozenLeft);
    frozenRight = parseFrozen(o.frozenRight);
  } catch {
    return null;
  }

  const frozenSet = new Set([...frozenLeft, ...frozenRight]);
  if (frozenSet.size !== frozenLeft.length + frozenRight.length) return null;

  return {
    version: 1,
    columnOrder,
    sort,
    columnWidths,
    frozenLeft,
    frozenRight,
    hiddenColumns,
  };
}
