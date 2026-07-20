import { apiFetch } from "./api";

export type WorkOrderLookupResult = {
  id: string;
  orderNumber: number;
  name: string;
  siteId: string;
  assetId: string;
  assetKey: string;
  assetName: string;
  costCenterId: string;
  costCenterKey: string;
  costCenterName: string;
};

export async function lookupWorkOrderByOrderNumber(
  orderNumber: number | string,
  options?: { siteId?: string },
): Promise<WorkOrderLookupResult | null> {
  const n =
    typeof orderNumber === "number" ? orderNumber : Number.parseInt(String(orderNumber).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const params = new URLSearchParams();
  params.set("orderNumber", String(n));
  if (options?.siteId) params.set("siteId", options.siteId);
  const res = await apiFetch(`/api/work-orders/by-order-number?${params.toString()}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("lookup_failed");
  const data = (await res.json()) as WorkOrderLookupResult;
  if (!data?.id || data.orderNumber == null) return null;
  return {
    id: data.id,
    orderNumber: Number(data.orderNumber),
    name: data.name ?? "",
    siteId: data.siteId,
    assetId: data.assetId,
    assetKey: data.assetKey ?? "",
    assetName: data.assetName ?? "",
    costCenterId: data.costCenterId,
    costCenterKey: data.costCenterKey ?? "",
    costCenterName: data.costCenterName ?? "",
  };
}
