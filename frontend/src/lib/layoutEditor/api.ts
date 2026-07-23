import { apiFetch } from "../api";
import type {
  AppLayoutAppKey,
  AppFieldDef,
  ContextMenuLayoutPayload,
  ModalLayoutPayload,
  TableLayoutPayload,
  TabsLayoutPayload,
} from "./types";

export type AppLayout = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  appKey: AppLayoutAppKey | string;
  isSystem: boolean;
  modal: ModalLayoutPayload;
  table: TableLayoutPayload;
  contextMenu: ContextMenuLayoutPayload;
  tabs: TabsLayoutPayload;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type AppLayoutWritePayload = {
  key: string;
  name: string;
  siteId: string;
  appKey: string;
  modal: ModalLayoutPayload;
  table: TableLayoutPayload;
  contextMenu: ContextMenuLayoutPayload;
  tabs: TabsLayoutPayload;
};

export type AppLayoutCopyPayload = {
  key: string;
  name: string;
  siteId: string;
};

export type AppLayoutMeta = {
  appKeys: AppLayoutAppKey[];
  catalogs: Record<string, AppFieldDef[]>;
};

export async function fetchAppLayoutMeta(): Promise<AppLayoutMeta> {
  const res = await apiFetch("/api/app-layouts/meta");
  if (!res.ok) throw new Error("meta");
  return (await res.json()) as AppLayoutMeta;
}

export async function fetchActiveAppLayout(
  siteId: string,
  appKey: string,
): Promise<AppLayout> {
  const q = new URLSearchParams({ siteId, appKey });
  const res = await apiFetch(`/api/app-layouts/active?${q.toString()}`);
  if (!res.ok) throw new Error("active");
  return (await res.json()) as AppLayout;
}

export async function fetchAppLayouts(params?: {
  appKey?: string;
  siteId?: string;
}): Promise<AppLayout[]> {
  const q = new URLSearchParams();
  if (params?.appKey) q.set("appKey", params.appKey);
  if (params?.siteId) q.set("siteId", params.siteId);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  const res = await apiFetch(`/api/app-layouts${suffix}`);
  if (!res.ok) throw new Error("list");
  return (await res.json()) as AppLayout[];
}

export async function fetchAppLayout(id: string): Promise<AppLayout> {
  const res = await apiFetch(`/api/app-layouts/${id}`);
  if (!res.ok) throw new Error("get");
  return (await res.json()) as AppLayout;
}

export async function createAppLayout(payload: AppLayoutWritePayload): Promise<AppLayout> {
  const res = await apiFetch("/api/app-layouts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("create");
  return (await res.json()) as AppLayout;
}

export async function updateAppLayout(
  id: string,
  payload: AppLayoutWritePayload,
): Promise<AppLayout> {
  const res = await apiFetch(`/api/app-layouts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "update");
  }
  return (await res.json()) as AppLayout;
}

export async function copyAppLayout(
  id: string,
  payload: AppLayoutCopyPayload,
): Promise<AppLayout> {
  const res = await apiFetch(`/api/app-layouts/${id}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "copy");
  }
  return (await res.json()) as AppLayout;
}

export async function deleteAppLayout(id: string): Promise<void> {
  const res = await apiFetch(`/api/app-layouts/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "delete");
  }
}
