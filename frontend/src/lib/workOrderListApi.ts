import { apiFetch } from "./api";
import type { WorkOrder } from "./workOrderTypes";

/** Must stay in sync with backend WORK_ORDER_LIST_DEFAULT_LIMIT / MAX. */
export const WORK_ORDER_LIST_DEFAULT_LIMIT = 50;
export const WORK_ORDER_LIST_MAX_LIMIT = 2000;

export type WorkOrderListResponse = {
  rows: WorkOrder[];
  hasMore: boolean;
  limit: number;
  offset: number;
};

/** Fill list-omitted fields so consumers can treat rows as full WorkOrder. */
function normalizeListWorkOrder(row: WorkOrder): WorkOrder {
  return {
    ...row,
    assetClassificationId: row.assetClassificationId ?? null,
    doneBy: row.doneBy ?? null,
    doneByEmployeeKey: row.doneByEmployeeKey ?? null,
    doneByEmployeeName: row.doneByEmployeeName ?? null,
    pauseRemark: row.pauseRemark ?? null,
    problemKey: row.problemKey ?? null,
    problemName: row.problemName ?? null,
    causeKey: row.causeKey ?? null,
    causeName: row.causeName ?? null,
    remedyKey: row.remedyKey ?? null,
    remedyName: row.remedyName ?? null,
    originalWoName: row.originalWoName ?? null,
    inspectionRoundKey: row.inspectionRoundKey ?? null,
    inspectionRoundName: row.inspectionRoundName ?? null,
    responsibleEmployeeIds: Array.isArray(row.responsibleEmployeeIds)
      ? row.responsibleEmployeeIds
      : [],
  };
}

/** Accepts the new `{ rows, hasMore }` shape and legacy bare arrays. */
export function parseWorkOrderListResponse(data: unknown): WorkOrderListResponse {
  if (Array.isArray(data)) {
    const rows = (data as WorkOrder[]).map(normalizeListWorkOrder);
    return {
      rows,
      hasMore: false,
      limit: rows.length,
      offset: 0,
    };
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const rows = (Array.isArray(obj.rows) ? (obj.rows as WorkOrder[]) : []).map(
      normalizeListWorkOrder,
    );
    return {
      rows,
      hasMore: Boolean(obj.hasMore),
      limit: typeof obj.limit === "number" ? obj.limit : rows.length,
      offset: typeof obj.offset === "number" ? obj.offset : 0,
    };
  }
  return { rows: [], hasMore: false, limit: WORK_ORDER_LIST_DEFAULT_LIMIT, offset: 0 };
}

export type FetchWorkOrderListOptions = {
  /** Query string without leading `?` (filters only). */
  queryString?: string;
  limit?: number;
  offset?: number;
};

export function buildWorkOrderListPath(options: FetchWorkOrderListOptions = {}): string {
  const params = new URLSearchParams(options.queryString ?? "");
  const limit = options.limit ?? WORK_ORDER_LIST_DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  params.set("limit", String(Math.min(Math.max(1, limit), WORK_ORDER_LIST_MAX_LIMIT)));
  params.set("offset", String(Math.max(0, offset)));
  const qs = params.toString();
  return qs ? `/api/work-orders?${qs}` : "/api/work-orders";
}

export async function fetchWorkOrderList(
  options: FetchWorkOrderListOptions = {},
): Promise<WorkOrderListResponse> {
  const res = await apiFetch(buildWorkOrderListPath(options));
  if (!res.ok) throw new Error(`work_orders_list_failed_${res.status}`);
  return parseWorkOrderListResponse(await res.json());
}

/** Deduping append used by load-more / load-all. */
export function appendWorkOrderPage(current: WorkOrder[], pageRows: WorkOrder[]): WorkOrder[] {
  if (pageRows.length === 0) return current;
  const seen = new Set(current.map((row) => row.id));
  const merged = [...current];
  for (const row of pageRows) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}

/**
 * Fetches remaining soft-limit pages until exhausted (chunks of MAX_LIMIT).
 * `onPage` is called after each chunk so the UI can grow progressively.
 */
export async function fetchRemainingWorkOrderPages(options: {
  queryString: string;
  offset: number;
  onPage?: (page: { rows: WorkOrder[]; hasMore: boolean; offset: number }) => void;
}): Promise<{ rows: WorkOrder[]; hasMore: boolean }> {
  let offset = Math.max(0, options.offset);
  let hasMore = true;
  const collected: WorkOrder[] = [];

  while (hasMore) {
    const page = await fetchWorkOrderList({
      queryString: options.queryString,
      offset,
      limit: WORK_ORDER_LIST_MAX_LIMIT,
    });
    collected.push(...page.rows);
    offset += page.rows.length;
    hasMore = page.hasMore;
    options.onPage?.({ rows: page.rows, hasMore, offset });
    if (page.rows.length === 0) break;
  }

  return { rows: collected, hasMore: false };
}
