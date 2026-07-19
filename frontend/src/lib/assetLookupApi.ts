import { apiFetch } from "./api";
import type { WorkOrderReferenceAsset } from "./workOrderTypes";

export type AssetLookupResult = WorkOrderReferenceAsset;

export async function lookupAssetByKey(key: string): Promise<AssetLookupResult | null> {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const res = await apiFetch(`/api/assets/by-key?key=${encodeURIComponent(trimmed)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("lookup_failed");
  const data = (await res.json()) as AssetLookupResult;
  if (!data?.id || !data.key) return null;
  return {
    id: data.id,
    key: data.key,
    name: data.name ?? "",
    siteId: data.siteId,
    costCenterId: data.costCenterId ?? null,
  };
}
