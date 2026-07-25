import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MultiSelect, type MultiSelectFilterEvent } from "primereact/multiselect";

import { overlayAppendTo } from "../../lib/overlayAppendTo";
import {
  assetRowToSelectOption,
  fetchAssetsByIds,
  suggestAssets,
  type AssetSelectOption,
} from "../../lib/assetSuggestApi";

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  placeholder?: string;
  /** Extra static options (rarely needed). */
  seedOptions?: AssetSelectOption[];
  siteId?: string;
};

/**
 * Asset MultiSelect backed by `/api/assets/suggest` + `/by-ids` hydration.
 * Avoids loading the full asset dump into the search panel.
 */
export function AssetSuggestMultiSelect({
  value,
  onChange,
  className,
  placeholder,
  seedOptions = [],
  siteId,
}: Props) {
  const [options, setOptions] = useState<AssetSelectOption[]>(seedOptions);
  const [filterBusy, setFilterBusy] = useState(false);
  const filterGenRef = useRef(0);
  const valueKey = value.join(",");

  const mergeOptions = useCallback((incoming: AssetSelectOption[]) => {
    setOptions((current) => {
      const byId = new Map(current.map((o) => [o.value, o]));
      for (const o of incoming) byId.set(o.value, o);
      return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
    });
  }, []);

  useEffect(() => {
    if (seedOptions.length === 0) return;
    mergeOptions(seedOptions);
  }, [mergeOptions, seedOptions]);

  // Hydrate labels for selected UUIDs (presets / clever search).
  useEffect(() => {
    const ids = valueKey ? valueKey.split(",").filter(Boolean) : [];
    if (ids.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchAssetsByIds(ids);
        if (cancelled) return;
        mergeOptions(rows.map(assetRowToSelectOption));
      } catch {
        /* leave raw UUIDs visible until next filter */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mergeOptions, valueKey]);

  const onFilter = useCallback(
    (e: MultiSelectFilterEvent) => {
      const q = String(e.filter ?? "").trim();
      const gen = ++filterGenRef.current;
      if (q.length < 1) return;
      setFilterBusy(true);
      void (async () => {
        try {
          const rows = await suggestAssets(q, { siteId, limit: 25 });
          if (gen !== filterGenRef.current) return;
          mergeOptions(rows.map(assetRowToSelectOption));
        } catch {
          /* ignore */
        } finally {
          if (gen === filterGenRef.current) setFilterBusy(false);
        }
      })();
    },
    [mergeOptions, siteId],
  );

  const selectedSeed = useMemo(
    () => options.filter((o) => value.includes(o.value)),
    [options, value],
  );

  // Keep selected chips in the options list even when filter results replace suggestions.
  const displayOptions = useMemo(() => {
    const byId = new Map(options.map((o) => [o.value, o]));
    for (const o of selectedSeed) byId.set(o.value, o);
    return [...byId.values()];
  }, [options, selectedSeed]);

  return (
    <MultiSelect
      value={value}
      options={displayOptions}
      onChange={(e) => onChange((e.value as string[]) ?? [])}
      optionLabel="label"
      optionValue="value"
      display="chip"
      className={className}
      filter
      onFilter={onFilter}
      resetFilterOnHide
      appendTo={overlayAppendTo}
      placeholder={placeholder}
      emptyFilterMessage={filterBusy ? "…" : undefined}
    />
  );
}
