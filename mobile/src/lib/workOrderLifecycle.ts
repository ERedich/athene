import type { WorkOrderStatus } from "../types/api";

export function canStartWorkOrder(status: WorkOrderStatus): boolean {
  return status === "open" || status === "assigned" || status === "paused";
}

export function canPauseWorkOrder(status: WorkOrderStatus): boolean {
  return status === "started" || status === "continued";
}

export function canFeedbackWorkOrder(status: WorkOrderStatus): boolean {
  return status === "started" || status === "continued" || status === "ended";
}
