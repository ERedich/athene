import { useCallback, useEffect, useState } from "react";

import {
  DASHBOARD_KPI_IDS,
  DASHBOARD_SLOT_COUNT,
  DEFAULT_DASHBOARD_LAYOUT,
  isDashboardKpiId,
  type DashboardKpiId,
} from "../lib/dashboardKpiRegistry";

export const DASHBOARD_LAYOUT_STORAGE_KEY = "athene.dashboardLayout";

function canUseDom(): boolean {
  return typeof window !== "undefined";
}

function isValidLayout(value: unknown): value is DashboardKpiId[] {
  if (!Array.isArray(value) || value.length !== DASHBOARD_SLOT_COUNT) return false;
  return value.every((id) => isDashboardKpiId(id));
}

function readStoredLayout(): DashboardKpiId[] {
  if (!canUseDom()) return [...DEFAULT_DASHBOARD_LAYOUT];
  try {
    const raw = window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY);
    if (!raw) return [...DEFAULT_DASHBOARD_LAYOUT];
    const parsed: unknown = JSON.parse(raw);
    if (isValidLayout(parsed)) return parsed;
  } catch {
    /* ignore */
  }
  return [...DEFAULT_DASHBOARD_LAYOUT];
}

function persistLayout(layout: DashboardKpiId[]): void {
  if (!canUseDom()) return;
  try {
    window.localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardKpiId[]>(() => readStoredLayout());

  useEffect(() => {
    persistLayout(layout);
  }, [layout]);

  const setSlotKpi = useCallback((slotIndex: number, kpiId: DashboardKpiId) => {
    if (slotIndex < 0 || slotIndex >= DASHBOARD_SLOT_COUNT) return;
    if (!DASHBOARD_KPI_IDS.includes(kpiId)) return;
    setLayout((prev) => {
      const next = [...prev];
      next[slotIndex] = kpiId;
      return next;
    });
  }, []);

  return { layout, setSlotKpi };
}
