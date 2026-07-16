import { useCallback, useEffect, useMemo, useState } from "react";

import {
  evaluateCustomKpis,
  fetchCustomKpis,
  parseCustomKpiSlotId,
  type CustomKpi,
  type KpiEvaluateEntry,
} from "../lib/kpiBuilderApi";

export function useCustomDashboardKpis(layoutSlotIds: string[]) {
  const [catalog, setCatalog] = useState<CustomKpi[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, KpiEvaluateEntry>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const customIdsInLayout = useMemo(() => {
    const ids = new Set<string>();
    for (const slot of layoutSlotIds) {
      const id = parseCustomKpiSlotId(slot);
      if (id) ids.add(id);
    }
    return [...ids];
  }, [layoutSlotIds]);

  const customIdsKey = customIdsInLayout.slice().sort().join(",");

  const loadCatalog = useCallback(async () => {
    try {
      const list = await fetchCustomKpis({ activeOnly: true });
      setCatalog(list);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (customIdsInLayout.length === 0) {
        setEvaluations({});
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const results = await evaluateCustomKpis(customIdsInLayout);
        if (!cancelled) {
          setEvaluations(results);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by customIdsKey
  }, [customIdsKey]);

  return { catalog, evaluations, loading, error, refetchCatalog: loadCatalog };
}
