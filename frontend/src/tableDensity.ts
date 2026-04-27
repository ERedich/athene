import { useEffect, useMemo, useState } from "react";

export type TableDensity = "comfortable" | "compact";

export const TABLE_DENSITY_STORAGE_KEY = "athene.tableDensity";

function isTableDensity(value: string | null): value is TableDensity {
  return value === "comfortable" || value === "compact";
}

function canUseDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function readInitialDensity(): TableDensity {
  if (!canUseDom()) return "comfortable";
  try {
    const stored = window.localStorage.getItem(TABLE_DENSITY_STORAGE_KEY);
    if (isTableDensity(stored)) {
      return stored;
    }
  } catch {
    /* ignore storage read failures */
  }
  const fromDataset = document.documentElement.dataset.tableDensity ?? null;
  return isTableDensity(fromDataset) ? fromDataset : "comfortable";
}

export function applyDensity(density: TableDensity): void {
  if (!canUseDom()) return;
  document.documentElement.dataset.tableDensity = density;
}

function persistDensity(density: TableDensity): void {
  if (!canUseDom()) return;
  try {
    window.localStorage.setItem(TABLE_DENSITY_STORAGE_KEY, density);
  } catch {
    /* ignore storage write failures */
  }
}

export function useTableDensity() {
  const [density, setDensity] = useState<TableDensity>(() => readInitialDensity());

  useEffect(() => {
    applyDensity(density);
    persistDensity(density);
  }, [density]);

  const isCompact = density === "compact";

  return useMemo(
    () => ({
      density,
      isCompact,
      setDensity,
      toggleDensity: () => setDensity((current) => (current === "compact" ? "comfortable" : "compact")),
    }),
    [density, isCompact],
  );
}
