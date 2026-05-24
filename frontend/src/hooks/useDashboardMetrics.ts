import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../lib/api";

export type StatusCount = { status: string; count: number };
export type DayCount = { date: string; count: number };
export type OrderTypeCount = { orderType: string; count: number };

export type DashboardMetrics = {
  openActive: { total: number; byStatus: StatusCount[] };
  completedLast7Days: { total: number; byDay: DayCount[] };
  myOrders: { total: number; byStatus: StatusCount[]; employeeLinked: boolean };
  transactionsLast7Days: { total: number; byDay: DayCount[] };
  ordersByType: { total: number; byType: OrderTypeCount[] };
  delayedOrders: { total: number };
  avgDelayHours: { hours: number | null };
  topAssetByOrders: {
    assetId: string | null;
    assetKey: string | null;
    assetName: string | null;
    count: number;
  };
  transactionsLast24h: { total: number };
  transactionsLastMonth: { total: number };
};

export function useDashboardMetrics() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/dashboard/metrics");
      if (!res.ok) {
        setError("fetch_failed");
        setData(null);
        return;
      }
      const json = (await res.json()) as DashboardMetrics;
      setData(json);
    } catch {
      setError("fetch_failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
