import type { WorkOrderStatus } from "./workOrderTypes";

/** Matches POST /api/work-orders/:id/feedback — only started, continued, ended. */
export function workOrderStatusAllowsFeedback(status: WorkOrderStatus | undefined): boolean {
  return status === "started" || status === "continued" || status === "ended";
}

/** Feedback tab visible (includes „Erledigt“ for read-only „Erledigt von“). */
export function workOrderStatusAllowsFeedbackTab(status: WorkOrderStatus | undefined): boolean {
  return workOrderStatusAllowsFeedback(status) || status === "done";
}
