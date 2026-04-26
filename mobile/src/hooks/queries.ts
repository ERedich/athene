import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import type { AssetRow, CostCenterRow, SiteRow } from "../types/api";

export const queryKeys = {
  sites: ["sites"] as const,
  costCenters: ["costCenters"] as const,
  assets: ["assets"] as const,
};

export function useSitesQuery() {
  return useQuery({
    queryKey: queryKeys.sites,
    queryFn: async (): Promise<SiteRow[]> => {
      const r = await apiFetch("/api/sites");
      if (!r.ok) throw new Error("sites");
      return r.json() as Promise<SiteRow[]>;
    },
  });
}

export function useCostCentersQuery() {
  return useQuery({
    queryKey: queryKeys.costCenters,
    queryFn: async (): Promise<CostCenterRow[]> => {
      const r = await apiFetch("/api/cost-centers");
      if (!r.ok) throw new Error("costCenters");
      return r.json() as Promise<CostCenterRow[]>;
    },
  });
}

export function useAssetsQuery() {
  return useQuery({
    queryKey: queryKeys.assets,
    queryFn: async (): Promise<AssetRow[]> => {
      const r = await apiFetch("/api/assets");
      if (!r.ok) throw new Error("assets");
      return r.json() as Promise<AssetRow[]>;
    },
  });
}

export function useDeleteCostCenterMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await apiFetch(`/api/cost-centers/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error("delete");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.costCenters });
    },
  });
}

export function useDeleteAssetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await apiFetch(`/api/assets/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error("delete");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.assets });
    },
  });
}

export async function postCostCenter(body: {
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
}): Promise<CostCenterRow> {
  const r = await apiFetch("/api/cost-centers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || "save");
  }
  return r.json() as Promise<CostCenterRow>;
}

export async function putCostCenter(
  id: string,
  body: { key: string; name: string; siteId: string; isActive: boolean },
): Promise<CostCenterRow> {
  const r = await apiFetch(`/api/cost-centers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || "save");
  }
  return r.json() as Promise<CostCenterRow>;
}

export type AssetSaveBody = {
  key: string;
  name: string;
  siteId: string;
  type: AssetRow["type"];
  parentAssetId: string | null;
  serialNumber: string | null;
  buildDate: string | null;
  manufacturer: string | null;
  remark: string | null;
  costCenterId: string | null;
};

export async function postAsset(body: AssetSaveBody): Promise<AssetRow> {
  const r = await apiFetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || "save");
  }
  return r.json() as Promise<AssetRow>;
}

export async function putAsset(id: string, body: AssetSaveBody): Promise<AssetRow> {
  const r = await apiFetch(`/api/assets/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || "save");
  }
  return r.json() as Promise<AssetRow>;
}
