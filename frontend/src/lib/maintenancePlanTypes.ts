export type MaintenancePlanIntervalUnit = "day" | "week" | "month" | "year";
export type MaintenancePlanStatus = "active" | "paused" | "ended";

export type MaintenancePlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  assetId: string;
  assetKey: string;
  assetName: string;
  costCenterId: string;
  costCenterKey: string;
  costCenterName: string;
  workgroupId: string;
  workgroupKey: string;
  workgroupName: string;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  inspectionRoundId: string | null;
  inspectionRoundKey: string | null;
  inspectionRoundName: string | null;
  plannedDurationMinutes: number | null;
  orderType: string;
  intervalUnit: MaintenancePlanIntervalUnit;
  intervalValue: number;
  anchorDate: string;
  nextDueAt: string;
  leadTimeDays: number;
  status: MaintenancePlanStatus;
  executionCount: number;
  ignoreOpenWorkOrders: boolean;
  responsibleEmployeeIds: string[];
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  hasOpenWorkOrder: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type MaintenancePlanFormState = {
  key: string;
  name: string;
  description: string;
  siteId: string;
  assetId: string;
  costCenterId: string;
  workgroupId: string;
  classificationId: string;
  inspectionRoundId: string;
  plannedDurationMinutes: number | null;
  orderType: string;
  intervalUnit: MaintenancePlanIntervalUnit;
  intervalValue: number;
  nextDueAt: Date | null;
  leadTimeDays: number;
  isActive: boolean;
  ignoreOpenWorkOrders: boolean;
  responsibleEmployeeIds: string[];
};

export const emptyMaintenancePlanForm = (siteId = ""): MaintenancePlanFormState => ({
  key: "",
  name: "",
  description: "",
  siteId,
  assetId: "",
  costCenterId: "",
  workgroupId: "",
  classificationId: "",
  inspectionRoundId: "",
  plannedDurationMinutes: null,
  orderType: "maintenance",
  intervalUnit: "week",
  intervalValue: 4,
  nextDueAt: new Date(),
  leadTimeDays: 7,
  isActive: true,
  ignoreOpenWorkOrders: false,
  responsibleEmployeeIds: [],
});

export function maintenancePlanToFormState(row: MaintenancePlan): MaintenancePlanFormState {
  const due = new Date(row.nextDueAt);
  return {
    key: row.key,
    name: row.name,
    description: row.description ?? "",
    siteId: row.siteId,
    assetId: row.assetId,
    costCenterId: row.costCenterId,
    workgroupId: row.workgroupId,
    classificationId: row.classificationId ?? "",
    inspectionRoundId: row.inspectionRoundId ?? "",
    plannedDurationMinutes: row.plannedDurationMinutes,
    orderType: row.orderType || "maintenance",
    intervalUnit: row.intervalUnit,
    intervalValue: row.intervalValue,
    nextDueAt: Number.isNaN(due.getTime()) ? new Date() : due,
    leadTimeDays: row.leadTimeDays,
    isActive: row.status === "active",
    ignoreOpenWorkOrders: Boolean(row.ignoreOpenWorkOrders),
    responsibleEmployeeIds: [...(row.responsibleEmployeeIds ?? [])],
  };
}
