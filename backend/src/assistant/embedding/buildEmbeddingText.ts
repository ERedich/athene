import { extractTextFromBuffer } from "./textExtract.js";

function line(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return `${key}: ${String(value)}`;
}

function joinLines(parts: Array<string | null>): string {
  return parts.filter((p): p is string => p != null).join("\n");
}

export type AssetEmbeddingRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  type: string;
  parentAssetKey: string | null;
  parentAssetName: string | null;
  serialNumber: string | null;
  buildDate: string | null;
  manufacturer: string | null;
  remark: string | null;
  costCenterKey: string | null;
  costCenterName: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  documentCount: number;
};

export function buildAssetText(row: AssetEmbeddingRow): string {
  return joinLines([
    "sourceKind: asset",
    line("assetId", row.id),
    line("assetKey", row.key),
    line("assetName", row.name),
    line("siteKey", row.siteKey),
    line("siteName", row.siteName),
    line("type", row.type),
    line("parentAssetKey", row.parentAssetKey),
    line("parentAssetName", row.parentAssetName),
    line("serialNumber", row.serialNumber),
    line("buildDate", row.buildDate),
    line("manufacturer", row.manufacturer),
    line("remark", row.remark),
    line("costCenterKey", row.costCenterKey),
    line("costCenterName", row.costCenterName),
    line("classificationKey", row.classificationKey),
    line("classificationName", row.classificationName),
    line("documentCount", row.documentCount),
  ]);
}

export type WorkOrderEmbeddingRow = {
  id: string;
  orderNumber: number;
  name: string;
  description: string | null;
  siteId: string;
  siteKey: string;
  siteName: string;
  assetKey: string;
  assetName: string;
  costCenterKey: string;
  costCenterName: string;
  classificationKey: string | null;
  classificationName: string | null;
  plannedStart: string;
  plannedEnd: string | null;
  plannedDurationMinutes: number | null;
  orderType: string;
  status: string;
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  doneByEmployeeKey: string | null;
  doneByEmployeeName: string | null;
  doneAt: string | null;
  endedAt: string | null;
  workgroupKey: string | null;
  workgroupName: string | null;
  documentCount: number;
  assetDocumentCount: number;
  assignedEmployeeCount: number;
};

export function buildWorkOrderText(row: WorkOrderEmbeddingRow): string {
  return joinLines([
    "sourceKind: workOrder",
    line("workOrderId", row.id),
    line("orderNumber", row.orderNumber),
    line("Auftragsnummer", row.orderNumber),
    line("name", row.name),
    line("description", row.description),
    line("siteKey", row.siteKey),
    line("siteName", row.siteName),
    line("assetKey", row.assetKey),
    line("assetName", row.assetName),
    line("costCenterKey", row.costCenterKey),
    line("costCenterName", row.costCenterName),
    line("classificationKey", row.classificationKey),
    line("classificationName", row.classificationName),
    line("plannedStart", row.plannedStart),
    line("plannedEnd", row.plannedEnd),
    line("plannedDurationMinutes", row.plannedDurationMinutes),
    line("orderType", row.orderType),
    line("status", row.status),
    line("responsibleEmployeeKey", row.responsibleEmployeeKey),
    line("responsibleEmployeeName", row.responsibleEmployeeName),
    line("doneByEmployeeKey", row.doneByEmployeeKey),
    line("doneByEmployeeName", row.doneByEmployeeName),
    line("doneAt", row.doneAt),
    line("endedAt", row.endedAt),
    line("workgroupKey", row.workgroupKey),
    line("workgroupName", row.workgroupName),
    line("documentCount", row.documentCount),
    line("assetDocumentCount", row.assetDocumentCount),
    line("assignedEmployeeCount", row.assignedEmployeeCount),
  ]);
}

export type WorkOrderDocumentEmbeddingRow = {
  id: string;
  fileName: string;
  displayName: string;
  category: string;
  mimeType: string;
  fileSize: number;
  referenceApp: string;
  linkEntityType: string;
  linkEntityId: string;
  content: Buffer;
  siteId: string;
  workOrderNumbers: number[];
  workOrderIds: string[];
};

export function buildWorkOrderDocumentText(row: WorkOrderDocumentEmbeddingRow): string {
  const textBody = extractTextFromBuffer(row.mimeType, row.content);
  const orderList =
    row.workOrderNumbers.length > 0
      ? row.workOrderNumbers.join(", ")
      : null;

  return joinLines([
    "sourceKind: workOrderDocument",
    line("documentId", row.id),
    line("fileName", row.fileName),
    line("displayName", row.displayName),
    line("category", row.category),
    line("mimeType", row.mimeType),
    line("fileSize", row.fileSize),
    line("referenceApp", row.referenceApp),
    line("linkEntityType", row.linkEntityType),
    line("linkEntityId", row.linkEntityId),
    line("relatedOrderNumbers", orderList),
    line("relatedWorkOrderIds", row.workOrderIds.join(", ") || null),
    textBody
      ? `documentText:\n${textBody}`
      : "documentText: [binary or non-text; metadata only]",
  ]);
}

export type SparePartEmbeddingRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  isActive: boolean;
  serialNumber: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  manufacturer: string | null;
  articleNumber: string | null;
  alternativeDesignation: string | null;
  longText: string | null;
  stockLines: Array<{
    warehouseKey: string;
    warehouseName: string;
    storageLocation: string;
    quantity: string;
    valuationPrice: string | null;
    valuationCurrency: string;
  }>;
  stockPolicies: Array<{
    scopeType: string;
    warehouseKey: string | null;
    warehouseName: string | null;
    storageLocation: string | null;
    reorderLevel: string;
    minStock: string;
    orderQuantity: string;
  }>;
  suppliers: Array<{
    supplierKey: string;
    supplierName: string;
    supplierArticleNumber: string | null;
    supplierArticleText: string | null;
    unitPrice: string | null;
    currency: string;
    isPreferred: boolean;
    isActive: boolean;
  }>;
  totalQuantity: string;
};

export function buildSparePartText(row: SparePartEmbeddingRow): string {
  const stockLines =
    row.stockLines.length > 0
      ? row.stockLines
          .map(
            (line) =>
              `warehouse=${line.warehouseKey}/${line.warehouseName}; location=${line.storageLocation}; quantity=${line.quantity}; valuationPrice=${line.valuationPrice ?? ""} ${line.valuationCurrency}`,
          )
          .join("\n")
      : null;
  const stockPolicies =
    row.stockPolicies.length > 0
      ? row.stockPolicies
          .map((policy) => {
            const wh =
              policy.warehouseKey || policy.warehouseName
                ? `; warehouse=${policy.warehouseKey ?? ""}/${policy.warehouseName ?? ""}`
                : "";
            const loc =
              policy.storageLocation !== null && policy.storageLocation !== undefined
                ? `; location=${policy.storageLocation}`
                : "";
            return `scope=${policy.scopeType}${wh}${loc}; reorderLevel=${policy.reorderLevel}; minStock=${policy.minStock}; orderQuantity=${policy.orderQuantity}`;
          })
          .join("\n")
      : null;
  const suppliers =
    row.suppliers.length > 0
      ? row.suppliers
          .map((supplier) => {
            const price =
              supplier.unitPrice != null
                ? `; unitPrice=${supplier.unitPrice} ${supplier.currency}`
                : "";
            return `supplier=${supplier.supplierKey}/${supplier.supplierName}; article=${supplier.supplierArticleNumber ?? ""}; text=${supplier.supplierArticleText ?? ""}${price}; preferred=${supplier.isPreferred}; active=${supplier.isActive}`;
          })
          .join("\n")
      : null;
  return joinLines([
    "sourceKind: sparePart",
    line("sparePartId", row.id),
    line("sparePartKey", row.key),
    line("sparePartName", row.name),
    line("siteKey", row.siteKey),
    line("siteName", row.siteName),
    line("isActive", row.isActive),
    line("serialNumber", row.serialNumber),
    line("classificationKey", row.classificationKey),
    line("classificationName", row.classificationName),
    line("manufacturer", row.manufacturer),
    line("articleNumber", row.articleNumber),
    line("alternativeDesignation", row.alternativeDesignation),
    line("longText", row.longText),
    line("totalQuantity", row.totalQuantity),
    stockLines ? `stockControlLines:\n${stockLines}` : "stockControlLines: none",
    stockPolicies ? `stockPolicies:\n${stockPolicies}` : "stockPolicies: none",
    suppliers ? `suppliers:\n${suppliers}` : "suppliers: none",
  ]);
}

export type WarehouseEmbeddingRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  isActive: boolean;
  stockLines: Array<{
    sparePartKey: string;
    sparePartName: string;
    articleNumber: string | null;
    storageLocation: string;
    quantity: string;
  }>;
  totalQuantity: string;
  distinctSparePartCount: number;
};

export function buildWarehouseText(row: WarehouseEmbeddingRow): string {
  const stockLines =
    row.stockLines.length > 0
      ? row.stockLines
          .map(
            (line) =>
              `sparePart=${line.sparePartKey}/${line.sparePartName}; article=${line.articleNumber ?? ""}; location=${line.storageLocation}; quantity=${line.quantity}`,
          )
          .join("\n")
      : null;
  return joinLines([
    "sourceKind: warehouse",
    line("warehouseId", row.id),
    line("warehouseKey", row.key),
    line("warehouseName", row.name),
    line("siteKey", row.siteKey),
    line("siteName", row.siteName),
    line("isActive", row.isActive),
    line("distinctSparePartCount", row.distinctSparePartCount),
    line("totalQuantity", row.totalQuantity),
    stockLines ? `stockLines:\n${stockLines}` : "stockLines: none",
  ]);
}
