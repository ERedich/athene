import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import bwipjs from "bwip-js";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

const router = Router();

const MAX_PREVIEW_ROWS = 200;
const MAX_PDF_ROWS = 200;
const MAX_TEXT_ELEMENTS = 100;
const MAX_FILTERS = 20;
const MAX_QUERY_LENGTH = 8000;
const MAX_TEXT_LENGTH = 1000;
const MAX_KEY_LENGTH = 100;
const MAX_NAME_LENGTH = 200;
const MAX_TARGET_APP_KEY_LENGTH = 64;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MIN_BAND_HEIGHT = 16;
const MAX_BAND_HEIGHT = 400;
const ALLOWED_TARGET_APP_KEYS = new Set(["", "assets"]);
const RECORD_ID_PLACEHOLDER_RE = /\{\{\s*recordId\s*\}\}/g;
const ANY_PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

const blockedSqlTokens = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "truncate",
  "grant",
  "revoke",
  "copy",
  "call",
  "execute",
  "do",
  "vacuum",
  "analyze",
];

type QueryPreviewBody = {
  sql: string;
  limit: number;
  recordId: string | null;
};

type ColumnType = "date" | "number" | "text" | "boolean";

type ReportSection = "header" | "groupHeader" | "detail" | "groupFooter" | "footer";

type GroupGranularity = "day" | "week" | "month" | "quarter" | "year";

type FilterOp =
  | "eq"
  | "neq"
  | "contains"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "empty"
  | "notEmpty";

type ReportFilter = {
  field: string;
  op: FilterOp;
  value: string;
};

type ReportElementKind = "text" | "qr" | "barcode";

type ReportElement = {
  id: string;
  section: ReportSection;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  align: "left" | "center" | "right";
  bold: boolean;
  italic: boolean;
  underline: boolean;
  kind: ReportElementKind;
  sourceField: string;
  dateFormat: string;
};

type BandConfig = { height: number };

type ReportLayout = {
  header: BandConfig & { firstPageOnly: boolean };
  groupHeader: BandConfig;
  detail: BandConfig;
  groupFooter: BandConfig;
  footer: BandConfig;
  grouping: {
    enabled: boolean;
    field: string;
    sort: "asc" | "desc";
    granularity: GroupGranularity;
    dateFormat: string;
  };
  filters: ReportFilter[];
  elements: ReportElement[];
};

type RenderPdfBody = {
  title: string;
  rows: Record<string, unknown>[];
  layout: ReportLayout;
};

type RowGroup = {
  key: string;
  rows: Record<string, unknown>[];
};

const REPORT_SECTIONS: ReportSection[] = [
  "header",
  "groupHeader",
  "detail",
  "groupFooter",
  "footer",
];

const FILTER_OPS: FilterOp[] = [
  "eq",
  "neq",
  "contains",
  "gt",
  "lt",
  "gte",
  "lte",
  "empty",
  "notEmpty",
];

const GRANULARITIES: GroupGranularity[] = ["day", "week", "month", "quarter", "year"];

const DATE_OIDS = new Set([1082, 1114, 1184, 1083, 1266]);
const NUMBER_OIDS = new Set([20, 21, 23, 700, 701, 1700]);
const BOOLEAN_OIDS = new Set([16]);

function pgTypeCategory(oid: number): ColumnType {
  if (DATE_OIDS.has(oid)) return "date";
  if (NUMBER_OIDS.has(oid)) return "number";
  if (BOOLEAN_OIDS.has(oid)) return "boolean";
  return "text";
}

function sanitizeSql(raw: string): string | null {
  const sql = raw.trim().replace(/;+$/g, "");
  if (!sql) return null;
  if (sql.length > MAX_QUERY_LENGTH) return null;

  const lowered = sql.toLowerCase();
  if (!(lowered.startsWith("select") || lowered.startsWith("with"))) return null;
  if (sql.includes(";")) return null;
  if (blockedSqlTokens.some((token) => new RegExp(`\\b${token}\\b`, "i").test(sql))) return null;

  return sql;
}

/** Replace {{recordId}} with bound $n params. Unknown placeholders are rejected. */
function bindRecordId(
  sql: string,
  recordId: string | null,
): { sql: string; params: unknown[] } | { error: "unsupported_placeholder" } {
  const unsupported: string[] = [];
  for (const match of sql.matchAll(ANY_PLACEHOLDER_RE)) {
    const name = match[1] ?? "";
    if (name !== "recordId") unsupported.push(name);
  }
  if (unsupported.length > 0) return { error: "unsupported_placeholder" };

  const params: unknown[] = [];
  let index = 0;
  const bound = sql.replace(RECORD_ID_PLACEHOLDER_RE, () => {
    index += 1;
    params.push(recordId);
    return `$${index}`;
  });
  return { sql: bound, params };
}

function hasRecordIdPlaceholder(sql: string): boolean {
  RECORD_ID_PLACEHOLDER_RE.lastIndex = 0;
  return RECORD_ID_PLACEHOLDER_RE.test(sql);
}

function parseRecordId(raw: unknown): string | null | undefined {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!isUuid(trimmed)) return undefined;
  return trimmed;
}

function parseQueryPreviewBody(body: unknown): QueryPreviewBody | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const sql = typeof obj.sql === "string" ? obj.sql : "";
  const sanitized = sanitizeSql(sql);
  if (!sanitized) return null;
  const boundCheck = bindRecordId(sanitized, null);
  if ("error" in boundCheck) return null;
  const limitRaw = Number(obj.limit ?? 50);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_PREVIEW_ROWS, Math.floor(limitRaw)))
    : 50;
  const recordId = parseRecordId(obj.recordId);
  if (recordId === undefined) return null;
  return { sql: sanitized, limit, recordId };
}

function auditMeta(req: Request) {
  const userId = req.session.userId;
  if (!userId) {
    throw new Error("missing_session_user");
  }
  return {
    userId,
    requestId: randomUUID(),
    reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
    source: "api",
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? "",
  };
}

function sendPgError(res: Response, err: unknown) {
  const e = err as { code?: string; detail?: string; message?: string };
  if (e.code === "23505") {
    res.status(409).json({ error: "duplicate_key", message: e.detail ?? e.message });
    return;
  }
  if (e.code === "23503") {
    res.status(409).json({ error: "foreign_key_violation", message: e.detail ?? e.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

type ReportDefinitionRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  targetAppKey: string;
  sql: string;
  layout: unknown;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

const definitionSelectSql = `
  SELECT
    d."id",
    d."key",
    d."name",
    d."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    d."targetAppKey",
    d."sql",
    d."layout",
    d."createdAt",
    d."updatedAt",
    COALESCE(u."loginName", d."createdBy"::text) AS "createdBy"
  FROM "reportDefinition" d
  JOIN "site" s ON s."id" = d."siteId"
  LEFT JOIN "users" u ON u."id" = d."createdBy"
`;

type ParsedDefinitionBody = {
  key: string;
  name: string;
  siteId: string;
  targetAppKey: string;
  sql: string;
  layout: ReportLayout;
};

function parseTargetAppKey(raw: unknown): string | null {
  if (raw == null) return "";
  if (typeof raw !== "string") return null;
  const value = raw.trim().slice(0, MAX_TARGET_APP_KEY_LENGTH);
  if (!ALLOWED_TARGET_APP_KEYS.has(value)) return null;
  return value;
}

function parseDefinitionBody(body: unknown): ParsedDefinitionBody | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const key = typeof obj.key === "string" ? obj.key.trim().slice(0, MAX_KEY_LENGTH) : "";
  const name = typeof obj.name === "string" ? obj.name.trim().slice(0, MAX_NAME_LENGTH) : "";
  const siteId = typeof obj.siteId === "string" ? obj.siteId.trim() : "";
  const targetAppKey = parseTargetAppKey(obj.targetAppKey);
  const sqlRaw = typeof obj.sql === "string" ? obj.sql : "";
  const sql = sanitizeSql(sqlRaw);
  const layout = parseReportLayout(obj.layout);
  if (!key || !name || !isUuid(siteId) || targetAppKey == null || !sql || !layout) return null;
  const boundCheck = bindRecordId(sql, null);
  if ("error" in boundCheck) return null;
  if (targetAppKey && !hasRecordIdPlaceholder(sql)) return null;
  return { key, name, siteId, targetAppKey, sql, layout };
}

function toSafeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function applyTemplate(
  text: string,
  row: Record<string, unknown>,
  extras: Record<string, string> = {},
  dateFormat = "",
): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(extras, key)) return extras[key] ?? "";
    const raw = row[key];
    if (dateFormat.trim()) {
      const date = toDateValue(raw);
      if (date) return formatDateBucket(date, dateFormat.trim());
    }
    return toSafeText(raw);
  });
}

function resolveFont(bold: boolean, italic: boolean): string {
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function parseBandHeight(raw: unknown, fallback: number): number | null {
  if (raw == null) return fallback;
  const height = Number(raw);
  if (!Number.isFinite(height)) return null;
  if (height < MIN_BAND_HEIGHT || height > MAX_BAND_HEIGHT) return null;
  return Math.round(height);
}

const REPORT_ELEMENT_KINDS: ReportElementKind[] = ["text", "qr", "barcode"];
const MIN_ELEMENT_BOX_HEIGHT = 16;
const MAX_ELEMENT_BOX_HEIGHT = 200;

function parseReportElement(raw: unknown, bandHeight: number): ReportElement | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : "";
  const sectionRaw = typeof obj.section === "string" ? obj.section : "";
  const section = REPORT_SECTIONS.includes(sectionRaw as ReportSection)
    ? (sectionRaw as ReportSection)
    : null;
  const text = typeof obj.text === "string" ? obj.text.slice(0, MAX_TEXT_LENGTH) : "";
  const x = Number(obj.x);
  const y = Number(obj.y);
  const width = Number(obj.width);
  const fontSize = Number(obj.fontSize ?? 12);
  const alignRaw = typeof obj.align === "string" ? obj.align : "left";
  const align = alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
  const bold = Boolean(obj.bold);
  const italic = Boolean(obj.italic);
  const underline = Boolean(obj.underline);
  const kindRaw = typeof obj.kind === "string" ? obj.kind : "text";
  const kind = REPORT_ELEMENT_KINDS.includes(kindRaw as ReportElementKind)
    ? (kindRaw as ReportElementKind)
    : "text";
  const sourceField =
    typeof obj.sourceField === "string" ? obj.sourceField.trim().slice(0, 120) : "";
  const dateFormat =
    typeof obj.dateFormat === "string" ? obj.dateFormat.trim().slice(0, 64) : "";
  const heightFallback = kind === "qr" ? 72 : kind === "barcode" ? 40 : 16;
  const heightRaw = Number(obj.height ?? heightFallback);
  const height = Number.isFinite(heightRaw)
    ? Math.max(MIN_ELEMENT_BOX_HEIGHT, Math.min(MAX_ELEMENT_BOX_HEIGHT, Math.round(heightRaw)))
    : heightFallback;

  if (!id || !section || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!Number.isFinite(width) || width < 20 || width > 560) return null;
  if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 48) return null;

  return {
    id,
    section,
    text,
    x: Math.max(0, Math.min(PAGE_WIDTH - 20, Math.round(x))),
    y: Math.max(0, Math.min(Math.max(bandHeight - 8, 0), Math.round(y))),
    width: Math.round(width),
    height,
    fontSize: Math.round(fontSize),
    align,
    bold,
    italic,
    underline,
    kind,
    sourceField,
    dateFormat,
  };
}

function parseGranularity(raw: unknown): GroupGranularity {
  if (typeof raw === "string" && GRANULARITIES.includes(raw as GroupGranularity)) {
    return raw as GroupGranularity;
  }
  return "day";
}

function defaultDateFormat(granularity: GroupGranularity): string {
  switch (granularity) {
    case "day":
      return "YYYY-MM-DD";
    case "week":
      return "YYYY-WWW";
    case "month":
      return "YYYY-MM";
    case "quarter":
      return "YYYY-Qq";
    case "year":
      return "YYYY";
    default:
      return "YYYY-MM-DD";
  }
}

function parseDateFormat(raw: unknown, granularity: GroupGranularity): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim().slice(0, 64);
    if (trimmed) return trimmed;
  }
  return defaultDateFormat(granularity);
}

function parseFilters(raw: unknown): ReportFilter[] {
  if (!Array.isArray(raw)) return [];
  const filters: ReportFilter[] = [];
  for (const entry of raw.slice(0, MAX_FILTERS)) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const field = typeof obj.field === "string" ? obj.field.trim().slice(0, 120) : "";
    const opRaw = typeof obj.op === "string" ? obj.op : "";
    const op = FILTER_OPS.includes(opRaw as FilterOp) ? (opRaw as FilterOp) : null;
    const value = typeof obj.value === "string" ? obj.value.slice(0, 500) : String(obj.value ?? "");
    if (!field || !op) continue;
    filters.push({ field, op, value });
  }
  return filters;
}

function parseReportLayout(raw: unknown): ReportLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const headerRaw =
    obj.header && typeof obj.header === "object" ? (obj.header as Record<string, unknown>) : null;
  const detailRaw =
    obj.detail && typeof obj.detail === "object" ? (obj.detail as Record<string, unknown>) : null;
  if (!headerRaw || !detailRaw) return null;

  const groupHeaderRaw =
    obj.groupHeader && typeof obj.groupHeader === "object"
      ? (obj.groupHeader as Record<string, unknown>)
      : {};
  const groupFooterRaw =
    obj.groupFooter && typeof obj.groupFooter === "object"
      ? (obj.groupFooter as Record<string, unknown>)
      : {};
  const footerRaw =
    obj.footer && typeof obj.footer === "object" ? (obj.footer as Record<string, unknown>) : {};
  const groupingRaw =
    obj.grouping && typeof obj.grouping === "object"
      ? (obj.grouping as Record<string, unknown>)
      : {};

  const headerHeight = parseBandHeight(headerRaw.height, 80);
  const groupHeaderHeight = parseBandHeight(groupHeaderRaw.height, 28);
  const detailHeight = parseBandHeight(detailRaw.height, 36);
  const groupFooterHeight = parseBandHeight(groupFooterRaw.height, 24);
  const footerHeight = parseBandHeight(footerRaw.height, 28);
  if (
    headerHeight == null ||
    groupHeaderHeight == null ||
    detailHeight == null ||
    groupFooterHeight == null ||
    footerHeight == null
  ) {
    return null;
  }

  const groupingEnabled = Boolean(groupingRaw.enabled);
  const groupingField =
    typeof groupingRaw.field === "string" ? groupingRaw.field.trim().slice(0, 120) : "";
  const sortRaw = typeof groupingRaw.sort === "string" ? groupingRaw.sort : "asc";
  const groupingSort = sortRaw === "desc" ? "desc" : "asc";
  const granularity = parseGranularity(groupingRaw.granularity);
  const dateFormat = parseDateFormat(groupingRaw.dateFormat, granularity);

  if (groupingEnabled && !groupingField) return null;

  const reserved =
    headerHeight +
    footerHeight +
    detailHeight +
    (groupingEnabled ? groupHeaderHeight + groupFooterHeight : 0);
  if (reserved > PAGE_HEIGHT) return null;

  const elementsRaw = Array.isArray(obj.elements) ? obj.elements : [];
  if (elementsRaw.length === 0 || elementsRaw.length > MAX_TEXT_ELEMENTS) return null;

  const header = {
    height: headerHeight,
    firstPageOnly: Boolean(headerRaw.firstPageOnly),
  };
  const groupHeader = { height: groupHeaderHeight };
  const detail = { height: detailHeight };
  const groupFooter = { height: groupFooterHeight };
  const footer = { height: footerHeight };

  const bandHeightBySection: Record<ReportSection, number> = {
    header: header.height,
    groupHeader: groupHeader.height,
    detail: detail.height,
    groupFooter: groupFooter.height,
    footer: footer.height,
  };

  const elements: ReportElement[] = [];
  for (const rawElement of elementsRaw) {
    const sectionGuess =
      rawElement && typeof rawElement === "object"
        ? (rawElement as Record<string, unknown>).section
        : null;
    const section =
      typeof sectionGuess === "string" && REPORT_SECTIONS.includes(sectionGuess as ReportSection)
        ? (sectionGuess as ReportSection)
        : "detail";
    const parsed = parseReportElement(rawElement, bandHeightBySection[section]);
    if (!parsed) return null;
    elements.push(parsed);
  }

  return {
    header,
    groupHeader,
    detail,
    groupFooter,
    footer,
    grouping: {
      enabled: groupingEnabled,
      field: groupingField,
      sort: groupingSort,
      granularity,
      dateFormat,
    },
    filters: parseFilters(obj.filters),
    elements,
  };
}

function parseRenderPdfBody(body: unknown): RenderPdfBody | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "report";
  const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];
  if (rowsRaw.length === 0 || rowsRaw.length > MAX_PDF_ROWS) return null;

  const rows: Record<string, unknown>[] = [];
  for (const row of rowsRaw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    rows.push(row as Record<string, unknown>);
  }

  const layout = parseReportLayout(obj.layout);
  if (!layout) return null;

  return {
    title: title || "report",
    rows,
    layout,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateValue(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function isoWeekParts(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function formatDateBucket(date: Date, format: string): string {
  const calendarYear = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const { year: isoYear, week } = isoWeekParts(date);
  const quarter = Math.ceil(month / 3);

  // Use ISO year for YYYY when format contains WW (week grouping).
  const year = format.includes("WW") ? isoYear : calendarYear;

  return format
    .replace(/YYYY/g, String(year))
    .replace(/WW/g, pad2(week))
    .replace(/MM/g, pad2(month))
    .replace(/DD/g, pad2(day))
    .replace(/q/g, String(quarter));
}

function bucketGroupKey(
  value: unknown,
  granularity: GroupGranularity,
  dateFormat?: string,
): string {
  const date = toDateValue(value);
  if (!date) return toSafeText(value);
  const fmt = (dateFormat ?? "").trim() || defaultDateFormat(granularity);
  return formatDateBucket(date, fmt);
}

function compareGroupValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const da = toDateValue(a);
  const db = toDateValue(b);
  if (da && db) return da.getTime() - db.getTime();
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function inferColumnType(value: unknown): ColumnType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (toDateValue(value)) return "date";
  return "text";
}

function coerceComparable(
  value: unknown,
  type: ColumnType,
): { kind: "number" | "date" | "text"; value: number | string } | null {
  if (value == null || value === "") return null;
  if (type === "number") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return null;
    return { kind: "number", value: n };
  }
  if (type === "date") {
    const d = toDateValue(value);
    if (!d) return null;
    return { kind: "date", value: d.getTime() };
  }
  return { kind: "text", value: toSafeText(value).toLowerCase() };
}

function matchFilter(
  row: Record<string, unknown>,
  filter: ReportFilter,
  columnTypes?: Record<string, ColumnType>,
): boolean {
  const raw = row[filter.field];
  const type = columnTypes?.[filter.field] ?? inferColumnType(raw);

  if (filter.op === "empty") {
    return raw == null || toSafeText(raw) === "";
  }
  if (filter.op === "notEmpty") {
    return raw != null && toSafeText(raw) !== "";
  }
  if (filter.op === "contains") {
    return toSafeText(raw).toLowerCase().includes(filter.value.toLowerCase());
  }

  const left = coerceComparable(raw, type);
  const right = coerceComparable(filter.value, type);
  if (!left || !right || left.kind !== right.kind) {
    const ls = toSafeText(raw).toLowerCase();
    const rs = filter.value.toLowerCase();
    if (filter.op === "eq") return ls === rs;
    if (filter.op === "neq") return ls !== rs;
    return false;
  }

  const cmp =
    left.kind === "text"
      ? String(left.value).localeCompare(String(right.value))
      : (left.value as number) - (right.value as number);

  switch (filter.op) {
    case "eq":
      return cmp === 0;
    case "neq":
      return cmp !== 0;
    case "gt":
      return cmp > 0;
    case "lt":
      return cmp < 0;
    case "gte":
      return cmp >= 0;
    case "lte":
      return cmp <= 0;
    default:
      return true;
  }
}

function applyFilters(
  rows: Record<string, unknown>[],
  filters: ReportFilter[],
  columnTypes?: Record<string, ColumnType>,
): Record<string, unknown>[] {
  if (!filters.length) return rows;
  return rows.filter((row) => filters.every((filter) => matchFilter(row, filter, columnTypes)));
}

function buildGroups(
  rows: Record<string, unknown>[],
  grouping: ReportLayout["grouping"],
): RowGroup[] {
  if (!grouping.enabled || !grouping.field) {
    return [{ key: "", rows: [...rows] }];
  }

  const field = grouping.field;
  const granularity = grouping.granularity ?? "day";
  const dateFormat = grouping.dateFormat || defaultDateFormat(granularity);
  const sorted = [...rows].sort((left, right) => {
    const leftKey = bucketGroupKey(left[field], granularity, dateFormat);
    const rightKey = bucketGroupKey(right[field], granularity, dateFormat);
    const cmp = leftKey.localeCompare(rightKey, undefined, { numeric: true, sensitivity: "base" });
    if (cmp !== 0) return grouping.sort === "desc" ? -cmp : cmp;
    const rawCmp = compareGroupValues(left[field], right[field]);
    return grouping.sort === "desc" ? -rawCmp : rawCmp;
  });

  const groups: RowGroup[] = [];
  for (const row of sorted) {
    const key = bucketGroupKey(row[field], granularity, dateFormat);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
    } else {
      groups.push({ key, rows: [row] });
    }
  }
  return groups;
}

function formatAggregate(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function buildGroupAggregates(
  groupRows: Record<string, unknown>[],
  allRows: Record<string, unknown>[],
): Record<string, string> {
  const extras: Record<string, string> = {};
  const numericFields = new Set<string>();
  for (const row of allRows) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "number" && Number.isFinite(value)) numericFields.add(key);
      else if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        // only count as numeric if majority of sample look numeric — skip string-looking fields
      }
    }
  }
  // Prefer fields that are numeric on at least one group row
  for (const row of groupRows) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "number" && Number.isFinite(value)) numericFields.add(key);
    }
  }

  for (const field of numericFields) {
    let sum = 0;
    let count = 0;
    for (const row of groupRows) {
      const raw = row[field];
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) continue;
      sum += n;
      count += 1;
    }
    extras[`_groupSum_${field}`] = formatAggregate(sum);
    extras[`_groupAvg_${field}`] = count > 0 ? formatAggregate(sum / count) : "";
  }
  return extras;
}

async function renderCodeImage(
  kind: "qr" | "barcode",
  value: string,
  width: number,
  height: number,
): Promise<Buffer | null> {
  const text = value.trim();
  if (!text) return null;
  try {
    if (kind === "qr") {
      return await QRCode.toBuffer(text, {
        type: "png",
        width: Math.max(width, 32),
        margin: 1,
        errorCorrectionLevel: "M",
      });
    }
    return await bwipjs.toBuffer({
      bcid: "code128",
      text,
      scale: 2,
      height: Math.max(8, Math.round(height / 3)),
      includetext: false,
    });
  } catch {
    return null;
  }
}

async function drawElements(
  doc: InstanceType<typeof PDFDocument>,
  elements: ReportElement[],
  row: Record<string, unknown>,
  offsetY: number,
  extras: Record<string, string> = {},
) {
  for (const element of elements) {
    const top = offsetY + element.y;
    if (element.kind === "qr" || element.kind === "barcode") {
      const raw = element.sourceField ? row[element.sourceField] : "";
      let value = toSafeText(raw);
      if (element.dateFormat.trim()) {
        const date = toDateValue(raw);
        if (date) value = formatDateBucket(date, element.dateFormat.trim());
      }
      const image = await renderCodeImage(element.kind, value, element.width, element.height);
      if (image) {
        doc.image(image, element.x, top, {
          width: element.width,
          height: element.height,
          fit: [element.width, element.height],
        });
      }
      continue;
    }

    const value = applyTemplate(element.text, row, extras, element.dateFormat);
    doc.font(resolveFont(element.bold, element.italic));
    doc.fontSize(element.fontSize);
    doc.text(value, element.x, top, {
      width: element.width,
      align: element.align,
      underline: element.underline,
    });
  }
}

async function renderReportPdf(payload: RenderPdfBody): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    autoFirstPage: false,
    compress: true,
    info: {
      Title: payload.title,
      Author: "Athene CMMS Report Designer",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const { header, groupHeader, detail, groupFooter, footer, grouping, filters, elements } =
    payload.layout;
  const bySection = (section: ReportSection) =>
    elements.filter((element) => element.section === section);

  const headerElements = bySection("header");
  const groupHeaderElements = bySection("groupHeader");
  const detailElements = bySection("detail");
  const groupFooterElements = bySection("groupFooter");
  const footerElements = bySection("footer");
  const filteredRows = applyFilters(payload.rows, filters ?? []);
  const headerRow = filteredRows[0] ?? payload.rows[0] ?? {};
  const groups = buildGroups(filteredRows, grouping);

  let pageIndex = 0;
  let cursorY = 0;
  let contentBottom = PAGE_HEIGHT;

  const pageExtras = (): Record<string, string> => ({
    _pageNumber: String(pageIndex),
  });

  const drawPageFooter = async () => {
    if (footer.height <= 0 || footerElements.length === 0) return;
    await drawElements(doc, footerElements, headerRow, PAGE_HEIGHT - footer.height, pageExtras());
  };

  const startPage = async () => {
    if (pageIndex > 0) {
      await drawPageFooter();
    }
    doc.addPage({ size: "A4", margin: 0 });
    pageIndex += 1;
    contentBottom = PAGE_HEIGHT - footer.height;
    const showHeader = !(header.firstPageOnly && pageIndex > 1);
    if (showHeader) {
      await drawElements(doc, headerElements, headerRow, 0, pageExtras());
      cursorY = header.height;
    } else {
      cursorY = 0;
    }
  };

  const ensureSpace = async (needed: number) => {
    if (cursorY + needed > contentBottom) {
      await startPage();
    }
  };

  await startPage();

  for (const group of groups) {
    const groupExtras: Record<string, string> = {
      ...pageExtras(),
      _groupValue: group.key,
      _groupCount: String(group.rows.length),
      ...buildGroupAggregates(group.rows, filteredRows),
    };

    if (grouping.enabled) {
      await ensureSpace(groupHeader.height);
      await drawElements(doc, groupHeaderElements, group.rows[0] ?? {}, cursorY, {
        ...groupExtras,
        ...pageExtras(),
      });
      cursorY += groupHeader.height;
    }

    for (const row of group.rows) {
      await ensureSpace(detail.height);
      await drawElements(doc, detailElements, row, cursorY, {
        ...groupExtras,
        ...pageExtras(),
      });
      cursorY += detail.height;
    }

    if (grouping.enabled) {
      await ensureSpace(groupFooter.height);
      await drawElements(doc, groupFooterElements, group.rows[0] ?? {}, cursorY, {
        ...groupExtras,
        ...pageExtras(),
      });
      cursorY += groupFooter.height;
    }
  }

  await drawPageFooter();
  doc.end();
  return done;
}

async function runReportQuery(
  sql: string,
  recordId: string | null,
  limit: number,
): Promise<{ rows: Record<string, unknown>[]; fields: { name: string; dataTypeID: number }[] }> {
  const bound = bindRecordId(sql, recordId);
  if ("error" in bound) {
    throw new Error(bound.error);
  }
  const limitParamIndex = bound.params.length + 1;
  const result = await pool.query<Record<string, unknown>>(
    `
    SELECT * FROM (
      ${bound.sql}
    ) report_designer_query
    LIMIT $${limitParamIndex}
    `,
    [...bound.params, limit],
  );
  return { rows: result.rows, fields: result.fields };
}

router.post("/query-preview", async (req: Request, res: Response) => {
  const parsed = parseQueryPreviewBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_query" });
    return;
  }
  try {
    const { rows, fields } = await runReportQuery(parsed.sql, parsed.recordId, parsed.limit);
    res.json({
      columns: fields.map((field) => field.name),
      columnTypes: Object.fromEntries(
        fields.map((field) => [field.name, pgTypeCategory(field.dataTypeID)]),
      ),
      rows,
      rowCount: rows.length,
      limit: parsed.limit,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "query_failed" });
  }
});

router.post("/render-pdf", async (req: Request, res: Response) => {
  const payload = parseRenderPdfBody(req.body);
  if (!payload) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const pdf = await renderReportPdf(payload);
    const baseFileName = payload.title.toLowerCase().replace(/[^a-z0-9-_]+/g, "-") || "report";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${baseFileName}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "pdf_render_failed" });
  }
});

router.get("/definitions", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const siteIdRaw = typeof req.query.siteId === "string" ? req.query.siteId.trim() : "";
  const targetAppKeyRaw =
    typeof req.query.targetAppKey === "string" ? req.query.targetAppKey.trim() : "";
  if (targetAppKeyRaw && !ALLOWED_TARGET_APP_KEYS.has(targetAppKeyRaw)) {
    res.status(400).json({ error: "invalid_targetAppKey" });
    return;
  }
  try {
    const params: unknown[] = [userId];
    let where = `WHERE ${siteAccessSql('d."siteId"', "$1")}`;
    if (siteIdRaw) {
      if (!isUuid(siteIdRaw)) {
        res.status(400).json({ error: "invalid_siteId" });
        return;
      }
      params.push(siteIdRaw);
      where += ` AND d."siteId" = $${params.length}::uuid`;
    }
    if (targetAppKeyRaw) {
      params.push(targetAppKeyRaw);
      where += ` AND d."targetAppKey" = $${params.length}`;
    }
    const result = await pool.query<ReportDefinitionRow>(
      `
      ${definitionSelectSql}
      ${where}
      ORDER BY d."name" ASC
      `,
      params,
    );
    res.json({ items: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/definitions/:id", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const result = await pool.query<ReportDefinitionRow>(
      `
      ${definitionSelectSql}
      WHERE d."id" = $2::uuid
        AND ${siteAccessSql('d."siteId"', "$1")}
      `,
      [userId, id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/definitions", async (req: Request, res: Response) => {
  const parsed = parseDefinitionBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    await assertSiteAccess(pool, meta.userId, parsed.siteId);
    const result = await withAuditContext(meta, async (client) => {
      return client.query<ReportDefinitionRow>(
        `
        WITH inserted AS (
          INSERT INTO "reportDefinition" ("key", "name", "siteId", "targetAppKey", "sql", "layout", "createdBy")
          VALUES ($1, $2, $3::uuid, $4, $5, $6::jsonb, $7::uuid)
          RETURNING *
        )
        SELECT
          d."id",
          d."key",
          d."name",
          d."siteId",
          s."key" AS "siteKey",
          s."name" AS "siteName",
          d."targetAppKey",
          d."sql",
          d."layout",
          d."createdAt",
          d."updatedAt",
          COALESCE(u."loginName", d."createdBy"::text) AS "createdBy"
        FROM inserted d
        JOIN "site" s ON s."id" = d."siteId"
        LEFT JOIN "users" u ON u."id" = d."createdBy"
        `,
        [
          parsed.key,
          parsed.name,
          parsed.siteId,
          parsed.targetAppKey,
          parsed.sql,
          JSON.stringify(parsed.layout),
          meta.userId,
        ],
      );
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.put("/definitions/:id", async (req: Request, res: Response) => {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = parseDefinitionBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const result = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string; siteId: string }>(
        `
        SELECT d."id", d."siteId"::text AS "siteId"
        FROM "reportDefinition" d
        WHERE d."id" = $1::uuid
          AND ${siteAccessSql('d."siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (existing.rows.length === 0) return null;
      await assertSiteAccess(client, meta.userId, parsed.siteId);
      return client.query<ReportDefinitionRow>(
        `
        WITH updated AS (
          UPDATE "reportDefinition"
          SET
            "key" = $2,
            "name" = $3,
            "siteId" = $4::uuid,
            "targetAppKey" = $5,
            "sql" = $6,
            "layout" = $7::jsonb
          WHERE "id" = $1::uuid
          RETURNING *
        )
        SELECT
          d."id",
          d."key",
          d."name",
          d."siteId",
          s."key" AS "siteKey",
          s."name" AS "siteName",
          d."targetAppKey",
          d."sql",
          d."layout",
          d."createdAt",
          d."updatedAt",
          COALESCE(u."loginName", d."createdBy"::text) AS "createdBy"
        FROM updated d
        JOIN "site" s ON s."id" = d."siteId"
        LEFT JOIN "users" u ON u."id" = d."createdBy"
        `,
        [
          id,
          parsed.key,
          parsed.name,
          parsed.siteId,
          parsed.targetAppKey,
          parsed.sql,
          JSON.stringify(parsed.layout),
        ],
      );
    });
    if (!result || result.rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.delete("/definitions/:id", async (req: Request, res: Response) => {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const result = await withAuditContext(meta, async (client) => {
      return client.query(
        `
        DELETE FROM "reportDefinition"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        RETURNING "id"
        `,
        [id, meta.userId],
      );
    });
    if (result.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/render-saved", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!req.body || typeof req.body !== "object") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const obj = req.body as Record<string, unknown>;
  const definitionId = typeof obj.definitionId === "string" ? obj.definitionId.trim() : "";
  if (!isUuid(definitionId)) {
    res.status(400).json({ error: "invalid_definitionId" });
    return;
  }
  const recordId = parseRecordId(obj.recordId);
  if (recordId === undefined) {
    res.status(400).json({ error: "invalid_recordId" });
    return;
  }
  const titleOverride =
    typeof obj.title === "string" ? obj.title.trim().slice(0, MAX_NAME_LENGTH) : "";

  try {
    const defResult = await pool.query<{
      name: string;
      sql: string;
      layout: unknown;
      targetAppKey: string;
      siteId: string;
    }>(
      `
      SELECT d."name", d."sql", d."layout", d."targetAppKey", d."siteId"::text AS "siteId"
      FROM "reportDefinition" d
      WHERE d."id" = $2::uuid
        AND ${siteAccessSql('d."siteId"', "$1")}
      `,
      [userId, definitionId],
    );
    if (defResult.rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const def = defResult.rows[0];
    const layout = parseReportLayout(def.layout);
    if (!layout) {
      res.status(400).json({ error: "invalid_layout" });
      return;
    }
    if (def.targetAppKey && recordId == null) {
      res.status(400).json({ error: "recordId_required" });
      return;
    }
    const { rows } = await runReportQuery(def.sql, recordId, MAX_PDF_ROWS);
    const title = titleOverride || def.name || "report";
    const pdf = await renderReportPdf({ title, rows, layout });
    const baseFileName = title.toLowerCase().replace(/[^a-z0-9-_]+/g, "-") || "report";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${baseFileName}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "pdf_render_failed" });
  }
});

export const reportDesignerRouter = router;

/** Test helpers (used by local smoke checks). */
export const __test__ = {
  parseReportLayout,
  parseRenderPdfBody,
  buildGroups,
  applyFilters,
  bucketGroupKey,
  defaultDateFormat,
  formatDateBucket,
  buildGroupAggregates,
  pgTypeCategory,
  renderReportPdf,
  bindRecordId,
  hasRecordIdPlaceholder,
};
