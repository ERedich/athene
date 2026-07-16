import {
  DASHBOARD_SLOT_COUNT,
  getDashboardKpiSpan,
  isDashboardKpiId,
  type DashboardKpiId,
} from "./dashboardKpiRegistry";
import type { DashboardSlotId } from "../hooks/useDashboardLayout";

/** Logical desktop grid (matches ≥1100px CSS). */
export const DASHBOARD_GRID_COLS = 4;
export const DASHBOARD_GRID_ROWS = 4;

export type KpiSpan = { colSpan: number; rowSpan: number };

export function getSlotSpan(kpiId: DashboardSlotId): KpiSpan {
  if (isDashboardKpiId(kpiId)) return getDashboardKpiSpan(kpiId);
  return { colSpan: 1, rowSpan: 1 };
}

export function slotRowCol(
  slotIndex: number,
  cols: number = DASHBOARD_GRID_COLS,
): { row: number; col: number } {
  return {
    row: Math.floor(slotIndex / cols),
    col: slotIndex % cols,
  };
}

export function slotIndexAt(
  row: number,
  col: number,
  cols: number = DASHBOARD_GRID_COLS,
): number {
  return row * cols + col;
}

/** Slots covered by a spanning tile anchored at `anchorIndex` (includes anchor). */
export function getCoveredSlots(
  anchorIndex: number,
  span: KpiSpan,
  cols: number = DASHBOARD_GRID_COLS,
  rows: number = DASHBOARD_GRID_ROWS,
): number[] {
  const { row, col } = slotRowCol(anchorIndex, cols);
  if (col + span.colSpan > cols || row + span.rowSpan > rows) return [];
  const covered: number[] = [];
  for (let dr = 0; dr < span.rowSpan; dr++) {
    for (let dc = 0; dc < span.colSpan; dc++) {
      covered.push(slotIndexAt(row + dr, col + dc, cols));
    }
  }
  return covered;
}

export function canPlaceSpanAt(
  anchorIndex: number,
  span: KpiSpan,
  cols: number = DASHBOARD_GRID_COLS,
  rows: number = DASHBOARD_GRID_ROWS,
): boolean {
  if (anchorIndex < 0 || anchorIndex >= DASHBOARD_SLOT_COUNT) return false;
  const { row, col } = slotRowCol(anchorIndex, cols);
  return col + span.colSpan <= cols && row + span.rowSpan <= rows;
}

/**
 * Visible slot anchors for rendering: skip slots covered by an earlier spanning KPI.
 * Covered non-anchor slots are omitted from the DOM so CSS grid-span works.
 */
export function getVisibleSlotIndices(layout: DashboardSlotId[]): number[] {
  const coveredByOther = new Set<number>();
  const visible: number[] = [];

  for (let i = 0; i < layout.length; i++) {
    if (coveredByOther.has(i)) continue;
    const span = getSlotSpan(layout[i]!);
    if (span.colSpan > 1 || span.rowSpan > 1) {
      if (!canPlaceSpanAt(i, span)) {
        // Invalid placement — render as 1×1 so the grid stays usable
        visible.push(i);
        continue;
      }
      const covered = getCoveredSlots(i, span);
      for (const c of covered) {
        if (c !== i) coveredByOther.add(c);
      }
    }
    visible.push(i);
  }

  return visible;
}

/** Whether dropping/swapping a spanning tile onto `targetIndex` is valid. */
export function canSwapWithSpan(
  layout: DashboardSlotId[],
  fromIndex: number,
  toIndex: number,
): boolean {
  if (fromIndex === toIndex) return true;
  if (fromIndex < 0 || toIndex < 0) return false;
  if (fromIndex >= layout.length || toIndex >= layout.length) return false;

  const fromId = layout[fromIndex]!;
  const toId = layout[toIndex]!;
  const fromSpan = getSlotSpan(fromId);
  const toSpan = getSlotSpan(toId);

  const next = [...layout];
  next[fromIndex] = toId;
  next[toIndex] = fromId;

  if (fromSpan.colSpan > 1 || fromSpan.rowSpan > 1) {
    if (!canPlaceSpanAt(toIndex, fromSpan)) return false;
  }
  if (toSpan.colSpan > 1 || toSpan.rowSpan > 1) {
    if (!canPlaceSpanAt(fromIndex, toSpan)) return false;
  }

  // After swap, no two spanning tiles may overlap
  return !spansOverlap(next);
}

function spansOverlap(layout: DashboardSlotId[]): boolean {
  const owner = new Map<number, number>();
  for (let i = 0; i < layout.length; i++) {
    const span = getSlotSpan(layout[i]!);
    if (span.colSpan === 1 && span.rowSpan === 1) continue;
    if (!canPlaceSpanAt(i, span)) return true;
    for (const c of getCoveredSlots(i, span)) {
      const prev = owner.get(c);
      if (prev !== undefined && prev !== i) return true;
      owner.set(c, i);
    }
  }
  return false;
}

/** Place a KPI into a slot; spanning KPIs may only exist once and must fit. */
export function placeKpiInLayout(
  layout: DashboardSlotId[],
  slotIndex: number,
  kpiId: DashboardSlotId,
  fallbackId: DashboardKpiId = "openActive",
): DashboardSlotId[] | null {
  if (slotIndex < 0 || slotIndex >= layout.length) return null;
  const span = getSlotSpan(kpiId);
  if (span.colSpan > 1 || span.rowSpan > 1) {
    if (!canPlaceSpanAt(slotIndex, span)) return null;
  }

  const next = [...layout];

  // Ensure spanning KPI appears at most once
  if (isDashboardKpiId(kpiId) && (span.colSpan > 1 || span.rowSpan > 1)) {
    for (let i = 0; i < next.length; i++) {
      if (i !== slotIndex && next[i] === kpiId) {
        next[i] = fallbackId;
      }
    }
  }

  next[slotIndex] = kpiId;

  if (spansOverlap(next)) return null;
  return next;
}
