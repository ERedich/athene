import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ArrowRight, Download, Plus, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
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

type QueryPreviewResponse = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
};

type TextElement = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  align: "left" | "center" | "right";
  bold: boolean;
};

const a4Size = { width: 595, height: 842 };

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;

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

function createDefaultElement(): TextElement {
  return {
    id: crypto.randomUUID(),
    text: "Titel: {{name}}",
    x: 50,
    y: 60,
    width: 500,
    fontSize: 14,
    align: "left",
    bold: true,
  };
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
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [elements, setElements] = useState<TextElement[]>([createDefaultElement()]);
  const [pdfLoading, setPdfLoading] = useState(false);

  const selectedRow = preview?.rows[selectedRowIndex] ?? null;
  const selectedElement = useMemo(
    () => elements.find((element) => element.id === selectedElementId) ?? null,
    [elements, selectedElementId],
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
      setSelectedRowIndex(0);
      if (!selectedElementId && elements[0]) {
        setSelectedElementId(elements[0].id);
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

  const updateSelectedElement = (patch: Partial<TextElement>) => {
    if (!selectedElementId) return;
    setElements((current) =>
      current.map((element) => (element.id === selectedElementId ? { ...element, ...patch } : element)),
    );
  };

  const addElement = () => {
    const element = createDefaultElement();
    setElements((current) => [...current, element]);
    setSelectedElementId(element.id);
  };

  const removeSelectedElement = () => {
    if (!selectedElementId) return;
    setElements((current) => {
      const next = current.filter((element) => element.id !== selectedElementId);
      setSelectedElementId(next[0]?.id ?? null);
      return next.length > 0 ? next : [createDefaultElement()];
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
          elements,
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
    if (!selectedElementId && elements[0]) {
      setSelectedElementId(elements[0].id);
    }
  }, [elements, selectedElementId]);

  const draggableHandlers = (element: TextElement) => ({
    onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setSelectedElementId(element.id);
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = element.x;
      const originY = element.y;

      const onMove = (moveEvent: MouseEvent) => {
        const nextX = originX + (moveEvent.clientX - startX);
        const nextY = originY + (moveEvent.clientY - startY);
        setElements((current) =>
          current.map((entry) =>
            entry.id === element.id
              ? {
                  ...entry,
                  x: Math.max(0, Math.min(a4Size.width - 20, Math.round(nextX))),
                  y: Math.max(0, Math.min(a4Size.height - 20, Math.round(nextY))),
                }
              : entry,
          ),
        );
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
  });

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
              selectionMode="single"
              selection={selectedRow}
              onSelectionChange={(e) => {
                const index = (preview?.rows ?? []).findIndex((row) => row === e.value);
                setSelectedRowIndex(index >= 0 ? index : 0);
              }}
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
            <div className="flex items-center justify-between">
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
              {elements.map((element, index) => (
                <button
                  key={element.id}
                  type="button"
                  className={`rounded-sm border px-2 py-1 text-left text-xs ${
                    element.id === selectedElementId
                      ? "border-primary bg-primary/10"
                      : "border-outline-variant"
                  }`}
                  onClick={() => setSelectedElementId(element.id)}
                >
                  #{index + 1} — {element.text.slice(0, 40) || t("reportDesigner.emptyText")}
                </button>
              ))}
            </div>

            {selectedElement ? (
              <div className="grid gap-2">
                <label className="text-xs uppercase tracking-wider text-on-surface-variant">
                  {t("reportDesigner.textTemplate")}
                </label>
                <InputTextarea
                  value={selectedElement.text}
                  onChange={(e) => updateSelectedElement({ text: e.target.value })}
                  rows={4}
                  className="font-mono text-xs"
                />
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-on-surface-variant">{t("reportDesigner.align")}</label>
                    <Dropdown
                      value={selectedElement.align}
                      options={[
                        { label: t("reportDesigner.left"), value: "left" },
                        { label: t("reportDesigner.center"), value: "center" },
                        { label: t("reportDesigner.right"), value: "right" },
                      ]}
                      onChange={(e) => updateSelectedElement({ align: e.value as TextElement["align"] })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-on-surface-variant">{t("reportDesigner.style")}</label>
                    <Dropdown
                      value={selectedElement.bold ? "bold" : "regular"}
                      options={[
                        { label: t("reportDesigner.regular"), value: "regular" },
                        { label: t("reportDesigner.bold"), value: "bold" },
                      ]}
                      onChange={(e) => updateSelectedElement({ bold: e.value === "bold" })}
                    />
                  </div>
                </div>
                <div className="text-xs text-on-surface-variant">{t("reportDesigner.tokenHint")}</div>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col gap-3 overflow-auto rounded-sm bg-surface-container-low p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{t("reportDesigner.canvasPreview")}</div>
              <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                <span>{t("reportDesigner.previewRowLabel")}</span>
                <InputNumber
                  value={selectedRowIndex + 1}
                  min={1}
                  max={Math.max(preview?.rows.length ?? 1, 1)}
                  onValueChange={(e) => {
                    const next = Math.max(1, Math.min(preview?.rows.length ?? 1, e.value ?? 1)) - 1;
                    setSelectedRowIndex(next);
                  }}
                  useGrouping={false}
                  showButtons
                />
              </div>
            </div>
            <div className="overflow-auto rounded-sm border border-outline-variant bg-surface p-4">
              <div
                ref={canvasRef}
                className="relative mx-auto border border-slate-300 bg-white shadow-sm"
                style={{ width: `${a4Size.width}px`, height: `${a4Size.height}px` }}
              >
                {elements.map((element) => (
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
                      border: element.id === selectedElementId ? "1px dashed #f97316" : "1px dashed transparent",
                      color: "#111827",
                      background: "transparent",
                      padding: "2px",
                      cursor: "move",
                    }}
                    onClick={() => setSelectedElementId(element.id)}
                    {...draggableHandlers(element)}
                  >
                    {selectedRow ? applyTemplate(element.text, selectedRow) : element.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
