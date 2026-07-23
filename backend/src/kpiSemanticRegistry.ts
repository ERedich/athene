/** Whitelist registry for semantic custom KPI definitions (no raw SQL). */

export const KPI_ENTITIES = ["workOrder", "transaction", "asset", "sparePart"] as const;
export type KpiEntity = (typeof KPI_ENTITIES)[number];

export const KPI_MEASURE_OPS = ["count", "sum", "avg"] as const;
export type KpiMeasureOp = (typeof KPI_MEASURE_OPS)[number];

export const KPI_FILTER_OPS = ["eq", "neq", "in", "notIn", "isNull", "gt", "gte", "lt", "lte"] as const;
export type KpiFilterOp = (typeof KPI_FILTER_OPS)[number];

export const KPI_TIME_PRESETS = [
  "last24h",
  "last7d",
  "last30d",
  "thisMonth",
  "lastMonth",
  "all",
] as const;
export type KpiTimePreset = (typeof KPI_TIME_PRESETS)[number];

export const KPI_DISPLAYS = ["value", "sparkline", "bar", "pie", "table"] as const;
export type KpiDisplay = (typeof KPI_DISPLAYS)[number];

export const KPI_ACCENTS = ["green", "blue", "amber", "teal"] as const;
export type KpiAccent = (typeof KPI_ACCENTS)[number];

export const KPI_CATEGORIES = ["workOrders", "transactions", "warehouse", "feedback"] as const;
export type KpiCategory = (typeof KPI_CATEGORIES)[number];

export type KpiFieldType = "text" | "number" | "boolean" | "timestamp" | "enum" | "uuid";

export type KpiFieldDef = {
  id: string;
  /** Quoted SQL column expression relative to entity alias `e` */
  sql: string;
  type: KpiFieldType;
  filterable: boolean;
  groupable: boolean;
  /** Allowed for sum/avg measures */
  measurable: boolean;
  /** Allowed as timeRange.field */
  timeable: boolean;
  enumValues?: readonly string[];
};

export type KpiEntityDef = {
  id: KpiEntity;
  table: string;
  siteColumn: string;
  fields: readonly KpiFieldDef[];
  defaultCategory: KpiCategory;
};

const WORK_ORDER_STATUSES = [
  "open",
  "assigned",
  "started",
  "paused",
  "continued",
  "ended",
  "done",
  "cancelled",
] as const;

const TRANSACTION_TYPES = ["IN", "EX", "RM", "RT", "IV", "ZU"] as const;
const ASSET_TYPES = ["site", "structure", "line", "maintenanceObject"] as const;

export const KPI_ENTITY_DEFS: Record<KpiEntity, KpiEntityDef> = {
  workOrder: {
    id: "workOrder",
    table: "workOrder",
    siteColumn: "siteId",
    defaultCategory: "workOrders",
    fields: [
      { id: "status", sql: 'e."status"', type: "enum", filterable: true, groupable: true, measurable: false, timeable: false, enumValues: WORK_ORDER_STATUSES },
      { id: "orderType", sql: 'e."orderType"', type: "text", filterable: true, groupable: true, measurable: false, timeable: false },
      { id: "plannedDurationMinutes", sql: 'e."plannedDurationMinutes"', type: "number", filterable: true, groupable: false, measurable: true, timeable: false },
      { id: "createdAt", sql: 'e."createdAt"', type: "timestamp", filterable: true, groupable: false, measurable: false, timeable: true },
      { id: "plannedStart", sql: 'e."plannedStart"', type: "timestamp", filterable: true, groupable: false, measurable: false, timeable: true },
      { id: "plannedEnd", sql: 'e."plannedEnd"', type: "timestamp", filterable: true, groupable: false, measurable: false, timeable: true },
      { id: "assetId", sql: 'e."assetId"', type: "uuid", filterable: true, groupable: true, measurable: false, timeable: false },
      { id: "costCenterId", sql: 'e."costCenterId"', type: "uuid", filterable: true, groupable: true, measurable: false, timeable: false },
    ],
  },
  transaction: {
    id: "transaction",
    table: "transaction",
    siteColumn: "siteId",
    defaultCategory: "transactions",
    fields: [
      { id: "type", sql: 'e."type"', type: "enum", filterable: true, groupable: true, measurable: false, timeable: false, enumValues: TRANSACTION_TYPES },
      { id: "quantity", sql: 'e."quantity"', type: "number", filterable: true, groupable: false, measurable: true, timeable: false },
      { id: "bookedAt", sql: 'e."bookedAt"', type: "timestamp", filterable: true, groupable: false, measurable: false, timeable: true },
      { id: "createdAt", sql: 'e."createdAt"', type: "timestamp", filterable: true, groupable: false, measurable: false, timeable: true },
      { id: "workOrderId", sql: 'e."workOrderId"', type: "uuid", filterable: true, groupable: true, measurable: false, timeable: false },
    ],
  },
  asset: {
    id: "asset",
    table: "asset",
    siteColumn: "siteId",
    defaultCategory: "workOrders",
    fields: [
      { id: "type", sql: 'e."type"', type: "enum", filterable: true, groupable: true, measurable: false, timeable: false, enumValues: ASSET_TYPES },
      { id: "key", sql: 'e."key"', type: "text", filterable: true, groupable: false, measurable: false, timeable: false },
      { id: "name", sql: 'e."name"', type: "text", filterable: true, groupable: false, measurable: false, timeable: false },
      { id: "createdAt", sql: 'e."createdAt"', type: "timestamp", filterable: true, groupable: false, measurable: false, timeable: true },
      { id: "parentAssetId", sql: 'e."parentAssetId"', type: "uuid", filterable: true, groupable: true, measurable: false, timeable: false },
    ],
  },
  sparePart: {
    id: "sparePart",
    table: "sparePart",
    siteColumn: "siteId",
    defaultCategory: "warehouse",
    fields: [
      { id: "isActive", sql: 'e."isActive"', type: "boolean", filterable: true, groupable: true, measurable: false, timeable: false },
      { id: "key", sql: 'e."key"', type: "text", filterable: true, groupable: false, measurable: false, timeable: false },
      { id: "name", sql: 'e."name"', type: "text", filterable: true, groupable: false, measurable: false, timeable: false },
      { id: "createdAt", sql: 'e."createdAt"', type: "timestamp", filterable: true, groupable: false, measurable: false, timeable: true },
      { id: "classificationId", sql: 'e."classificationId"', type: "uuid", filterable: true, groupable: true, measurable: false, timeable: false },
      { id: "manufacturer", sql: 'e."manufacturer"', type: "text", filterable: true, groupable: true, measurable: false, timeable: false },
    ],
  },
};

export type KpiMeasure = {
  op: KpiMeasureOp;
  field?: string;
};

export type KpiFilter = {
  field: string;
  op: KpiFilterOp;
  value?: unknown;
};

export type KpiTimeRange = {
  field: string;
  preset: KpiTimePreset;
};

export type KpiDefinition = {
  entity: KpiEntity;
  measure: KpiMeasure;
  filters: KpiFilter[];
  groupBy?: string | null;
  timeRange?: KpiTimeRange | null;
  category?: KpiCategory;
};

export type KpiDeeplink = {
  app: "monitoring" | "transactions" | "assets" | "spare-parts";
  params?: Record<string, string | string[]>;
};

export type KpiStyle = {
  display: KpiDisplay;
  accent?: KpiAccent;
  showLegend?: boolean;
  showAxes?: boolean;
  showTooltip?: boolean;
  valueSuffix?: string;
  rowLimit?: number;
  deeplink?: KpiDeeplink | null;
};

export function isKpiEntity(value: unknown): value is KpiEntity {
  return typeof value === "string" && (KPI_ENTITIES as readonly string[]).includes(value);
}

export function getEntityDef(entity: KpiEntity): KpiEntityDef {
  return KPI_ENTITY_DEFS[entity];
}

export function getFieldDef(entity: KpiEntity, fieldId: string): KpiFieldDef | undefined {
  return KPI_ENTITY_DEFS[entity].fields.find((f) => f.id === fieldId);
}

export function buildKpiMeta() {
  return {
    entities: KPI_ENTITIES.map((id) => {
      const def = KPI_ENTITY_DEFS[id];
      return {
        id,
        defaultCategory: def.defaultCategory,
        fields: def.fields.map((f) => ({
          id: f.id,
          type: f.type,
          filterable: f.filterable,
          groupable: f.groupable,
          measurable: f.measurable,
          timeable: f.timeable,
          enumValues: f.enumValues ? [...f.enumValues] : undefined,
        })),
      };
    }),
    measureOps: [...KPI_MEASURE_OPS],
    filterOps: [...KPI_FILTER_OPS],
    timePresets: [...KPI_TIME_PRESETS],
    displays: [...KPI_DISPLAYS],
    accents: [...KPI_ACCENTS],
    categories: [...KPI_CATEGORIES],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseKpiDefinition(raw: unknown): KpiDefinition | null {
  if (!isPlainObject(raw)) return null;
  if (!isKpiEntity(raw.entity)) return null;
  const entity = raw.entity;
  const entityDef = KPI_ENTITY_DEFS[entity];

  if (!isPlainObject(raw.measure)) return null;
  const op = raw.measure.op;
  if (typeof op !== "string" || !(KPI_MEASURE_OPS as readonly string[]).includes(op)) return null;
  const measureOp = op as KpiMeasureOp;
  let measureField: string | undefined;
  if (measureOp === "count") {
    if (raw.measure.field !== undefined && raw.measure.field !== null && raw.measure.field !== "") {
      return null;
    }
  } else {
    if (typeof raw.measure.field !== "string") return null;
    const fieldDef = getFieldDef(entity, raw.measure.field);
    if (!fieldDef?.measurable) return null;
    measureField = raw.measure.field;
  }

  const filtersRaw = raw.filters;
  if (!Array.isArray(filtersRaw)) return null;
  if (filtersRaw.length > 20) return null;
  const filters: KpiFilter[] = [];
  for (const item of filtersRaw) {
    if (!isPlainObject(item)) return null;
    if (typeof item.field !== "string") return null;
    const fieldDef = getFieldDef(entity, item.field);
    if (!fieldDef?.filterable) return null;
    if (typeof item.op !== "string" || !(KPI_FILTER_OPS as readonly string[]).includes(item.op)) {
      return null;
    }
    const filterOp = item.op as KpiFilterOp;
    if (filterOp === "isNull") {
      filters.push({ field: item.field, op: filterOp });
      continue;
    }
    if (filterOp === "in" || filterOp === "notIn") {
      if (!Array.isArray(item.value) || item.value.length === 0 || item.value.length > 50) return null;
      filters.push({ field: item.field, op: filterOp, value: item.value });
      continue;
    }
    if (item.value === undefined) return null;
    filters.push({ field: item.field, op: filterOp, value: item.value });
  }

  let groupBy: string | null = null;
  if (raw.groupBy !== undefined && raw.groupBy !== null && raw.groupBy !== "") {
    if (typeof raw.groupBy !== "string") return null;
    const fieldDef = getFieldDef(entity, raw.groupBy);
    if (!fieldDef?.groupable) return null;
    groupBy = raw.groupBy;
  }

  let timeRange: KpiTimeRange | null = null;
  if (raw.timeRange !== undefined && raw.timeRange !== null) {
    if (!isPlainObject(raw.timeRange)) return null;
    if (typeof raw.timeRange.field !== "string") return null;
    const fieldDef = getFieldDef(entity, raw.timeRange.field);
    if (!fieldDef?.timeable) return null;
    if (
      typeof raw.timeRange.preset !== "string" ||
      !(KPI_TIME_PRESETS as readonly string[]).includes(raw.timeRange.preset)
    ) {
      return null;
    }
    timeRange = {
      field: raw.timeRange.field,
      preset: raw.timeRange.preset as KpiTimePreset,
    };
  }

  let category: KpiCategory | undefined = entityDef.defaultCategory;
  if (raw.category !== undefined && raw.category !== null) {
    if (typeof raw.category !== "string" || !(KPI_CATEGORIES as readonly string[]).includes(raw.category)) {
      return null;
    }
    category = raw.category as KpiCategory;
  }

  return {
    entity,
    measure: measureField ? { op: measureOp, field: measureField } : { op: measureOp },
    filters,
    groupBy,
    timeRange,
    category,
  };
}

export function parseKpiStyle(raw: unknown): KpiStyle | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.display !== "string" || !(KPI_DISPLAYS as readonly string[]).includes(raw.display)) {
    return null;
  }
  const display = raw.display as KpiDisplay;
  let accent: KpiAccent | undefined;
  if (raw.accent !== undefined && raw.accent !== null) {
    if (typeof raw.accent !== "string" || !(KPI_ACCENTS as readonly string[]).includes(raw.accent)) {
      return null;
    }
    accent = raw.accent as KpiAccent;
  }
  const showLegend = raw.showLegend === undefined ? undefined : Boolean(raw.showLegend);
  const showAxes = raw.showAxes === undefined ? undefined : Boolean(raw.showAxes);
  const showTooltip = raw.showTooltip === undefined ? undefined : Boolean(raw.showTooltip);

  let valueSuffix: string | undefined;
  if (raw.valueSuffix !== undefined && raw.valueSuffix !== null) {
    if (typeof raw.valueSuffix !== "string") return null;
    const trimmed = raw.valueSuffix.trim();
    if (trimmed.length > 40) return null;
    valueSuffix = trimmed.length > 0 ? trimmed : undefined;
  }

  let rowLimit: number | undefined;
  if (raw.rowLimit !== undefined && raw.rowLimit !== null) {
    if (typeof raw.rowLimit !== "number" || !Number.isFinite(raw.rowLimit)) return null;
    const n = Math.round(raw.rowLimit);
    if (n < 5 || n > 50) return null;
    rowLimit = n;
  }

  let deeplink: KpiDeeplink | null | undefined;
  if (raw.deeplink === null) {
    deeplink = null;
  } else if (raw.deeplink !== undefined) {
    if (!isPlainObject(raw.deeplink)) return null;
    const app = raw.deeplink.app;
    const allowedApps = ["monitoring", "transactions", "assets", "spare-parts"] as const;
    if (typeof app !== "string" || !(allowedApps as readonly string[]).includes(app)) return null;
    let params: Record<string, string | string[]> | undefined;
    if (raw.deeplink.params !== undefined) {
      if (!isPlainObject(raw.deeplink.params)) return null;
      params = {};
      for (const [k, v] of Object.entries(raw.deeplink.params)) {
        if (typeof v === "string") params[k] = v;
        else if (Array.isArray(v) && v.every((x) => typeof x === "string")) params[k] = v as string[];
        else return null;
      }
    }
    deeplink = { app: app as KpiDeeplink["app"], params };
  }

  return {
    display,
    accent,
    showLegend,
    showAxes,
    showTooltip,
    valueSuffix,
    rowLimit,
    deeplink,
  };
}
