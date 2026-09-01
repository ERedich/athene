import type { TodoFormItem, TodoRecord } from "./todoTypes";
import { todosFromRecords } from "./todoTypes";

/** Stable key from site Stammdaten `workOrderType`. */
export type WorkOrderType = string;

export type WorkOrderFormFields = {
  orderNumber: number | null;
  name: string;
  description: string;
  todos: TodoFormItem[];
  assetId: string;
  costCenterId: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  plannedDurationHours: string;
  orderType: WorkOrderType;
  responsibleEmployeeIds: string[];
  workgroupId: string;
  classificationId: string;
  inspectionRoundId: string;
  originalWoId: string;
  /** Shown in create dialog when copying; not sent to API. */
  copySourceOrderNumber: number | null;
};

export type WorkOrderFormSource = {
  id: string;
  orderNumber: number;
  name: string;
  description: string | null;
  todos?: TodoRecord[];
  assetId: string;
  costCenterId: string;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationMinutes: number | null;
  orderType: WorkOrderType;
  responsibleEmployeeIds: string[];
  workgroupId: string | null;
  classificationId: string | null;
  inspectionRoundId?: string | null;
  originalWo?: string | null;
  originalWoOrderNumber?: number | null;
};

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function emptyWorkOrderForm(): WorkOrderFormFields {
  const start = new Date();
  const plannedEnd = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    orderNumber: null,
    name: "",
    description: "",
    todos: [],
    assetId: "",
    costCenterId: "",
    plannedStart: start,
    plannedEnd,
    plannedDurationHours: "24",
    orderType: "maintenance",
    responsibleEmployeeIds: [],
    workgroupId: "",
    classificationId: "",
    inspectionRoundId: "",
    originalWoId: "",
    copySourceOrderNumber: null,
  };
}

export function workOrderRowToFormState(
  row: WorkOrderFormSource,
  opts?: { name?: string; asCopy?: boolean },
): WorkOrderFormFields {
  const asCopy = opts?.asCopy === true;
  return {
    orderNumber: asCopy ? null : row.orderNumber,
    name: opts?.name ?? row.name,
    description: row.description ?? "",
    todos: todosFromRecords(row.todos),
    assetId: row.assetId,
    costCenterId: row.costCenterId,
    plannedStart: parseIsoDate(row.plannedStart),
    plannedEnd: parseIsoDate(row.plannedEnd),
    plannedDurationHours:
      row.plannedDurationMinutes == null
        ? ""
        : Number.isInteger(row.plannedDurationMinutes / 60)
          ? String(row.plannedDurationMinutes / 60)
          : (row.plannedDurationMinutes / 60).toFixed(2),
    orderType: row.orderType,
    responsibleEmployeeIds: [...(row.responsibleEmployeeIds ?? [])],
    workgroupId: row.workgroupId ?? "",
    classificationId: row.classificationId ?? "",
    inspectionRoundId: row.inspectionRoundId ?? "",
    originalWoId: asCopy ? row.id : (row.originalWo ?? ""),
    copySourceOrderNumber: asCopy
      ? row.orderNumber
      : row.originalWoOrderNumber ?? null,
  };
}
