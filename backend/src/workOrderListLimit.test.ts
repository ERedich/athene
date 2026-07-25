import { describe, expect, it } from "vitest";

/** Mirror of parse helpers in workOrders.ts (kept local to avoid exporting router internals). */
const WORK_ORDER_LIST_DEFAULT_LIMIT = 250;
const WORK_ORDER_LIST_MAX_LIMIT = 2000;

function parseWorkOrderListLimit(raw: unknown): number {
  if (typeof raw !== "string" || !raw.trim()) return WORK_ORDER_LIST_DEFAULT_LIMIT;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return WORK_ORDER_LIST_DEFAULT_LIMIT;
  return Math.min(n, WORK_ORDER_LIST_MAX_LIMIT);
}

function parseWorkOrderListOffset(raw: unknown): number {
  if (typeof raw !== "string" || !raw.trim()) return 0;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

describe("work order list soft-limit parsing", () => {
  it("defaults limit to 250", () => {
    expect(parseWorkOrderListLimit(undefined)).toBe(250);
    expect(parseWorkOrderListLimit("")).toBe(250);
    expect(parseWorkOrderListLimit("abc")).toBe(250);
  });

  it("clamps limit to max 2000", () => {
    expect(parseWorkOrderListLimit("100")).toBe(100);
    expect(parseWorkOrderListLimit("2000")).toBe(2000);
    expect(parseWorkOrderListLimit("5000")).toBe(2000);
  });

  it("parses non-negative offsets", () => {
    expect(parseWorkOrderListOffset(undefined)).toBe(0);
    expect(parseWorkOrderListOffset("-3")).toBe(0);
    expect(parseWorkOrderListOffset("250")).toBe(250);
  });
});
