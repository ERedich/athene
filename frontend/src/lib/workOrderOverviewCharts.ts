import type { TransactionRow } from "../pages/TransactionsPage";

export const TRANSACTION_TYPE_COLORS: Record<string, string> = {
  IN: "rgba(52, 211, 153, 0.85)",
  EX: "rgba(56, 189, 248, 0.85)",
  RM: "rgba(251, 191, 36, 0.85)",
  RT: "rgba(167, 139, 250, 0.85)",
  IV: "rgba(251, 113, 133, 0.85)",
};

const TRANSACTION_TYPES = ["IN", "EX", "RM", "RT", "IV"] as const;

export type TransactionTypeAgg = {
  type: string;
  count: number;
  quantitySum: number;
};

export function aggregateTransactionsByType(rows: TransactionRow[]): TransactionTypeAgg[] {
  const map = new Map<string, TransactionTypeAgg>();
  for (const type of TRANSACTION_TYPES) {
    map.set(type, { type, count: 0, quantitySum: 0 });
  }
  for (const row of rows) {
    const type = row.type in TRANSACTION_TYPE_COLORS ? row.type : "OTHER";
    let entry = map.get(type);
    if (!entry) {
      entry = { type, count: 0, quantitySum: 0 };
      map.set(type, entry);
    }
    entry.count += 1;
    const qty = Number(row.quantity);
    if (Number.isFinite(qty)) entry.quantitySum += qty;
  }
  return [...map.values()].filter((e) => e.count > 0);
}

export type TransactionsByDay = {
  labels: string[];
  counts: number[];
};

export function aggregateTransactionsByDay(
  rows: TransactionRow[],
  locale: string,
): TransactionsByDay {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const d = new Date(row.bookedAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const sorted = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "short" });
  return {
    labels: sorted.map(([iso]) => {
      try {
        return fmt.format(new Date(`${iso}T12:00:00`));
      } catch {
        return iso;
      }
    }),
    counts: sorted.map(([, count]) => count),
  };
}

export function chartColorForType(type: string): string {
  return TRANSACTION_TYPE_COLORS[type] ?? "rgba(148, 163, 184, 0.75)";
}

export type StatusHistoryEntry = {
  status: string;
  occurredAt: string;
};

export type StatusHoursAgg = {
  status: string;
  hours: number;
};

const WORK_ORDER_STATUS_ORDER = [
  "open",
  "assigned",
  "started",
  "paused",
  "continued",
  "ended",
  "done",
  "cancelled",
] as const;

/** Statuses excluded from active-work duration in the overview pie chart. */
export const STATUS_HOURS_EXCLUDED = new Set(["ended", "done"]);

export const WORK_ORDER_STATUS_CHART_COLORS: Record<string, string> = {
  open: "rgba(203, 213, 225, 0.85)",
  assigned: "rgba(125, 211, 252, 0.85)",
  started: "rgba(59, 130, 246, 0.85)",
  paused: "rgba(251, 146, 60, 0.85)",
  continued: "rgba(45, 212, 191, 0.85)",
  ended: "rgba(74, 222, 128, 0.85)",
  done: "rgba(74, 222, 128, 0.85)",
  cancelled: "rgba(248, 113, 113, 0.85)",
};

export function chartColorForStatus(status: string): string {
  return WORK_ORDER_STATUS_CHART_COLORS[status] ?? "rgba(148, 163, 184, 0.75)";
}

export function aggregateStatusHours(
  history: StatusHistoryEntry[],
  now: Date = new Date(),
): StatusHoursAgg[] {
  if (history.length === 0) return [];

  const sorted = [...history].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  const hoursByStatus = new Map<string, number>();
  const nowMs = now.getTime();

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    if (STATUS_HOURS_EXCLUDED.has(entry.status)) continue;

    const startMs = new Date(entry.occurredAt).getTime();
    const endMs =
      i + 1 < sorted.length ? new Date(sorted[i + 1].occurredAt).getTime() : nowMs;
    if (Number.isNaN(startMs) || endMs <= startMs) continue;

    const hours = (endMs - startMs) / (1000 * 60 * 60);
    hoursByStatus.set(entry.status, (hoursByStatus.get(entry.status) ?? 0) + hours);
  }

  const order = new Map(WORK_ORDER_STATUS_ORDER.map((status, index) => [status, index]));
  return [...hoursByStatus.entries()]
    .map(([status, hours]) => ({ status, hours }))
    .filter((entry) => entry.hours > 0)
    .sort((a, b) => (order.get(a.status as (typeof WORK_ORDER_STATUS_ORDER)[number]) ?? 99) - (order.get(b.status as (typeof WORK_ORDER_STATUS_ORDER)[number]) ?? 99));
}

export function resolveActualEndAt(history: StatusHistoryEntry[]): string | null {
  if (history.length === 0) return null;

  const sorted = [...history].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  const ended = sorted.find((entry) => entry.status === "ended");
  if (ended) return ended.occurredAt;

  const done = sorted.find((entry) => entry.status === "done");
  return done?.occurredAt ?? null;
}

export type ScheduleTimelineModel = {
  plannedStartMs: number;
  plannedEndMs: number;
  actualEndMs: number | null;
  rangeStartMs: number;
  rangeEndMs: number;
};

export function buildScheduleTimelineModel(
  plannedStart: string,
  plannedEnd: string,
  actualEndAt: string | null,
  now: Date = new Date(),
): ScheduleTimelineModel | null {
  const plannedStartMs = new Date(plannedStart).getTime();
  const plannedEndMs = new Date(plannedEnd).getTime();
  if (Number.isNaN(plannedStartMs) || Number.isNaN(plannedEndMs)) return null;

  const actualEndMs = actualEndAt ? new Date(actualEndAt).getTime() : null;
  const nowMs = now.getTime();
  const rangeStartMs = Math.min(plannedStartMs, actualEndMs ?? plannedStartMs);
  let rangeEndMs = Math.max(plannedEndMs, actualEndMs ?? plannedEndMs, nowMs);
  if (rangeEndMs <= rangeStartMs) {
    rangeEndMs = rangeStartMs + 60 * 60 * 1000;
  }

  return {
    plannedStartMs,
    plannedEndMs,
    actualEndMs: actualEndMs != null && !Number.isNaN(actualEndMs) ? actualEndMs : null,
    rangeStartMs,
    rangeEndMs,
  };
}

export function scheduleTimelinePercent(valueMs: number, rangeStartMs: number, rangeEndMs: number): number {
  const span = rangeEndMs - rangeStartMs;
  if (span <= 0) return 0;
  return Math.min(100, Math.max(0, ((valueMs - rangeStartMs) / span) * 100));
}

export function scheduleDeltaHours(actualMs: number, plannedMs: number): number {
  return (actualMs - plannedMs) / (1000 * 60 * 60);
}

const SCHEDULE_ON_TIME_TOLERANCE_HOURS = 0.05;

export type ScheduleAdherenceState = {
  late: boolean;
  deltaHours: number;
  referenceMs: number;
  isOpen: boolean;
};

export function resolveScheduleAdherence(
  plannedEnd: string,
  actualEndAt: string | null,
  now: Date = new Date(),
): ScheduleAdherenceState | null {
  const plannedEndMs = new Date(plannedEnd).getTime();
  if (Number.isNaN(plannedEndMs)) return null;

  const isOpen = actualEndAt == null;
  const referenceMs = isOpen ? now.getTime() : new Date(actualEndAt).getTime();
  if (Number.isNaN(referenceMs)) return null;

  const deltaHours = scheduleDeltaHours(referenceMs, plannedEndMs);
  return {
    late: deltaHours > SCHEDULE_ON_TIME_TOLERANCE_HOURS,
    deltaHours,
    referenceMs,
    isOpen,
  };
}

/** Resolve a CSS color (including var()) to a value Chart.js can paint on canvas. */
export function resolveCssColor(cssValue: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const el = document.createElement("div");
  el.style.color = cssValue;
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  el.style.pointerEvents = "none";
  document.documentElement.appendChild(el);
  const resolved = getComputedStyle(el).color.trim();
  el.remove();
  return resolved && resolved !== "rgba(0, 0, 0, 0)" ? resolved : fallback;
}

function rgbToRgba(rgb: string, alpha: number): string {
  if (rgb.startsWith("rgba(")) {
    return rgb.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
  }
  if (rgb.startsWith("rgb(")) {
    return rgb.replace(/^rgb\(/, "rgba(").replace(/\)$/, `, ${alpha})`);
  }
  return rgb;
}

/** Primary accent for line/area charts (Chart.js cannot use CSS variables). */
export function readThemePrimaryChartColors(fillAlpha = 0.25): { border: string; fill: string } {
  const fallbackBorder = "rgb(0, 212, 255)";
  const border = resolveCssColor("var(--color-primary)", fallbackBorder);
  return {
    border,
    fill: rgbToRgba(border, fillAlpha),
  };
}

export function readThemeChartColors(): {
  text: string;
  grid: string;
  border: string;
} {
  if (typeof document === "undefined") {
    return { text: "#94a3b8", grid: "rgba(148, 163, 184, 0.15)", border: "rgba(148, 163, 184, 0.25)" };
  }
  const root = document.documentElement;
  const text =
    getComputedStyle(root).getPropertyValue("--color-on-surface-variant").trim() || "#94a3b8";
  const onSurface =
    getComputedStyle(root).getPropertyValue("--color-on-surface").trim() || "#94a3b8";
  return {
    text,
    grid: rgbToRgba(resolveCssColor(onSurface, "#94a3b8"), 0.12),
    border: rgbToRgba(resolveCssColor(onSurface, "#94a3b8"), 0.18),
  };
}
