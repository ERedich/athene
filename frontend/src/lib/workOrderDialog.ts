export const orderDialogTabs = {
  General: 0,
  Planning: 1,
  Documents: 2,
  Feedback: 3,
  Transactions: 4,
  Messages: 5,
} as const;

export type OrderDialogTab = (typeof orderDialogTabs)[keyof typeof orderDialogTabs];

export type FeedbackEntryMode = "create" | "pause" | "stop";

export type FeedbackStatusAction = "none" | "pause" | "end";

export type FeedbackAdditionalHoursRow = {
  localId: string;
  employeeId: string;
  hours: string;
};

export function feedbackStatusActionForEntryMode(mode: FeedbackEntryMode): FeedbackStatusAction {
  if (mode === "pause") return "pause";
  if (mode === "stop") return "end";
  return "none";
}

export function formatHoursForInput(hours: number): string {
  const rounded = Math.round(hours * 10_000) / 10_000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(4).replace(/\.?0+$/, "");
}

export function computeSegmentHours(startedAt: string | null | undefined): string {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return "";
  const hours = (Date.now() - start) / 3_600_000;
  if (hours <= 0) return "";
  return formatHoursForInput(hours);
}

export function newAdditionalHoursRow(): FeedbackAdditionalHoursRow {
  return { localId: crypto.randomUUID(), employeeId: "", hours: "" };
}
