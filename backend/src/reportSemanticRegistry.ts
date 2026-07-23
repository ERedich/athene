/** Whitelist registry for Report Designer queries (no raw SQL from clients). */

export const REPORT_ENTITIES = [
  "workOrder",
  "asset",
  "sparePart",
  "transaction",
  "employee",
  "costCenter",
] as const;
export type ReportEntity = (typeof REPORT_ENTITIES)[number];

export const REPORT_FILTER_OPS = [
  "eq",
  "neq",
  "in",
  "notIn",
  "isNull",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
] as const;
export type ReportFilterOp = (typeof REPORT_FILTER_OPS)[number];

export const REPORT_SORT_DIRS = ["asc", "desc"] as const;
export type ReportSortDir = (typeof REPORT_SORT_DIRS)[number];

export const REPORT_PAGE_SIZES = ["A4", "A5", "Letter"] as const;
export type ReportPageSize = (typeof REPORT_PAGE_SIZES)[number];

export const REPORT_ORIENTATIONS = ["portrait", "landscape"] as const;
export type ReportOrientation = (typeof REPORT_ORIENTATIONS)[number];

export const REPORT_DATA_MODES = ["onePagePerRow", "list"] as const;
export type ReportDataMode = (typeof REPORT_DATA_MODES)[number];

export const REPORT_TEXT_ALIGNS = ["left", "center", "right"] as const;
export type ReportTextAlign = (typeof REPORT_TEXT_ALIGNS)[number];

export const REPORT_FONT_WEIGHTS = ["normal", "bold"] as const;
export type ReportFontWeight = (typeof REPORT_FONT_WEIGHTS)[number];

export type ReportFieldType = "text" | "number" | "boolean" | "timestamp" | "enum" | "uuid";

export type ReportFieldDef = {
  id: string;
  /** SQL expression relative to FROM clause (alias `e` + joins). */
  sql: string;
  type: ReportFieldType;
  filterable: boolean;
  sortable: boolean;
  selectable: boolean;
  enumValues?: readonly string[];
};

export type ReportEntityDef = {
  id: ReportEntity;
  /** FROM … JOIN fragment; primary alias must be `e`. */
  fromSql: string;
  siteColumn: string;
  defaultFields: readonly string[];
  fields: readonly ReportFieldDef[];
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

export const REPORT_ENTITY_DEFS: Record<ReportEntity, ReportEntityDef> = {
  workOrder: {
    id: "workOrder",
    fromSql: `
      FROM "workOrder" e
      LEFT JOIN "asset" a ON a."id" = e."assetId"
      LEFT JOIN "costCenter" cc ON cc."id" = e."costCenterId"
      LEFT JOIN "site" s ON s."id" = e."siteId"
    `,
    siteColumn: "siteId",
    defaultFields: [
      "orderNumber",
      "name",
      "status",
      "orderType",
      "assetKey",
      "assetName",
      "plannedStart",
      "plannedEnd",
    ],
    fields: [
      {
        id: "orderNumber",
        sql: 'e."orderNumber"',
        type: "number",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "name",
        sql: 'e."name"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "description",
        sql: 'e."description"',
        type: "text",
        filterable: true,
        sortable: false,
        selectable: true,
      },
      {
        id: "status",
        sql: 'e."status"',
        type: "enum",
        filterable: true,
        sortable: true,
        selectable: true,
        enumValues: WORK_ORDER_STATUSES,
      },
      {
        id: "orderType",
        sql: 'e."orderType"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "plannedStart",
        sql: 'e."plannedStart"',
        type: "timestamp",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "plannedEnd",
        sql: 'e."plannedEnd"',
        type: "timestamp",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "plannedDurationMinutes",
        sql: 'e."plannedDurationMinutes"',
        type: "number",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "createdAt",
        sql: 'e."createdAt"',
        type: "timestamp",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "assetKey",
        sql: 'a."key"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "assetName",
        sql: 'a."name"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "costCenterKey",
        sql: 'cc."key"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "costCenterName",
        sql: 'cc."name"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "siteKey",
        sql: 's."key"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "siteName",
        sql: 's."name"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
    ],
  },
  asset: {
    id: "asset",
    fromSql: `
      FROM "asset" e
      LEFT JOIN "site" s ON s."id" = e."siteId"
      LEFT JOIN "costCenter" cc ON cc."id" = e."costCenterId"
    `,
    siteColumn: "siteId",
    defaultFields: ["key", "name", "type", "siteKey", "costCenterKey"],
    fields: [
      { id: "key", sql: 'e."key"', type: "text", filterable: true, sortable: true, selectable: true },
      { id: "name", sql: 'e."name"', type: "text", filterable: true, sortable: true, selectable: true },
      {
        id: "type",
        sql: 'e."type"',
        type: "enum",
        filterable: true,
        sortable: true,
        selectable: true,
        enumValues: ASSET_TYPES,
      },
      {
        id: "createdAt",
        sql: 'e."createdAt"',
        type: "timestamp",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "siteKey",
        sql: 's."key"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "siteName",
        sql: 's."name"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "costCenterKey",
        sql: 'cc."key"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "costCenterName",
        sql: 'cc."name"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
    ],
  },
  sparePart: {
    id: "sparePart",
    fromSql: `
      FROM "sparePart" e
      LEFT JOIN "site" s ON s."id" = e."siteId"
    `,
    siteColumn: "siteId",
    defaultFields: ["key", "name", "isActive", "manufacturer", "siteKey"],
    fields: [
      { id: "key", sql: 'e."key"', type: "text", filterable: true, sortable: true, selectable: true },
      { id: "name", sql: 'e."name"', type: "text", filterable: true, sortable: true, selectable: true },
      {
        id: "isActive",
        sql: 'e."isActive"',
        type: "boolean",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "manufacturer",
        sql: 'e."manufacturer"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "createdAt",
        sql: 'e."createdAt"',
        type: "timestamp",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "siteKey",
        sql: 's."key"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "siteName",
        sql: 's."name"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
    ],
  },
  transaction: {
    id: "transaction",
    fromSql: `
      FROM "transaction" e
      LEFT JOIN "site" s ON s."id" = e."siteId"
      LEFT JOIN "sparePart" sp ON sp."id" = e."sparePartId"
    `,
    siteColumn: "siteId",
    defaultFields: ["type", "quantity", "bookedAt", "sparePartKey", "sparePartName"],
    fields: [
      {
        id: "type",
        sql: 'e."type"',
        type: "enum",
        filterable: true,
        sortable: true,
        selectable: true,
        enumValues: TRANSACTION_TYPES,
      },
      {
        id: "quantity",
        sql: 'e."quantity"',
        type: "number",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "bookedAt",
        sql: 'e."bookedAt"',
        type: "timestamp",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "createdAt",
        sql: 'e."createdAt"',
        type: "timestamp",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "sparePartKey",
        sql: 'sp."key"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "sparePartName",
        sql: 'sp."name"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "siteKey",
        sql: 's."key"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "siteName",
        sql: 's."name"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
    ],
  },
  employee: {
    id: "employee",
    fromSql: `
      FROM "employee" e
      LEFT JOIN "site" s ON s."id" = e."siteId"
    `,
    siteColumn: "siteId",
    defaultFields: ["key", "name", "siteKey"],
    fields: [
      { id: "key", sql: 'e."key"', type: "text", filterable: true, sortable: true, selectable: true },
      { id: "name", sql: 'e."name"', type: "text", filterable: true, sortable: true, selectable: true },
      {
        id: "createdAt",
        sql: 'e."createdAt"',
        type: "timestamp",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "siteKey",
        sql: 's."key"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "siteName",
        sql: 's."name"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
    ],
  },
  costCenter: {
    id: "costCenter",
    fromSql: `
      FROM "costCenter" e
      LEFT JOIN "site" s ON s."id" = e."siteId"
    `,
    siteColumn: "siteId",
    defaultFields: ["key", "name", "siteKey"],
    fields: [
      { id: "key", sql: 'e."key"', type: "text", filterable: true, sortable: true, selectable: true },
      { id: "name", sql: 'e."name"', type: "text", filterable: true, sortable: true, selectable: true },
      {
        id: "createdAt",
        sql: 'e."createdAt"',
        type: "timestamp",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "siteKey",
        sql: 's."key"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
      {
        id: "siteName",
        sql: 's."name"',
        type: "text",
        filterable: true,
        sortable: true,
        selectable: true,
      },
    ],
  },
};

export type ReportFilter = {
  field: string;
  op: ReportFilterOp;
  value?: unknown;
};

export type ReportSort = {
  field: string;
  dir: ReportSortDir;
};

export type ReportQueryDefinition = {
  entity: ReportEntity;
  fields: string[];
  filters: ReportFilter[];
  sort: ReportSort[];
  rowLimit: number;
};

export type ReportTextElement = {
  id: string;
  type: "label" | "field";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fieldId?: string;
  fontSize: number;
  fontWeight: ReportFontWeight;
  align: ReportTextAlign;
  color: string;
};

export type ReportLayout = {
  pageSize: ReportPageSize;
  orientation: ReportOrientation;
  marginMm: { top: number; right: number; bottom: number; left: number };
  dataMode: ReportDataMode;
  elements: ReportTextElement[];
};

export function isReportEntity(value: unknown): value is ReportEntity {
  return typeof value === "string" && (REPORT_ENTITIES as readonly string[]).includes(value);
}

export function getReportEntityDef(entity: ReportEntity): ReportEntityDef {
  return REPORT_ENTITY_DEFS[entity];
}

export function getReportFieldDef(entity: ReportEntity, fieldId: string): ReportFieldDef | undefined {
  return REPORT_ENTITY_DEFS[entity].fields.find((f) => f.id === fieldId);
}

export function defaultReportQuery(entity: ReportEntity = "workOrder"): ReportQueryDefinition {
  const def = REPORT_ENTITY_DEFS[entity];
  return {
    entity,
    fields: [...def.defaultFields],
    filters: [],
    sort: [{ field: def.fields.find((f) => f.sortable)?.id ?? def.fields[0].id, dir: "desc" }],
    rowLimit: 50,
  };
}

export function defaultReportLayout(): ReportLayout {
  return {
    pageSize: "A4",
    orientation: "portrait",
    marginMm: { top: 15, right: 15, bottom: 15, left: 15 },
    dataMode: "onePagePerRow",
    elements: [
      {
        id: "el-title",
        type: "label",
        x: 15,
        y: 20,
        width: 180,
        height: 10,
        text: "Auftragskarte",
        fontSize: 18,
        fontWeight: "bold",
        align: "left",
        color: "#111827",
      },
      {
        id: "el-order-label",
        type: "label",
        x: 15,
        y: 40,
        width: 40,
        height: 7,
        text: "Auftrag",
        fontSize: 10,
        fontWeight: "normal",
        align: "left",
        color: "#6b7280",
      },
      {
        id: "el-order-field",
        type: "field",
        x: 55,
        y: 40,
        width: 80,
        height: 7,
        fieldId: "orderNumber",
        fontSize: 12,
        fontWeight: "bold",
        align: "left",
        color: "#111827",
      },
      {
        id: "el-name-label",
        type: "label",
        x: 15,
        y: 52,
        width: 40,
        height: 7,
        text: "Bezeichnung",
        fontSize: 10,
        fontWeight: "normal",
        align: "left",
        color: "#6b7280",
      },
      {
        id: "el-name-field",
        type: "field",
        x: 55,
        y: 52,
        width: 140,
        height: 7,
        fieldId: "name",
        fontSize: 12,
        fontWeight: "normal",
        align: "left",
        color: "#111827",
      },
    ],
  };
}

export function buildReportMeta() {
  return {
    entities: REPORT_ENTITIES.map((id) => {
      const def = REPORT_ENTITY_DEFS[id];
      return {
        id,
        defaultFields: [...def.defaultFields],
        fields: def.fields.map((f) => ({
          id: f.id,
          type: f.type,
          filterable: f.filterable,
          sortable: f.sortable,
          selectable: f.selectable,
          enumValues: f.enumValues ? [...f.enumValues] : undefined,
        })),
      };
    }),
    filterOps: [...REPORT_FILTER_OPS],
    sortDirs: [...REPORT_SORT_DIRS],
    pageSizes: [...REPORT_PAGE_SIZES],
    orientations: [...REPORT_ORIENTATIONS],
    dataModes: [...REPORT_DATA_MODES],
    textAligns: [...REPORT_TEXT_ALIGNS],
    fontWeights: [...REPORT_FONT_WEIGHTS],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseReportQueryDefinition(raw: unknown): ReportQueryDefinition | null {
  if (!isPlainObject(raw)) return null;
  if (!isReportEntity(raw.entity)) return null;
  const entity = raw.entity;
  const entityDef = REPORT_ENTITY_DEFS[entity];

  if (!Array.isArray(raw.fields) || raw.fields.length === 0 || raw.fields.length > 40) return null;
  const fields: string[] = [];
  for (const item of raw.fields) {
    if (typeof item !== "string") return null;
    const fieldDef = getReportFieldDef(entity, item);
    if (!fieldDef?.selectable) return null;
    if (!fields.includes(item)) fields.push(item);
  }
  if (fields.length === 0) return null;

  if (!Array.isArray(raw.filters) || raw.filters.length > 20) return null;
  const filters: ReportFilter[] = [];
  for (const item of raw.filters) {
    if (!isPlainObject(item)) return null;
    if (typeof item.field !== "string") return null;
    const fieldDef = getReportFieldDef(entity, item.field);
    if (!fieldDef?.filterable) return null;
    if (typeof item.op !== "string" || !(REPORT_FILTER_OPS as readonly string[]).includes(item.op)) {
      return null;
    }
    const op = item.op as ReportFilterOp;
    if (op === "isNull") {
      filters.push({ field: item.field, op });
      continue;
    }
    if (op === "in" || op === "notIn") {
      if (!Array.isArray(item.value) || item.value.length === 0 || item.value.length > 50) return null;
      filters.push({ field: item.field, op, value: item.value });
      continue;
    }
    if (item.value === undefined) return null;
    filters.push({ field: item.field, op, value: item.value });
  }

  const sort: ReportSort[] = [];
  if (raw.sort !== undefined && raw.sort !== null) {
    if (!Array.isArray(raw.sort) || raw.sort.length > 5) return null;
    for (const item of raw.sort) {
      if (!isPlainObject(item)) return null;
      if (typeof item.field !== "string") return null;
      const fieldDef = getReportFieldDef(entity, item.field);
      if (!fieldDef?.sortable) return null;
      if (typeof item.dir !== "string" || !(REPORT_SORT_DIRS as readonly string[]).includes(item.dir)) {
        return null;
      }
      sort.push({ field: item.field, dir: item.dir as ReportSortDir });
    }
  }
  if (sort.length === 0) {
    const fallback = entityDef.fields.find((f) => f.sortable)?.id;
    if (fallback) sort.push({ field: fallback, dir: "desc" });
  }

  let rowLimit = 50;
  if (raw.rowLimit !== undefined && raw.rowLimit !== null) {
    if (typeof raw.rowLimit !== "number" || !Number.isFinite(raw.rowLimit)) return null;
    const n = Math.round(raw.rowLimit);
    if (n < 1 || n > 500) return null;
    rowLimit = n;
  }

  return { entity, fields, filters, sort, rowLimit };
}

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

function parseMarginMm(raw: unknown): ReportLayout["marginMm"] | null {
  if (!isPlainObject(raw)) return null;
  const keys = ["top", "right", "bottom", "left"] as const;
  const out = { top: 15, right: 15, bottom: 15, left: 15 };
  for (const key of keys) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const n = Math.round(value * 10) / 10;
    if (n < 0 || n > 80) return null;
    out[key] = n;
  }
  return out;
}

function parseTextElement(raw: unknown): ReportTextElement | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.id !== "string" || raw.id.trim().length === 0 || raw.id.length > 80) return null;
  if (raw.type !== "label" && raw.type !== "field") return null;
  for (const key of ["x", "y", "width", "height", "fontSize"] as const) {
    if (typeof raw[key] !== "number" || !Number.isFinite(raw[key])) return null;
  }
  const x = Math.round((raw.x as number) * 10) / 10;
  const y = Math.round((raw.y as number) * 10) / 10;
  const width = Math.round((raw.width as number) * 10) / 10;
  const height = Math.round((raw.height as number) * 10) / 10;
  const fontSize = Math.round((raw.fontSize as number) * 10) / 10;
  if (x < -20 || y < -20 || x > 400 || y > 400) return null;
  if (width < 2 || height < 2 || width > 400 || height > 200) return null;
  if (fontSize < 6 || fontSize > 72) return null;
  if (
    typeof raw.fontWeight !== "string" ||
    !(REPORT_FONT_WEIGHTS as readonly string[]).includes(raw.fontWeight)
  ) {
    return null;
  }
  if (typeof raw.align !== "string" || !(REPORT_TEXT_ALIGNS as readonly string[]).includes(raw.align)) {
    return null;
  }
  const color = typeof raw.color === "string" && HEX_COLOR_RE.test(raw.color) ? raw.color : "#111827";

  if (raw.type === "label") {
    if (typeof raw.text !== "string") return null;
    const text = raw.text.slice(0, 500);
    return {
      id: raw.id.trim(),
      type: "label",
      x,
      y,
      width,
      height,
      text,
      fontSize,
      fontWeight: raw.fontWeight as ReportFontWeight,
      align: raw.align as ReportTextAlign,
      color,
    };
  }

  if (typeof raw.fieldId !== "string" || raw.fieldId.trim().length === 0 || raw.fieldId.length > 80) {
    return null;
  }
  return {
    id: raw.id.trim(),
    type: "field",
    x,
    y,
    width,
    height,
    fieldId: raw.fieldId.trim(),
    fontSize,
    fontWeight: raw.fontWeight as ReportFontWeight,
    align: raw.align as ReportTextAlign,
    color,
  };
}

export function parseReportLayout(raw: unknown): ReportLayout | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.pageSize !== "string" || !(REPORT_PAGE_SIZES as readonly string[]).includes(raw.pageSize)) {
    return null;
  }
  if (
    typeof raw.orientation !== "string" ||
    !(REPORT_ORIENTATIONS as readonly string[]).includes(raw.orientation)
  ) {
    return null;
  }
  if (typeof raw.dataMode !== "string" || !(REPORT_DATA_MODES as readonly string[]).includes(raw.dataMode)) {
    return null;
  }
  const marginMm = parseMarginMm(raw.marginMm);
  if (!marginMm) return null;
  if (!Array.isArray(raw.elements) || raw.elements.length > 200) return null;
  const elements: ReportTextElement[] = [];
  const ids = new Set<string>();
  for (const item of raw.elements) {
    const el = parseTextElement(item);
    if (!el) return null;
    if (ids.has(el.id)) return null;
    ids.add(el.id);
    elements.push(el);
  }
  return {
    pageSize: raw.pageSize as ReportPageSize,
    orientation: raw.orientation as ReportOrientation,
    marginMm,
    dataMode: raw.dataMode as ReportDataMode,
    elements,
  };
}
