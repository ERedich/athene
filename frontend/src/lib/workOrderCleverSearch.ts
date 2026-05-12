import type { WorkOrderAdvancedSearchState } from "./workOrderApiFilters";

export type WorkOrderCleverSearchRow = {
  orderNumber: number;
  name: string;
  description: string | null;
  siteId: string;
  assetId: string;
  costCenterId: string;
  classificationId: string | null;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationMinutes: number | null;
  orderType: string;
  status: string;
  responsibleEmployeeId: string | null;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
  assetDocumentCount: number;
  assignedEmployeeCount: number;
  workgroupId: string | null;
};

export type WorkOrderCleverSearchLookup = {
  userIdByLoginName: (loginName: string) => string | null | undefined;
};

function singleton(value: string | null | undefined): string[] {
  return value ? [value] : [];
}

function numericRange(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

export function mergeWorkOrderIntoAdvancedSearch(
  prev: WorkOrderAdvancedSearchState,
  row: WorkOrderCleverSearchRow,
  lookup: WorkOrderCleverSearchLookup,
): WorkOrderAdvancedSearchState {
  const createdBy = lookup.userIdByLoginName(row.createdBy.trim());
  const updatedBy = lookup.userIdByLoginName(row.updatedBy.trim());
  const orderNumber = String(row.orderNumber);
  const plannedDuration = numericRange(row.plannedDurationMinutes);
  const documentCount = numericRange(row.documentCount);
  const assetDocumentCount = numericRange(row.assetDocumentCount);
  const assignedEmployeeCount = numericRange(row.assignedEmployeeCount);

  return {
    ...prev,
    orderNumberFrom: orderNumber,
    orderNumberTo: orderNumber,
    plannedDurationFrom: plannedDuration,
    plannedDurationTo: plannedDuration,
    documentCountFrom: documentCount,
    documentCountTo: documentCount,
    assetDocumentCountFrom: assetDocumentCount,
    assetDocumentCountTo: assetDocumentCount,
    assignedEmployeeCountFrom: assignedEmployeeCount,
    assignedEmployeeCountTo: assignedEmployeeCount,
    name: row.name,
    description: row.description ?? "",
    createdBy: createdBy ? [createdBy] : [],
    updatedBy: updatedBy ? [updatedBy] : [],
    plannedStartFrom: row.plannedStart,
    plannedStartTo: row.plannedStart,
    plannedEndFrom: row.plannedEnd,
    plannedEndTo: row.plannedEnd,
    orderType: [row.orderType],
    status: [row.status],
    siteId: singleton(row.siteId),
    assetId: singleton(row.assetId),
    costCenterId: singleton(row.costCenterId),
    classificationId: singleton(row.classificationId),
    classificationUnassigned: row.classificationId == null,
    workgroupId: singleton(row.workgroupId),
    responsibleEmployeeId: singleton(row.responsibleEmployeeId),
  };
}
