/** Column ids used by the Monitoring work-orders DataTable (for corrupt-state checks). */
const MONITORING_WORK_ORDERS_COLUMN_IDS = [
  "orderNumber",
  "originalWoOrderNumber",
  "maintenancePlanKey",
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

/** PrimeReact DataTable stateStorage key for Monitoring (personal browser state). */
export const MONITORING_TABLE_STATE_STORAGE_KEY = "athene-monitoring-table-v3";

const LEGACY_MONITORING_TABLE_STATE_KEYS = [
  "athene-monitoring-table-v2",
  "athene-monitoring-table",
] as const;

const KNOWN_MONITORING_COLUMN_KEYS = new Set<string>(MONITORING_WORK_ORDERS_COLUMN_IDS);

export const MONITORING_TABLE_COLUMN_COUNT = MONITORING_WORK_ORDERS_COLUMN_IDS.length;

function parseColumnOrderTokens(order: unknown): string[] {
  if (typeof order === "string") {
    return order
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(order)) {
    return order.filter((item): item is string => typeof item === "string" && item.length > 0);
  }
  return [];
}

function widthTokenCount(widths: unknown): number {
  if (typeof widths === "string") {
    return widths.split(",").map((w) => w.trim()).filter(Boolean).length;
  }
  if (widths && typeof widths === "object" && !Array.isArray(widths)) {
    return Object.keys(widths as Record<string, unknown>).length;
  }
  return 0;
}

function isCorruptMonitoringTableState(state: Record<string, unknown>): boolean {
  const orderTokens = parseColumnOrderTokens(state.columnOrder);
  if (orderTokens.length === 0 && state.columnOrder != null) return true;
  if (
    orderTokens.length > 0 &&
    !orderTokens.some((token) => KNOWN_MONITORING_COLUMN_KEYS.has(token))
  ) {
    return true;
  }

  const storedWidthCount = widthTokenCount(state.columnWidths);
  if (storedWidthCount > 0 && storedWidthCount < MONITORING_TABLE_COLUMN_COUNT) {
    return true;
  }

  const widths = state.columnWidths;
  if (typeof widths === "string") {
    const parts = widths.split(",");
    if (parts.length >= 2) {
      const widthTokens = parts.filter((_, index) => index % 2 === 1);
      if (widthTokens.length > 0 && widthTokens.every((w) => Number.parseInt(w, 10) <= 0)) {
        return true;
      }
    }
    const numericWidths = parts.map((w) => Number.parseInt(w.trim(), 10));
    if (numericWidths.length === 1 && numericWidths[0] > 0) {
      return true;
    }
  }
  if (widths && typeof widths === "object" && !Array.isArray(widths)) {
    const values = Object.values(widths as Record<string, unknown>);
    if (values.length > 0 && values.every((v) => Number(v) <= 0)) return true;
  }

  const filters = state.filters;
  if (filters && typeof filters === "object" && !Array.isArray(filters) && "null" in filters) {
    return true;
  }

  return false;
}

/** PrimeReact state to persist only when it matches the full monitoring column set. */
export function isValidMonitoringTablePersistedState(state: Record<string, unknown>): boolean {
  return !isCorruptMonitoringTableState(state);
}

/** Drops local table state that hides every column (common after layout-editor experiments). */
export function repairMonitoringTableStateStorage(
  stateKey: string = MONITORING_TABLE_STATE_STORAGE_KEY,
): void {
  if (typeof window === "undefined") return;

  for (const key of LEGACY_MONITORING_TABLE_STATE_KEYS) {
    window.localStorage.removeItem(key);
  }

  try {
    const raw = window.localStorage.getItem(stateKey);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (isCorruptMonitoringTableState(parsed)) {
      window.localStorage.removeItem(stateKey);
    }
  } catch {
    window.localStorage.removeItem(stateKey);
  }
}

if (typeof window !== "undefined") {
  repairMonitoringTableStateStorage();
}
