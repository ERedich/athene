import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../lib/api";
import {
  emptyGettingStartedCounts,
  fetchGettingStartedCounts,
  type GettingStartedCounts,
} from "../lib/gettingStartedCounts";

export function useGettingStartedCounts() {
  const [counts, setCounts] = useState<GettingStartedCounts>(() =>
    emptyGettingStartedCounts(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const next = await fetchGettingStartedCounts(apiFetch);
    const anyOk = Object.values(next).some((value) => value !== null);
    setCounts(next);
    setError(anyOk ? null : "fetch_failed");
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { counts, loading, error, refetch };
}
