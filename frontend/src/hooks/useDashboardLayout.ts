import { useCallback, useEffect, useState } from "react";

import {
  DASHBOARD_SLOT_COUNT,
  DEFAULT_DASHBOARD_LAYOUT,
  isDashboardKpiId,
  type DashboardKpiId,
} from "../lib/dashboardKpiRegistry";
import { canSwapWithSpan, placeKpiInLayout } from "../lib/dashboardGridLayout";
import { parseCustomKpiSlotId } from "../lib/kpiBuilderApi";

export const DASHBOARD_LAYOUT_STORAGE_KEY = "athene.dashboardLayout.v2";
const LEGACY_LAYOUT_STORAGE_KEY = "athene.dashboardLayout";

export type DashboardSlotId = DashboardKpiId | `custom:${string}`;

function canUseDom(): boolean {
  return typeof window !== "undefined";
}

export function isDashboardSlotId(value: unknown): value is DashboardSlotId {
  if (typeof value !== "string") return false;
  if (isDashboardKpiId(value)) return true;
  return parseCustomKpiSlotId(value) !== null;
}

function isValidLayout(value: unknown): value is DashboardSlotId[] {
  if (!Array.isArray(value) || value.length !== DASHBOARD_SLOT_COUNT) return false;
  return value.every((id) => isDashboardSlotId(id));
}

function migrateLegacyLayout(): DashboardSlotId[] | null {
  if (!canUseDom()) return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidLayout(parsed)) return null;
    // Drop legacy layouts that cannot express the greeting span — use default.
    window.localStorage.removeItem(LEGACY_LAYOUT_STORAGE_KEY);
    return [...DEFAULT_DASHBOARD_LAYOUT];
  } catch {
    return null;
  }
}

function readStoredLayout(): DashboardSlotId[] {
  if (!canUseDom()) return [...DEFAULT_DASHBOARD_LAYOUT];
  try {
    const raw = window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidLayout(parsed)) return parsed;
    }
    const migrated = migrateLegacyLayout();
    if (migrated) return migrated;
  } catch {
    /* ignore */
  }
  return [...DEFAULT_DASHBOARD_LAYOUT];
}

function persistLayout(layout: DashboardSlotId[]): void {
  if (!canUseDom()) return;
  try {
    window.localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardSlotId[]>(() => readStoredLayout());

  useEffect(() => {
    persistLayout(layout);
  }, [layout]);

  const setSlotKpi = useCallback((slotIndex: number, kpiId: DashboardSlotId) => {
    if (slotIndex < 0 || slotIndex >= DASHBOARD_SLOT_COUNT) return;
    if (!isDashboardSlotId(kpiId)) return;
    setLayout((prev) => {
      const next = placeKpiInLayout(prev, slotIndex, kpiId);
      return next ?? prev;
    });
  }, []);

  const swapSlots = useCallback((a: number, b: number) => {
    if (a < 0 || a >= DASHBOARD_SLOT_COUNT) return;
    if (b < 0 || b >= DASHBOARD_SLOT_COUNT) return;
    if (a === b) return;
    setLayout((prev) => {
      if (!canSwapWithSpan(prev, a, b)) return prev;
      const next = [...prev];
      [next[a], next[b]] = [next[b]!, next[a]!];
      return next;
    });
  }, []);

  return { layout, setSlotKpi, swapSlots };
}
