import { apiFetch } from "./api";

export type ReportEntity =
  | "workOrder"
  | "asset"
  | "sparePart"
  | "transaction"
  | "employee"
  | "costCenter";

export type ReportFilterOp =
  | "eq"
  | "neq"
  | "in"
  | "notIn"
  | "isNull"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains";

export type ReportSortDir = "asc" | "desc";
export type ReportPageSize = "A4" | "A5" | "Letter";
export type ReportOrientation = "portrait" | "landscape";
export type ReportDataMode = "onePagePerRow" | "list";
export type ReportTextAlign = "left" | "center" | "right";
export type ReportFontWeight = "normal" | "bold";

export type ReportFilter = { field: string; op: ReportFilterOp; value?: unknown };
export type ReportSort = { field: string; dir: ReportSortDir };

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

export type ReportDefinition = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  queryDefinition: ReportQueryDefinition;
  layout: ReportLayout;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type ReportDefinitionWritePayload = {
  key: string;
  name: string;
  siteId: string;
  queryDefinition: ReportQueryDefinition;
  layout: ReportLayout;
  isActive: boolean;
};

export type ReportMetaField = {
  id: string;
  type: string;
  filterable: boolean;
  sortable: boolean;
  selectable: boolean;
  enumValues?: string[];
};

export type ReportMetaEntity = {
  id: ReportEntity;
  defaultFields: string[];
  fields: ReportMetaField[];
};

export type ReportMeta = {
  entities: ReportMetaEntity[];
  filterOps: ReportFilterOp[];
  sortDirs: ReportSortDir[];
  pageSizes: ReportPageSize[];
  orientations: ReportOrientation[];
  dataModes: ReportDataMode[];
  textAligns: ReportTextAlign[];
  fontWeights: ReportFontWeight[];
};

export type ReportQueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
};

export function defaultReportQuery(entity: ReportEntity = "workOrder"): ReportQueryDefinition {
  const defaults: Record<ReportEntity, string[]> = {
    workOrder: [
      "orderNumber",
      "name",
      "status",
      "orderType",
      "assetKey",
      "assetName",
      "plannedStart",
      "plannedEnd",
    ],
    asset: ["key", "name", "type", "siteKey", "costCenterKey"],
    sparePart: ["key", "name", "isActive", "manufacturer", "siteKey"],
    transaction: ["type", "quantity", "bookedAt", "sparePartKey", "sparePartName"],
    employee: ["key", "name", "siteKey"],
    costCenter: ["key", "name", "siteKey"],
  };
  return {
    entity,
    fields: defaults[entity],
    filters: [],
    sort: [{ field: defaults[entity][0] ?? "name", dir: "desc" }],
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

export async function fetchReportMeta(): Promise<ReportMeta> {
  const res = await apiFetch("/api/reports/meta");
  if (!res.ok) throw new Error("meta");
  return (await res.json()) as ReportMeta;
}

export async function fetchReports(): Promise<ReportDefinition[]> {
  const res = await apiFetch("/api/reports");
  if (!res.ok) throw new Error("list");
  return (await res.json()) as ReportDefinition[];
}

export async function createReport(payload: ReportDefinitionWritePayload): Promise<ReportDefinition> {
  const res = await apiFetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("create");
  return (await res.json()) as ReportDefinition;
}

export async function updateReport(
  id: string,
  payload: ReportDefinitionWritePayload,
): Promise<ReportDefinition> {
  const res = await apiFetch(`/api/reports/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("update");
  return (await res.json()) as ReportDefinition;
}

export async function deleteReport(id: string): Promise<void> {
  const res = await apiFetch(`/api/reports/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("delete");
}

export async function previewReportQuery(payload: {
  siteId: string;
  queryDefinition: ReportQueryDefinition;
}): Promise<ReportQueryResult> {
  const res = await apiFetch("/api/reports/preview-query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("preview_query");
  return (await res.json()) as ReportQueryResult;
}

export async function previewReportPdf(payload: {
  siteId: string;
  name?: string;
  queryDefinition: ReportQueryDefinition;
  layout: ReportLayout;
}): Promise<Blob> {
  const res = await apiFetch("/api/reports/preview-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("preview_pdf");
  return await res.blob();
}

export async function downloadReportPdf(id: string): Promise<Blob> {
  const res = await apiFetch(`/api/reports/${id}/pdf`);
  if (!res.ok) throw new Error("pdf");
  return await res.blob();
}

export function pageSizeMm(
  pageSize: ReportPageSize,
  orientation: ReportOrientation,
): { width: number; height: number } {
  const sizes: Record<ReportPageSize, { width: number; height: number }> = {
    A4: { width: 210, height: 297 },
    A5: { width: 148, height: 210 },
    Letter: { width: 215.9, height: 279.4 },
  };
  const base = sizes[pageSize];
  if (orientation === "landscape") return { width: base.height, height: base.width };
  return base;
}

export function newElementId(): string {
  return `el-${Math.random().toString(36).slice(2, 10)}`;
}
