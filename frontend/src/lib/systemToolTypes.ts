export type SystemToolId = "maintenance-plan-generate-due" | "banf-create";

export type SystemToolCatalogItem = {
  id: SystemToolId;
  enabled: boolean;
  dueCount: number | null;
};

export type MaintenancePlanSweepStatus = {
  enabled: boolean;
  intervalMs: number | null;
  scheduleTime?: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  remainingMs: number | null;
};

export type GenerateDueResult = {
  planId: string;
  status: "created" | "skipped";
  workOrderId?: string;
  orderNumber?: number;
  reason?: string;
};

export const SYSTEM_TOOL_LABEL_KEYS: Record<SystemToolId, string> = {
  "maintenance-plan-generate-due": "systemTools.toolGenerateDue",
  "banf-create": "systemTools.toolBanfCreate",
};

export const SYSTEM_TOOL_META_KEYS: Record<SystemToolId, string> = {
  "maintenance-plan-generate-due": "systemTools.toolGenerateDueMeta",
  "banf-create": "systemTools.toolBanfCreateMeta",
};

export function isSystemToolId(value: string | undefined): value is SystemToolId {
  return value === "maintenance-plan-generate-due" || value === "banf-create";
}

export function isEnabledSystemToolId(
  value: string | undefined,
): value is "maintenance-plan-generate-due" {
  return value === "maintenance-plan-generate-due";
}
