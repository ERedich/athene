/** Moving average (GLD) for stock valuation. */
export function computeMovingAverage(
  oldQty: number,
  oldGld: number,
  qty: number,
  unitPrice: number,
): number {
  if (oldQty <= 0) return unitPrice;
  const newGld = (oldQty * oldGld + qty * unitPrice) / (oldQty + qty);
  return Math.round(newGld * 10_000) / 10_000;
}
