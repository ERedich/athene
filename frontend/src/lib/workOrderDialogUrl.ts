import { orderDialogTabs, type OrderDialogTab } from "./workOrderDialog";

export const WO_URL_PARAM = "wo";
export const WO_TAB_URL_PARAM = "woTab";

export function parseWoTabParam(raw: string | null): OrderDialogTab | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 5) return undefined;
  const tabs = [
    orderDialogTabs.General,
    orderDialogTabs.Planning,
    orderDialogTabs.Documents,
    orderDialogTabs.Feedback,
    orderDialogTabs.Transactions,
    orderDialogTabs.Messages,
  ] as const;
  return tabs[n];
}

export function woTabToParam(tab: OrderDialogTab): string {
  return String(tab);
}

export function readWorkOrderUrlState(searchParams: URLSearchParams): {
  woId: string | null;
  tab: OrderDialogTab | undefined;
} {
  const woId = searchParams.get(WO_URL_PARAM)?.trim() || null;
  const tab = parseWoTabParam(searchParams.get(WO_TAB_URL_PARAM));
  return { woId, tab };
}

export function applyWorkOrderUrlParams(
  params: URLSearchParams,
  woId: string | null,
  tab?: OrderDialogTab,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (woId) {
    next.set(WO_URL_PARAM, woId);
    if (tab != null) {
      next.set(WO_TAB_URL_PARAM, woTabToParam(tab));
    } else {
      next.delete(WO_TAB_URL_PARAM);
    }
  } else {
    next.delete(WO_URL_PARAM);
    next.delete(WO_TAB_URL_PARAM);
  }
  return next;
}
