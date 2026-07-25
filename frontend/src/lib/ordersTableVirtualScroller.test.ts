import { describe, expect, it } from "vitest";

import { assetRowToSelectOption } from "./assetSuggestApi";
import { ORDERS_TABLE_VIRTUAL_ROW_PX, ordersTableVirtualScrollerOptions } from "./ordersTableVirtualScroller";

describe("assetRowToSelectOption", () => {
  it("formats key - name labels", () => {
    expect(assetRowToSelectOption({ id: "1", key: "A-1", name: "Pump" })).toEqual({
      label: "A-1 - Pump",
      value: "1",
    });
  });
});

describe("ordersTableVirtualScrollerOptions", () => {
  it("enables VirtualScroller with fixed row height", () => {
    expect(ordersTableVirtualScrollerOptions()).toEqual({
      itemSize: ORDERS_TABLE_VIRTUAL_ROW_PX,
      showLoader: true,
      delay: 0,
    });
  });
});
