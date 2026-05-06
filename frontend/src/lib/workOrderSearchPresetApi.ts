import { apiFetch } from "./api";
import type { WorkOrderAdvancedSearchState } from "./workOrderApiFilters";

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

export function buildWorkOrderSearchPresetPayload(
  quickSearch: string,
  advanced: WorkOrderAdvancedSearchState,
): WorkOrderSearchPresetPayloadV1 {
  return { version: 1, quickSearch, advanced: { ...advanced } };
}

export async function fetchWorkOrderSearchPresets(): Promise<WorkOrderSearchPresetListItem[]> {
  const r = await apiFetch("/api/work-order-search-presets", { cache: "no-store" });
  if (!r.ok) throw new Error(`presets_list_${r.status}`);
  return r.json() as Promise<WorkOrderSearchPresetListItem[]>;
}

export type WorkOrderSearchPresetDetail = {
  id: string;
  name: string;
  isOwner: boolean;
  payload: WorkOrderSearchPresetPayloadV1;
};

export async function fetchWorkOrderSearchPresetDetail(id: string): Promise<WorkOrderSearchPresetDetail> {
  const r = await apiFetch(`/api/work-order-search-presets/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`preset_detail_${r.status}`);
  return r.json() as Promise<WorkOrderSearchPresetDetail>;
}

export async function createWorkOrderSearchPreset(
  name: string,
  payload: WorkOrderSearchPresetPayloadV1,
): Promise<WorkOrderSearchPresetDetail> {
  const r = await apiFetch("/api/work-order-search-presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, payload }),
  });
  if (!r.ok) throw new Error(`preset_create_${r.status}`);
  return r.json() as Promise<WorkOrderSearchPresetDetail>;
}

export type PresetShareRow = { userId: string; loginName: string; name: string };

export async function fetchWorkOrderSearchPresetShares(presetId: string): Promise<PresetShareRow[]> {
  const r = await apiFetch(`/api/work-order-search-presets/${encodeURIComponent(presetId)}/shares`);
  if (!r.ok) throw new Error(`preset_shares_${r.status}`);
  return r.json() as Promise<PresetShareRow[]>;
}

export async function putWorkOrderSearchPresetShares(presetId: string, userIds: string[]): Promise<void> {
  const r = await apiFetch(`/api/work-order-search-presets/${encodeURIComponent(presetId)}/shares`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds }),
  });
  if (!r.ok) throw new Error(`preset_shares_put_${r.status}`);
}

export async function deleteWorkOrderSearchPreset(id: string): Promise<void> {
  const r = await apiFetch(`/api/work-order-search-presets/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`preset_delete_${r.status}`);
}

export type WorkOrderSearchPresetDefaults = {
  workOrdersPresetId: string | null;
  monitoringPresetId: string | null;
  mobilePresetId: string | null;
};

/** Postgres / drivers vary UUID string casing; normalize for stable React comparisons. */
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

export async function fetchWorkOrderSearchPresetDefaults(): Promise<WorkOrderSearchPresetDefaults> {
  const r = await apiFetch("/api/work-order-search-presets/defaults", { cache: "no-store" });
  if (!r.ok) throw new Error(`presets_defaults_${r.status}`);
  const raw = (await r.json()) as WorkOrderSearchPresetDefaults;
  return normalizeSearchPresetDefaults(raw);
}

export async function putWorkOrderSearchPresetDefaults(
  body: Partial<{ workOrdersPresetId: string | null; monitoringPresetId: string | null; mobilePresetId: string | null }>,
): Promise<WorkOrderSearchPresetDefaults> {
  const r = await apiFetch("/api/work-order-search-presets/defaults", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`presets_defaults_put_${r.status}`);
  const raw = (await r.json()) as WorkOrderSearchPresetDefaults;
  return normalizeSearchPresetDefaults(raw);
}

export async function patchWorkOrderSearchPreset(
  id: string,
  patch: { name?: string; payload?: WorkOrderSearchPresetPayloadV1 },
): Promise<WorkOrderSearchPresetDetail> {
  const r = await apiFetch(`/api/work-order-search-presets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`preset_patch_${r.status}`);
  return r.json() as Promise<WorkOrderSearchPresetDetail>;
}
