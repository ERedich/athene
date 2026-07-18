/** Must match backend `workOrderListQuery.ts`. */
export const WORKGROUP_PSEUDO_MY = "__MY_WORKGROUPS__";
export const EMPLOYEE_PSEUDO_ME = "__ME__";

export type WorkOrderPlanningDateMode = "absolute" | "relative";

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
  plannedStartMode: WorkOrderPlanningDateMode;
  plannedStartFrom: string;
  plannedStartTo: string;
  /** Non-negative days before now (relative mode). Empty = no lower bound. */
  plannedStartPastDays: string;
  /** Non-negative days after now (relative mode). Empty = no upper bound. */
  plannedStartFutureDays: string;
  plannedEndMode: WorkOrderPlanningDateMode;
  plannedEndFrom: string;
  plannedEndTo: string;
  plannedEndPastDays: string;
  plannedEndFutureDays: string;
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
  /** Past planned end beyond tolerance (matches dashboard "delayedOrders" KPI). */
  overdue: boolean;
  workgroupId: string[];
  /** Responsible only (`w.responsibleEmployeeId`); distinct from assignment filter */
  responsibleEmployeeId: string[];
  employeeId: string[];
  /** Maintenance plan IDs (discrete filter on w."maintenancePlanId") */
  maintenancePlanId: string[];
};

const PLANNING_MODE_KEYS = new Set<keyof WorkOrderAdvancedSearchState>([
  "plannedStartMode",
  "plannedEndMode",
]);

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
    plannedStartMode: "relative",
    plannedStartFrom: "",
    plannedStartTo: "",
    plannedStartPastDays: "",
    plannedStartFutureDays: "",
    plannedEndMode: "relative",
    plannedEndFrom: "",
    plannedEndTo: "",
    plannedEndPastDays: "",
    plannedEndFutureDays: "",
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
    overdue: false,
    workgroupId: [],
    responsibleEmployeeId: [],
    employeeId: [],
    maintenancePlanId: [],
  };
}

/** Merge partial / legacy preset payloads into a full search state. */
export function coerceWorkOrderAdvancedSearch(
  partial: Partial<WorkOrderAdvancedSearchState> | null | undefined,
): WorkOrderAdvancedSearchState {
  const base = emptyWorkOrderAdvancedSearch();
  if (!partial || typeof partial !== "object") return base;
  const merged: WorkOrderAdvancedSearchState = { ...base, ...partial };

  const startMode = partial.plannedStartMode;
  if (startMode !== "absolute" && startMode !== "relative") {
    merged.plannedStartMode =
      String(partial.plannedStartFrom ?? "").trim() || String(partial.plannedStartTo ?? "").trim()
        ? "absolute"
        : "relative";
  }
  const endMode = partial.plannedEndMode;
  if (endMode !== "absolute" && endMode !== "relative") {
    merged.plannedEndMode =
      String(partial.plannedEndFrom ?? "").trim() || String(partial.plannedEndTo ?? "").trim()
        ? "absolute"
        : "relative";
  }

  if (!Array.isArray(merged.maintenancePlanId)) merged.maintenancePlanId = [];
  if (typeof merged.plannedStartPastDays !== "string") merged.plannedStartPastDays = "";
  if (typeof merged.plannedStartFutureDays !== "string") merged.plannedStartFutureDays = "";
  if (typeof merged.plannedEndPastDays !== "string") merged.plannedEndPastDays = "";
  if (typeof merged.plannedEndFutureDays !== "string") merged.plannedEndFutureDays = "";

  return merged;
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
  if (a.overdue) return true;
  const keys = Object.keys(a) as (keyof WorkOrderAdvancedSearchState)[];
  for (const k of keys) {
    if (PLANNING_MODE_KEYS.has(k)) continue;
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

  if (adv.plannedStartMode === "relative") {
    setParam(p, "plannedStartPastDays", adv.plannedStartPastDays);
    setParam(p, "plannedStartFutureDays", adv.plannedStartFutureDays);
  } else {
    setParam(p, "plannedStartFrom", adv.plannedStartFrom);
    setParam(p, "plannedStartTo", adv.plannedStartTo);
  }
  if (adv.plannedEndMode === "relative") {
    setParam(p, "plannedEndPastDays", adv.plannedEndPastDays);
    setParam(p, "plannedEndFutureDays", adv.plannedEndFutureDays);
  } else {
    setParam(p, "plannedEndFrom", adv.plannedEndFrom);
    setParam(p, "plannedEndTo", adv.plannedEndTo);
  }
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
  appendEach(p, "maintenancePlanId", adv.maintenancePlanId);
  if (adv.classificationUnassigned) p.set("classificationUnassigned", "1");
  if (adv.overdue) p.set("overdue", "1");
  appendEach(p, "workgroupId", adv.workgroupId);
  appendEach(p, "responsibleEmployeeId", adv.responsibleEmployeeId);
  appendEach(p, "employeeId", adv.employeeId);

  return p.toString();
}

/**
 * Inverse of {@link buildWorkOrderListQueryString}: turns deeplink URL params
 * (e.g. dashboard KPI links like `?assetId=…`, `?status=open&status=assigned`,
 * `?employeeId=__ME__`) back into the search state. Returns `null` when no
 * recognised filter params are present.
 */
export function parseWorkOrderDeeplinkParams(
  params: URLSearchParams,
): { quickSearch: string; advanced: WorkOrderAdvancedSearchState } | null {
  const advanced = emptyWorkOrderAdvancedSearch();
  let hasAny = false;

  const single = (key: string, assign: (value: string) => void) => {
    const raw = params.get(key);
    if (raw == null) return;
    const value = raw.trim();
    if (!value) return;
    assign(value);
    hasAny = true;
  };

  const multi = (key: string, assign: (values: string[]) => void) => {
    const values = params.getAll(key).map((v) => v.trim()).filter(Boolean);
    if (values.length === 0) return;
    assign(values);
    hasAny = true;
  };

  let quickSearch = "";
  single("search", (v) => {
    quickSearch = v;
  });

  single("orderNumberFrom", (v) => (advanced.orderNumberFrom = v));
  single("orderNumberTo", (v) => (advanced.orderNumberTo = v));
  single("plannedDurationFrom", (v) => (advanced.plannedDurationFrom = v));
  single("plannedDurationTo", (v) => (advanced.plannedDurationTo = v));
  single("documentCountFrom", (v) => (advanced.documentCountFrom = v));
  single("documentCountTo", (v) => (advanced.documentCountTo = v));
  single("assetDocumentCountFrom", (v) => (advanced.assetDocumentCountFrom = v));
  single("assetDocumentCountTo", (v) => (advanced.assetDocumentCountTo = v));
  single("assignedEmployeeCountFrom", (v) => (advanced.assignedEmployeeCountFrom = v));
  single("assignedEmployeeCountTo", (v) => (advanced.assignedEmployeeCountTo = v));

  single("name", (v) => (advanced.name = v));
  single("description", (v) => (advanced.description = v));
  multi("createdBy", (v) => (advanced.createdBy = v));
  multi("updatedBy", (v) => (advanced.updatedBy = v));

  single("plannedStartFrom", (v) => {
    advanced.plannedStartFrom = v;
    advanced.plannedStartMode = "absolute";
  });
  single("plannedStartTo", (v) => {
    advanced.plannedStartTo = v;
    advanced.plannedStartMode = "absolute";
  });
  single("plannedStartPastDays", (v) => {
    advanced.plannedStartPastDays = v;
    advanced.plannedStartMode = "relative";
  });
  single("plannedStartFutureDays", (v) => {
    advanced.plannedStartFutureDays = v;
    advanced.plannedStartMode = "relative";
  });
  single("plannedEndFrom", (v) => {
    advanced.plannedEndFrom = v;
    advanced.plannedEndMode = "absolute";
  });
  single("plannedEndTo", (v) => {
    advanced.plannedEndTo = v;
    advanced.plannedEndMode = "absolute";
  });
  single("plannedEndPastDays", (v) => {
    advanced.plannedEndPastDays = v;
    advanced.plannedEndMode = "relative";
  });
  single("plannedEndFutureDays", (v) => {
    advanced.plannedEndFutureDays = v;
    advanced.plannedEndMode = "relative";
  });
  single("createdAtFrom", (v) => (advanced.createdAtFrom = v));
  single("createdAtTo", (v) => (advanced.createdAtTo = v));
  single("updatedAtFrom", (v) => (advanced.updatedAtFrom = v));
  single("updatedAtTo", (v) => (advanced.updatedAtTo = v));

  multi("orderType", (v) => (advanced.orderType = v));
  multi("status", (v) => (advanced.status = v));
  multi("siteId", (v) => (advanced.siteId = v));
  multi("assetId", (v) => (advanced.assetId = v));
  multi("costCenterId", (v) => (advanced.costCenterId = v));
  multi("classificationId", (v) => (advanced.classificationId = v));
  multi("maintenancePlanId", (v) => (advanced.maintenancePlanId = v));
  if (params.get("classificationUnassigned") === "1") {
    advanced.classificationUnassigned = true;
    hasAny = true;
  }
  if (params.get("overdue") === "1") {
    advanced.overdue = true;
    hasAny = true;
  }
  multi("workgroupId", (v) => (advanced.workgroupId = v));
  multi("responsibleEmployeeId", (v) => (advanced.responsibleEmployeeId = v));
  multi("employeeId", (v) => (advanced.employeeId = v));

  return hasAny ? { quickSearch, advanced } : null;
}
