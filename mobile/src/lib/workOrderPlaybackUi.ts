export const WORK_ORDER_PLAYBACK_COLORS = {
  start: "#22c55e",
  pause: "#f59e0b",
  stop: "#ef4444",
  disabled: "#94a3b8",
} as const;

export type WorkOrderPlaybackAction = "start" | "pause" | "stop";

export function workOrderPlaybackIconColor(action: WorkOrderPlaybackAction, enabled: boolean): string {
  if (!enabled) return WORK_ORDER_PLAYBACK_COLORS.disabled;
  return WORK_ORDER_PLAYBACK_COLORS[action];
}

export function workOrderPlaybackBtnStyles(
  action: WorkOrderPlaybackAction,
  enabled: boolean,
  colors: { background: string; border: string },
  isDark: boolean,
  radii: { sm: number },
) {
  const tint = {
    start: isDark ? "rgba(34, 197, 94, 0.2)" : "rgba(34, 197, 94, 0.14)",
    pause: isDark ? "rgba(245, 158, 11, 0.2)" : "rgba(245, 158, 11, 0.14)",
    stop: isDark ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.14)",
  }[action];
  const border = {
    start: isDark ? "rgba(34, 197, 94, 0.5)" : "rgba(34, 197, 94, 0.4)",
    pause: isDark ? "rgba(245, 158, 11, 0.5)" : "rgba(245, 158, 11, 0.4)",
    stop: isDark ? "rgba(239, 68, 68, 0.5)" : "rgba(239, 68, 68, 0.4)",
  }[action];

  return {
    button: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingVertical: 14,
      minHeight: 48,
      borderRadius: radii.sm,
      borderWidth: 1,
      backgroundColor: enabled ? tint : colors.background,
      borderColor: enabled ? border : colors.border,
    },
    iconColor: workOrderPlaybackIconColor(action, enabled),
  };
}
