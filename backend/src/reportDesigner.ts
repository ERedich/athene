import { Router, type Request, type Response } from "express";
import PDFDocument from "pdfkit";

import { pool } from "./db.js";

const router = Router();

const MAX_PREVIEW_ROWS = 200;
const MAX_PDF_ROWS = 200;
const MAX_TEXT_ELEMENTS = 100;
const MAX_QUERY_LENGTH = 8000;
const MAX_TEXT_LENGTH = 1000;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MIN_BAND_HEIGHT = 24;
const MAX_HEADER_HEIGHT = 400;
const MAX_DETAIL_HEIGHT = 400;

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
};

type ReportSection = "header" | "detail";

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

type RenderPdfBody = {
  title: string;
  rows: Record<string, unknown>[];
  layout: ReportLayout;
};

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

function parseQueryPreviewBody(body: unknown): QueryPreviewBody | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const sql = typeof obj.sql === "string" ? obj.sql : "";
  const sanitized = sanitizeSql(sql);
  if (!sanitized) return null;
  const limitRaw = Number(obj.limit ?? 50);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_PREVIEW_ROWS, Math.floor(limitRaw)))
    : 50;
  return { sql: sanitized, limit };
}

function toSafeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function applyTemplate(text: string, row: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) =>
    toSafeText(row[key]),
  );
}

function resolveFont(bold: boolean, italic: boolean): string {
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function parseReportElement(raw: unknown, bandHeight: number): ReportElement | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : "";
  const sectionRaw = typeof obj.section === "string" ? obj.section : "";
  const section: ReportSection | null =
    sectionRaw === "header" || sectionRaw === "detail" ? sectionRaw : null;
  const text =
    typeof obj.text === "string" ? obj.text.slice(0, MAX_TEXT_LENGTH) : "";
  const x = Number(obj.x);
  const y = Number(obj.y);
  const width = Number(obj.width);
  const fontSize = Number(obj.fontSize);
  const alignRaw = typeof obj.align === "string" ? obj.align : "left";
  const align = alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
  const bold = Boolean(obj.bold);
  const italic = Boolean(obj.italic);
  const underline = Boolean(obj.underline);

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
    fontSize: Math.round(fontSize),
    align,
    bold,
    italic,
    underline,
  };
}

function parseReportLayout(raw: unknown): ReportLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const headerRaw = obj.header && typeof obj.header === "object" ? (obj.header as Record<string, unknown>) : null;
  const detailRaw = obj.detail && typeof obj.detail === "object" ? (obj.detail as Record<string, unknown>) : null;
  if (!headerRaw || !detailRaw) return null;

  const headerHeight = Number(headerRaw.height);
  const detailHeight = Number(detailRaw.height);
  if (!Number.isFinite(headerHeight) || !Number.isFinite(detailHeight)) return null;
  if (headerHeight < MIN_BAND_HEIGHT || headerHeight > MAX_HEADER_HEIGHT) return null;
  if (detailHeight < MIN_BAND_HEIGHT || detailHeight > MAX_DETAIL_HEIGHT) return null;
  if (headerHeight + detailHeight > PAGE_HEIGHT) return null;

  const elementsRaw = Array.isArray(obj.elements) ? obj.elements : [];
  if (elementsRaw.length === 0 || elementsRaw.length > MAX_TEXT_ELEMENTS) return null;

  const header = {
    height: Math.round(headerHeight),
    firstPageOnly: Boolean(headerRaw.firstPageOnly),
  };
  const detail = { height: Math.round(detailHeight) };

  const elements: ReportElement[] = [];
  for (const rawElement of elementsRaw) {
    const sectionGuess =
      rawElement && typeof rawElement === "object"
        ? (rawElement as Record<string, unknown>).section
        : null;
    const bandHeight = sectionGuess === "header" ? header.height : detail.height;
    const parsed = parseReportElement(rawElement, bandHeight);
    if (!parsed) return null;
    elements.push(parsed);
  }

  return { header, detail, elements };
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

function drawElements(
  doc: InstanceType<typeof PDFDocument>,
  elements: ReportElement[],
  row: Record<string, unknown>,
  offsetY: number,
) {
  for (const element of elements) {
    const value = applyTemplate(element.text, row);
    doc.font(resolveFont(element.bold, element.italic));
    doc.fontSize(element.fontSize);
    doc.text(value, element.x, offsetY + element.y, {
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

  const { header, detail, elements } = payload.layout;
  const headerElements = elements.filter((element) => element.section === "header");
  const detailElements = elements.filter((element) => element.section === "detail");
  const headerRow = payload.rows[0] ?? {};

  let pageIndex = 0;
  let cursorY = 0;

  const startPage = () => {
    doc.addPage({ size: "A4", margin: 0 });
    const showHeader = !(header.firstPageOnly && pageIndex > 0);
    if (showHeader) {
      drawElements(doc, headerElements, headerRow, 0);
      cursorY = header.height;
    } else {
      cursorY = 0;
    }
    pageIndex += 1;
  };

  startPage();

  for (const row of payload.rows) {
    if (cursorY + detail.height > PAGE_HEIGHT) {
      startPage();
    }
    drawElements(doc, detailElements, row, cursorY);
    cursorY += detail.height;
  }

  doc.end();
  return done;
}

router.post("/query-preview", async (req: Request, res: Response) => {
  const parsed = parseQueryPreviewBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_query" });
    return;
  }
  try {
    const { rows, fields } = await pool.query<Record<string, unknown>>(
      `
      SELECT * FROM (
        ${parsed.sql}
      ) report_designer_query
      LIMIT $1
      `,
      [parsed.limit],
    );
    res.json({
      columns: fields.map((field) => field.name),
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

export const reportDesignerRouter = router;
