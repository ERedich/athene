import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowRight,
  Bold,
  Download,
  Italic,
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
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Toast } from "primereact/toast";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";

type Step = 1 | 2;
type ReportSection = "header" | "detail";

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

type ReportLayout = {
  header: { height: number; firstPageOnly: boolean };
  detail: { height: number };
  elements: ReportElement[];
};

const a4Size = { width: 595, height: 842 };
const MIN_BAND_HEIGHT = 24;
const MAX_HEADER_HEIGHT = 400;
const MAX_DETAIL_HEIGHT = 400;
const FIELD_DND_MIME = "application/x-report-field";

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const toolbarBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-sm border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-high";
const toolbarBtnActive = "border-primary bg-primary/10 text-primary";

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

function applyTemplate(template: string, row: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) =>
    toPreviewText(row[key]),
  );
}

function createDefaultLayout(): ReportLayout {
  return {
    header: { height: 80, firstPageOnly: false },
    detail: { height: 36 },
    elements: [
      {
        id: crypto.randomUUID(),
        section: "header",
        text: "Report",
        x: 40,
        y: 24,
        width: 500,
        fontSize: 18,
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
    y: patch.y ?? 8,
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

export function ReportDesignerPage() {
  const { t } = useTranslation();
  const toastRef = useRef<Toast>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
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

  const headerElements = useMemo(
    () => layout.elements.filter((element) => element.section === "header"),
    [layout.elements],
  );
  const detailElements = useMemo(
    () => layout.elements.filter((element) => element.section === "detail"),
    [layout.elements],
  );

  const previewDetailRows = useMemo(() => {
    const available = a4Size.height - layout.header.height;
    const maxRows = Math.max(1, Math.floor(available / layout.detail.height));
    return (preview?.rows ?? []).slice(0, maxRows);
  }, [layout.detail.height, layout.header.height, preview?.rows]);

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
        const bandHeight =
          next.section === "header" ? current.header.height : current.detail.height;
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
      text: selectedSection === "header" ? "Header" : "{{name}}",
      y: selectedSection === "header" ? 20 : 8,
      bold: selectedSection === "header",
      fontSize: selectedSection === "header" ? 16 : 12,
      width: selectedSection === "header" ? 500 : 200,
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
                y: 24,
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

  const setHeaderHeight = (height: number) => {
    const nextHeight = clamp(height, MIN_BAND_HEIGHT, MAX_HEADER_HEIGHT);
    setLayout((current) => {
      const maxHeader = Math.min(MAX_HEADER_HEIGHT, a4Size.height - current.detail.height);
      const headerHeight = clamp(nextHeight, MIN_BAND_HEIGHT, maxHeader);
      return {
        ...current,
        header: { ...current.header, height: headerHeight },
        elements: current.elements.map((element) =>
          element.section === "header"
            ? { ...element, y: clamp(element.y, 0, Math.max(headerHeight - 8, 0)) }
            : element,
        ),
      };
    });
  };

  const setDetailHeight = (height: number) => {
    const nextHeight = clamp(height, MIN_BAND_HEIGHT, MAX_DETAIL_HEIGHT);
    setLayout((current) => {
      const maxDetail = Math.min(MAX_DETAIL_HEIGHT, a4Size.height - current.header.height);
      const detailHeight = clamp(nextHeight, MIN_BAND_HEIGHT, maxDetail);
      return {
        ...current,
        detail: { height: detailHeight },
        elements: current.elements.map((element) =>
          element.section === "detail"
            ? { ...element, y: clamp(element.y, 0, Math.max(detailHeight - 8, 0)) }
            : element,
        ),
      };
    });
  };

  const startBandResize = (band: "header" | "detail", event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const origin =
      band === "header" ? layout.header.height : layout.detail.height;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      if (band === "header") setHeaderHeight(origin + delta);
      else setDetailHeight(origin + delta);
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
      const bandHeight =
        element.section === "header" ? layout.header.height : layout.detail.height;

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
    const bandHeight = section === "header" ? layout.header.height : layout.detail.height;
    const x = clamp(Math.round(event.clientX - rect.left), 0, a4Size.width - 20);
    const rawY = Math.round(event.clientY - rect.top);
    const yInBand = section === "detail" && bandHeight > 0 ? rawY % bandHeight : rawY;
    const y = clamp(yInBand, 0, Math.max(bandHeight - 8, 0));

    const element = createElement(section, {
      text: `{{${columnName}}}`,
      x,
      y,
      width: Math.min(220, a4Size.width - x - 8),
      fontSize: section === "header" ? 14 : 12,
      bold: section === "header",
    });
    setLayout((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedElementId(element.id);
    setSelectedSection(section);
  };

  const renderElementButton = (
    element: ReportElement,
    row: Record<string, unknown> | null,
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
      {row ? applyTemplate(element.text, row) : element.text}
    </button>
  );

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
              <div className="mb-2 text-sm font-semibold">{t("reportDesigner.sections")}</div>
              <div className="mb-2 flex gap-1">
                <button
                  type="button"
                  className={`${toolbarBtn} w-auto px-2 text-xs ${selectedSection === "header" ? toolbarBtnActive : ""}`}
                  onClick={() => setSelectedSection("header")}
                >
                  {t("reportDesigner.headerSection")}
                </button>
                <button
                  type="button"
                  className={`${toolbarBtn} w-auto px-2 text-xs ${selectedSection === "detail" ? toolbarBtnActive : ""}`}
                  onClick={() => setSelectedSection("detail")}
                >
                  {t("reportDesigner.detailSection")}
                </button>
              </div>

              {selectedSection === "header" ? (
                <div className="mb-3 grid gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-on-surface-variant">{t("reportDesigner.bandHeight")}</label>
                    <InputNumber
                      value={layout.header.height}
                      onValueChange={(e) => setHeaderHeight(e.value ?? MIN_BAND_HEIGHT)}
                      min={MIN_BAND_HEIGHT}
                      max={MAX_HEADER_HEIGHT}
                      showButtons
                    />
                  </div>
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
                </div>
              ) : (
                <div className="mb-3 flex flex-col gap-1">
                  <label className="text-xs text-on-surface-variant">{t("reportDesigner.bandHeight")}</label>
                  <InputNumber
                    value={layout.detail.height}
                    onValueChange={(e) => setDetailHeight(e.value ?? MIN_BAND_HEIGHT)}
                    min={MIN_BAND_HEIGHT}
                    max={MAX_DETAIL_HEIGHT}
                    showButtons
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-outline-variant pt-3">
              <div className="text-sm font-semibold">{t("reportDesigner.textElements")}</div>
              <div className="flex items-center gap-1">
                <button type="button" className={createActionNavItem} onClick={addElement}>
                  <Plus className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button type="button" className={deleteActionNavItem} onClick={removeSelectedElement}>
                  <Trash2 className="h-4 w-4 text-red-500" strokeWidth={1.75} />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {layout.elements.map((element, index) => (
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
                  #{index + 1} [{element.section === "header" ? t("reportDesigner.headerShort") : t("reportDesigner.detailShort")}]{" "}
                  — {element.text.slice(0, 32) || t("reportDesigner.emptyText")}
                </button>
              ))}
            </div>

            {selectedElement ? (
              <div className="grid gap-2 border-t border-outline-variant pt-3">
                <label className="text-xs uppercase tracking-wider text-on-surface-variant">
                  {t("reportDesigner.textTemplate")}
                </label>
                <InputTextarea
                  value={selectedElement.text}
                  onChange={(e) => updateSelectedElement({ text: e.target.value })}
                  rows={3}
                  className="font-mono text-xs"
                />

                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    title={t("reportDesigner.left")}
                    className={`${toolbarBtn} ${selectedElement.align === "left" ? toolbarBtnActive : ""}`}
                    onClick={() => updateSelectedElement({ align: "left" })}
                  >
                    <AlignLeft className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    title={t("reportDesigner.center")}
                    className={`${toolbarBtn} ${selectedElement.align === "center" ? toolbarBtnActive : ""}`}
                    onClick={() => updateSelectedElement({ align: "center" })}
                  >
                    <AlignCenter className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    title={t("reportDesigner.right")}
                    className={`${toolbarBtn} ${selectedElement.align === "right" ? toolbarBtnActive : ""}`}
                    onClick={() => updateSelectedElement({ align: "right" })}
                  >
                    <AlignRight className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <span className="mx-1 w-px self-stretch bg-outline-variant" />
                  <button
                    type="button"
                    title={t("reportDesigner.bold")}
                    className={`${toolbarBtn} ${selectedElement.bold ? toolbarBtnActive : ""}`}
                    onClick={() => updateSelectedElement({ bold: !selectedElement.bold })}
                  >
                    <Bold className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    title={t("reportDesigner.italic")}
                    className={`${toolbarBtn} ${selectedElement.italic ? toolbarBtnActive : ""}`}
                    onClick={() => updateSelectedElement({ italic: !selectedElement.italic })}
                  >
                    <Italic className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    title={t("reportDesigner.underline")}
                    className={`${toolbarBtn} ${selectedElement.underline ? toolbarBtnActive : ""}`}
                    onClick={() => updateSelectedElement({ underline: !selectedElement.underline })}
                  >
                    <Underline className="h-4 w-4" strokeWidth={1.75} />
                  </button>
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
                    <label className="text-xs text-on-surface-variant">{t("reportDesigner.fontSize")}</label>
                    <InputNumber
                      value={selectedElement.fontSize}
                      onValueChange={(e) => updateSelectedElement({ fontSize: e.value ?? 12 })}
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
                ref={canvasRef}
                className="relative mx-auto border border-slate-300 bg-white shadow-sm"
                style={{ width: `${a4Size.width}px`, height: `${a4Size.height}px` }}
              >
                <div
                  className={`absolute inset-x-0 top-0 ${
                    dropTarget === "header" ? "bg-sky-100/70" : "bg-sky-50/40"
                  }`}
                  style={{ height: `${layout.header.height}px` }}
                  onDragOver={(event) => onBandDragOver("header", event)}
                  onDragLeave={() => onBandDragLeave("header")}
                  onDrop={(event) => onBandDrop("header", event)}
                  onClick={() => setSelectedSection("header")}
                >
                  <div className="pointer-events-none absolute left-1 top-1 rounded-sm bg-sky-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
                    {t("reportDesigner.headerSection")}
                    {layout.header.firstPageOnly ? ` · ${t("reportDesigner.firstPageOnlyShort")}` : ""}
                  </div>
                  {headerElements.map((element) =>
                    renderElementButton(element, preview?.rows[0] ?? null),
                  )}
                  <div
                    className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-row-resize bg-sky-400/50 hover:bg-sky-500"
                    onMouseDown={(event) => startBandResize("header", event)}
                  />
                </div>

                <div
                  className={`absolute inset-x-0 ${
                    dropTarget === "detail" ? "bg-amber-100/60" : "bg-amber-50/30"
                  }`}
                  style={{
                    top: `${layout.header.height}px`,
                    height: `${Math.max(a4Size.height - layout.header.height, layout.detail.height)}px`,
                  }}
                  onDragOver={(event) => onBandDragOver("detail", event)}
                  onDragLeave={() => onBandDragLeave("detail")}
                  onDrop={(event) => onBandDrop("detail", event)}
                  onClick={() => setSelectedSection("detail")}
                >
                  <div className="pointer-events-none absolute left-1 top-1 z-10 rounded-sm bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                    {t("reportDesigner.detailSection")}
                  </div>

                  {previewDetailRows.length > 0
                    ? previewDetailRows.map((row, rowIndex) => (
                        <div
                          key={`detail-row-${rowIndex}`}
                          className="absolute inset-x-0 border-b border-dashed border-amber-200/80"
                          style={{
                            top: `${rowIndex * layout.detail.height}px`,
                            height: `${layout.detail.height}px`,
                          }}
                        >
                          {detailElements.map((element) =>
                            renderElementButton(
                              element,
                              row,
                              `-row-${rowIndex}`,
                              rowIndex === 0,
                            ),
                          )}
                          {rowIndex === 0 ? (
                            <div
                              className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-row-resize bg-amber-400/50 hover:bg-amber-500"
                              onMouseDown={(event) => startBandResize("detail", event)}
                            />
                          ) : null}
                        </div>
                      ))
                    : (
                        <div
                          className="absolute inset-x-0 border-b border-dashed border-amber-200/80"
                          style={{ top: 0, height: `${layout.detail.height}px` }}
                        >
                          {detailElements.map((element) => renderElementButton(element, null))}
                          <div
                            className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-row-resize bg-amber-400/50 hover:bg-amber-500"
                            onMouseDown={(event) => startBandResize("detail", event)}
                          />
                        </div>
                      )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
