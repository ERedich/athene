export type DocumentCategory =
  | "general"
  | "protocols"
  | "drawings"
  | "instructions"
  | "nameplates"
  | "certificates";

export type ReferenceApp = "assets" | "workOrders";

export type DocumentEntityType = "asset" | "workOrder";

/** API field: maps entityType to legacy source label. */
export type DocumentSource = "asset" | "workOrder";

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "general",
  "protocols",
  "drawings",
  "instructions",
  "nameplates",
  "certificates",
];

export const REFERENCE_APPS: ReferenceApp[] = ["assets", "workOrders"];

export const DOCUMENT_ENTITY_TYPES: DocumentEntityType[] = ["asset", "workOrder"];

export function isDocumentCategory(value: unknown): value is DocumentCategory {
  return typeof value === "string" && (DOCUMENT_CATEGORIES as string[]).includes(value);
}

export function isReferenceApp(value: unknown): value is ReferenceApp {
  return typeof value === "string" && (REFERENCE_APPS as string[]).includes(value);
}

export function isDocumentEntityType(value: unknown): value is DocumentEntityType {
  return typeof value === "string" && (DOCUMENT_ENTITY_TYPES as string[]).includes(value);
}

export function entityTypeToSource(entityType: DocumentEntityType): DocumentSource {
  return entityType;
}

export const DOCUMENT_MAX_BYTES =
  Number(process.env.DOCUMENT_MAX_BYTES) ||
  Number(process.env.ASSET_DOCUMENT_MAX_BYTES) ||
  Number(process.env.WORK_ORDER_DOCUMENT_MAX_BYTES) ||
  25 * 1024 * 1024;
