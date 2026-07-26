import type { SlaState } from "../types/api";

const SLA_BACKGROUND: Record<SlaState, string> = {
  ok: "rgba(74, 222, 128, 0.35)",
  warn: "rgba(251, 191, 36, 0.45)",
  overdue: "rgba(248, 113, 113, 0.45)",
};

const SLA_FOREGROUND: Record<SlaState, string> = {
  ok: "rgb(22, 163, 74)",
  warn: "rgb(180, 83, 9)",
  overdue: "rgb(220, 38, 38)",
};

export function workOrderSlaBackground(state: SlaState): string {
  return SLA_BACKGROUND[state];
}

export function workOrderSlaForeground(state: SlaState): string {
  return SLA_FOREGROUND[state];
}

export function worstSlaState(...states: (SlaState | null | undefined)[]): SlaState | null {
  const rank: Record<SlaState, number> = { ok: 1, warn: 2, overdue: 3 };
  let best: SlaState | null = null;
  let bestRank = 0;
  for (const state of states) {
    if (!state) continue;
    const r = rank[state];
    if (r > bestRank) {
      bestRank = r;
      best = state;
    }
  }
  return best;
}
