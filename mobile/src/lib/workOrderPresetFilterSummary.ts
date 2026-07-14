import {
  EMPLOYEE_PSEUDO_ME,
  WORKGROUP_PSEUDO_MY,
  type WorkOrderAdvancedSearchState,
} from "./workOrderListQueryString";
import type { WorkOrderSearchPresetPayloadV1 } from "./workOrderSearchPresetsApi";

export type WorkOrderPresetFilterLine = { label: string; value: string };

type TFn = (key: string, options?: Record<string, unknown>) => string;

function formatRange(from: string, to: string, t: TFn): string | null {
  const f = from.trim();
  const toVal = to.trim();
  if (!f && !toVal) return null;
  if (f && toVal) return `${f} – ${toVal}`;
  if (f) return `${t("workOrders.filterFields.from")} ${f}`;
  return `${t("workOrders.filterFields.to")} ${toVal}`;
}

function formatArray(values: string[], countKey: string, t: TFn): string | null {
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  const mapped = cleaned.map((v) => {
    if (v === EMPLOYEE_PSEUDO_ME) return t("workOrders.filterFields.me");
    if (v === WORKGROUP_PSEUDO_MY) return t("workOrders.filterFields.myWorkgroups");
    return v;
  });
  if (mapped.length <= 2) return mapped.join(", ");
  return t(countKey, { count: mapped.length });
}

function formatStatus(values: string[], t: TFn): string | null {
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  return cleaned.map((v) => t(`workOrders.statusValues.${v}`, { defaultValue: v })).join(", ");
}

function formatOrderType(values: string[], t: TFn): string | null {
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  return cleaned.map((v) => t(`workOrders.typeValues.${v}`, { defaultValue: v })).join(", ");
}

export function buildWorkOrderPresetFilterLines(
  payload: WorkOrderSearchPresetPayloadV1,
  t: TFn,
): WorkOrderPresetFilterLine[] {
  const adv: WorkOrderAdvancedSearchState = payload.advanced;
  const lines: WorkOrderPresetFilterLine[] = [];

  const push = (labelKey: string, value: string | null) => {
    if (value) lines.push({ label: t(labelKey), value });
  };

  push("workOrders.filterFields.orderNumber", formatRange(adv.orderNumberFrom, adv.orderNumberTo, t));
  push("workOrders.filterFields.plannedDuration", formatRange(adv.plannedDurationFrom, adv.plannedDurationTo, t));
  push("workOrders.filterFields.documentCount", formatRange(adv.documentCountFrom, adv.documentCountTo, t));
  push(
    "workOrders.filterFields.assetDocumentCount",
    formatRange(adv.assetDocumentCountFrom, adv.assetDocumentCountTo, t),
  );
  push(
    "workOrders.filterFields.assignedEmployeeCount",
    formatRange(adv.assignedEmployeeCountFrom, adv.assignedEmployeeCountTo, t),
  );

  if (adv.name.trim()) push("workOrders.name", adv.name.trim());
  if (adv.description.trim()) push("workOrders.description", adv.description.trim());

  push("workOrders.filterFields.status", formatStatus(adv.status, t));
  push("workOrders.filterFields.orderType", formatOrderType(adv.orderType, t));
  push("workOrders.filterFields.site", formatArray(adv.siteId, "workOrders.filterFields.siteCount", t));
  push("workOrders.filterFields.asset", formatArray(adv.assetId, "workOrders.filterFields.assetCount", t));
  push(
    "workOrders.filterFields.costCenter",
    formatArray(adv.costCenterId, "workOrders.filterFields.costCenterCount", t),
  );
  push(
    "workOrders.filterFields.classification",
    formatArray(adv.classificationId, "workOrders.filterFields.classificationCount", t),
  );
  if (adv.classificationUnassigned) {
    push("workOrders.filterFields.classificationUnassigned", t("workOrders.filterFields.yes"));
  }
  push("workOrders.filterFields.workgroup", formatArray(adv.workgroupId, "workOrders.filterFields.workgroupCount", t));
  push(
    "workOrders.filterFields.responsibleEmployee",
    formatArray(adv.responsibleEmployeeId, "workOrders.filterFields.responsibleEmployeeCount", t),
  );
  push("workOrders.filterFields.employee", formatArray(adv.employeeId, "workOrders.filterFields.employeeCount", t));
  push("workOrders.filterFields.createdBy", formatArray(adv.createdBy, "workOrders.filterFields.createdByCount", t));
  push("workOrders.filterFields.updatedBy", formatArray(adv.updatedBy, "workOrders.filterFields.updatedByCount", t));

  push("workOrders.filterFields.plannedStart", formatRange(adv.plannedStartFrom, adv.plannedStartTo, t));
  push("workOrders.filterFields.plannedEnd", formatRange(adv.plannedEndFrom, adv.plannedEndTo, t));
  push("workOrders.filterFields.createdAt", formatRange(adv.createdAtFrom, adv.createdAtTo, t));
  push("workOrders.filterFields.updatedAt", formatRange(adv.updatedAtFrom, adv.updatedAtTo, t));

  return lines;
}
