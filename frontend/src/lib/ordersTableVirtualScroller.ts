/** Shared VirtualScroller options for Monitoring / Work Orders tables. */
export const ORDERS_TABLE_VIRTUAL_ROW_PX = 38;

/**
 * Always enable VirtualScroller. Soft-limited lists stay within a few hundred rows;
 * TranslationsPage already uses the same PrimeReact pattern with scrollHeight="flex".
 * Historical Chromium/Firefox gate was a zero-height workaround — keep itemSize exact.
 */
export function ordersTableVirtualScrollerOptions() {
  return {
    itemSize: ORDERS_TABLE_VIRTUAL_ROW_PX,
    showLoader: true,
    delay: 0 as const,
  };
}
