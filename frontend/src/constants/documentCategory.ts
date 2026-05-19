/**
 * Shared document categories for all apps (must match backend `document.category` CHECK).
 */
export {
  ASSET_DOCUMENT_CATEGORY_ORDER as DOCUMENT_CATEGORY_ORDER,
  type AssetDocumentCategory as DocumentCategory,
  DOCUMENT_CATEGORY_BADGE_CLASS,
  documentCategoryBadgeClass,
  isAssetDocumentCategory as isDocumentCategory,
} from "./assetDocumentCategory";

export type ReferenceApp = "assets" | "workOrders";
