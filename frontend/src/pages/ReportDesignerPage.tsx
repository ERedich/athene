import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  ArrowRight,
  ArrowUpAZ,
  Bold,
  Download,
  Filter,
  FolderOpen,
  Italic,
  Plus,
  QrCode,
  Save,
  ScanBarcode,
  Sparkles,
  Trash2,
  Type,
  Underline,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Toast } from "primereact/toast";

import { useAuth } from "../auth/AuthContext";
import { AppDialog } from "../components/AppDialog";
import { ReportCodePreview } from "../components/ReportCodePreview";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";

type Step = 1 | 2;
type ReportSection = "header" | "groupHeader" | "detail" | "groupFooter" | "footer";
type ColumnType = "date" | "number" | "text" | "boolean";
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

type QueryPreviewResponse = {
  columns: string[];
  columnTypes?: Record<string, ColumnType>;
  rows: Record<string, unknown>[];
  rowCount: number;
};

const TARGET_APP_OPTIONS = [
  { value: "", labelKey: "reportDesigner.targetAppNone" },
  { value: "assets", labelKey: "reportDesigner.targetAppAssets" },
] as const;

const RECORD_ID_TOKEN = "{{recordId}}";
const RECORD_FILTER_SNIPPET = `WHERE "id" = ${RECORD_ID_TOKEN}`;

function slugifyReportKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

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

type ReportDefinitionListItem = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  targetAppKey: string;
  sql: string;
  layout: ReportLayout;
};

type BandMeta = {
  section: ReportSection;
  labelKey: string;
  shortKey: string;
  tint: string;
  tintStrong: string;
  dropTint: string;
  resizeTint: string;
  labelTint: string;
};

const a4Size = { width: 595, height: 842 };
const BAND_GUTTER_WIDTH = 148;
const MIN_BAND_HEIGHT = 16;
const MAX_BAND_HEIGHT = 400;
const FIELD_DND_MIME = "application/x-report-field";
const POOL_DND_MIME = "application/x-report-pool-item";
const GRID_SIZES = [5, 10, 20] as const;
type GridSize = (typeof GRID_SIZES)[number];

const BAND_META: BandMeta[] = [
  {
    section: "header",
    labelKey: "reportDesigner.headerSection",
    shortKey: "reportDesigner.headerShort",
    tint: "bg-sky-50/50",
    tintStrong: "bg-sky-100/70",
    dropTint: "bg-sky-100/80",
    resizeTint: "bg-sky-400/50 hover:bg-sky-500",
    labelTint: "bg-sky-200/80 text-sky-900",
  },
  {
    section: "groupHeader",
    labelKey: "reportDesigner.groupHeaderSection",
    shortKey: "reportDesigner.groupHeaderShort",
    tint: "bg-violet-50/50",
    tintStrong: "bg-violet-100/70",
    dropTint: "bg-violet-100/80",
    resizeTint: "bg-violet-400/50 hover:bg-violet-500",
    labelTint: "bg-violet-200/80 text-violet-900",
  },
  {
    section: "detail",
    labelKey: "reportDesigner.detailSection",
    shortKey: "reportDesigner.detailShort",
    tint: "bg-amber-50/40",
    tintStrong: "bg-amber-100/60",
    dropTint: "bg-amber-100/70",
    resizeTint: "bg-amber-400/50 hover:bg-amber-500",
    labelTint: "bg-amber-200/80 text-amber-900",
  },
  {
    section: "groupFooter",
    labelKey: "reportDesigner.groupFooterSection",
    shortKey: "reportDesigner.groupFooterShort",
    tint: "bg-fuchsia-50/40",
    tintStrong: "bg-fuchsia-100/60",
    dropTint: "bg-fuchsia-100/70",
    resizeTint: "bg-fuchsia-400/50 hover:bg-fuchsia-500",
    labelTint: "bg-fuchsia-200/80 text-fuchsia-900",
  },
  {
    section: "footer",
    labelKey: "reportDesigner.footerSection",
    shortKey: "reportDesigner.footerShort",
    tint: "bg-slate-50/60",
    tintStrong: "bg-slate-100/80",
    dropTint: "bg-slate-100/90",
    resizeTint: "bg-slate-400/50 hover:bg-slate-500",
    labelTint: "bg-slate-200/80 text-slate-800",
  },
];

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const selectedActionNavItem = `${actionNavItem} bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]`;
const toolbarBtn =
  "inline-flex !h-9 !w-9 !min-w-9 shrink-0 items-center justify-center !rounded-sm !border-0 !p-0 text-on-surface-variant transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const toolbarBtnActive =
  "bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]";
const ribbonAction =
  "inline-flex !h-9 shrink-0 items-center gap-1.5 !rounded-sm px-2 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const ribbonCreateAction = `${ribbonAction} hover:bg-green-500/10 hover:text-green-500`;
const ribbonDeleteAction = `${ribbonAction} hover:bg-red-500/10`;
const ribbonGroup =
  "flex shrink-0 flex-col justify-start gap-1.5 border-r border-outline-variant px-2.5 py-3.5";
const ribbonTools = "flex h-9 items-center gap-0.5";
const ribbonLabel =
  "text-[10px] font-semibold uppercase leading-none tracking-wider text-on-surface-variant";
const ribbonIconClass = "h-5 w-5 shrink-0";
const ribbonIconStroke = 2;
const ribbonSelect =
  "h-9 w-[4.75rem] shrink-0 rounded-sm border border-outline-variant bg-surface px-1.5 text-xs text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-45 focus-visible:border-primary";
const fieldSelect =
  "h-9 w-full rounded-sm border border-outline-variant bg-surface px-1.5 text-xs text-on-surface outline-none disabled:cursor-not-allowed disabled:opacity-45 focus-visible:border-primary";
const fieldLabel = "text-[10px] font-semibold uppercase leading-none tracking-wider text-on-surface-variant";
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 48;
const FONT_SIZE_OPTIONS = Array.from(
  { length: FONT_SIZE_MAX - FONT_SIZE_MIN + 1 },
  (_, index) => {
    const size = FONT_SIZE_MIN + index;
    return { label: `${size} pt`, value: size };
  },
);
const panelBand =
  "flex min-h-0 flex-col overflow-auto border border-outline-variant bg-surface-container-low";

function snapValue(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled || gridSize <= 0) return Math.round(value);
  return Math.round(value / gridSize) * gridSize;
}

function toPreviewText(value: unknown): string {
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
  template: string,
  row: Record<string, unknown>,
  extras: Record<string, string> = {},
  dateFormat = "",
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(extras, key)) return extras[key] ?? "";
    const raw = row[key];
    if (dateFormat.trim()) {
      const date = toDateValue(raw);
      if (date) return formatDateBucket(date, dateFormat.trim());
    }
    return toPreviewText(raw);
  });
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

function formatDateBucket(date: Date, format: string): string {
  const calendarYear = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const { year: isoYear, week } = isoWeekParts(date);
  const quarter = Math.ceil(month / 3);
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
  if (!date) return toPreviewText(value);
  const fmt = (dateFormat ?? "").trim() || defaultDateFormat(granularity);
  return formatDateBucket(date, fmt);
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
  return { kind: "text", value: toPreviewText(value).toLowerCase() };
}

function matchFilter(
  row: Record<string, unknown>,
  filter: ReportFilter,
  columnTypes?: Record<string, ColumnType>,
): boolean {
  const raw = row[filter.field];
  const type = columnTypes?.[filter.field] ?? inferColumnType(raw);

  if (filter.op === "empty") return raw == null || toPreviewText(raw) === "";
  if (filter.op === "notEmpty") return raw != null && toPreviewText(raw) !== "";
  if (filter.op === "contains") {
    return toPreviewText(raw).toLowerCase().includes(filter.value.toLowerCase());
  }

  const left = coerceComparable(raw, type);
  const right = coerceComparable(filter.value, type);
  if (!left || !right || left.kind !== right.kind) {
    const ls = toPreviewText(raw).toLowerCase();
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

function formatAggregate(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function buildGroupAggregates(
  groupRows: Record<string, unknown>[],
  numberFields: string[],
): Record<string, string> {
  const extras: Record<string, string> = {};
  for (const field of numberFields) {
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

function createDefaultLayout(): ReportLayout {
  const textDefaults = {
    height: 16,
    kind: "text" as const,
    sourceField: "",
    dateFormat: "",
  };
  return {
    header: { height: 72, firstPageOnly: false },
    groupHeader: { height: 28 },
    detail: { height: 32 },
    groupFooter: { height: 24 },
    footer: { height: 28 },
    grouping: { enabled: false, field: "", sort: "asc", granularity: "day", dateFormat: "YYYY-MM-DD" },
    filters: [],
    elements: [
      {
        id: crypto.randomUUID(),
        section: "header",
        text: "Report",
        x: 40,
        y: 22,
        width: 500,
        fontSize: 18,
        align: "left",
        bold: true,
        italic: false,
        underline: false,
        ...textDefaults,
      },
      {
        id: crypto.randomUUID(),
        section: "groupHeader",
        text: "{{_groupValue}}",
        x: 40,
        y: 6,
        width: 320,
        fontSize: 12,
        align: "left",
        bold: true,
        italic: false,
        underline: false,
        ...textDefaults,
      },
      {
        id: crypto.randomUUID(),
        section: "detail",
        text: "{{name}}",
        x: 40,
        y: 8,
        width: 240,
        fontSize: 12,
        align: "left",
        bold: false,
        italic: false,
        underline: false,
        ...textDefaults,
      },
      {
        id: crypto.randomUUID(),
        section: "groupFooter",
        text: "{{_groupCount}} rows",
        x: 40,
        y: 4,
        width: 200,
        fontSize: 10,
        align: "left",
        bold: false,
        italic: true,
        underline: false,
        ...textDefaults,
      },
      {
        id: crypto.randomUUID(),
        section: "footer",
        text: "Page {{_pageNumber}}",
        x: 40,
        y: 6,
        width: 200,
        fontSize: 10,
        align: "left",
        bold: false,
        italic: false,
        underline: false,
        ...textDefaults,
      },
    ],
  };
}

function createElement(
  section: ReportSection,
  patch: Partial<ReportElement> = {},
): ReportElement {
  const kind = patch.kind ?? "text";
  return {
    id: crypto.randomUUID(),
    section,
    text: patch.text ?? (kind === "qr" ? "QR" : kind === "barcode" ? "Barcode" : "Text"),
    x: patch.x ?? 40,
    y: patch.y ?? 6,
    width: patch.width ?? (kind === "qr" ? 72 : kind === "barcode" ? 160 : 200),
    height: patch.height ?? (kind === "qr" ? 72 : kind === "barcode" ? 40 : 16),
    fontSize: patch.fontSize ?? 12,
    align: patch.align ?? "left",
    bold: patch.bold ?? false,
    italic: patch.italic ?? false,
    underline: patch.underline ?? false,
    kind,
    sourceField: patch.sourceField ?? "",
    dateFormat: patch.dateFormat ?? "",
  };
}

function boundFieldFromText(text: string): string | null {
  const match = text.trim().match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/);
  return match?.[1] ?? null;
}

function isDateBoundElement(
  element: ReportElement,
  columnTypes: Record<string, ColumnType>,
): boolean {
  if (element.kind === "qr" || element.kind === "barcode") {
    return Boolean(element.sourceField && columnTypes[element.sourceField] === "date");
  }
  const field = boundFieldFromText(element.text);
  return Boolean(field && columnTypes[field] === "date");
}

function resolveCodeValue(
  element: ReportElement,
  row: Record<string, unknown> | null,
): string {
  if (!element.sourceField.trim() || !row) return "";
  const raw = row[element.sourceField];
  if (element.dateFormat.trim()) {
    const date = toDateValue(raw);
    if (date) return formatDateBucket(date, element.dateFormat.trim());
  }
  return toPreviewText(raw);
}

type PoolDragItem =
  | { type: "field"; name: string }
  | { type: "token"; token: string }
  | { type: "text" }
  | { type: "qr" }
  | { type: "barcode" };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function bandHeightOf(layout: ReportLayout, section: ReportSection): number {
  switch (section) {
    case "header":
      return layout.header.height;
    case "groupHeader":
      return layout.groupHeader.height;
    case "detail":
      return layout.detail.height;
    case "groupFooter":
      return layout.groupFooter.height;
    case "footer":
      return layout.footer.height;
  }
}

function defaultTextForSection(section: ReportSection): string {
  switch (section) {
    case "header":
      return "Report";
    case "groupHeader":
      return "{{_groupValue}}";
    case "detail":
      return "{{name}}";
    case "groupFooter":
      return "{{_groupCount}}";
    case "footer":
      return "Page {{_pageNumber}}";
  }
}

export function ReportDesignerPage() {
  const { t } = useTranslation();
  const toastRef = useRef<Toast>(null);
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [query, setQuery] = useState(
    `SELECT "key", "name" FROM "asset" ${RECORD_FILTER_SNIPPET}`,
  );
  const [queryLimit, setQueryLimit] = useState(50);
  const [queryLoading, setQueryLoading] = useState(false);
  const [reportTitle, setReportTitle] = useState("report-designer");
  const [reportKey, setReportKey] = useState("report-designer");
  const [targetAppKey, setTargetAppKey] = useState("");
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  const [previewRecordId, setPreviewRecordId] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [savedReports, setSavedReports] = useState<ReportDefinitionListItem[]>([]);
  const [savedReportsLoading, setSavedReportsLoading] = useState(false);
  const [preview, setPreview] = useState<QueryPreviewResponse | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<ReportSection>("header");
  const [layout, setLayout] = useState<ReportLayout>(createDefaultLayout);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [dropTarget, setDropTarget] = useState<ReportSection | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState<GridSize>(10);
  const [showPreview, setShowPreview] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [poolTab, setPoolTab] = useState<"tools" | "fields">("tools");

  const selectedElement = useMemo(
    () => layout.elements.find((element) => element.id === selectedElementId) ?? null,
    [layout.elements, selectedElementId],
  );
  const selectedIsText = !selectedElement || selectedElement.kind === "text";
  const selectedIsCode =
    selectedElement?.kind === "qr" || selectedElement?.kind === "barcode";

  const visibleBands = useMemo(() => {
    return BAND_META.filter((band) => {
      if (band.section === "groupHeader" || band.section === "groupFooter") {
        return layout.grouping.enabled;
      }
      return true;
    });
  }, [layout.grouping.enabled]);

  const columnTypes = preview?.columnTypes ?? {};
  const selectedIsDateBound = selectedElement
    ? isDateBoundElement(selectedElement, columnTypes)
    : false;

  const fieldOptions = useMemo(
    () => (preview?.columns ?? []).map((column) => ({ label: column, value: column })),
    [preview?.columns],
  );

  const dateFields = useMemo(
    () => (preview?.columns ?? []).filter((col) => columnTypes[col] === "date"),
    [preview?.columns, columnTypes],
  );

  const numberFields = useMemo(
    () => (preview?.columns ?? []).filter((col) => columnTypes[col] === "number"),
    [preview?.columns, columnTypes],
  );

  const isGroupFieldDate = Boolean(
    layout.grouping.field && dateFields.includes(layout.grouping.field),
  );

  useEffect(() => {
    setHeaderRowCount(null);
    return () => setHeaderRowCount(null);
  }, [setHeaderRowCount]);

  const runPreview = useCallback(async () => {
    setQueryLoading(true);
    try {
      const recordId = previewRecordId.trim() || null;
      const res = await apiFetch("/api/report-designer/query-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: query, limit: queryLimit, recordId }),
      });
      if (!res.ok) {
        let detail = "";
        try {
          const errBody = (await res.json()) as { error?: string };
          if (errBody.error === "invalid_query") detail = t("reportDesigner.queryInvalid");
          else if (errBody.error === "query_failed") detail = t("reportDesigner.queryFailed");
        } catch {
          /* ignore */
        }
        if (!detail && (res.status === 401 || res.status === 403)) {
          detail = t("reportDesigner.queryAuthError");
        } else if (!detail && res.status === 404) {
          detail = t("reportDesigner.queryUnavailable");
        }
        throw new Error(detail || "query");
      }
      const data = (await res.json()) as QueryPreviewResponse;
      setPreview(data);
      if (data.columns[0] && !layout.grouping.field) {
        setLayout((current) => ({
          ...current,
          grouping: { ...current.grouping, field: data.columns[0] },
        }));
      }
      if (data.rows.length > 0) {
        setStep(2);
      }
    } catch (err) {
      const detail = err instanceof Error && err.message && err.message !== "query" ? err.message : "";
      toastRef.current?.show({
        severity: "error",
        summary: detail || t("reportDesigner.queryError"),
        life: 5000,
      });
    } finally {
      setQueryLoading(false);
    }
  }, [layout.grouping.field, previewRecordId, query, queryLimit, t]);

  const updateSelectedElement = (patch: Partial<ReportElement>) => {
    if (!selectedElementId) return;
    setLayout((current) => ({
      ...current,
      elements: current.elements.map((element) => {
        if (element.id !== selectedElementId) return element;
        const next = { ...element, ...patch };
        const bandHeight = bandHeightOf(current, next.section);
        if (patch.x != null) next.x = snapValue(next.x, gridSize, snapToGrid);
        if (patch.y != null) next.y = snapValue(next.y, gridSize, snapToGrid);
        if (patch.width != null) next.width = snapValue(next.width, gridSize, snapToGrid);
        next.x = clamp(next.x, 0, a4Size.width - 20);
        next.y = clamp(next.y, 0, Math.max(bandHeight - 8, 0));
        next.width = clamp(next.width, 20, 560);
        next.fontSize = clamp(next.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX);
        return next;
      }),
    }));
  };

  const setSelectedFontSize = (raw: number | null | undefined) => {
    if (raw == null || Number.isNaN(raw)) return;
    updateSelectedElement({ fontSize: clamp(Math.round(raw), FONT_SIZE_MIN, FONT_SIZE_MAX) });
  };

  const addElement = () => {
    const element = createElement(selectedSection, {
      text: defaultTextForSection(selectedSection),
      y: selectedSection === "header" ? 20 : 6,
      bold: selectedSection === "header" || selectedSection === "groupHeader",
      fontSize: selectedSection === "header" ? 16 : selectedSection === "footer" ? 10 : 12,
      width: selectedSection === "header" ? 500 : 220,
      italic: selectedSection === "groupFooter",
    });
    setLayout((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedElementId(element.id);
  };

  const removeSelectedElement = () => {
    if (!selectedElementId) return;
    setLayout((current) => {
      const nextElements = current.elements.filter((element) => element.id !== selectedElementId);
      const fallback =
        nextElements.length > 0
          ? nextElements
          : [
              createElement("header", {
                text: "Report",
                y: 22,
                width: 500,
                fontSize: 18,
                bold: true,
              }),
            ];
      setSelectedElementId(null);
      return { ...current, elements: fallback };
    });
  };

  useEffect(() => {
    if (step !== 2) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
        return;
      }

      if (event.key === "Escape") {
        if (!selectedElementId) return;
        event.preventDefault();
        setSelectedElementId(null);
        return;
      }

      if (event.key !== "Delete") return;
      if (!selectedElementId) return;
      event.preventDefault();
      setLayout((current) => {
        const nextElements = current.elements.filter((element) => element.id !== selectedElementId);
        const fallback =
          nextElements.length > 0
            ? nextElements
            : [
                createElement("header", {
                  text: "Report",
                  y: 22,
                  width: 500,
                  fontSize: 18,
                  bold: true,
                }),
              ];
        setSelectedElementId(null);
        return { ...current, elements: fallback };
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedElementId, step]);

  const insertRecordFilter = () => {
    if (query.includes(RECORD_ID_TOKEN)) {
      toastRef.current?.show({
        severity: "info",
        summary: t("reportDesigner.recordIdHint"),
        life: 3000,
      });
      return;
    }
    const trimmed = query.trim();
    const next = /\bwhere\b/i.test(trimmed)
      ? `${trimmed}\n  AND "id" = ${RECORD_ID_TOKEN}`
      : `${trimmed}\n${RECORD_FILTER_SNIPPET}`;
    setQuery(next);
  };

  const openLoadDialog = useCallback(async () => {
    setLoadDialogOpen(true);
    setSavedReportsLoading(true);
    try {
      const params = new URLSearchParams({ siteId: user.workingSiteId });
      const res = await apiFetch(`/api/report-designer/definitions?${params}`);
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as { items: ReportDefinitionListItem[] };
      setSavedReports(data.items ?? []);
    } catch {
      setSavedReports([]);
      toastRef.current?.show({
        severity: "error",
        summary: t("reportDesigner.loadError"),
        life: 4000,
      });
    } finally {
      setSavedReportsLoading(false);
    }
  }, [t, user.workingSiteId]);

  const applyLoadedReport = (item: ReportDefinitionListItem) => {
    setDefinitionId(item.id);
    setReportKey(item.key);
    setReportTitle(item.name);
    setTargetAppKey(item.targetAppKey || "");
    setQuery(item.sql);
    setLayout(item.layout);
    setPreview(null);
    setSelectedElementId(null);
    setStep(1);
    setLoadDialogOpen(false);
  };

  const saveReport = useCallback(async () => {
    const key = (reportKey.trim() || slugifyReportKey(reportTitle) || "report").slice(0, 100);
    const name = (reportTitle.trim() || key).slice(0, 200);
    if (targetAppKey && !query.includes(RECORD_ID_TOKEN)) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("reportDesigner.saveNeedTargetPlaceholder"),
        life: 4000,
      });
      return;
    }
    if (layout.grouping.enabled && !layout.grouping.field) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("reportDesigner.groupingFieldRequired"),
        life: 3000,
      });
      return;
    }
    setSaveLoading(true);
    try {
      const body = {
        key,
        name,
        siteId: user.workingSiteId,
        targetAppKey,
        sql: query,
        layout,
      };
      const res = await apiFetch(
        definitionId
          ? `/api/report-designer/definitions/${definitionId}`
          : "/api/report-designer/definitions",
        {
          method: definitionId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        let code = "";
        try {
          const errBody = (await res.json()) as { error?: string };
          code = errBody.error ?? "";
        } catch {
          /* ignore */
        }
        if (code === "duplicate_key") {
          throw new Error(t("reportDesigner.saveDuplicate"));
        }
        if (code === "invalid_body") {
          throw new Error(t("reportDesigner.saveInvalid"));
        }
        throw new Error(t("reportDesigner.saveError"));
      }
      const saved = (await res.json()) as ReportDefinitionListItem;
      setDefinitionId(saved.id);
      setReportKey(saved.key);
      setReportTitle(saved.name);
      toastRef.current?.show({
        severity: "success",
        summary: t("reportDesigner.saveReady"),
        life: 2500,
      });
    } catch (err) {
      toastRef.current?.show({
        severity: "error",
        summary: err instanceof Error ? err.message : t("reportDesigner.saveError"),
        life: 5000,
      });
    } finally {
      setSaveLoading(false);
    }
  }, [
    definitionId,
    layout,
    query,
    reportKey,
    reportTitle,
    t,
    targetAppKey,
    user.workingSiteId,
  ]);

  const downloadPdf = useCallback(async () => {
    if (!preview || preview.rows.length === 0) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("reportDesigner.noRows"),
        life: 3000,
      });
      return;
    }
    if (layout.grouping.enabled && !layout.grouping.field) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("reportDesigner.groupingFieldRequired"),
        life: 3000,
      });
      return;
    }
    setPdfLoading(true);
    try {
      const res = await apiFetch("/api/report-designer/render-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: reportTitle,
          rows: preview.rows,
          layout,
        }),
      });
      if (!res.ok) throw new Error("pdf");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${reportTitle || "report-designer"}.pdf`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toastRef.current?.show({
        severity: "success",
        summary: t("reportDesigner.pdfReady"),
        life: 2500,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("reportDesigner.pdfError"),
        life: 5000,
      });
    } finally {
      setPdfLoading(false);
    }
  }, [layout, preview, reportTitle, t]);

  const headerActionsNode = useMemo(
    () => (
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            onClick={() => setStep(1)}
            disabled={step === 1}
          >
            <span>1.</span>
            <span>{t("reportDesigner.stepQuery")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            onClick={() => setStep(2)}
            disabled={!preview}
          >
            <span>2.</span>
            <span>{t("reportDesigner.stepDesigner")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <button
            type="button"
            className={primaryActionNavItem}
            onClick={() => void openLoadDialog()}
            title={t("reportDesigner.load")}
          >
            <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
            <span>{t("reportDesigner.load")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={createActionNavItem}
            onClick={() => void saveReport()}
            disabled={saveLoading}
            title={t("reportDesigner.save")}
          >
            <Save className="h-4 w-4" strokeWidth={1.75} />
            <span>{saveLoading ? t("reportDesigner.saving") : t("reportDesigner.save")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={createActionNavItem}
            onClick={() => void runPreview()}
            disabled={queryLoading}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            <span>{queryLoading ? t("reportDesigner.loading") : t("reportDesigner.runQuery")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            onClick={() => void downloadPdf()}
            disabled={!preview || preview.rows.length === 0 || pdfLoading}
          >
            <Download className="h-4 w-4" strokeWidth={1.75} />
            <span>{pdfLoading ? t("reportDesigner.generatingPdf") : t("reportDesigner.generatePdf")}</span>
          </button>
        </li>
      </ul>
    ),
    [
      downloadPdf,
      openLoadDialog,
      pdfLoading,
      preview,
      queryLoading,
      runPreview,
      saveLoading,
      saveReport,
      step,
      t,
    ],
  );

  useEffect(() => {
    setHeaderActions(headerActionsNode);
    return () => setHeaderActions(null);
  }, [headerActionsNode, setHeaderActions]);

  useEffect(() => {
    if (selectedElementId && !layout.elements.some((element) => element.id === selectedElementId)) {
      setSelectedElementId(null);
    }
  }, [layout.elements, selectedElementId]);

  useEffect(() => {
    if (selectedElement) {
      setSelectedSection(selectedElement.section);
    }
  }, [selectedElement]);

  useEffect(() => {
    if (
      !layout.grouping.enabled &&
      (selectedSection === "groupHeader" || selectedSection === "groupFooter")
    ) {
      setSelectedSection("detail");
    }
    if (!layout.grouping.enabled) {
      setFilterPanelOpen(false);
    }
  }, [layout.grouping.enabled, selectedSection]);

  const setBandHeight = (section: ReportSection, height: number) => {
    const snapped = snapValue(height, gridSize, snapToGrid);
    const nextHeight = clamp(snapped, MIN_BAND_HEIGHT, MAX_BAND_HEIGHT);
    setLayout((current) => {
      const next = { ...current };
      if (section === "header") next.header = { ...current.header, height: nextHeight };
      else if (section === "groupHeader") next.groupHeader = { height: nextHeight };
      else if (section === "detail") next.detail = { height: nextHeight };
      else if (section === "groupFooter") next.groupFooter = { height: nextHeight };
      else next.footer = { height: nextHeight };

      next.elements = current.elements.map((element) =>
        element.section === section
          ? { ...element, y: clamp(element.y, 0, Math.max(nextHeight - 8, 0)) }
          : element,
      );
      return next;
    });
  };

  const startBandResize = (section: ReportSection, event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const origin = bandHeightOf(layout, section);

    const onMove = (moveEvent: MouseEvent) => {
      setBandHeight(section, origin + (moveEvent.clientY - startY));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const draggableHandlers = (element: ReportElement) => ({
    onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setSelectedElementId(element.id);
      setSelectedSection(element.section);
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = element.x;
      const originY = element.y;
      const bandHeight = bandHeightOf(layout, element.section);

      const onMove = (moveEvent: MouseEvent) => {
        const nextX = snapValue(originX + (moveEvent.clientX - startX), gridSize, snapToGrid);
        const nextY = snapValue(originY + (moveEvent.clientY - startY), gridSize, snapToGrid);
        setLayout((current) => ({
          ...current,
          elements: current.elements.map((entry) =>
            entry.id === element.id
              ? {
                  ...entry,
                  x: clamp(nextX, 0, a4Size.width - 20),
                  y: clamp(nextY, 0, Math.max(bandHeight - 8, 0)),
                }
              : entry,
          ),
        }));
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
  });

  const onFieldDragStart = (columnName: string, event: ReactDragEvent) => {
    event.dataTransfer.setData(FIELD_DND_MIME, columnName);
    event.dataTransfer.setData(POOL_DND_MIME, JSON.stringify({ type: "field", name: columnName }));
    event.dataTransfer.setData("text/plain", columnName);
    event.dataTransfer.effectAllowed = "copy";
  };

  const onPoolItemDragStart = (item: PoolDragItem, event: ReactDragEvent) => {
    event.dataTransfer.setData(POOL_DND_MIME, JSON.stringify(item));
    if (item.type === "field") {
      event.dataTransfer.setData(FIELD_DND_MIME, item.name);
      event.dataTransfer.setData("text/plain", item.name);
    } else if (item.type === "token") {
      event.dataTransfer.setData("text/plain", item.token);
    } else if (item.type === "qr") {
      event.dataTransfer.setData("text/plain", "QR");
    } else if (item.type === "barcode") {
      event.dataTransfer.setData("text/plain", "Barcode");
    } else {
      event.dataTransfer.setData("text/plain", "Text");
    }
    event.dataTransfer.effectAllowed = "copy";
  };

  const onBandDragOver = (section: ReportSection, event: ReactDragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropTarget(section);
  };

  const onBandDragLeave = (section: ReportSection) => {
    setDropTarget((current) => (current === section ? null : current));
  };

  const onBandDrop = (section: ReportSection, event: ReactDragEvent) => {
    event.preventDefault();
    setDropTarget(null);

    let text = "";
    let width = 220;
    let height: number | undefined;
    let kind: ReportElementKind = "text";
    let bold = section === "header" || section === "groupHeader";
    let italic = false;
    let fontSize = section === "header" ? 14 : section === "footer" ? 10 : 12;

    const poolRaw = event.dataTransfer.getData(POOL_DND_MIME);
    if (poolRaw) {
      try {
        const item = JSON.parse(poolRaw) as PoolDragItem;
        if (item.type === "field") {
          text = `{{${item.name}}}`;
        } else if (item.type === "token") {
          text = item.token;
          width = item.token.includes("page") ? 140 : 180;
          italic = item.token.includes("Count");
        } else if (item.type === "qr") {
          kind = "qr";
          text = "QR";
          width = 72;
          height = 72;
          bold = false;
          fontSize = 10;
        } else if (item.type === "barcode") {
          kind = "barcode";
          text = "Barcode";
          width = 160;
          height = 40;
          bold = false;
          fontSize = 10;
        } else {
          text = "Text";
          width = 160;
        }
      } catch {
        /* fall through */
      }
    }
    if (!text && kind === "text") {
      const columnName =
        event.dataTransfer.getData(FIELD_DND_MIME) || event.dataTransfer.getData("text/plain");
      if (!columnName) return;
      text =
        columnName.startsWith("{{") || columnName === "Text" ? columnName : `{{${columnName}}}`;
    }
    if (!text && kind === "text") return;

    const bandEl = event.currentTarget as HTMLElement;
    const rect = bandEl.getBoundingClientRect();
    const bandHeight = bandHeightOf(layout, section);
    const x = clamp(
      snapValue(event.clientX - rect.left, gridSize, snapToGrid),
      0,
      a4Size.width - 20,
    );
    const y = clamp(
      snapValue(event.clientY - rect.top, gridSize, snapToGrid),
      0,
      Math.max(bandHeight - 8, 0),
    );

    const element = createElement(section, {
      text,
      x,
      y,
      width: Math.min(width, a4Size.width - x - 8),
      height,
      fontSize,
      bold,
      italic,
      kind,
    });
    setLayout((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedElementId(element.id);
    setSelectedSection(section);
  };

  const gridOverlayStyle = showGrid
    ? {
        backgroundImage: `
          linear-gradient(to right, rgba(100, 116, 139, 0.22) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(100, 116, 139, 0.22) 1px, transparent 1px)
        `,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: "0 0",
      }
    : undefined;

  const renderCodeElement = (element: ReportElement, row: Record<string, unknown> | null) => (
    <ReportCodePreview
      kind={element.kind === "barcode" ? "barcode" : "qr"}
      value={resolveCodeValue(element, row)}
      width={element.width}
      height={element.height}
      emptyLabel={
        element.sourceField.trim()
          ? element.sourceField
          : t("reportDesigner.sourceFieldPlaceholder")
      }
      kindLabel={
        element.kind === "qr" ? t("reportDesigner.poolQr") : t("reportDesigner.poolBarcode")
      }
    />
  );

  const renderElementButton = (
    element: ReportElement,
    row: Record<string, unknown> | null,
    extras: Record<string, string>,
  ) => (
    <button
      key={element.id}
      type="button"
      style={{
        position: "absolute",
        left: `${element.x}px`,
        top: `${element.y}px`,
        width: `${element.width}px`,
        height: element.kind === "text" ? undefined : `${element.height}px`,
        textAlign: element.align,
        fontSize: `${element.fontSize}px`,
        fontWeight: element.bold ? 700 : 400,
        fontStyle: element.italic ? "italic" : "normal",
        textDecoration: element.underline ? "underline" : "none",
        border: element.id === selectedElementId ? "1px dashed #f97316" : "1px dashed transparent",
        color: "#111827",
        background: "transparent",
        padding: element.kind === "text" ? "2px" : "0",
        cursor: "move",
      }}
      onClick={(event) => {
        event.stopPropagation();
        setSelectedElementId(element.id);
        setSelectedSection(element.section);
      }}
      {...draggableHandlers(element)}
    >
      {element.kind === "qr" || element.kind === "barcode"
        ? renderCodeElement(element, row)
        : row
          ? applyTemplate(element.text, row, extras, element.dateFormat)
          : element.text}
    </button>
  );

  const elementsFor = (section: ReportSection) =>
    layout.elements.filter((element) => element.section === section);

  const sectionLabel = (section: ReportSection) => {
    const meta = BAND_META.find((band) => band.section === section);
    return meta ? t(meta.labelKey) : section;
  };

  const designSampleRow = preview?.rows[0] ?? null;
  const designExtras = useMemo(() => {
    const field = layout.grouping.field;
    const raw = designSampleRow && field ? designSampleRow[field] : null;
    const groupValue =
      field && raw != null
        ? bucketGroupKey(raw, layout.grouping.granularity, layout.grouping.dateFormat)
        : t("reportDesigner.sampleGroup");
    const sampleRows = designSampleRow ? [designSampleRow] : [];
    return {
      _groupValue: groupValue || t("reportDesigner.sampleGroup"),
      _groupCount: "1",
      _pageNumber: "1",
      ...buildGroupAggregates(sampleRows, numberFields),
    };
  }, [
    designSampleRow,
    layout.grouping.field,
    layout.grouping.granularity,
    layout.grouping.dateFormat,
    numberFields,
    t,
  ]);

  const updateFilter = (index: number, patch: Partial<ReportFilter>) => {
    setLayout((current) => ({
      ...current,
      filters: current.filters.map((filter, i) => (i === index ? { ...filter, ...patch } : filter)),
    }));
  };

  const addFilter = () => {
    const firstField = preview?.columns[0] ?? "";
    if (!firstField) return;
    setLayout((current) => ({
      ...current,
      filters: [...current.filters, { field: firstField, op: "eq", value: "" }],
    }));
  };

  const removeFilter = (index: number) => {
    setLayout((current) => ({
      ...current,
      filters: current.filters.filter((_, i) => i !== index),
    }));
  };

  const opsForColumn = (field: string): FilterOp[] => {
    const type = columnTypes[field] ?? "text";
    if (type === "number" || type === "date") {
      return ["eq", "neq", "gt", "lt", "gte", "lte", "empty", "notEmpty"];
    }
    return ["eq", "neq", "contains", "empty", "notEmpty"];
  };

  const renderPreviewElement = (
    element: ReportElement,
    row: Record<string, unknown> | null,
    extras: Record<string, string>,
    keyId: string,
  ) => (
    <div
      key={keyId}
      style={{
        position: "absolute",
        left: `${element.x}px`,
        top: `${element.y}px`,
        width: `${element.width}px`,
        height: element.kind === "text" ? undefined : `${element.height}px`,
        textAlign: element.align,
        fontSize: `${element.fontSize}px`,
        fontWeight: element.bold ? 700 : 400,
        fontStyle: element.italic ? "italic" : "normal",
        textDecoration: element.underline ? "underline" : "none",
        color: "#111827",
        padding: element.kind === "text" ? "2px" : "0",
        overflow: "hidden",
        whiteSpace: element.kind === "text" ? "nowrap" : "normal",
      }}
    >
      {element.kind === "qr" || element.kind === "barcode"
        ? renderCodeElement(element, row)
        : row
          ? applyTemplate(element.text, row, extras, element.dateFormat)
          : element.text}
    </div>
  );

  const renderPreviewPage = () => {
    const rows = applyFilters(preview?.rows ?? [], layout.filters, columnTypes);
    const totalCount = rows.length;
    const footerTop = a4Size.height - layout.footer.height;
    const bands: ReactNode[] = [];
    let y = 0;

    const pushPreviewBand = (
      section: ReportSection,
      height: number,
      row: Record<string, unknown> | null,
      extras: Record<string, string>,
      keyId: string,
    ) => {
      if (height <= 0) return true;
      if (y + height > footerTop) return false;
      bands.push(
        <div
          key={keyId}
          className="absolute inset-x-0 overflow-hidden"
          style={{ top: `${y}px`, height: `${height}px` }}
        >
          {elementsFor(section).map((element) =>
            renderPreviewElement(element, row, extras, `${keyId}-${element.id}`),
          )}
        </div>,
      );
      y += height;
      return true;
    };

    const baseExtras = (count: number, groupValue: string, groupRows: Record<string, unknown>[] = []) => ({
      _groupValue: groupValue,
      _groupCount: String(count),
      _pageNumber: "1",
      ...buildGroupAggregates(groupRows, numberFields),
    });

    pushPreviewBand(
      "header",
      layout.header.height,
      rows[0] ?? null,
      baseExtras(totalCount, ""),
      "pv-header",
    );

    if (layout.grouping.enabled && layout.grouping.field) {
      const field = layout.grouping.field;
      const granularity = layout.grouping.granularity;
      const dateFormat = layout.grouping.dateFormat;
      const groupMap = new Map<string, Record<string, unknown>[]>();
      for (const row of rows) {
        const key = bucketGroupKey(row[field], granularity, dateFormat);
        const bucket = groupMap.get(key);
        if (bucket) bucket.push(row);
        else groupMap.set(key, [row]);
      }
      const groups = Array.from(groupMap.entries())
        .map(([key, groupRows]) => ({ key, rows: groupRows }))
        .sort((a, b) =>
          layout.grouping.sort === "desc"
            ? b.key.localeCompare(a.key)
            : a.key.localeCompare(b.key),
        );

      let ranOut = false;
      for (const group of groups) {
        if (ranOut) break;
        const extras = baseExtras(
          group.rows.length,
          group.key || t("reportDesigner.sampleGroup"),
          group.rows,
        );
        if (!pushPreviewBand("groupHeader", layout.groupHeader.height, group.rows[0] ?? null, extras, `pv-gh-${group.key}`)) break;
        for (let i = 0; i < group.rows.length; i += 1) {
          if (!pushPreviewBand("detail", layout.detail.height, group.rows[i], extras, `pv-d-${group.key}-${i}`)) {
            ranOut = true;
            break;
          }
        }
        if (ranOut) break;
        if (!pushPreviewBand("groupFooter", layout.groupFooter.height, group.rows[0] ?? null, extras, `pv-gf-${group.key}`)) break;
      }
    } else {
      const extras = baseExtras(totalCount, "", rows);
      for (let i = 0; i < rows.length; i += 1) {
        if (!pushPreviewBand("detail", layout.detail.height, rows[i], extras, `pv-d-${i}`)) break;
      }
    }

    if (layout.footer.height > 0) {
      bands.push(
        <div
          key="pv-footer"
          className="absolute inset-x-0 overflow-hidden"
          style={{ top: `${footerTop}px`, height: `${layout.footer.height}px` }}
        >
          {elementsFor("footer").map((element) =>
            renderPreviewElement(element, rows[0] ?? null, baseExtras(totalCount, ""), `pv-footer-${element.id}`),
          )}
        </div>,
      );
    }

    return bands;
  };

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${
        step === 2 ? "gap-0 p-0" : "gap-4 p-4"
      }`}
    >
      <Toast ref={toastRef} />

      <AppDialog
        header={t("reportDesigner.filterTitle")}
        visible={filterPanelOpen && layout.grouping.enabled}
        style={{ width: "min(36rem, 95vw)" }}
        onHide={() => setFilterPanelOpen(false)}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              label={t("reportDesigner.filterClose")}
              className="p-button-text"
              onClick={() => setFilterPanelOpen(false)}
            />
          </div>
        }
      >
        <div className="flex flex-col gap-3 pt-1">
          <div className="text-xs text-on-surface-variant">{t("reportDesigner.filterHint")}</div>
          <div className="flex flex-col gap-2">
            {layout.filters.map((filter, index) => {
              const type = columnTypes[filter.field] ?? "text";
              const hideValue = filter.op === "empty" || filter.op === "notEmpty";
              return (
                <div key={`filter-${index}`} className="flex flex-wrap items-center gap-1.5">
                  <select
                    className={`${fieldSelect} !w-[7.5rem]`}
                    value={filter.field}
                    onChange={(e) => {
                      const field = e.target.value;
                      const ops = opsForColumn(field);
                      updateFilter(index, {
                        field,
                        op: ops.includes(filter.op) ? filter.op : ops[0],
                      });
                    }}
                  >
                    {(preview?.columns ?? []).map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                  <select
                    className={`${fieldSelect} !w-[6.5rem]`}
                    value={filter.op}
                    onChange={(e) => updateFilter(index, { op: e.target.value as FilterOp })}
                  >
                    {opsForColumn(filter.field).map((op) => (
                      <option key={op} value={op}>
                        {t(`reportDesigner.filterOp.${op}`)}
                      </option>
                    ))}
                  </select>
                  {!hideValue ? (
                    <input
                      className={`${fieldSelect} !w-[8rem]`}
                      type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                      value={filter.value}
                      onChange={(e) => updateFilter(index, { value: e.target.value })}
                      placeholder={t("reportDesigner.filterValue")}
                    />
                  ) : null}
                  <button
                    type="button"
                    className={`${toolbarBtn} !h-7 !w-7 !min-w-7 text-red-500`}
                    onClick={() => removeFilter(index)}
                    aria-label={t("reportDesigner.filterRemove")}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className={`${createActionNavItem} !h-9 px-2 text-xs`}
            disabled={(preview?.columns ?? []).length === 0}
            onClick={addFilter}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            {t("reportDesigner.filterAdd")}
          </button>
        </div>
      </AppDialog>

      <AppDialog
        visible={loadDialogOpen}
        onHide={() => setLoadDialogOpen(false)}
        header={t("reportDesigner.loadTitle")}
        style={{ width: "min(32rem, 94vw)" }}
        modal
      >
        <div className="flex flex-col gap-2">
          {savedReportsLoading ? (
            <div className="text-sm text-on-surface-variant">{t("reportDesigner.loading")}</div>
          ) : savedReports.length === 0 ? (
            <div className="text-sm text-on-surface-variant">{t("reportDesigner.loadEmpty")}</div>
          ) : (
            savedReports.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full flex-col items-start gap-0.5 rounded-sm border border-outline-variant bg-surface px-3 py-2 text-left hover:bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
                onClick={() => applyLoadedReport(item)}
              >
                <span className="text-sm font-semibold text-on-surface">{item.name}</span>
                <span className="font-mono text-[11px] text-on-surface-variant">
                  {item.key}
                  {item.targetAppKey ? ` · ${item.targetAppKey}` : ""}
                </span>
              </button>
            ))
          )}
        </div>
      </AppDialog>

      {step === 1 ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(360px,460px)_1fr]">
          <div className="flex flex-col gap-3 rounded-sm bg-surface-container-low p-4">
            <label className="text-sm font-semibold">{t("reportDesigner.queryLabel")}</label>
            <InputTextarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={10}
              autoResize
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`${primaryActionNavItem} !h-9 px-2 text-xs`}
                onClick={insertRecordFilter}
              >
                {t("reportDesigner.insertRecordFilter")}
              </button>
              <span className="text-[10px] text-on-surface-variant">{t("reportDesigner.recordIdHint")}</span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-on-surface-variant">
                  {t("reportDesigner.reportTitle")}
                </label>
                <InputText
                  value={reportTitle}
                  onChange={(e) => {
                    const next = e.target.value;
                    setReportTitle(next);
                    if (!definitionId) setReportKey(slugifyReportKey(next) || "report");
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-on-surface-variant">
                  {t("reportDesigner.reportKey")}
                </label>
                <InputText
                  value={reportKey}
                  onChange={(e) => setReportKey(slugifyReportKey(e.target.value) || e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-on-surface-variant">
                  {t("reportDesigner.targetApp")}
                </label>
                <select
                  className={fieldSelect}
                  value={targetAppKey}
                  onChange={(e) => setTargetAppKey(e.target.value)}
                >
                  {TARGET_APP_OPTIONS.map((opt) => (
                    <option key={opt.value || "none"} value={opt.value}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-on-surface-variant">
                  {t("reportDesigner.limitLabel")}
                </label>
                <InputNumber
                  value={queryLimit}
                  onValueChange={(e) => setQueryLimit(Math.max(1, Math.min(200, e.value ?? 50)))}
                  min={1}
                  max={200}
                  showButtons
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-on-surface-variant">
                  {t("reportDesigner.previewRecordId")}
                </label>
                <InputText
                  value={previewRecordId}
                  onChange={(e) => setPreviewRecordId(e.target.value.trim())}
                  className="font-mono text-xs"
                  placeholder="uuid"
                />
              </div>
            </div>
            <Button label={t("reportDesigner.runQuery")} icon="pi pi-play" onClick={runPreview} loading={queryLoading} />
          </div>

          <div className="flex min-h-0 flex-col gap-3 rounded-sm bg-surface-container-low p-4">
            <div className="text-sm font-semibold">
              {t("reportDesigner.previewRows", { count: preview?.rowCount ?? 0 })}
            </div>
            <DataTable
              value={preview?.rows ?? []}
              scrollable
              scrollHeight="420px"
              className="app-data-table"
              emptyMessage={t("reportDesigner.emptyPreview")}
            >
              {(preview?.columns ?? []).map((columnName) => (
                <Column
                  key={columnName}
                  field={columnName}
                  header={columnName}
                  body={(row: Record<string, unknown>) => toPreviewText(row[columnName])}
                  style={{ minWidth: "10rem" }}
                />
              ))}
            </DataTable>
            <div className="text-xs text-on-surface-variant">
              {t("reportDesigner.step2Hint")}
              <ArrowRight className="ml-1 inline h-3.5 w-3.5" strokeWidth={1.75} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="flex flex-col border-b border-outline bg-surface-container-low">
            <div className="flex w-full flex-wrap items-stretch gap-0">
              <div className={ribbonGroup}>
                <div className={ribbonLabel}>{t("reportDesigner.ribbonClipboard")}</div>
                <div className={ribbonTools}>
                  <button type="button" className={ribbonCreateAction} onClick={addElement} title={t("reportDesigner.addText")}>
                    <Plus className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                    <span>{t("reportDesigner.addText")}</span>
                  </button>
                  <button
                    type="button"
                    className={ribbonDeleteAction}
                    onClick={removeSelectedElement}
                    disabled={!selectedElement}
                    title={`${t("reportDesigner.deleteText")} (Entf)`}
                  >
                    <Trash2 className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                    <span>{t("reportDesigner.deleteText")}</span>
                  </button>
                </div>
              </div>

              <div className={`${ribbonGroup} w-[11rem] max-w-[11rem]`}>
                <div className={ribbonLabel}>{t("reportDesigner.ribbonText")}</div>
                <InputText
                  value={selectedElement?.kind === "text" ? (selectedElement.text ?? "") : ""}
                  onChange={(e) => updateSelectedElement({ text: e.target.value })}
                  disabled={!selectedElement || !selectedIsText}
                  className="!h-9 w-full !py-0 font-mono text-xs"
                  placeholder={t("reportDesigner.textTemplate")}
                />
              </div>

              <div className={ribbonGroup}>
                <div className={ribbonLabel}>{t("reportDesigner.ribbonFont")}</div>
                <div className={ribbonTools}>
                  <button
                    type="button"
                    title={t("reportDesigner.bold")}
                    disabled={!selectedElement || !selectedIsText}
                    className={`${toolbarBtn} ${selectedElement?.bold ? toolbarBtnActive : ""}`}
                    onClick={() => updateSelectedElement({ bold: !selectedElement?.bold })}
                  >
                    <Bold className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                  </button>
                  <button
                    type="button"
                    title={t("reportDesigner.italic")}
                    disabled={!selectedElement || !selectedIsText}
                    className={`${toolbarBtn} ${selectedElement?.italic ? toolbarBtnActive : ""}`}
                    onClick={() => updateSelectedElement({ italic: !selectedElement?.italic })}
                  >
                    <Italic className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                  </button>
                  <button
                    type="button"
                    title={t("reportDesigner.underline")}
                    disabled={!selectedElement || !selectedIsText}
                    className={`${toolbarBtn} ${selectedElement?.underline ? toolbarBtnActive : ""}`}
                    onClick={() => updateSelectedElement({ underline: !selectedElement?.underline })}
                  >
                    <Underline className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                  </button>
                  <select
                    className={ribbonSelect}
                    disabled={!selectedElement || !selectedIsText}
                    value={selectedElement?.kind === "text" ? (selectedElement.fontSize ?? "") : ""}
                    title={t("reportDesigner.fontSize")}
                    aria-label={t("reportDesigner.fontSize")}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setSelectedFontSize(Number.isFinite(next) ? next : null);
                    }}
                  >
                    {!selectedElement || !selectedIsText ? <option value="">—</option> : null}
                    {FONT_SIZE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={ribbonGroup}>
                <div className={ribbonLabel}>{t("reportDesigner.ribbonAlign")}</div>
                <div className={ribbonTools}>
                  <button
                    type="button"
                    title={t("reportDesigner.left")}
                    disabled={!selectedElement || !selectedIsText}
                    className={`${toolbarBtn} ${selectedElement?.align === "left" ? toolbarBtnActive : ""}`}
                    onClick={() => updateSelectedElement({ align: "left" })}
                  >
                    <AlignLeft className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                  </button>
                  <button
                    type="button"
                    title={t("reportDesigner.center")}
                    disabled={!selectedElement || !selectedIsText}
                    className={`${toolbarBtn} ${selectedElement?.align === "center" ? toolbarBtnActive : ""}`}
                    onClick={() => updateSelectedElement({ align: "center" })}
                  >
                    <AlignCenter className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                  </button>
                  <button
                    type="button"
                    title={t("reportDesigner.right")}
                    disabled={!selectedElement || !selectedIsText}
                    className={`${toolbarBtn} ${selectedElement?.align === "right" ? toolbarBtnActive : ""}`}
                    onClick={() => updateSelectedElement({ align: "right" })}
                  >
                    <AlignRight className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                  </button>
                </div>
              </div>

              <div className={ribbonGroup}>
                <div className={ribbonLabel}>{t("reportDesigner.ribbonGrid")}</div>
                <div className={`${ribbonTools} gap-x-2.5`}>
                  <label className="flex items-center gap-1.5 text-xs text-on-surface">
                    <Checkbox
                      inputId="showGrid"
                      checked={showGrid}
                      onChange={(e) => setShowGrid(Boolean(e.checked))}
                    />
                    <span>{t("reportDesigner.showGridShort")}</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-on-surface">
                    <Checkbox
                      inputId="snapToGrid"
                      checked={snapToGrid}
                      onChange={(e) => setSnapToGrid(Boolean(e.checked))}
                    />
                    <span>{t("reportDesigner.snapToGrid")}</span>
                  </label>
                  <select
                    className={ribbonSelect}
                    value={gridSize}
                    title={t("reportDesigner.ribbonGrid")}
                    aria-label={t("reportDesigner.ribbonGrid")}
                    onChange={(e) => setGridSize(Number(e.target.value) as GridSize)}
                  >
                    {GRID_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}px
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={ribbonGroup}>
                <div className={ribbonLabel}>{t("reportDesigner.ribbonView")}</div>
                <div className={ribbonTools}>
                  <label className="flex items-center gap-1.5 text-xs text-on-surface">
                    <Checkbox
                      inputId="showPreview"
                      checked={showPreview}
                      onChange={(e) => setShowPreview(Boolean(e.checked))}
                    />
                    <span>{t("reportDesigner.previewToggle")}</span>
                  </label>
                </div>
              </div>

              <div className={`${ribbonGroup} border-r-0`}>
                <div className={ribbonLabel}>{t("reportDesigner.ribbonBand")}</div>
                <div className="flex h-9 items-center whitespace-nowrap text-sm text-on-surface">
                  {sectionLabel(selectedSection)}
                  {selectedElement
                    ? ` · #${layout.elements.findIndex((el) => el.id === selectedElement.id) + 1}`
                    : ""}
                </div>
              </div>
            </div>
          </div>

          <div className="!m-0 grid min-h-0 flex-1 gap-0 xl:grid-cols-[280px_minmax(0,1fr)_260px]">
            <div className={`${panelBand} border-t-0 p-3 xl:border-r-0`}>
              <div className={`${ribbonLabel} mb-3`}>{t("reportDesigner.properties")}</div>

              <div className={`${ribbonLabel} mb-2`}>{t("reportDesigner.groupAndSort")}</div>
              <label className="mb-2 flex h-9 items-center gap-2 text-xs text-on-surface">
                <Checkbox
                  inputId="groupingEnabled"
                  checked={layout.grouping.enabled}
                  onChange={(e) =>
                    setLayout((current) => ({
                      ...current,
                      grouping: {
                        ...current.grouping,
                        enabled: Boolean(e.checked),
                        field: current.grouping.field || preview?.columns[0] || "",
                      },
                    }))
                  }
                />
                <span>{t("reportDesigner.enableGrouping")}</span>
              </label>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label className={fieldLabel}>{t("reportDesigner.groupByField")}</label>
                  <select
                    className={fieldSelect}
                    value={layout.grouping.field}
                    disabled={!layout.grouping.enabled || fieldOptions.length === 0}
                    onChange={(e) =>
                      setLayout((current) => ({
                        ...current,
                        grouping: { ...current.grouping, field: e.target.value },
                      }))
                    }
                  >
                    <option value="">{t("reportDesigner.groupByPlaceholder")}</option>
                    {fieldOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {layout.grouping.enabled && isGroupFieldDate ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className={fieldLabel}>{t("reportDesigner.granularityLabel")}</label>
                      <select
                        className={fieldSelect}
                        value={layout.grouping.granularity}
                        onChange={(e) => {
                          const granularity = e.target.value as GroupGranularity;
                          setLayout((current) => ({
                            ...current,
                            grouping: {
                              ...current.grouping,
                              granularity,
                              dateFormat: defaultDateFormat(granularity),
                            },
                          }));
                        }}
                      >
                        <option value="day">{t("reportDesigner.granularityDay")}</option>
                        <option value="week">{t("reportDesigner.granularityWeek")}</option>
                        <option value="month">{t("reportDesigner.granularityMonth")}</option>
                        <option value="quarter">{t("reportDesigner.granularityQuarter")}</option>
                        <option value="year">{t("reportDesigner.granularityYear")}</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={fieldLabel}>{t("reportDesigner.dateFormatLabel")}</label>
                      <input
                        className={fieldSelect}
                        type="text"
                        value={layout.grouping.dateFormat}
                        placeholder={defaultDateFormat(layout.grouping.granularity)}
                        onChange={(e) =>
                          setLayout((current) => ({
                            ...current,
                            grouping: {
                              ...current.grouping,
                              dateFormat: e.target.value.slice(0, 64),
                            },
                          }))
                        }
                      />
                      <div className="text-[10px] text-on-surface-variant">
                        {t("reportDesigner.dateFormatHint")}
                      </div>
                    </div>
                  </>
                ) : null}
                <div className="flex w-full gap-1">
                  <button
                    type="button"
                    className={`${actionNavItem} !h-9 flex-1 justify-center px-2 text-xs ${
                      layout.grouping.sort === "asc" ? selectedActionNavItem : ""
                    }`}
                    disabled={!layout.grouping.enabled}
                    onClick={() =>
                      setLayout((current) => ({
                        ...current,
                        grouping: { ...current.grouping, sort: "asc" },
                      }))
                    }
                  >
                    <ArrowUpAZ className="h-4 w-4" strokeWidth={1.75} />
                    {t("reportDesigner.sortAsc")}
                  </button>
                  <button
                    type="button"
                    className={`${actionNavItem} !h-9 flex-1 justify-center px-2 text-xs ${
                      layout.grouping.sort === "desc" ? selectedActionNavItem : ""
                    }`}
                    disabled={!layout.grouping.enabled}
                    onClick={() =>
                      setLayout((current) => ({
                        ...current,
                        grouping: { ...current.grouping, sort: "desc" },
                      }))
                    }
                  >
                    <ArrowDownAZ className="h-4 w-4" strokeWidth={1.75} />
                    {t("reportDesigner.sortDesc")}
                  </button>
                </div>
              </div>

              <div className="mt-3 border-t border-outline-variant pt-3">
                <div className={`${ribbonLabel} mb-2`}>
                  {selectedElement
                    ? `${sectionLabel(selectedElement.section)} · #${
                        layout.elements.findIndex((el) => el.id === selectedElement.id) + 1
                      }`
                    : t("reportDesigner.section")}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label className={fieldLabel}>X</label>
                      <input
                        type="number"
                        className={fieldSelect}
                        value={selectedElement?.x ?? ""}
                        disabled={!selectedElement}
                        onChange={(e) =>
                          updateSelectedElement({ x: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label className={fieldLabel}>Y</label>
                      <input
                        type="number"
                        className={fieldSelect}
                        value={selectedElement?.y ?? ""}
                        disabled={!selectedElement}
                        onChange={(e) =>
                          updateSelectedElement({ y: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label className={fieldLabel}>{t("reportDesigner.width")}</label>
                      <input
                        type="number"
                        className={fieldSelect}
                        value={selectedElement?.width ?? ""}
                        disabled={!selectedElement}
                        onChange={(e) =>
                          updateSelectedElement({ width: Number(e.target.value) || 100 })
                        }
                      />
                    </div>
                    {selectedIsCode ? (
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <label className={fieldLabel}>{t("reportDesigner.elementHeight")}</label>
                        <input
                          type="number"
                          className={fieldSelect}
                          value={selectedElement?.height ?? ""}
                          disabled={!selectedElement}
                          min={16}
                          max={200}
                          onChange={(e) =>
                            updateSelectedElement({
                              height: Math.max(16, Math.min(200, Number(e.target.value) || 16)),
                            })
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={fieldLabel}>{t("reportDesigner.section")}</label>
                    <select
                      className={fieldSelect}
                      value={selectedElement?.section ?? ""}
                      disabled={!selectedElement}
                      onChange={(e) => {
                        const nextSection = e.target.value as ReportSection;
                        updateSelectedElement({ section: nextSection });
                        setSelectedSection(nextSection);
                      }}
                    >
                      {!selectedElement ? <option value="">—</option> : null}
                      {visibleBands.map((band) => (
                        <option key={band.section} value={band.section}>
                          {t(band.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {selectedIsCode ? (
                  <div className="mt-2 flex flex-col gap-1">
                    <label className={fieldLabel}>{t("reportDesigner.sourceField")}</label>
                    <select
                      className={fieldSelect}
                      value={selectedElement?.sourceField ?? ""}
                      disabled={!selectedElement || (preview?.columns ?? []).length === 0}
                      onChange={(e) => updateSelectedElement({ sourceField: e.target.value })}
                    >
                      <option value="">{t("reportDesigner.sourceFieldPlaceholder")}</option>
                      {(preview?.columns ?? []).map((columnName) => (
                        <option key={columnName} value={columnName}>
                          {columnName}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {selectedElement && selectedIsDateBound ? (
                  <div className="mt-2 flex flex-col gap-1">
                    <label className={fieldLabel}>{t("reportDesigner.elementDateFormat")}</label>
                    <InputText
                      value={selectedElement.dateFormat}
                      onChange={(e) => updateSelectedElement({ dateFormat: e.target.value })}
                      className="!h-9 w-full !py-0 font-mono text-xs"
                      placeholder={defaultDateFormat("day")}
                    />
                    <span className="text-[10px] text-on-surface-variant">
                      {t("reportDesigner.dateFormatHint")}
                    </span>
                  </div>
                ) : null}
                {selectedSection === "header" ? (
                  <label className="mt-2 flex h-9 items-center gap-2 text-xs text-on-surface">
                    <Checkbox
                      inputId="firstPageOnly"
                      checked={layout.header.firstPageOnly}
                      onChange={(e) =>
                        setLayout((current) => ({
                          ...current,
                          header: { ...current.header, firstPageOnly: Boolean(e.checked) },
                        }))
                      }
                    />
                    <span>{t("reportDesigner.firstPageOnly")}</span>
                  </label>
                ) : null}
              </div>
            </div>

            <div className={`${panelBand} min-h-0 border-t-0`}>
              <div className="border-b border-outline-variant px-3 py-2 text-sm font-semibold">
                {t("reportDesigner.canvasPreview")}
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-[color-mix(in_srgb,var(--color-surface-container-high)_55%,transparent)] p-4">
                <div className="flex items-start justify-center gap-8">
                <div className="flex flex-col items-center gap-2">
                  {showPreview ? (
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      {t("reportDesigner.designLabel")}
                    </div>
                  ) : null}
                <div
                  className="relative"
                  style={{
                    width: `${BAND_GUTTER_WIDTH + a4Size.width}px`,
                    height: `${a4Size.height}px`,
                    paddingLeft: `${BAND_GUTTER_WIDTH}px`,
                  }}
                >
                  <div
                    className="relative border border-slate-300 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.12)]"
                    style={{
                      width: `${a4Size.width}px`,
                      height: `${a4Size.height}px`,
                      ...gridOverlayStyle,
                    }}
                    aria-label="DIN A4"
                  >
                    {(() => {
                      let offset = 0;
                      const nodes: ReactNode[] = [];
                      const gutterLabels: ReactNode[] = [];

                      const pushGutterLabel = (
                        section: ReportSection,
                        top: number,
                        height: number,
                        labelExtra?: string,
                      ) => {
                        const meta = BAND_META.find((band) => band.section === section)!;
                        const showFilter = section === "groupHeader" && layout.grouping.enabled;
                        gutterLabels.push(
                          <div
                            key={`gutter-${section}-${top}`}
                            className="absolute right-1 flex items-start justify-end gap-1"
                            style={{
                              top: `${top + 2}px`,
                              maxHeight: `${Math.max(height - 4, 14)}px`,
                            }}
                          >
                            <div
                              className={`${meta.labelTint} pointer-events-none rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap`}
                            >
                              {t(meta.labelKey)}
                              {labelExtra ? ` · ${labelExtra}` : ""}
                            </div>
                            {showFilter ? (
                              <button
                                type="button"
                                className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-violet-200/80 text-violet-900 hover:bg-violet-300/80"
                                title={t("reportDesigner.filterTitle")}
                                aria-label={t("reportDesigner.filterTitle")}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setFilterPanelOpen((open) => !open);
                                }}
                              >
                                <Filter className="h-3.5 w-3.5" strokeWidth={2} />
                                {layout.filters.length > 0 ? (
                                  <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-on-primary">
                                    {layout.filters.length}
                                  </span>
                                ) : null}
                              </button>
                            ) : null}
                          </div>,
                        );
                      };

                      const pushBand = (
                        section: ReportSection,
                        height: number,
                        content: ReactNode,
                        options?: {
                          resizable?: boolean;
                          labelExtra?: string;
                          pinBottom?: boolean;
                        },
                      ) => {
                        const meta = BAND_META.find((band) => band.section === section)!;
                        const top = options?.pinBottom
                          ? a4Size.height - height
                          : offset;
                        if (!options?.pinBottom) {
                          offset += height;
                        }
                        pushGutterLabel(section, top, height, options?.labelExtra);
                        nodes.push(
                          <div
                            key={`${section}-${top}`}
                            className={`absolute inset-x-0 border-b border-dashed border-black/10 ${
                              dropTarget === section ? meta.dropTint : meta.tint
                            } ${selectedSection === section ? meta.tintStrong : ""}`}
                            style={{ top: `${top}px`, height: `${height}px` }}
                            onDragOver={(event) => onBandDragOver(section, event)}
                            onDragLeave={() => onBandDragLeave(section)}
                            onDrop={(event) => onBandDrop(section, event)}
                            onClick={() => {
                              setSelectedSection(section);
                              setSelectedElementId(null);
                            }}
                          >
                            {content}
                            {options?.resizable !== false ? (
                              <div
                                className={`absolute inset-x-0 z-10 h-1.5 cursor-row-resize ${meta.resizeTint} ${
                                  options?.pinBottom ? "top-0" : "bottom-0"
                                }`}
                                onMouseDown={(event) => {
                                  if (options?.pinBottom) {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const startY = event.clientY;
                                    const origin = height;
                                    const onMove = (moveEvent: MouseEvent) => {
                                      setBandHeight(section, origin - (moveEvent.clientY - startY));
                                    };
                                    const onUp = () => {
                                      window.removeEventListener("mousemove", onMove);
                                      window.removeEventListener("mouseup", onUp);
                                    };
                                    window.addEventListener("mousemove", onMove);
                                    window.addEventListener("mouseup", onUp);
                                    return;
                                  }
                                  startBandResize(section, event);
                                }}
                              />
                            ) : null}
                          </div>,
                        );
                      };

                      pushBand(
                        "header",
                        layout.header.height,
                        elementsFor("header").map((element) =>
                          renderElementButton(element, designSampleRow, designExtras),
                        ),
                        {
                          labelExtra: layout.header.firstPageOnly
                            ? t("reportDesigner.firstPageOnlyShort")
                            : undefined,
                        },
                      );

                      if (layout.grouping.enabled) {
                        pushBand(
                          "groupHeader",
                          layout.groupHeader.height,
                          elementsFor("groupHeader").map((element) =>
                            renderElementButton(element, designSampleRow, designExtras),
                          ),
                        );
                      }

                      pushBand(
                        "detail",
                        layout.detail.height,
                        elementsFor("detail").map((element) =>
                          renderElementButton(element, designSampleRow, designExtras),
                        ),
                      );

                      if (layout.grouping.enabled) {
                        pushBand(
                          "groupFooter",
                          layout.groupFooter.height,
                          elementsFor("groupFooter").map((element) =>
                            renderElementButton(element, designSampleRow, designExtras),
                          ),
                        );
                      }

                      // Empty printable body between band stack and page footer.
                      const bodyTop = offset;
                      const bodyHeight = Math.max(a4Size.height - layout.footer.height - bodyTop, 0);
                      if (bodyHeight > 0) {
                        nodes.push(
                          <div
                            key="page-body"
                            className="pointer-events-none absolute inset-x-0 flex items-center justify-center"
                            style={{ top: `${bodyTop}px`, height: `${bodyHeight}px` }}
                          >
                            <div className="rounded-sm border border-dashed border-slate-300/80 bg-slate-50/40 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-400">
                              {t("reportDesigner.pageBodyHint")}
                            </div>
                          </div>,
                        );
                      }

                      pushBand(
                        "footer",
                        layout.footer.height,
                        elementsFor("footer").map((element) =>
                          renderElementButton(element, designSampleRow, designExtras),
                        ),
                        { pinBottom: true },
                      );

                      return (
                        <>
                          <div
                            className="absolute inset-y-0"
                            style={{
                              left: `-${BAND_GUTTER_WIDTH}px`,
                              width: `${BAND_GUTTER_WIDTH}px`,
                            }}
                          >
                            {gutterLabels}
                          </div>
                          {nodes}
                        </>
                      );
                    })()}
                  </div>
                </div>
                </div>
                {showPreview ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      {t("reportDesigner.previewLabel")}
                    </div>
                    <div
                      className="relative overflow-hidden border border-slate-300 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.12)]"
                      style={{ width: `${a4Size.width}px`, height: `${a4Size.height}px` }}
                      aria-label={t("reportDesigner.previewLabel")}
                    >
                      {renderPreviewPage()}
                    </div>
                  </div>
                ) : null}
                </div>
              </div>
            </div>

            <div className={`${panelBand} border-t-0 p-3`}>
              <div className="mb-1 text-sm font-semibold">{t("reportDesigner.itemPool")}</div>
              <div className="mb-2 text-xs text-on-surface-variant">{t("reportDesigner.itemPoolHint")}</div>

              <div className="mb-3 grid grid-cols-2 gap-1 rounded-sm border border-outline-variant p-0.5">
                <button
                  type="button"
                  className={`h-8 rounded-sm text-xs font-semibold transition-colors ${
                    poolTab === "tools"
                      ? "bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]"
                      : "text-on-surface-variant hover:bg-surface"
                  }`}
                  onClick={() => setPoolTab("tools")}
                >
                  {t("reportDesigner.poolTabTools")}
                </button>
                <button
                  type="button"
                  className={`h-8 rounded-sm text-xs font-semibold transition-colors ${
                    poolTab === "fields"
                      ? "bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]"
                      : "text-on-surface-variant hover:bg-surface"
                  }`}
                  onClick={() => setPoolTab("fields")}
                >
                  {t("reportDesigner.poolTabFields")}
                </button>
              </div>

              {poolTab === "tools" ? (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => onPoolItemDragStart({ type: "text" }, event)}
                    className="flex cursor-grab items-center gap-2 rounded-sm border-2 border-outline-variant bg-surface px-2 py-2 text-left text-sm text-on-surface active:cursor-grabbing"
                  >
                    <Type className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                    <span>{t("reportDesigner.poolTextItem")}</span>
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => onPoolItemDragStart({ type: "qr" }, event)}
                    className="flex cursor-grab items-center gap-2 rounded-sm border-2 border-outline-variant bg-surface px-2 py-2 text-left text-sm text-on-surface active:cursor-grabbing"
                  >
                    <QrCode className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                    <span>{t("reportDesigner.poolQr")}</span>
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => onPoolItemDragStart({ type: "barcode" }, event)}
                    className="flex cursor-grab items-center gap-2 rounded-sm border-2 border-outline-variant bg-surface px-2 py-2 text-left text-sm text-on-surface active:cursor-grabbing"
                  >
                    <ScanBarcode className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                    <span>{t("reportDesigner.poolBarcode")}</span>
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) =>
                      onPoolItemDragStart({ type: "token", token: "{{_pageNumber}}" }, event)
                    }
                    className="flex cursor-grab items-center gap-2 rounded-sm border-2 border-outline-variant bg-surface px-2 py-2 text-left font-mono text-xs text-on-surface active:cursor-grabbing"
                  >
                    <span>{"{{_pageNumber}}"}</span>
                  </button>
                  {layout.grouping.enabled ? (
                    <>
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) =>
                          onPoolItemDragStart({ type: "token", token: "{{_groupValue}}" }, event)
                        }
                        className="flex cursor-grab items-center gap-2 rounded-sm border-2 border-outline-variant bg-surface px-2 py-2 text-left font-mono text-xs text-on-surface active:cursor-grabbing"
                      >
                        <span>{"{{_groupValue}}"}</span>
                      </button>
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) =>
                          onPoolItemDragStart({ type: "token", token: "{{_groupCount}}" }, event)
                        }
                        className="flex cursor-grab items-center gap-2 rounded-sm border-2 border-outline-variant bg-surface px-2 py-2 text-left font-mono text-xs text-on-surface active:cursor-grabbing"
                      >
                        <span>{"{{_groupCount}}"}</span>
                      </button>
                      {numberFields.map((field) => (
                        <div key={`agg-${field}`} className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) =>
                              onPoolItemDragStart(
                                { type: "token", token: `{{_groupSum_${field}}}` },
                                event,
                              )
                            }
                            className="flex cursor-grab items-center gap-2 rounded-sm border-2 border-outline-variant bg-surface px-2 py-2 text-left font-mono text-xs text-on-surface active:cursor-grabbing"
                          >
                            <span>
                              {t("reportDesigner.aggregateSum")} {`{{_groupSum_${field}}}`}
                            </span>
                          </button>
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) =>
                              onPoolItemDragStart(
                                { type: "token", token: `{{_groupAvg_${field}}}` },
                                event,
                              )
                            }
                            className="flex cursor-grab items-center gap-2 rounded-sm border-2 border-outline-variant bg-surface px-2 py-2 text-left font-mono text-xs text-on-surface active:cursor-grabbing"
                          >
                            <span>
                              {t("reportDesigner.aggregateAvg")} {`{{_groupAvg_${field}}}`}
                            </span>
                          </button>
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {(preview?.columns ?? []).map((columnName) => (
                    <button
                      key={columnName}
                      type="button"
                      draggable
                      onDragStart={(event) => onFieldDragStart(columnName, event)}
                      className="cursor-grab rounded-sm border-2 border-outline-variant bg-surface px-2 py-2 text-left font-mono text-xs text-on-surface active:cursor-grabbing"
                    >
                      {columnName}
                    </button>
                  ))}
                  {(preview?.columns ?? []).length === 0 ? (
                    <span className="text-xs text-on-surface-variant">{t("reportDesigner.noFields")}</span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
