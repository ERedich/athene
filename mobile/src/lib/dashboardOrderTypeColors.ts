/** Bar fills for work-order type breakdown on the dashboard (aligned with web). */
export const WORK_ORDER_TYPE_CHART_COLORS: Record<string, string> = {
  maintenance: "rgba(59, 130, 246, 0.9)",
  repair: "rgba(245, 158, 11, 0.9)",
  breakdown: "rgba(248, 113, 113, 0.9)",
};

export function chartColorForWorkOrderType(orderType: string): string {
  return WORK_ORDER_TYPE_CHART_COLORS[orderType] ?? "rgba(148, 163, 184, 0.75)";
}
