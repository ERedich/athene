import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../lib/api";
import { useWorkOrderSubscriptions } from "../workOrders/WorkOrderSubscriptionContext";

export type DashboardAuditFeedItem = {
  id: string;
  occurredAt: string;
  actorLogin: string | null;
  kind: "work_order_status" | "transaction_created";
  workOrderId: string | null;
  orderNumber: number | null;
  status: string | null;
  transactionType: string | null;
  quantity: string | null;
};

const FEED_CAP = 50;
/** Match monitoring new-row flash (10s hold + 1s fade). */
const FRESH_HIGHLIGHT_MS = 11_000;

function isAuditFeedItem(value: unknown): value is DashboardAuditFeedItem {
  if (!value || typeof value !== "object") return false;
  const item = value as DashboardAuditFeedItem;
  return (
    typeof item.id === "string" &&
    typeof item.occurredAt === "string" &&
    (item.kind === "work_order_status" || item.kind === "transaction_created")
  );
}

function appendUnique(
  current: DashboardAuditFeedItem[],
  incoming: DashboardAuditFeedItem,
): DashboardAuditFeedItem[] {
  if (current.some((row) => row.id === incoming.id)) return current;
  return [...current, incoming].slice(-FEED_CAP);
}

function sortOldestFirst(rows: DashboardAuditFeedItem[]): DashboardAuditFeedItem[] {
  return [...rows].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
}

export function useDashboardAuditFeed(enabled: boolean) {
  const { onAuditFeedEvent } = useWorkOrderSubscriptions();
  const [items, setItems] = useState<DashboardAuditFeedItem[]>([]);
  const [freshIds, setFreshIds] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/dashboard/audit-feed?limit=${FEED_CAP}`);
      if (!res.ok) {
        setError("fetch_failed");
        setItems([]);
        return;
      }
      const body = (await res.json()) as { items?: unknown };
      const rows = Array.isArray(body.items) ? body.items.filter(isAuditFeedItem) : [];
      setItems(sortOldestFirst(rows).slice(-FEED_CAP));
      setFreshIds({});
    } catch {
      setError("fetch_failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refetch();
  }, [enabled, refetch]);

  useEffect(() => {
    if (!enabled) return;
    return onAuditFeedEvent((item) => {
      setItems((current) => appendUnique(current, item));
      setFreshIds((current) => ({ ...current, [item.id]: Date.now() }));
    });
  }, [enabled, onAuditFeedEvent]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setFreshIds((current) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const [itemId, at] of Object.entries(current)) {
          if (now - at <= FRESH_HIGHLIGHT_MS) {
            next[itemId] = at;
          } else {
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  return { items, freshIds, loading, error, refetch };
}
