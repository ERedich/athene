import { sparePartDialogTabs, type SparePartDialogTab } from "./sparePartDialog";

export const SP_URL_PARAM = "sp";
export const SP_TAB_URL_PARAM = "spTab";

const TAB_VALUES = [
  sparePartDialogTabs.General,
  sparePartDialogTabs.StockData,
  sparePartDialogTabs.StockPlanning,
  sparePartDialogTabs.Suppliers,
  sparePartDialogTabs.Documents,
] as const;

export function parseSpTabParam(raw: string | null): SparePartDialogTab | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n >= TAB_VALUES.length) return undefined;
  return TAB_VALUES[n];
}

export function spTabToParam(tab: SparePartDialogTab): string {
  return String(tab);
}

export function readSparePartUrlState(searchParams: URLSearchParams): {
  sparePartId: string | null;
  tab: SparePartDialogTab | undefined;
} {
  const sparePartId = searchParams.get(SP_URL_PARAM)?.trim() || null;
  const tab = parseSpTabParam(searchParams.get(SP_TAB_URL_PARAM));
  return { sparePartId, tab };
}

export function applySparePartUrlParams(
  params: URLSearchParams,
  sparePartId: string | null,
  tab?: SparePartDialogTab,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (sparePartId) {
    next.set(SP_URL_PARAM, sparePartId);
    if (tab != null) {
      next.set(SP_TAB_URL_PARAM, spTabToParam(tab));
    } else {
      next.delete(SP_TAB_URL_PARAM);
    }
  } else {
    next.delete(SP_URL_PARAM);
    next.delete(SP_TAB_URL_PARAM);
  }
  return next;
}
