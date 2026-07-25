import { apiFetch } from "./api";

export type AssetSuggestRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
};

export type AssetSelectOption = { label: string; value: string };

export function assetRowToSelectOption(row: Pick<AssetSuggestRow, "id" | "key" | "name">): AssetSelectOption {
  return { label: `${row.key} - ${row.name}`, value: row.id };
}

export async function suggestAssets(query: string, options?: { limit?: number; siteId?: string }): Promise<AssetSuggestRow[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("limit", String(options?.limit ?? 25));
  if (options?.siteId) params.set("siteId", options.siteId);
  const res = await apiFetch(`/api/assets/suggest?${params.toString()}`);
  if (!res.ok) throw new Error(`assets_suggest_failed_${res.status}`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as AssetSuggestRow[]) : [];
}

export async function fetchAssetsByIds(ids: string[]): Promise<AssetSuggestRow[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const params = new URLSearchParams();
  params.set("ids", unique.join(","));
  const res = await apiFetch(`/api/assets/by-ids?${params.toString()}`);
  if (!res.ok) throw new Error(`assets_by_ids_failed_${res.status}`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as AssetSuggestRow[]) : [];
}
