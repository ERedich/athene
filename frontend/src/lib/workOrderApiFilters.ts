/** Must match backend `workOrderListQuery.ts`. */
export const WORKGROUP_PSEUDO_MY = "__MY_WORKGROUPS__";
export const EMPLOYEE_PSEUDO_ME = "__ME__";

/** LIKE filters only on real free-text columns (`w.name`, `w.description`). All FKs use discrete multi-select params. */
export type WorkOrderAdvancedSearchState = {
  orderNumberFrom: string;
  orderNumberTo: string;
  plannedDurationFrom: string;
  plannedDurationTo: string;
  documentCountFrom: string;
  documentCountTo: string;
  assetDocumentCountFrom: string;
  assetDocumentCountTo: string;
  assignedEmployeeCountFrom: string;
  assignedEmployeeCountTo: string;
  name: string;
  description: string;
  /** User IDs (discrete filter on w."createdBy") */
  createdBy: string[];
  /** User IDs (discrete filter on w."updatedBy") */
  updatedBy: string[];
  plannedStartFrom: string;
  plannedStartTo: string;
  plannedEndFrom: string;
  plannedEndTo: string;
  createdAtFrom: string;
  createdAtTo: string;
  updatedAtFrom: string;
  updatedAtTo: string;
  orderType: string[];
  status: string[];
  siteId: string[];
  assetId: string[];
  costCenterId: string[];
  classificationId: string[];
  classificationUnassigned: boolean;
  workgroupId: string[];
  /** Responsible only (`w.responsibleEmployeeId`); distinct from assignment filter */
  responsibleEmployeeId: string[];
  employeeId: string[];
};

export function emptyWorkOrderAdvancedSearch(): WorkOrderAdvancedSearchState {
  return {
    orderNumberFrom: "",
    orderNumberTo: "",
    plannedDurationFrom: "",
    plannedDurationTo: "",
    documentCountFrom: "",
    documentCountTo: "",
    assetDocumentCountFrom: "",
    assetDocumentCountTo: "",
    assignedEmployeeCountFrom: "",
    assignedEmployeeCountTo: "",
    name: "",
    description: "",
    createdBy: [],
    updatedBy: [],
    plannedStartFrom: "",
    plannedStartTo: "",
    plannedEndFrom: "",
    plannedEndTo: "",
    createdAtFrom: "",
    createdAtTo: "",
    updatedAtFrom: "",
    updatedAtTo: "",
    orderType: [],
    status: [],
    siteId: [],
    assetId: [],
    costCenterId: [],
    classificationId: [],
    classificationUnassigned: false,
    workgroupId: [],
    responsibleEmployeeId: [],
    employeeId: [],
  };
}

function setParam(p: URLSearchParams, key: string, value: string) {
  const t = value.trim();
  if (t) p.set(key, t);
}

function appendEach(p: URLSearchParams, key: string, values: string[]) {
  for (const v of values) {
    const t = v.trim();
    if (t) p.append(key, t);
  }
}

export function hasActiveWorkOrderAdvancedSearch(a: WorkOrderAdvancedSearchState): boolean {
  if (a.classificationUnassigned) return true;
  const keys = Object.keys(a) as (keyof WorkOrderAdvancedSearchState)[];
  for (const k of keys) {
    const v = a[k];
    if (Array.isArray(v)) {
      if (v.length > 0) return true;
    } else if (typeof v === "boolean") {
      /* handled */
    } else if (String(v).trim() !== "") {
      return true;
    }
  }
  return false;
}

/** Returns query string without leading `?`. */
export function buildWorkOrderListQueryString(quickSearch: string, adv: WorkOrderAdvancedSearchState): string {
  const p = new URLSearchParams();
  setParam(p, "search", quickSearch);

  setParam(p, "orderNumberFrom", adv.orderNumberFrom);
  setParam(p, "orderNumberTo", adv.orderNumberTo);
  setParam(p, "plannedDurationFrom", adv.plannedDurationFrom);
  setParam(p, "plannedDurationTo", adv.plannedDurationTo);
  setParam(p, "documentCountFrom", adv.documentCountFrom);
  setParam(p, "documentCountTo", adv.documentCountTo);
  setParam(p, "assetDocumentCountFrom", adv.assetDocumentCountFrom);
  setParam(p, "assetDocumentCountTo", adv.assetDocumentCountTo);
  setParam(p, "assignedEmployeeCountFrom", adv.assignedEmployeeCountFrom);
  setParam(p, "assignedEmployeeCountTo", adv.assignedEmployeeCountTo);

  setParam(p, "name", adv.name);
  setParam(p, "description", adv.description);
  appendEach(p, "createdBy", adv.createdBy);
  appendEach(p, "updatedBy", adv.updatedBy);

  setParam(p, "plannedStartFrom", adv.plannedStartFrom);
  setParam(p, "plannedStartTo", adv.plannedStartTo);
  setParam(p, "plannedEndFrom", adv.plannedEndFrom);
  setParam(p, "plannedEndTo", adv.plannedEndTo);
  setParam(p, "createdAtFrom", adv.createdAtFrom);
  setParam(p, "createdAtTo", adv.createdAtTo);
  setParam(p, "updatedAtFrom", adv.updatedAtFrom);
  setParam(p, "updatedAtTo", adv.updatedAtTo);

  appendEach(p, "orderType", adv.orderType);
  appendEach(p, "status", adv.status);
  appendEach(p, "siteId", adv.siteId);
  appendEach(p, "assetId", adv.assetId);
  appendEach(p, "costCenterId", adv.costCenterId);
  appendEach(p, "classificationId", adv.classificationId);
  if (adv.classificationUnassigned) p.set("classificationUnassigned", "1");
  appendEach(p, "workgroupId", adv.workgroupId);
  appendEach(p, "responsibleEmployeeId", adv.responsibleEmployeeId);
  appendEach(p, "employeeId", adv.employeeId);

  return p.toString();
}
