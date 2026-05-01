import type { WorkOrderStatus } from "../types/api";

/** Same RGB hues as desktop `frontend/src/index.css` (`.app-wo-status-*`), alpha 30%. */
const STATUS_BACKGROUND: Record<WorkOrderStatus, string> = {
  open: "rgba(203, 213, 225, 0.3)",
  assigned: "rgba(125, 211, 252, 0.3)",
  started: "rgba(59, 130, 246, 0.3)",
  paused: "rgba(251, 146, 60, 0.3)",
  continued: "rgba(45, 212, 191, 0.3)",
  ended: "rgba(74, 222, 128, 0.3)",
  done: "rgba(74, 222, 128, 0.3)",
  cancelled: "rgba(248, 113, 113, 0.3)",
};

/** Matches `.app-wo-status-modal` label colors on the web app. */
const STATUS_FOREGROUND: Record<WorkOrderStatus, string> = {
  open: "rgb(100, 116, 139)",
  assigned: "rgb(2, 132, 199)",
  started: "rgb(37, 99, 235)",
  paused: "rgb(234, 88, 12)",
  continued: "rgb(13, 148, 136)",
  ended: "rgb(22, 163, 74)",
  done: "rgb(22, 163, 74)",
  cancelled: "rgb(220, 38, 38)",
};

export function workOrderStatusBackground(status: WorkOrderStatus): string {
  return STATUS_BACKGROUND[status];
}

export function workOrderStatusForeground(status: WorkOrderStatus): string {
  return STATUS_FOREGROUND[status];
}
