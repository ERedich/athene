import { apiFetch } from "./api";
import type { InspectionRound } from "./inspectionRoundTypes";

export async function fetchInspectionRounds(): Promise<InspectionRound[]> {
  const res = await apiFetch("/api/inspection-rounds");
  if (!res.ok) throw new Error(`inspection_rounds_fetch_failed_${res.status}`);
  const data = (await res.json()) as InspectionRound[];
  return Array.isArray(data) ? data : [];
}

export async function fetchInspectionRoundById(id: string): Promise<InspectionRound | null> {
  const res = await apiFetch(`/api/inspection-rounds/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`inspection_round_fetch_failed_${res.status}`);
  return (await res.json()) as InspectionRound;
}

export type InspectionRoundSavePayload = {
  key: string;
  name: string;
  siteId: string;
  assetId: string | null;
  activities: Array<{
    pos: number;
    name: string;
    assetId: string | null;
    inspectionPointId: string | null;
  }>;
};

export async function createInspectionRound(
  payload: InspectionRoundSavePayload,
): Promise<InspectionRound> {
  const res = await apiFetch("/api/inspection-rounds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `create_failed_${res.status}`);
  }
  return (await res.json()) as InspectionRound;
}

export async function updateInspectionRound(
  id: string,
  payload: InspectionRoundSavePayload,
): Promise<InspectionRound> {
  const res = await apiFetch(`/api/inspection-rounds/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `update_failed_${res.status}`);
  }
  return (await res.json()) as InspectionRound;
}

export async function deleteInspectionRound(id: string): Promise<void> {
  const res = await apiFetch(`/api/inspection-rounds/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`delete_failed_${res.status}`);
}
