import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { apiFetch } from "../lib/api";
import type { WorkOrder } from "../lib/workOrderTypes";

type SubscriptionChangeKind = "status" | "temporal" | "data" | "references";

export type WorkOrderSubscriptionNotification = {
  id: string;
  workOrderId: string;
  orderNumber: number;
  workOrderName: string;
  siteKey: string;
  siteName: string;
  changeKinds: SubscriptionChangeKind[];
  createdAt: string;
  readAt: string | null;
};

type WorkOrderEventMessage = {
  type: "work_order_created" | "work_order_updated";
  workOrder: WorkOrder;
};

type SubscriptionContextValue = {
  unreadCount: number;
  subscribedIds: Set<string>;
  refreshUnreadCount: () => Promise<void>;
  refreshSubscribedIds: () => Promise<void>;
  subscribe: (workOrderId: string) => Promise<void>;
  unsubscribe: (workOrderId: string) => Promise<void>;
  isSubscribed: (workOrderId: string) => boolean;
  onWorkOrderEvent: (handler: (message: WorkOrderEventMessage) => void) => () => void;
};

const WorkOrderSubscriptionContext = createContext<SubscriptionContextValue | null>(null);

function eventsWsUrl(): string {
  const url = new URL("/api/work-orders/events", window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function WorkOrderSubscriptionProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const workOrderEventListenersRef = useRef(new Set<(message: WorkOrderEventMessage) => void>());

  const refreshUnreadCount = useCallback(async () => {
    const res = await apiFetch("/api/notification-center/unread-count");
    if (!res.ok) throw new Error("unread_count");
    const body = (await res.json()) as { count?: number };
    setUnreadCount(typeof body.count === "number" ? body.count : 0);
  }, []);

  const refreshSubscribedIds = useCallback(async () => {
    const res = await apiFetch("/api/work-order-subscriptions");
    if (!res.ok) throw new Error("subscription_ids");
    const body = (await res.json()) as string[];
    setSubscribedIds(new Set(Array.isArray(body) ? body : []));
  }, []);

  useEffect(() => {
    void refreshUnreadCount().catch(() => {
      setUnreadCount(0);
    });
    void refreshSubscribedIds().catch(() => {
      setSubscribedIds(new Set());
    });
  }, [refreshSubscribedIds, refreshUnreadCount]);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: number | undefined;
    let ws: WebSocket | undefined;
    let reconnectAttempt = 0;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(eventsWsUrl());
      ws.onopen = () => {
        reconnectAttempt = 0;
      };
      ws.onmessage = (event) => {
        let payload: unknown;
        try {
          payload = JSON.parse(event.data as string);
        } catch {
          return;
        }
        if (!payload || typeof payload !== "object") return;
        const message = payload as {
          type?: string;
          workOrder?: WorkOrder;
          notification?: WorkOrderSubscriptionNotification;
        };
        if (
          (message.type === "work_order_created" || message.type === "work_order_updated") &&
          message.workOrder?.id
        ) {
          const casted: WorkOrderEventMessage = {
            type: message.type,
            workOrder: message.workOrder,
          };
          for (const listener of workOrderEventListenersRef.current) listener(casted);
          return;
        }
        if (message.type === "subscription_notification" && message.notification?.id) {
          setUnreadCount((current) => current + 1);
          return;
        }
        if (message.type === "chat_notification" && message.notification?.id) {
          setUnreadCount((current) => current + 1);
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        const delay = Math.min(15_000, 1_000 * 2 ** reconnectAttempt);
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const subscribe = useCallback(async (workOrderId: string) => {
    const res = await apiFetch("/api/work-order-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workOrderId }),
    });
    if (!res.ok) throw new Error("subscribe");
    setSubscribedIds((current) => {
      const next = new Set(current);
      next.add(workOrderId);
      return next;
    });
  }, []);

  const unsubscribe = useCallback(async (workOrderId: string) => {
    const res = await apiFetch(`/api/work-order-subscriptions/${workOrderId}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) throw new Error("unsubscribe");
    setSubscribedIds((current) => {
      const next = new Set(current);
      next.delete(workOrderId);
      return next;
    });
  }, []);

  const isSubscribed = useCallback((workOrderId: string) => subscribedIds.has(workOrderId), [subscribedIds]);

  const onWorkOrderEvent = useCallback((handler: (message: WorkOrderEventMessage) => void) => {
    workOrderEventListenersRef.current.add(handler);
    return () => {
      workOrderEventListenersRef.current.delete(handler);
    };
  }, []);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      unreadCount,
      subscribedIds,
      refreshUnreadCount,
      refreshSubscribedIds,
      subscribe,
      unsubscribe,
      isSubscribed,
      onWorkOrderEvent,
    }),
    [
      isSubscribed,
      onWorkOrderEvent,
      refreshSubscribedIds,
      refreshUnreadCount,
      subscribe,
      subscribedIds,
      unreadCount,
      unsubscribe,
    ],
  );

  return (
    <WorkOrderSubscriptionContext.Provider value={value}>{children}</WorkOrderSubscriptionContext.Provider>
  );
}

export function useWorkOrderSubscriptions(): SubscriptionContextValue {
  const ctx = useContext(WorkOrderSubscriptionContext);
  if (!ctx) {
    throw new Error("useWorkOrderSubscriptions must be used within WorkOrderSubscriptionProvider");
  }
  return ctx;
}
