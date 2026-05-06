import { apiFetch } from "./api";

import type { WorkOrderAdvancedSearchState } from "./workOrderListQueryString";

export type WorkOrderSearchPresetListItem = {
  id: string;
  name: string;
  isOwner: boolean;
};

export type WorkOrderSearchPresetPayloadV1 = {
  version: 1;
  quickSearch: string;
  advanced: WorkOrderAdvancedSearchState;
};

export type WorkOrderSearchPresetDetail = {
  id: string;
  name: string;
  isOwner: boolean;
  payload: WorkOrderSearchPresetPayloadV1;
};

export type WorkOrderSearchPresetDefaults = {
  workOrdersPresetId: string | null;
  monitoringPresetId: string | null;
  mobilePresetId: string | null;
};

export function normalizeSearchPresetDefaults(d: WorkOrderSearchPresetDefaults): WorkOrderSearchPresetDefaults {
  return {
    workOrdersPresetId: d.workOrdersPresetId ? d.workOrdersPresetId.toLowerCase() : null,
    monitoringPresetId: d.monitoringPresetId ? d.monitoringPresetId.toLowerCase() : null,
    mobilePresetId: d.mobilePresetId ? d.mobilePresetId.toLowerCase() : null,
  };
}

export function isSamePresetId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export async function fetchWorkOrderSearchPresets(): Promise<WorkOrderSearchPresetListItem[]> {
  const r = await apiFetch("/api/work-order-search-presets");
  if (!r.ok) throw new Error(`presets_list_${r.status}`);
  return r.json() as Promise<WorkOrderSearchPresetListItem[]>;
}

export async function fetchWorkOrderSearchPresetDefaults(): Promise<WorkOrderSearchPresetDefaults> {
  const r = await apiFetch("/api/work-order-search-presets/defaults");
  if (!r.ok) throw new Error(`presets_defaults_${r.status}`);
  const raw = (await r.json()) as WorkOrderSearchPresetDefaults;
  return normalizeSearchPresetDefaults({
    workOrdersPresetId: raw.workOrdersPresetId ?? null,
    monitoringPresetId: raw.monitoringPresetId ?? null,
    mobilePresetId: raw.mobilePresetId ?? null,
  });
}

export async function fetchWorkOrderSearchPresetDetail(id: string): Promise<WorkOrderSearchPresetDetail> {
  const r = await apiFetch(`/api/work-order-search-presets/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`preset_detail_${r.status}`);
  return r.json() as Promise<WorkOrderSearchPresetDetail>;
}
