/** QR payload for a work order: plain order number (WO identity key). */
export function workOrderQrValue(orderNumber: number | string | null | undefined): string {
  if (orderNumber == null || orderNumber === "") return "";
  const n = typeof orderNumber === "number" ? orderNumber : Number(String(orderNumber).trim());
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.trunc(n));
}
