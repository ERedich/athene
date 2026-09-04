import type { AssetDocumentCategory } from "../constants/assetDocumentCategory";
import type { TodoRecord } from "./todoTypes";

/** Stable key from site Stammdaten `workOrderType` (e.g. plannedRepair, breakdown). */
export type WorkOrderType = string;

export type WorkOrderStatus =
  | "open"
  | "assigned"
  | "started"
  | "paused"
  | "continued"
  | "ended"
  | "done"
  | "cancelled";

export type WorkOrder = {
  id: string;
  orderNumber: number;
  name: string;
  description: string | null;
  siteId: string;
  siteKey: string;
  siteName: string;
  assetId: string;
  assetKey: string;
  assetName: string;
  assetClassificationId?: string | null;
  costCenterId: string;
  costCenterKey: string;
  costCenterName: string;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationMinutes: number | null;
  orderType: WorkOrderType;
  status: WorkOrderStatus;
  responsibleEmployeeIds: string[];
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  doneBy: string | null;
  doneByEmployeeKey: string | null;
  doneByEmployeeName: string | null;
  pauseRemark: string | null;
  currentSegmentStartedAt: string | null;
  problemId?: string | null;
  problemKey?: string | null;
  problemName?: string | null;
  causeId?: string | null;
  causeKey?: string | null;
  causeName?: string | null;
  remedyId?: string | null;
  remedyKey?: string | null;
  remedyName?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
  assetDocumentCount: number;
  assignedEmployeeCount: number;
  transactionCount: number;
  inspectionPointCount: number;
  checkedInspectionPointCount: number;
  todoCount: number;
  uncheckedTodoCount: number;
  todos?: TodoRecord[];
  workgroupId: string | null;
  workgroupKey: string | null;
  workgroupName: string | null;
  originalWo: string | null;
  originalWoOrderNumber: number | null;
  originalWoName: string | null;
  maintenancePlanId: string | null;
  maintenancePlanKey: string | null;
  maintenancePlanName: string | null;
  inspectionRoundId: string | null;
  inspectionRoundKey: string | null;
  inspectionRoundName: string | null;
};

export type WorkOrderAssignment = {
  id: string;
  workOrderId: string;
  employeeId: string;
  employeeKey: string;
  employeeName: string;
  assignedFrom: string;
  assignedTo: string;
  createdAt: string;
  createdBy: string;
};

export type WorkOrderDocumentSource = "workOrder" | "asset";

export type WorkOrderDocument = {
  id: string;
  source: WorkOrderDocumentSource;
  workOrderId: string | null;
  assetId: string | null;
  fileName: string;
  displayName: string;
  category: AssetDocumentCategory;
  mimeType: string;
  fileSize: number;
  referenceApp?: "assets" | "workOrders";
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type PendingDocumentUpload = {
  localId: string;
  file: File;
  displayName: string;
  category: AssetDocumentCategory;
  addedAt: number;
};

export type WorkOrderReferenceAsset = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  costCenterId: string | null;
};

export type WorkOrderReferenceCostCenter = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
};

export type WorkOrderReferenceOrderType = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  sortOrder: number;
};

export type WorkOrderReferenceClassification = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  appliesToAsset: boolean;
  appliesToWorkOrder: boolean;
};

export type WorkOrderReferenceEmployee = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
};

export type WorkOrderReferenceMaintenancePlan = {
  id: string;
  key: string;
  name: string;
  siteId: string;
};

export type WorkOrderReferenceWorkgroup = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  employeeIds: string[];
  leaderEmployeeIds: string[];
};

export type WorkOrderSiteOption = { id: string; key: string; name: string };

export type WorkOrderUserDirectoryRow = { id: string; loginName: string; name: string };

export type WorkOrderSelectOption = { label: string; value: string };

export type WorkOrderEditMeta = {
  status?: WorkOrderStatus;
  orderNumber?: number;
  currentSegmentStartedAt?: string | null;
  workgroupId?: string | null;
  siteId?: string;
  siteKey?: string;
  siteName?: string;
  assetId?: string;
  assetKey?: string;
  assetName?: string;
  assetClassificationId?: string | null;
  name?: string;
  documentCount?: number;
  assetDocumentCount?: number;
  transactionCount?: number;
  orderType?: WorkOrderType;
  problemId?: string | null;
  causeId?: string | null;
  remedyId?: string | null;
};

export function workOrderToEditMeta(row: WorkOrder | WorkOrderEditMeta): WorkOrderEditMeta {
  return {
    status: row.status,
    orderNumber: row.orderNumber,
    currentSegmentStartedAt: row.currentSegmentStartedAt,
    workgroupId: row.workgroupId,
    siteId: "siteId" in row ? row.siteId : undefined,
    siteKey: "siteKey" in row ? row.siteKey : undefined,
    siteName: "siteName" in row ? row.siteName : undefined,
    assetId: "assetId" in row ? row.assetId : undefined,
    assetKey: "assetKey" in row ? row.assetKey : undefined,
    assetName: "assetName" in row ? row.assetName : undefined,
    assetClassificationId:
      "assetClassificationId" in row ? (row.assetClassificationId ?? null) : undefined,
    name: "name" in row ? row.name : undefined,
    documentCount: "documentCount" in row ? row.documentCount : undefined,
    assetDocumentCount: "assetDocumentCount" in row ? row.assetDocumentCount : undefined,
    transactionCount: "transactionCount" in row ? row.transactionCount : undefined,
    orderType: "orderType" in row ? row.orderType : undefined,
    problemId: "problemId" in row ? (row.problemId ?? null) : undefined,
    causeId: "causeId" in row ? (row.causeId ?? null) : undefined,
    remedyId: "remedyId" in row ? (row.remedyId ?? null) : undefined,
  };
}

/** Display label for copy source (Auftragsnummer of the template work order). */
export function formatOriginalWoOrderNumber(orderNumber: number | null | undefined): string {
  if (orderNumber == null || orderNumber <= 0) return "—";
  return String(orderNumber);
}

export function formatOriginalWoCell(row: Pick<WorkOrder, "originalWoOrderNumber">): string {
  return formatOriginalWoOrderNumber(row.originalWoOrderNumber);
}
