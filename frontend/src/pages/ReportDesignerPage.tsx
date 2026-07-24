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
  Italic,
  Layers,
  Plus,
  Sparkles,
  Trash2,
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
const MIN_BAND_HEIGHT = 16;
const MAX_BAND_HEIGHT = 400;
const FIELD_DND_MIME = "application/x-report-field";

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
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const toolbarBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-sm border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-40";
const toolbarBtnActive = "border-primary bg-primary/10 text-primary";
const ribbonGroup =
  "flex min-w-0 flex-col gap-1 border-r border-outline-variant px-3 py-1 last:border-r-0";

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

function compareGroupValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function buildPreviewGroups(
  rows: Record<string, unknown>[],
  grouping: ReportLayout["grouping"],
): { key: string; rows: Record<string, unknown>[] }[] {
  if (!grouping.enabled || !grouping.field) {
    return [{ key: "", rows }];
  }
  const field = grouping.field;
  const sorted = [...rows].sort((left, right) => {
    const cmp = compareGroupValues(left[field], right[field]);
    return grouping.sort === "desc" ? -cmp : cmp;
  });
  const groups: { key: string; rows: Record<string, unknown>[] }[] = [];
  for (const row of sorted) {
    const key = toPreviewText(row[field]);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, rows: [row] });
  }
  return groups;
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

  const previewGroups = useMemo(() => {
    const groups = buildPreviewGroups(preview?.rows ?? [], layout.grouping);
    return groups.slice(0, 3);
  }, [layout.grouping, preview?.rows]);

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
      if (!res.ok) throw new Error("query");
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
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("reportDesigner.queryError"),
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
        next.x = clamp(next.x, 0, a4Size.width - 20);
        next.y = clamp(next.y, 0, Math.max(bandHeight - 8, 0));
        next.width = clamp(next.width, 20, 560);
        next.fontSize = clamp(next.fontSize, 8, 48);
        return next;
      }),
    }));
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
        const nextX = originX + (moveEvent.clientX - startX);
        const nextY = originY + (moveEvent.clientY - startY);
        setLayout((current) => ({
          ...current,
          elements: current.elements.map((entry) =>
            entry.id === element.id
              ? {
                  ...entry,
                  x: clamp(Math.round(nextX), 0, a4Size.width - 20),
                  y: clamp(Math.round(nextY), 0, Math.max(bandHeight - 8, 0)),
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
    event.dataTransfer.setData("text/plain", columnName);
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
    const columnName =
      event.dataTransfer.getData(FIELD_DND_MIME) || event.dataTransfer.getData("text/plain");
    if (!columnName) return;

    const bandEl = event.currentTarget as HTMLElement;
    const rect = bandEl.getBoundingClientRect();
    const bandHeight = bandHeightOf(layout, section);
    const x = clamp(Math.round(event.clientX - rect.left), 0, a4Size.width - 20);
    const rawY = Math.round(event.clientY - rect.top);
    const yInBand = section === "detail" && bandHeight > 0 ? rawY % bandHeight : rawY;
    const y = clamp(yInBand, 0, Math.max(bandHeight - 8, 0));

    const element = createElement(section, {
      text: `{{${columnName}}}`,
      x,
      y,
      width: Math.min(220, a4Size.width - x - 8),
      fontSize: section === "header" ? 14 : section === "footer" ? 10 : 12,
      bold: section === "header" || section === "groupHeader",
    });
    setLayout((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedElementId(element.id);
    setSelectedSection(section);
  };

  const renderElementButton = (
    element: ReportElement,
    row: Record<string, unknown> | null,
    extras: Record<string, string>,
    keySuffix = "",
    interactive = true,
  ) => (
    <button
      key={`${element.id}${keySuffix}`}
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
        border:
          interactive && element.id === selectedElementId
            ? "1px dashed #f97316"
            : "1px dashed transparent",
        color: "#111827",
        background: "transparent",
        padding: "2px",
        cursor: interactive ? "move" : "default",
        pointerEvents: interactive ? "auto" : "none",
      }}
      onClick={
        interactive
          ? () => {
              setSelectedElementId(element.id);
              setSelectedSection(element.section);
            }
          : undefined
      }
      {...(interactive ? draggableHandlers(element) : {})}
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

  const canvasContentHeight = useMemo(() => {
    let height = layout.header.height + layout.footer.height;
    if (layout.grouping.enabled) {
      for (const group of previewGroups.length > 0 ? previewGroups : [{ key: "", rows: [{}] }]) {
        height += layout.groupHeader.height;
        height += Math.max(group.rows.length, 1) * layout.detail.height;
        height += layout.groupFooter.height;
      }
    } else {
      const rowCount = Math.max((preview?.rows ?? []).slice(0, 12).length, 1);
      height += rowCount * layout.detail.height;
    }
    return Math.min(a4Size.height, Math.max(height, 320));
  }, [layout, preview?.rows, previewGroups]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <Toast ref={toastRef} />

      <div className="rounded-sm border border-outline-variant bg-surface-container-low p-3 text-sm text-on-surface-variant">
        {t("reportDesigner.hint")}
      </div>

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
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-stretch rounded-sm border border-outline-variant bg-surface-container-low">
            <div className={ribbonGroup}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                {t("reportDesigner.ribbonClipboard")}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className={createActionNavItem} onClick={addElement} title={t("reportDesigner.addText")}>
                  <Plus className="h-4 w-4" strokeWidth={1.75} />
                  <span>{t("reportDesigner.addText")}</span>
                </button>
                <button
                  type="button"
                  className={deleteActionNavItem}
                  onClick={removeSelectedElement}
                  disabled={!selectedElement}
                  title={t("reportDesigner.deleteText")}
                >
                  <Trash2 className="h-4 w-4 text-red-500" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className={`${ribbonGroup} min-w-[220px] flex-1`}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                {t("reportDesigner.ribbonText")}
              </div>
              <InputText
                value={selectedElement?.text ?? ""}
                onChange={(e) => updateSelectedElement({ text: e.target.value })}
                disabled={!selectedElement}
                className="w-full font-mono text-xs"
                placeholder={t("reportDesigner.textTemplate")}
              />
            </div>

            <div className={ribbonGroup}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                {t("reportDesigner.ribbonFont")}
              </div>
              <div className="flex items-center gap-1">
                <InputNumber
                  value={selectedElement?.fontSize ?? 12}
                  onValueChange={(e) => updateSelectedElement({ fontSize: e.value ?? 12 })}
                  disabled={!selectedElement}
                  min={8}
                  max={48}
                  showButtons
                  buttonLayout="horizontal"
                  className="w-[7.5rem]"
                  inputClassName="w-12 text-center text-xs"
                />
                <button
                  type="button"
                  title={t("reportDesigner.bold")}
                  disabled={!selectedElement}
                  className={`${toolbarBtn} ${selectedElement?.bold ? toolbarBtnActive : ""}`}
                  onClick={() => updateSelectedElement({ bold: !selectedElement?.bold })}
                >
                  <Bold className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  title={t("reportDesigner.italic")}
                  disabled={!selectedElement}
                  className={`${toolbarBtn} ${selectedElement?.italic ? toolbarBtnActive : ""}`}
                  onClick={() => updateSelectedElement({ italic: !selectedElement?.italic })}
                >
                  <Italic className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  title={t("reportDesigner.underline")}
                  disabled={!selectedElement}
                  className={`${toolbarBtn} ${selectedElement?.underline ? toolbarBtnActive : ""}`}
                  onClick={() => updateSelectedElement({ underline: !selectedElement?.underline })}
                >
                  <Underline className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className={ribbonGroup}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                {t("reportDesigner.ribbonAlign")}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title={t("reportDesigner.left")}
                  disabled={!selectedElement}
                  className={`${toolbarBtn} ${selectedElement?.align === "left" ? toolbarBtnActive : ""}`}
                  onClick={() => updateSelectedElement({ align: "left" })}
                >
                  <AlignLeft className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  title={t("reportDesigner.center")}
                  disabled={!selectedElement}
                  className={`${toolbarBtn} ${selectedElement?.align === "center" ? toolbarBtnActive : ""}`}
                  onClick={() => updateSelectedElement({ align: "center" })}
                >
                  <AlignCenter className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  title={t("reportDesigner.right")}
                  disabled={!selectedElement}
                  className={`${toolbarBtn} ${selectedElement?.align === "right" ? toolbarBtnActive : ""}`}
                  onClick={() => updateSelectedElement({ align: "right" })}
                >
                  <AlignRight className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className={ribbonGroup}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                {t("reportDesigner.ribbonBand")}
              </div>
              <div className="text-xs text-on-surface">
                {sectionLabel(selectedSection)}
                {selectedElement ? ` · #${layout.elements.findIndex((el) => el.id === selectedElement.id) + 1}` : ""}
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[320px_1fr]">
            <div className="flex min-h-0 flex-col gap-3 overflow-auto rounded-sm bg-surface-container-low p-4">
              <div>
                <div className="mb-2 text-sm font-semibold">{t("reportDesigner.queryFields")}</div>
                <div className="mb-2 text-xs text-on-surface-variant">{t("reportDesigner.dndHint")}</div>
                <div className="flex flex-wrap gap-1.5">
                  {(preview?.columns ?? []).map((columnName) => (
                    <span
                      key={columnName}
                      draggable
                      onDragStart={(event) => onFieldDragStart(columnName, event)}
                      className="cursor-grab rounded-sm border border-outline-variant bg-surface px-2 py-1 font-mono text-xs active:cursor-grabbing"
                    >
                      {columnName}
                    </span>
                  ))}
                  {(preview?.columns ?? []).length === 0 ? (
                    <span className="text-xs text-on-surface-variant">{t("reportDesigner.noFields")}</span>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-outline-variant pt-3">
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
              </div>

              <div className="border-t border-outline-variant pt-3">
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

            <div className="flex min-h-0 flex-col gap-3 overflow-auto rounded-sm bg-surface-container-low p-4">
              <div className="text-sm font-semibold">{t("reportDesigner.canvasPreview")}</div>
              <div className="overflow-auto rounded-sm border border-outline-variant bg-surface p-4">
                <div
                  className="relative mx-auto border border-slate-300 bg-white shadow-sm"
                  style={{ width: `${a4Size.width}px`, height: `${canvasContentHeight}px` }}
                >
                  {(() => {
                    let offset = 0;
                    const nodes: ReactNode[] = [];

                    const pushBand = (
                      section: ReportSection,
                      height: number,
                      content: React.ReactNode,
                      options?: { resizable?: boolean; labelExtra?: string },
                    ) => {
                      const meta = BAND_META.find((band) => band.section === section)!;
                      const top = offset;
                      offset += height;
                      nodes.push(
                        <div
                          key={`${section}-${top}`}
                          className={`absolute inset-x-0 ${
                            dropTarget === section ? meta.dropTint : meta.tint
                          } ${selectedSection === section ? meta.tintStrong : ""}`}
                          style={{ top: `${top}px`, height: `${height}px` }}
                          onDragOver={(event) => onBandDragOver(section, event)}
                          onDragLeave={() => onBandDragLeave(section)}
                          onDrop={(event) => onBandDrop(section, event)}
                          onClick={() => setSelectedSection(section)}
                        >
                          <div
                            className={`pointer-events-none absolute left-1 top-1 z-10 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.labelTint}`}
                          >
                            {t(meta.labelKey)}
                            {options?.labelExtra ? ` · ${options.labelExtra}` : ""}
                          </div>
                          {content}
                          {options?.resizable !== false ? (
                            <div
                              className={`absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-row-resize ${meta.resizeTint}`}
                              onMouseDown={(event) => startBandResize(section, event)}
                            />
                          ) : null}
                        </div>,
                      );
                    };

                    pushBand(
                      "header",
                      layout.header.height,
                      elementsFor("header").map((element) =>
                        renderElementButton(element, preview?.rows[0] ?? null, { _pageNumber: "1" }),
                      ),
                      {
                        labelExtra: layout.header.firstPageOnly
                          ? t("reportDesigner.firstPageOnlyShort")
                          : undefined,
                      },
                    );

                    if (layout.grouping.enabled) {
                      const groups =
                        previewGroups.length > 0
                          ? previewGroups
                          : [{ key: t("reportDesigner.sampleGroup"), rows: [{} as Record<string, unknown>] }];

                      groups.forEach((group, groupIndex) => {
                        const extras = {
                          _groupValue: group.key || t("reportDesigner.sampleGroup"),
                          _groupCount: String(Math.max(group.rows.length, 1)),
                          _pageNumber: "1",
                        };
                        pushBand(
                          "groupHeader",
                          layout.groupHeader.height,
                          elementsFor("groupHeader").map((element) =>
                            renderElementButton(
                              element,
                              group.rows[0] ?? null,
                              extras,
                              `-gh-${groupIndex}`,
                              groupIndex === 0,
                            ),
                          ),
                          { resizable: groupIndex === 0 },
                        );

                        const detailRows =
                          group.rows.length > 0 ? group.rows.slice(0, 8) : [{} as Record<string, unknown>];
                        detailRows.forEach((row, rowIndex) => {
                          const detailTop = offset;
                          offset += layout.detail.height;
                          nodes.push(
                            <div
                              key={`detail-${groupIndex}-${rowIndex}`}
                              className={`absolute inset-x-0 border-b border-dashed border-amber-200/80 ${
                                dropTarget === "detail" ? "bg-amber-100/70" : "bg-amber-50/40"
                              }`}
                              style={{ top: `${detailTop}px`, height: `${layout.detail.height}px` }}
                              onDragOver={(event) => onBandDragOver("detail", event)}
                              onDragLeave={() => onBandDragLeave("detail")}
                              onDrop={(event) => onBandDrop("detail", event)}
                              onClick={() => setSelectedSection("detail")}
                            >
                              {groupIndex === 0 && rowIndex === 0 ? (
                                <div className="pointer-events-none absolute left-1 top-1 z-10 rounded-sm bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                                  {t("reportDesigner.detailSection")}
                                </div>
                              ) : null}
                              {elementsFor("detail").map((element) =>
                                renderElementButton(
                                  element,
                                  row,
                                  extras,
                                  `-g${groupIndex}-r${rowIndex}`,
                                  groupIndex === 0 && rowIndex === 0,
                                ),
                              )}
                              {groupIndex === 0 && rowIndex === 0 ? (
                                <div
                                  className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-row-resize bg-amber-400/50 hover:bg-amber-500"
                                  onMouseDown={(event) => startBandResize("detail", event)}
                                />
                              ) : null}
                            </div>,
                          );
                        });

                        pushBand(
                          "groupFooter",
                          layout.groupFooter.height,
                          elementsFor("groupFooter").map((element) =>
                            renderElementButton(
                              element,
                              group.rows[0] ?? null,
                              extras,
                              `-gf-${groupIndex}`,
                              groupIndex === 0,
                            ),
                          ),
                          { resizable: groupIndex === 0 },
                        );
                      });
                    } else {
                      const detailRows =
                        (preview?.rows ?? []).length > 0
                          ? (preview?.rows ?? []).slice(0, 12)
                          : [{} as Record<string, unknown>];
                      detailRows.forEach((row, rowIndex) => {
                        const detailTop = offset;
                        offset += layout.detail.height;
                        nodes.push(
                          <div
                            key={`detail-plain-${rowIndex}`}
                            className={`absolute inset-x-0 border-b border-dashed border-amber-200/80 ${
                              dropTarget === "detail" ? "bg-amber-100/70" : "bg-amber-50/40"
                            }`}
                            style={{ top: `${detailTop}px`, height: `${layout.detail.height}px` }}
                            onDragOver={(event) => onBandDragOver("detail", event)}
                            onDragLeave={() => onBandDragLeave("detail")}
                            onDrop={(event) => onBandDrop("detail", event)}
                            onClick={() => setSelectedSection("detail")}
                          >
                            {rowIndex === 0 ? (
                              <div className="pointer-events-none absolute left-1 top-1 z-10 rounded-sm bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                                {t("reportDesigner.detailSection")}
                              </div>
                            ) : null}
                            {elementsFor("detail").map((element) =>
                              renderElementButton(
                                element,
                                Object.keys(row).length ? row : null,
                                { _pageNumber: "1" },
                                `-r${rowIndex}`,
                                rowIndex === 0,
                              ),
                            )}
                            {rowIndex === 0 ? (
                              <div
                                className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-row-resize bg-amber-400/50 hover:bg-amber-500"
                                onMouseDown={(event) => startBandResize("detail", event)}
                              />
                            ) : null}
                          </div>,
                        );
                      });
                    }

                    const footerTop = Math.max(offset, canvasContentHeight - layout.footer.height);
                    nodes.push(
                      <div
                        key="footer-band"
                        className={`absolute inset-x-0 ${
                          dropTarget === "footer" ? "bg-slate-100/90" : "bg-slate-50/70"
                        }`}
                        style={{ top: `${footerTop}px`, height: `${layout.footer.height}px` }}
                        onDragOver={(event) => onBandDragOver("footer", event)}
                        onDragLeave={() => onBandDragLeave("footer")}
                        onDrop={(event) => onBandDrop("footer", event)}
                        onClick={() => setSelectedSection("footer")}
                      >
                        <div className="pointer-events-none absolute left-1 top-1 z-10 rounded-sm bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                          {t("reportDesigner.footerSection")}
                        </div>
                        {elementsFor("footer").map((element) =>
                          renderElementButton(element, preview?.rows[0] ?? null, { _pageNumber: "1" }),
                        )}
                        <div
                          className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-row-resize bg-slate-400/50 hover:bg-slate-500"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const startY = event.clientY;
                            const origin = layout.footer.height;
                            const onMove = (moveEvent: MouseEvent) => {
                              // Dragging the top edge up increases height.
                              setBandHeight("footer", origin - (moveEvent.clientY - startY));
                            };
                            const onUp = () => {
                              window.removeEventListener("mousemove", onMove);
                              window.removeEventListener("mouseup", onUp);
                            };
                            window.addEventListener("mousemove", onMove);
                            window.addEventListener("mouseup", onUp);
                          }}
                        />
                      </div>,
                    );

                    return nodes;
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
