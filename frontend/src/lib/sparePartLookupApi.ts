import { apiFetch } from "./api";

export type SparePartLookupResult = {
  id: string;
  key: string;
  name: string;
  siteId: string;
};

export async function lookupSparePartByKey(key: string): Promise<SparePartLookupResult | null> {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const res = await apiFetch(`/api/spare-parts/by-key?key=${encodeURIComponent(trimmed)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("lookup_failed");
  const data = (await res.json()) as SparePartLookupResult;
  if (!data?.id || !data.key) return null;
  return {
    id: data.id,
    key: data.key,
    name: data.name ?? "",
    siteId: data.siteId,
  };
}

export async function suggestSpareParts(
  q: string,
  options?: { siteId?: string; signal?: AbortSignal; limit?: number },
): Promise<SparePartLookupResult[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const params = new URLSearchParams();
  params.set("q", trimmed);
  params.set("limit", String(options?.limit ?? 25));
  if (options?.siteId) params.set("siteId", options.siteId);

  const res = await apiFetch(`/api/spare-parts/suggest?${params.toString()}`, {
    signal: options?.signal,
  });
  if (!res.ok) throw new Error("suggest_failed");
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data
    .map((raw): SparePartLookupResult | null => {
      if (!raw || typeof raw !== "object") return null;
      const o = raw as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : "";
      const key = typeof o.key === "string" ? o.key : "";
      const siteId = typeof o.siteId === "string" ? o.siteId : "";
      if (!id || !key || !siteId) return null;
      return {
        id,
        key,
        name: typeof o.name === "string" ? o.name : "",
        siteId,
      };
    })
    .filter((row): row is SparePartLookupResult => row != null);
}
