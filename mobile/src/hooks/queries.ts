import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import type {
  AssetRow,
  ClassificationRow,
  CostCenterRow,
  SiteRow,
  WorkOrderDocumentCategory,
  WorkOrderDocumentRow,
  WorkOrderAssignmentRow,
  WorkOrderRow,
  WorkOrderType,
  WorkgroupRow,
} from "../types/api";

export const queryKeys = {
  sites: ["sites"] as const,
  costCenters: ["costCenters"] as const,
  classifications: ["classifications"] as const,
  assets: ["assets"] as const,
  workOrders: ["workOrders"] as const,
  workOrderDocuments: (orderId: string) => ["workOrders", orderId, "documents"] as const,
  workOrderAssignments: (orderId: string) => ["workOrders", orderId, "assignments"] as const,
  workgroups: ["workgroups"] as const,
};

export type WorkOrderActionErrorCode =
  | "cannot_start_from_status"
  | "cannot_pause_from_status"
  | "cannot_feedback_from_status"
  | "invalid_body"
  | "unknown";

export class WorkOrderActionError extends Error {
  code: WorkOrderActionErrorCode;

  constructor(code: WorkOrderActionErrorCode) {
    super(code);
    this.code = code;
  }
}

type WorkOrderFeedbackBody = {
  hours: number;
  remark?: string | null;
  completeOrder?: boolean;
};

async function readActionErrorCode(r: Response): Promise<WorkOrderActionErrorCode> {
  try {
    const json = (await r.json()) as { error?: string };
    const code = json?.error;
    if (
      code === "cannot_start_from_status" ||
      code === "cannot_pause_from_status" ||
      code === "cannot_feedback_from_status" ||
      code === "invalid_body"
    ) {
      return code;
    }
  } catch {
    // Ignore JSON parsing failures and fallback to unknown.
  }
  return "unknown";
}

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

export function useClassificationsQuery() {
  return useQuery({
    queryKey: queryKeys.classifications,
    queryFn: async (): Promise<ClassificationRow[]> => {
      const r = await apiFetch("/api/classifications");
      if (!r.ok) throw new Error("classifications");
      return r.json() as Promise<ClassificationRow[]>;
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

export function useWorkOrdersQuery() {
  return useQuery({
    queryKey: queryKeys.workOrders,
    queryFn: async (): Promise<WorkOrderRow[]> => {
      const r = await apiFetch("/api/work-orders");
      if (!r.ok) throw new Error("workOrders");
      return r.json() as Promise<WorkOrderRow[]>;
    },
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
  });
}

export function useWorkgroupsQuery() {
  return useQuery({
    queryKey: queryKeys.workgroups,
    queryFn: async (): Promise<WorkgroupRow[]> => {
      const r = await apiFetch("/api/workgroups");
      if (!r.ok) throw new Error("workgroups");
      const raw = (await r.json()) as WorkgroupRow[];
      return Array.isArray(raw)
        ? raw.map((wg) => ({ ...wg, employeeIds: Array.isArray(wg.employeeIds) ? wg.employeeIds : [] }))
        : [];
    },
  });
}

export function useWorkOrderDocumentsQuery(orderId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.workOrderDocuments(orderId ?? ""),
    enabled: Boolean(orderId),
    queryFn: async (): Promise<WorkOrderDocumentRow[]> => {
      if (!orderId) return [];
      const r = await apiFetch(`/api/work-orders/${orderId}/documents`);
      if (!r.ok) throw new Error("workOrderDocuments");
      return r.json() as Promise<WorkOrderDocumentRow[]>;
    },
  });
}

export function useWorkOrderAssignmentsQuery(orderId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.workOrderAssignments(orderId ?? ""),
    enabled: Boolean(orderId),
    queryFn: async (): Promise<WorkOrderAssignmentRow[]> => {
      if (!orderId) return [];
      const r = await apiFetch(`/api/work-orders/${orderId}/assignments`);
      if (!r.ok) throw new Error("workOrderAssignments");
      return r.json() as Promise<WorkOrderAssignmentRow[]>;
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

export function useDeleteWorkOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await apiFetch(`/api/work-orders/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error("delete");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.workOrders });
    },
  });
}

export function useStartWorkOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postWorkOrderStart,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.workOrders });
    },
  });
}

export function usePauseWorkOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postWorkOrderPause,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.workOrders });
    },
  });
}

export function useWorkOrderFeedbackMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: WorkOrderFeedbackBody }) => postWorkOrderFeedback(orderId, body),
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({ queryKey: queryKeys.workOrders });
      await qc.invalidateQueries({ queryKey: queryKeys.workOrderDocuments(vars.orderId) });
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
  classificationId: string | null;
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

export type WorkOrderSaveBody = {
  name: string;
  description: string | null;
  assetId: string;
  costCenterId: string;
  classificationId: string | null;
  plannedStart: string;
  plannedEnd: string | null;
  plannedDurationMinutes: number | null;
  orderType: WorkOrderType;
  workgroupId: string;
};

export async function postWorkOrder(body: WorkOrderSaveBody): Promise<WorkOrderRow> {
  const r = await apiFetch("/api/work-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || "save");
  }
  return r.json() as Promise<WorkOrderRow>;
}

export async function putWorkOrder(id: string, body: WorkOrderSaveBody): Promise<WorkOrderRow> {
  const r = await apiFetch(`/api/work-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || "save");
  }
  return r.json() as Promise<WorkOrderRow>;
}

export async function postWorkOrderStart(orderId: string): Promise<WorkOrderRow> {
  const r = await apiFetch(`/api/work-orders/${orderId}/start`, { method: "POST" });
  if (!r.ok) {
    throw new WorkOrderActionError(await readActionErrorCode(r));
  }
  return r.json() as Promise<WorkOrderRow>;
}

export async function postWorkOrderPause(orderId: string): Promise<WorkOrderRow> {
  const r = await apiFetch(`/api/work-orders/${orderId}/pause`, { method: "POST" });
  if (!r.ok) {
    throw new WorkOrderActionError(await readActionErrorCode(r));
  }
  return r.json() as Promise<WorkOrderRow>;
}

export async function postWorkOrderFeedback(orderId: string, body: WorkOrderFeedbackBody): Promise<WorkOrderRow> {
  const r = await apiFetch(`/api/work-orders/${orderId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hours: body.hours,
      remark: body.remark ?? null,
      completeOrder: Boolean(body.completeOrder),
    }),
  });
  if (!r.ok) {
    throw new WorkOrderActionError(await readActionErrorCode(r));
  }
  return r.json() as Promise<WorkOrderRow>;
}

export async function uploadWorkOrderDocument(
  orderId: string,
  input: {
    file: { uri: string; name: string; type?: string | null };
    displayName: string;
    category: WorkOrderDocumentCategory;
  },
): Promise<WorkOrderDocumentRow> {
  const formData = new FormData();
  formData.append("displayName", input.displayName);
  formData.append("category", input.category);
  formData.append("file", {
    uri: input.file.uri,
    name: input.file.name,
    type: input.file.type ?? "application/octet-stream",
  } as unknown as Blob);

  const r = await apiFetch(`/api/work-orders/${orderId}/documents`, {
    method: "POST",
    body: formData,
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || "upload_document");
  }
  return r.json() as Promise<WorkOrderDocumentRow>;
}

export async function patchWorkOrderDocument(
  orderId: string,
  documentId: string,
  body: { displayName?: string; category?: WorkOrderDocumentCategory },
): Promise<WorkOrderDocumentRow> {
  const r = await apiFetch(`/api/work-orders/${orderId}/documents/${documentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || "patch_document");
  }
  return r.json() as Promise<WorkOrderDocumentRow>;
}

export async function patchAssetDocument(
  assetId: string,
  documentId: string,
  body: { displayName?: string; category?: WorkOrderDocumentCategory },
): Promise<WorkOrderDocumentRow> {
  const r = await apiFetch(`/api/assets/${assetId}/documents/${documentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || "patch_asset_document");
  }
  return r.json() as Promise<WorkOrderDocumentRow>;
}

export async function deleteWorkOrderDocument(orderId: string, documentId: string): Promise<void> {
  const r = await apiFetch(`/api/work-orders/${orderId}/documents/${documentId}`, {
    method: "DELETE",
  });
  if (!r.ok && r.status !== 204) {
    const err = await r.text();
    throw new Error(err || "delete_document");
  }
}

export async function fetchWorkOrderDocumentBlob(orderId: string, documentId: string): Promise<Blob> {
  const r = await apiFetch(`/api/work-orders/${orderId}/documents/${documentId}/content`);
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || "fetch_document_content");
  }
  return r.blob();
}

export async function fetchAssetDocumentBlob(assetId: string, documentId: string): Promise<Blob> {
  const r = await apiFetch(`/api/assets/${assetId}/documents/${documentId}/content`);
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || "fetch_asset_document_content");
  }
  return r.blob();
}
