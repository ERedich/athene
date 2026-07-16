import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../lib/api";

export type AtheneBriefingCounts = {
  created24h: number;
  completed24h: number;
  bookings24h: number;
  maintenanceNext48h: number;
  unreadNotifications: number;
};

export type AtheneBriefing = {
  counts: AtheneBriefingCounts;
  news: string;
  lookback: string;
  outlook: string;
  summarySource: "ai" | "fallback";
  maintenancePreview: Array<{
    orderNumber: number | null;
    name: string;
    plannedStart: string;
  }>;
};

export function useAtheneBriefing(enabled: boolean, lang: string) {
  const [data, setData] = useState<AtheneBriefing | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const langParam = lang.toLowerCase().startsWith("en") ? "en" : "de";
      const res = await apiFetch(`/api/dashboard/athene-briefing?lang=${langParam}`);
      if (!res.ok) {
        setError("fetch_failed");
        setData(null);
        return;
      }
      setData((await res.json()) as AtheneBriefing);
    } catch {
      setError("fetch_failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, lang]);

  useEffect(() => {
    if (!enabled) return;
    void refetch();
  }, [enabled, refetch]);

  return { data, loading, error, refetch };
}
