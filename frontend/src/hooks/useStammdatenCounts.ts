import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../lib/api";
import {
  STAMMDATEN_COUNT_ENDPOINTS,
  type StammdatenCountKey,
} from "../lib/stammdatenManagerTiles";

export type StammdatenCounts = Record<StammdatenCountKey, number | null>;

function emptyCounts(): StammdatenCounts {
  return {
    assets: null,
    employees: null,
    costCenters: null,
    workOrderTypes: null,
    problems: null,
    causes: null,
    remedies: null,
    classifications: null,
    workgroups: null,
    suppliers: null,
    maintenancePlans: null,
    inspectionRounds: null,
  };
}

async function fetchListLength(path: string): Promise<number | null> {
  try {
    const res = await apiFetch(path);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}

export function useStammdatenCounts() {
  const [counts, setCounts] = useState<StammdatenCounts>(() => emptyCounts());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const keys = Object.keys(STAMMDATEN_COUNT_ENDPOINTS) as StammdatenCountKey[];
    const results = await Promise.all(
      keys.map(async (key) => {
        const length = await fetchListLength(STAMMDATEN_COUNT_ENDPOINTS[key]);
        return [key, length] as const;
      }),
    );

    const next = emptyCounts();
    let anyOk = false;
    for (const [key, length] of results) {
      next[key] = length;
      if (length !== null) anyOk = true;
    }
    setCounts(next);
    setError(anyOk ? null : "fetch_failed");
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { counts, loading, error, refetch };
}
