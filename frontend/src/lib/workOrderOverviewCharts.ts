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
  return {
    text,
    grid: "color-mix(in srgb, var(--color-on-surface) 12%, transparent)",
    border: "color-mix(in srgb, var(--color-on-surface) 18%, transparent)",
  };
}
