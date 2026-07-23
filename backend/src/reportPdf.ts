import PDFDocument from "pdfkit";

import type { ReportLayout, ReportTextElement } from "./reportSemanticRegistry.js";

const MM_TO_PT = 72 / 25.4;

type PageDimsMm = { width: number; height: number };

function pageSizeMm(layout: ReportLayout): PageDimsMm {
  const sizes: Record<ReportLayout["pageSize"], PageDimsMm> = {
    A4: { width: 210, height: 297 },
    A5: { width: 148, height: 210 },
    Letter: { width: 215.9, height: 279.4 },
  };
  const base = sizes[layout.pageSize];
  if (layout.orientation === "landscape") {
    return { width: base.height, height: base.width };
  }
  return base;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "string") {
    // ISO timestamps → compact local-friendly display
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
    return value;
  }
  return String(value);
}

function resolveElementText(el: ReportTextElement, row: Record<string, unknown> | null): string {
  if (el.type === "label") return el.text ?? "";
  if (!row || !el.fieldId) return `{${el.fieldId ?? "?"}}`;
  return formatCell(row[el.fieldId]);
}

function drawTextElement(
  doc: PDFKit.PDFDocument,
  el: ReportTextElement,
  row: Record<string, unknown> | null,
) {
  const text = resolveElementText(el, row);
  const x = el.x * MM_TO_PT;
  const y = el.y * MM_TO_PT;
  const width = el.width * MM_TO_PT;
  const height = el.height * MM_TO_PT;

  doc
    .fillColor(el.color || "#111827")
    .font(el.fontWeight === "bold" ? "Helvetica-Bold" : "Helvetica")
    .fontSize(el.fontSize)
    .text(text, x, y, {
      width,
      height,
      align: el.align,
      lineBreak: true,
      ellipsis: true,
    });
}

function drawListHeader(
  doc: PDFKit.PDFDocument,
  layout: ReportLayout,
  columns: string[],
  startYMm: number,
): number {
  const left = layout.marginMm.left;
  const usableWidth =
    pageSizeMm(layout).width - layout.marginMm.left - layout.marginMm.right;
  const colWidth = columns.length > 0 ? usableWidth / columns.length : usableWidth;
  let x = left;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#374151");
  for (const col of columns) {
    doc.text(col, x * MM_TO_PT, startYMm * MM_TO_PT, {
      width: colWidth * MM_TO_PT,
      height: 6 * MM_TO_PT,
      ellipsis: true,
    });
    x += colWidth;
  }
  return startYMm + 8;
}

function drawListRow(
  doc: PDFKit.PDFDocument,
  layout: ReportLayout,
  columns: string[],
  row: Record<string, unknown>,
  yMm: number,
): number {
  const left = layout.marginMm.left;
  const usableWidth =
    pageSizeMm(layout).width - layout.marginMm.left - layout.marginMm.right;
  const colWidth = columns.length > 0 ? usableWidth / columns.length : usableWidth;
  let x = left;
  doc.font("Helvetica").fontSize(9).fillColor("#111827");
  for (const col of columns) {
    doc.text(formatCell(row[col]), x * MM_TO_PT, yMm * MM_TO_PT, {
      width: colWidth * MM_TO_PT,
      height: 6 * MM_TO_PT,
      ellipsis: true,
    });
    x += colWidth;
  }
  return yMm + 7;
}

export async function renderReportPdf(options: {
  layout: ReportLayout;
  rows: Record<string, unknown>[];
  columns: string[];
  title?: string;
}): Promise<Buffer> {
  const { layout, rows, columns, title } = options;
  const pageMm = pageSizeMm(layout);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [pageMm.width * MM_TO_PT, pageMm.height * MM_TO_PT],
      margin: 0,
      info: {
        Title: title || "Report",
        Creator: "Athene Report Designer",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (layout.dataMode === "list") {
      const dataColumns = columns.filter((c) => c !== "id");
      let y = layout.marginMm.top;
      if (title) {
        doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827");
        doc.text(title, layout.marginMm.left * MM_TO_PT, y * MM_TO_PT, {
          width: (pageMm.width - layout.marginMm.left - layout.marginMm.right) * MM_TO_PT,
        });
        y += 12;
      }
      // Static label elements above the list (if any)
      for (const el of layout.elements.filter((e) => e.type === "label")) {
        drawTextElement(doc, el, null);
      }
      y = Math.max(y, layout.marginMm.top + 20);
      y = drawListHeader(doc, layout, dataColumns, y);
      const maxY = pageMm.height - layout.marginMm.bottom;
      for (const row of rows) {
        if (y + 7 > maxY) {
          doc.addPage({ size: [pageMm.width * MM_TO_PT, pageMm.height * MM_TO_PT], margin: 0 });
          y = layout.marginMm.top;
          y = drawListHeader(doc, layout, dataColumns, y);
        }
        y = drawListRow(doc, layout, dataColumns, row, y);
      }
      if (rows.length === 0) {
        doc.font("Helvetica").fontSize(10).fillColor("#6b7280");
        doc.text("Keine Daten", layout.marginMm.left * MM_TO_PT, y * MM_TO_PT);
      }
    } else {
      // onePagePerRow — classic order-card style
      const dataRows = rows.length > 0 ? rows : [null];
      dataRows.forEach((row, index) => {
        if (index > 0) {
          doc.addPage({ size: [pageMm.width * MM_TO_PT, pageMm.height * MM_TO_PT], margin: 0 });
        }
        for (const el of layout.elements) {
          drawTextElement(doc, el, row);
        }
      });
    }

    doc.end();
  });
}
