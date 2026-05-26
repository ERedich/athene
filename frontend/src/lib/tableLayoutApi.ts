import { apiFetch } from "./api";
import type { TableLayoutPayloadV1 } from "./tableLayouts/tableLayoutPayload";

export type TableLayoutListItem = {
  id: string;
  name: string;
  tableKey: string;
  isOwner: boolean;
};

export type TableLayoutDetail = {
  id: string;
  name: string;
  tableKey: string;
  isOwner: boolean;
  payload: TableLayoutPayloadV1;
};

export type TableLayoutDefaults = {
  monitoringLayoutId: string | null;
};

export type LayoutShareRow = { userId: string; loginName: string; name: string };

export function normalizeTableLayoutDefaults(d: TableLayoutDefaults): TableLayoutDefaults {
  return {
    monitoringLayoutId: d.monitoringLayoutId ? d.monitoringLayoutId.toLowerCase() : null,
  };
}

export function isSameLayoutId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export async function fetchTableLayouts(tableKey: string): Promise<TableLayoutListItem[]> {
  const q = new URLSearchParams({ tableKey });
  const r = await apiFetch(`/api/table-layouts?${q}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`table_layouts_list_${r.status}`);
  return r.json() as Promise<TableLayoutListItem[]>;
}

export async function fetchTableLayoutDetail(id: string): Promise<TableLayoutDetail> {
  const r = await apiFetch(`/api/table-layouts/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`table_layout_detail_${r.status}`);
  return r.json() as Promise<TableLayoutDetail>;
}

export async function createTableLayout(
  name: string,
  tableKey: string,
  payload: TableLayoutPayloadV1,
): Promise<TableLayoutDetail> {
  const r = await apiFetch("/api/table-layouts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, tableKey, payload }),
  });
  if (!r.ok) throw new Error(`table_layout_create_${r.status}`);
  return r.json() as Promise<TableLayoutDetail>;
}

export async function patchTableLayout(
  id: string,
  patch: { name?: string; payload?: TableLayoutPayloadV1 },
): Promise<TableLayoutDetail> {
  const r = await apiFetch(`/api/table-layouts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`table_layout_patch_${r.status}`);
  return r.json() as Promise<TableLayoutDetail>;
}

export async function deleteTableLayout(id: string): Promise<void> {
  const r = await apiFetch(`/api/table-layouts/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`table_layout_delete_${r.status}`);
}

export async function fetchTableLayoutShares(layoutId: string): Promise<LayoutShareRow[]> {
  const r = await apiFetch(`/api/table-layouts/${encodeURIComponent(layoutId)}/shares`);
  if (!r.ok) throw new Error(`table_layout_shares_${r.status}`);
  return r.json() as Promise<LayoutShareRow[]>;
}

export async function putTableLayoutShares(layoutId: string, userIds: string[]): Promise<void> {
  const r = await apiFetch(`/api/table-layouts/${encodeURIComponent(layoutId)}/shares`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds }),
  });
  if (!r.ok) throw new Error(`table_layout_shares_put_${r.status}`);
}

export async function fetchTableLayoutDefaults(): Promise<TableLayoutDefaults> {
  const r = await apiFetch("/api/table-layouts/defaults", { cache: "no-store" });
  if (!r.ok) throw new Error(`table_layout_defaults_${r.status}`);
  const raw = (await r.json()) as TableLayoutDefaults;
  return normalizeTableLayoutDefaults(raw);
}

export async function putTableLayoutDefaults(
  body: Partial<{ monitoringLayoutId: string | null }>,
): Promise<TableLayoutDefaults> {
  const r = await apiFetch("/api/table-layouts/defaults", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`table_layout_defaults_put_${r.status}`);
  const raw = (await r.json()) as TableLayoutDefaults;
  return normalizeTableLayoutDefaults(raw);
}
