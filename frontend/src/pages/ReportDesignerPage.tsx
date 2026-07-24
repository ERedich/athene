import {
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
  Grid3x3,
  Italic,
  Layers,
  Minus,
  Plus,
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
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Toast } from "primereact/toast";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";

type Step = 1 | 2;
type ReportSection = "header" | "groupHeader" | "detail" | "groupFooter" | "footer";

type QueryPreviewResponse = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
};

type ReportElement = {
  id: string;
  section: ReportSection;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  align: "left" | "center" | "right";
  bold: boolean;
  italic: boolean;
  underline: boolean;
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
  };
  elements: ReportElement[];
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
const BAND_GUTTER_WIDTH = 118;
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
const createActionNavItem =
  "inline-flex h-10 items-center gap-2 rounded-sm border border-emerald-600/40 bg-emerald-500/15 px-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-500/25 disabled:pointer-events-none disabled:opacity-40 dark:text-emerald-300";
const deleteActionNavItem =
  "inline-flex h-10 items-center gap-2 rounded-sm border border-red-500/40 bg-red-500/10 px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:pointer-events-none disabled:opacity-40";
const toolbarBtn =
  "inline-flex h-11 w-11 items-center justify-center rounded-sm border-2 border-outline bg-surface text-on-surface shadow-sm transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-40";
const toolbarBtnActive = "border-primary bg-primary text-white hover:bg-primary";
const ribbonGroup =
  "relative flex min-w-0 flex-col justify-center gap-1.5 border border-outline-variant bg-surface-container-low px-3 py-2 first:rounded-l-sm last:rounded-r-sm [&:not(:first-child)]:-ml-px";
const ribbonIconClass = "h-6 w-6";
const ribbonIconStroke = 2.5;
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 48;
const FONT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48] as const;
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
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(extras, key)) return extras[key] ?? "";
    return toPreviewText(row[key]);
  });
}

function createDefaultLayout(): ReportLayout {
  return {
    header: { height: 72, firstPageOnly: false },
    groupHeader: { height: 28 },
    detail: { height: 32 },
    groupFooter: { height: 24 },
    footer: { height: 28 },
    grouping: { enabled: false, field: "", sort: "asc" },
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
      },
    ],
  };
}

function createElement(
  section: ReportSection,
  patch: Partial<ReportElement> = {},
): ReportElement {
  return {
    id: crypto.randomUUID(),
    section,
    text: patch.text ?? "Text",
    x: patch.x ?? 40,
    y: patch.y ?? 6,
    width: patch.width ?? 200,
    fontSize: patch.fontSize ?? 12,
    align: patch.align ?? "left",
    bold: patch.bold ?? false,
    italic: patch.italic ?? false,
    underline: patch.underline ?? false,
  };
}

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

  const [step, setStep] = useState<Step>(1);
  const [query, setQuery] = useState('SELECT "key", "name" FROM "asset" ORDER BY "name" ASC');
  const [queryLimit, setQueryLimit] = useState(50);
  const [queryLoading, setQueryLoading] = useState(false);
  const [reportTitle, setReportTitle] = useState("report-designer");
  const [preview, setPreview] = useState<QueryPreviewResponse | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<ReportSection>("header");
  const [layout, setLayout] = useState<ReportLayout>(createDefaultLayout);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [dropTarget, setDropTarget] = useState<ReportSection | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState<GridSize>(10);

  const selectedElement = useMemo(
    () => layout.elements.find((element) => element.id === selectedElementId) ?? null,
    [layout.elements, selectedElementId],
  );

  const visibleBands = useMemo(() => {
    return BAND_META.filter((band) => {
      if (band.section === "groupHeader" || band.section === "groupFooter") {
        return layout.grouping.enabled;
      }
      return true;
    });
  }, [layout.grouping.enabled]);

  const fieldOptions = useMemo(
    () => (preview?.columns ?? []).map((column) => ({ label: column, value: column })),
    [preview?.columns],
  );

  useEffect(() => {
    setHeaderRowCount(null);
    return () => setHeaderRowCount(null);
  }, [setHeaderRowCount]);

  const runPreview = async () => {
    setQueryLoading(true);
    try {
      const res = await apiFetch("/api/report-designer/query-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: query, limit: queryLimit }),
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
      if (!selectedElementId && layout.elements[0]) {
        setSelectedElementId(layout.elements[0].id);
      }
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
  };

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

  const nudgeSelectedFontSize = (delta: number) => {
    if (!selectedElement) return;
    setSelectedFontSize(selectedElement.fontSize + delta);
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
      setSelectedElementId(fallback[0]?.id ?? null);
      return { ...current, elements: fallback };
    });
  };

  useEffect(() => {
    if (step !== 2) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete") return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
        return;
      }
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
        setSelectedElementId(fallback[0]?.id ?? null);
        return { ...current, elements: fallback };
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedElementId, step]);

  const downloadPdf = async () => {
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
  };

  useEffect(() => {
    setHeaderActions(
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
            disabled={!preview || preview.rows.length === 0}
          >
            <span>2.</span>
            <span>{t("reportDesigner.stepDesigner")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <button type="button" className={createActionNavItem} onClick={runPreview} disabled={queryLoading}>
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            <span>{queryLoading ? t("reportDesigner.loading") : t("reportDesigner.runQuery")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            onClick={downloadPdf}
            disabled={!preview || preview.rows.length === 0 || pdfLoading}
          >
            <Download className="h-4 w-4" strokeWidth={1.75} />
            <span>{pdfLoading ? t("reportDesigner.generatingPdf") : t("reportDesigner.generatePdf")}</span>
          </button>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [downloadPdf, pdfLoading, preview, queryLoading, runPreview, setHeaderActions, step, t]);

  useEffect(() => {
    if (!selectedElementId && layout.elements[0]) {
      setSelectedElementId(layout.elements[0].id);
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
  }, [layout.grouping.enabled, selectedSection]);

  const setBandHeight = (section: ReportSection, height: number) => {
    const nextHeight = clamp(height, MIN_BAND_HEIGHT, MAX_BAND_HEIGHT);
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

  const onPoolItemDragStart = (
    item: { type: "field"; name: string } | { type: "token"; token: string } | { type: "text" },
    event: ReactDragEvent,
  ) => {
    event.dataTransfer.setData(POOL_DND_MIME, JSON.stringify(item));
    if (item.type === "field") {
      event.dataTransfer.setData(FIELD_DND_MIME, item.name);
      event.dataTransfer.setData("text/plain", item.name);
    } else if (item.type === "token") {
      event.dataTransfer.setData("text/plain", item.token);
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
    let bold = section === "header" || section === "groupHeader";
    let italic = false;
    let fontSize = section === "header" ? 14 : section === "footer" ? 10 : 12;

    const poolRaw = event.dataTransfer.getData(POOL_DND_MIME);
    if (poolRaw) {
      try {
        const item = JSON.parse(poolRaw) as
          | { type: "field"; name: string }
          | { type: "token"; token: string }
          | { type: "text" };
        if (item.type === "field") {
          text = `{{${item.name}}}`;
        } else if (item.type === "token") {
          text = item.token;
          width = item.token.includes("page") ? 140 : 180;
          italic = item.token.includes("Count");
        } else {
          text = "Text";
          width = 160;
        }
      } catch {
        /* fall through */
      }
    }
    if (!text) {
      const columnName =
        event.dataTransfer.getData(FIELD_DND_MIME) || event.dataTransfer.getData("text/plain");
      if (!columnName) return;
      text =
        columnName.startsWith("{{") || columnName === "Text" ? columnName : `{{${columnName}}}`;
    }

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
      fontSize,
      bold,
      italic,
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
        textAlign: element.align,
        fontSize: `${element.fontSize}px`,
        fontWeight: element.bold ? 700 : 400,
        fontStyle: element.italic ? "italic" : "normal",
        textDecoration: element.underline ? "underline" : "none",
        border: element.id === selectedElementId ? "1px dashed #f97316" : "1px dashed transparent",
        color: "#111827",
        background: "transparent",
        padding: "2px",
        cursor: "move",
      }}
      onClick={() => {
        setSelectedElementId(element.id);
        setSelectedSection(element.section);
      }}
      {...draggableHandlers(element)}
    >
      {row ? applyTemplate(element.text, row, extras) : element.text}
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
    const groupValue =
      designSampleRow && field ? toPreviewText(designSampleRow[field]) : t("reportDesigner.sampleGroup");
    return {
      _groupValue: groupValue || t("reportDesigner.sampleGroup"),
      _groupCount: "1",
      _pageNumber: "1",
    };
  }, [designSampleRow, layout.grouping.field, t]);

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${
        step === 2 ? "gap-0 p-0" : "gap-4 p-4"
      }`}
    >
      <Toast ref={toastRef} />

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
            <div className="grid gap-3 md:grid-cols-2">
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
                  {t("reportDesigner.reportTitle")}
                </label>
                <InputText value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} />
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
          <div className="flex flex-wrap items-stretch gap-0">
            <div className={ribbonGroup}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface">
                {t("reportDesigner.ribbonClipboard")}
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" className={createActionNavItem} onClick={addElement} title={t("reportDesigner.addText")}>
                  <Plus className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                  <span>{t("reportDesigner.addText")}</span>
                </button>
                <button
                  type="button"
                  className={deleteActionNavItem}
                  onClick={removeSelectedElement}
                  disabled={!selectedElement}
                  title={`${t("reportDesigner.deleteText")} (Entf)`}
                >
                  <Trash2 className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                  <span>{t("reportDesigner.deleteText")}</span>
                </button>
              </div>
            </div>

            <div className={`${ribbonGroup} min-w-[220px] flex-1`}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface">
                {t("reportDesigner.ribbonText")}
              </div>
              <InputText
                value={selectedElement?.text ?? ""}
                onChange={(e) => updateSelectedElement({ text: e.target.value })}
                disabled={!selectedElement}
                className="w-full font-mono text-sm"
                placeholder={t("reportDesigner.textTemplate")}
              />
            </div>

            <div className={ribbonGroup}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface">
                {t("reportDesigner.ribbonFont")}
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className={`inline-flex h-11 items-stretch overflow-hidden rounded-sm border-2 border-outline bg-surface shadow-sm ${
                    selectedElement ? "" : "opacity-40"
                  }`}
                  title={t("reportDesigner.fontSize")}
                >
                  <button
                    type="button"
                    aria-label={`${t("reportDesigner.fontSize")} −`}
                    disabled={!selectedElement || (selectedElement?.fontSize ?? FONT_SIZE_MIN) <= FONT_SIZE_MIN}
                    className="inline-flex w-9 items-center justify-center text-on-surface transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-40"
                    onClick={() => nudgeSelectedFontSize(-1)}
                  >
                    <Minus className="h-4 w-4" strokeWidth={2.25} />
                  </button>
                  <div className="flex min-w-[4.25rem] items-center justify-center gap-0.5 border-x-2 border-outline bg-surface px-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={FONT_SIZE_MIN}
                      max={FONT_SIZE_MAX}
                      step={1}
                      list="report-designer-font-sizes"
                      disabled={!selectedElement}
                      value={selectedElement?.fontSize ?? ""}
                      placeholder="—"
                      className="h-full w-8 appearance-none border-0 bg-transparent text-center text-sm font-semibold tabular-nums text-on-surface outline-none [appearance:textfield] disabled:cursor-not-allowed [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      onChange={(e) => {
                        const next = e.target.value === "" ? null : Number(e.target.value);
                        if (next == null) return;
                        setSelectedFontSize(next);
                      }}
                      onBlur={(e) => {
                        if (!selectedElement) return;
                        const next = Number(e.target.value);
                        setSelectedFontSize(Number.isFinite(next) ? next : selectedElement.fontSize);
                      }}
                    />
                    <span className="text-[10px] font-medium text-on-surface-variant">pt</span>
                  </div>
                  <datalist id="report-designer-font-sizes">
                    {FONT_SIZE_PRESETS.map((size) => (
                      <option key={size} value={size} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    aria-label={`${t("reportDesigner.fontSize")} +`}
                    disabled={!selectedElement || (selectedElement?.fontSize ?? FONT_SIZE_MAX) >= FONT_SIZE_MAX}
                    className="inline-flex w-9 items-center justify-center text-on-surface transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-40"
                    onClick={() => nudgeSelectedFontSize(1)}
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.25} />
                  </button>
                </div>
                <button
                  type="button"
                  title={t("reportDesigner.bold")}
                  disabled={!selectedElement}
                  className={`${toolbarBtn} ${selectedElement?.bold ? toolbarBtnActive : ""}`}
                  onClick={() => updateSelectedElement({ bold: !selectedElement?.bold })}
                >
                  <Bold className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                </button>
                <button
                  type="button"
                  title={t("reportDesigner.italic")}
                  disabled={!selectedElement}
                  className={`${toolbarBtn} ${selectedElement?.italic ? toolbarBtnActive : ""}`}
                  onClick={() => updateSelectedElement({ italic: !selectedElement?.italic })}
                >
                  <Italic className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                </button>
                <button
                  type="button"
                  title={t("reportDesigner.underline")}
                  disabled={!selectedElement}
                  className={`${toolbarBtn} ${selectedElement?.underline ? toolbarBtnActive : ""}`}
                  onClick={() => updateSelectedElement({ underline: !selectedElement?.underline })}
                >
                  <Underline className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                </button>
              </div>
            </div>

            <div className={ribbonGroup}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface">
                {t("reportDesigner.ribbonAlign")}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title={t("reportDesigner.left")}
                  disabled={!selectedElement}
                  className={`${toolbarBtn} ${selectedElement?.align === "left" ? toolbarBtnActive : ""}`}
                  onClick={() => updateSelectedElement({ align: "left" })}
                >
                  <AlignLeft className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                </button>
                <button
                  type="button"
                  title={t("reportDesigner.center")}
                  disabled={!selectedElement}
                  className={`${toolbarBtn} ${selectedElement?.align === "center" ? toolbarBtnActive : ""}`}
                  onClick={() => updateSelectedElement({ align: "center" })}
                >
                  <AlignCenter className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                </button>
                <button
                  type="button"
                  title={t("reportDesigner.right")}
                  disabled={!selectedElement}
                  className={`${toolbarBtn} ${selectedElement?.align === "right" ? toolbarBtnActive : ""}`}
                  onClick={() => updateSelectedElement({ align: "right" })}
                >
                  <AlignRight className={ribbonIconClass} strokeWidth={ribbonIconStroke} />
                </button>
              </div>
            </div>

            <div className={ribbonGroup}>
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface">
                <Grid3x3 className="h-3.5 w-3.5" strokeWidth={2.25} />
                {t("reportDesigner.ribbonGrid")}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-on-surface">
                  <Checkbox
                    inputId="showGrid"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(Boolean(e.checked))}
                  />
                  <span>{t("reportDesigner.showGrid")}</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-on-surface">
                  <Checkbox
                    inputId="snapToGrid"
                    checked={snapToGrid}
                    onChange={(e) => setSnapToGrid(Boolean(e.checked))}
                  />
                  <span>{t("reportDesigner.snapToGrid")}</span>
                </label>
                <div className="flex items-center gap-1">
                  {GRID_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`${toolbarBtn} h-9 w-auto px-2 text-xs font-semibold ${
                        gridSize === size ? toolbarBtnActive : ""
                      }`}
                      onClick={() => setGridSize(size)}
                      title={`${size}px`}
                    >
                      {size}px
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={ribbonGroup}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface">
                {t("reportDesigner.ribbonBand")}
              </div>
              <div className="text-sm font-medium text-on-surface">
                {sectionLabel(selectedSection)}
                {selectedElement ? ` · #${layout.elements.findIndex((el) => el.id === selectedElement.id) + 1}` : ""}
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[280px_minmax(0,1fr)_260px]">
            <div className={`${panelBand} border-t-0 p-3 xl:border-r-0`}>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Layers className="h-4 w-4" strokeWidth={1.75} />
                  {t("reportDesigner.groupAndSort")}
                </div>
                <label className="mb-2 flex items-center gap-2 text-xs text-on-surface">
                  <Checkbox
                    inputId="groupingEnabled"
                    checked={layout.grouping.enabled}
                    onChange={(e) =>
                      setLayout((current) => ({
                        ...current,
                        grouping: {
                          ...current.grouping,
                          enabled: Boolean(e.checked),
                          field:
                            current.grouping.field ||
                            preview?.columns[0] ||
                            "",
                        },
                      }))
                    }
                  />
                  <span>{t("reportDesigner.enableGrouping")}</span>
                </label>
                <div className="grid gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-on-surface-variant">{t("reportDesigner.groupByField")}</label>
                    <Dropdown
                      value={layout.grouping.field || null}
                      options={fieldOptions}
                      onChange={(e) =>
                        setLayout((current) => ({
                          ...current,
                          grouping: { ...current.grouping, field: e.value ?? "" },
                        }))
                      }
                      placeholder={t("reportDesigner.groupByPlaceholder")}
                      disabled={!layout.grouping.enabled || fieldOptions.length === 0}
                      className="w-full text-xs"
                    />
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={`${toolbarBtn} w-auto gap-1 px-2 text-xs ${
                        layout.grouping.sort === "asc" ? toolbarBtnActive : ""
                      }`}
                      disabled={!layout.grouping.enabled}
                      onClick={() =>
                        setLayout((current) => ({
                          ...current,
                          grouping: { ...current.grouping, sort: "asc" },
                        }))
                      }
                    >
                      <ArrowUpAZ className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {t("reportDesigner.sortAsc")}
                    </button>
                    <button
                      type="button"
                      className={`${toolbarBtn} w-auto gap-1 px-2 text-xs ${
                        layout.grouping.sort === "desc" ? toolbarBtnActive : ""
                      }`}
                      disabled={!layout.grouping.enabled}
                      onClick={() =>
                        setLayout((current) => ({
                          ...current,
                          grouping: { ...current.grouping, sort: "desc" },
                        }))
                      }
                    >
                      <ArrowDownAZ className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {t("reportDesigner.sortDesc")}
                    </button>
                  </div>
                  <div className="text-xs text-on-surface-variant">{t("reportDesigner.groupHint")}</div>
                </div>

              <div className="mt-3 border-t border-outline-variant pt-3">
                <div className="mb-2 text-sm font-semibold">{t("reportDesigner.sections")}</div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {visibleBands.map((band) => (
                    <button
                      key={band.section}
                      type="button"
                      className={`${toolbarBtn} w-auto px-2 text-xs ${
                        selectedSection === band.section ? toolbarBtnActive : ""
                      }`}
                      onClick={() => setSelectedSection(band.section)}
                    >
                      {t(band.shortKey)}
                    </button>
                  ))}
                </div>

                <div className="mb-3 grid gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-on-surface-variant">
                      {t("reportDesigner.bandHeight")} · {sectionLabel(selectedSection)}
                    </label>
                    <InputNumber
                      value={bandHeightOf(layout, selectedSection)}
                      onValueChange={(e) => setBandHeight(selectedSection, e.value ?? MIN_BAND_HEIGHT)}
                      min={MIN_BAND_HEIGHT}
                      max={MAX_BAND_HEIGHT}
                      showButtons
                    />
                  </div>
                  {selectedSection === "header" ? (
                    <label className="flex items-center gap-2 text-xs text-on-surface">
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

              <div className="border-t border-outline-variant pt-3">
                <div className="mb-2 text-sm font-semibold">{t("reportDesigner.textElements")}</div>
                <div className="flex flex-col gap-2">
                  {layout.elements
                    .filter((element) => {
                      if (
                        !layout.grouping.enabled &&
                        (element.section === "groupHeader" || element.section === "groupFooter")
                      ) {
                        return false;
                      }
                      return true;
                    })
                    .map((element, index) => (
                      <button
                        key={element.id}
                        type="button"
                        className={`rounded-sm border px-2 py-1 text-left text-xs ${
                          element.id === selectedElementId
                            ? "border-primary bg-primary/10"
                            : "border-outline-variant"
                        }`}
                        onClick={() => {
                          setSelectedElementId(element.id);
                          setSelectedSection(element.section);
                        }}
                      >
                        #{index + 1} [{t(BAND_META.find((b) => b.section === element.section)?.shortKey ?? "reportDesigner.detailShort")}]{" "}
                        — {element.text.slice(0, 28) || t("reportDesigner.emptyText")}
                      </button>
                    ))}
                </div>
              </div>

              {selectedElement ? (
                <div className="grid gap-2 border-t border-outline-variant pt-3">
                  <div className="text-xs uppercase tracking-wider text-on-surface-variant">
                    {t("reportDesigner.properties")}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-on-surface-variant">X</label>
                      <InputNumber
                        value={selectedElement.x}
                        onValueChange={(e) => updateSelectedElement({ x: e.value ?? 0 })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-on-surface-variant">Y</label>
                      <InputNumber
                        value={selectedElement.y}
                        onValueChange={(e) => updateSelectedElement({ y: e.value ?? 0 })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-on-surface-variant">{t("reportDesigner.width")}</label>
                      <InputNumber
                        value={selectedElement.width}
                        onValueChange={(e) => updateSelectedElement({ width: e.value ?? 100 })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-on-surface-variant">{t("reportDesigner.section")}</label>
                      <Dropdown
                        value={selectedElement.section}
                        options={visibleBands.map((band) => ({
                          label: t(band.labelKey),
                          value: band.section,
                        }))}
                        onChange={(e) => {
                          const nextSection = e.value as ReportSection;
                          updateSelectedElement({ section: nextSection });
                          setSelectedSection(nextSection);
                        }}
                        className="w-full text-xs"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-on-surface-variant">{t("reportDesigner.tokenHint")}</div>
                </div>
              ) : null}
            </div>

            <div className={`${panelBand} min-h-0 border-t-0`}>
              <div className="border-b border-outline-variant px-3 py-2 text-sm font-semibold">
                {t("reportDesigner.canvasPreview")}
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-[color-mix(in_srgb,var(--color-surface-container-high)_55%,transparent)] p-4">
                <div
                  className="relative mx-auto"
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
                        gutterLabels.push(
                          <div
                            key={`gutter-${section}-${top}`}
                            className={`pointer-events-none absolute right-2 flex items-start justify-end ${meta.labelTint} rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide`}
                            style={{
                              top: `${top + 2}px`,
                              maxWidth: `${BAND_GUTTER_WIDTH - 10}px`,
                              maxHeight: `${Math.max(height - 4, 14)}px`,
                            }}
                          >
                            <span className="truncate">
                              {t(meta.labelKey)}
                              {labelExtra ? ` · ${labelExtra}` : ""}
                            </span>
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
                            onClick={() => setSelectedSection(section)}
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
                            className="pointer-events-none absolute inset-y-0"
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
            </div>

            <div className={`${panelBand} border-t-0 p-3`}>
              <div className="mb-1 text-sm font-semibold">{t("reportDesigner.itemPool")}</div>
              <div className="mb-3 text-xs text-on-surface-variant">{t("reportDesigner.itemPoolHint")}</div>

              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                {t("reportDesigner.poolBasics")}
              </div>
              <div className="mb-3 flex flex-col gap-1.5">
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
                  </>
                ) : null}
              </div>

              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                {t("reportDesigner.queryFields")}
              </div>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
