/** PrimeReact DataTable stateStorage key for Monitoring (personal browser state). */
export const MONITORING_TABLE_STATE_STORAGE_KEY = "athene-monitoring-table-v5";

const LEGACY_MONITORING_TABLE_STATE_KEYS = [
  "athene-monitoring-table-v4",
  "athene-monitoring-table-v3",
  "athene-monitoring-table-v2",
  "athene-monitoring-table",
] as const;

/** Removes obsolete layout-editor / custom-storage keys so PrimeReact local state can take over. */
export function clearLegacyMonitoringTableStateStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_MONITORING_TABLE_STATE_KEYS) {
    window.localStorage.removeItem(key);
  }
}

if (typeof window !== "undefined") {
  clearLegacyMonitoringTableStateStorage();
}
