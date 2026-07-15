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
import type { WorkOrderMessage } from "../lib/notificationCenter";
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

export type WorkOrderChatNotification = {
  id: string;
  workOrderId: string;
  orderNumber: number;
  workOrderName: string;
  siteKey: string;
  siteName: string;
  messageId: string;
  messagePreview: string;
  authorUserName: string;
  isReply: boolean;
  createdAt: string;
  readAt: string | null;
};

type WorkOrderEventMessage = {
  type: "work_order_created" | "work_order_updated";
  workOrder: WorkOrder;
};

export type WorkOrderMessageEventMessage = {
  type: "work_order_message_created";
  message: WorkOrderMessage;
};

export type NotificationEventMessage =
  | { type: "subscription_notification"; notification: WorkOrderSubscriptionNotification }
  | { type: "chat_notification"; notification: WorkOrderChatNotification };

type NotificationEventHandler = (message: NotificationEventMessage) => boolean | void;

type SubscriptionContextValue = {
  unreadCount: number;
  subscribedIds: Set<string>;
  refreshUnreadCount: () => Promise<void>;
  refreshSubscribedIds: () => Promise<void>;
  subscribe: (workOrderId: string) => Promise<void>;
  unsubscribe: (workOrderId: string) => Promise<void>;
  isSubscribed: (workOrderId: string) => boolean;
  onWorkOrderEvent: (handler: (message: WorkOrderEventMessage) => void) => () => void;
  onWorkOrderMessageEvent: (handler: (message: WorkOrderMessageEventMessage) => void) => () => void;
  onNotificationEvent: (handler: NotificationEventHandler) => () => void;
};

const WorkOrderSubscriptionContext = createContext<SubscriptionContextValue | null>(null);

function eventsWsUrl(): string {
  const url = new URL("/api/work-orders/events", window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function isSubscriptionNotification(value: unknown): value is WorkOrderSubscriptionNotification {
  if (!value || typeof value !== "object") return false;
  const n = value as WorkOrderSubscriptionNotification;
  return typeof n.id === "string" && typeof n.workOrderId === "string" && Array.isArray(n.changeKinds);
}

function isChatNotification(value: unknown): value is WorkOrderChatNotification {
  if (!value || typeof value !== "object") return false;
  const n = value as WorkOrderChatNotification;
  return (
    typeof n.id === "string" &&
    typeof n.workOrderId === "string" &&
    typeof n.messageId === "string" &&
    typeof n.messagePreview === "string"
  );
}

function isWorkOrderMessage(value: unknown): value is WorkOrderMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as WorkOrderMessage;
  return (
    typeof m.id === "string" &&
    typeof m.workOrderId === "string" &&
    typeof m.authorUserId === "string" &&
    typeof m.body === "string" &&
    typeof m.createdAt === "string"
  );
}

export function WorkOrderSubscriptionProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const workOrderEventListenersRef = useRef(new Set<(message: WorkOrderEventMessage) => void>());
  const workOrderMessageEventListenersRef = useRef(
    new Set<(message: WorkOrderMessageEventMessage) => void>(),
  );
  const notificationEventListenersRef = useRef(new Set<NotificationEventHandler>());

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
          notification?: unknown;
          message?: unknown;
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
        if (message.type === "work_order_message_created" && isWorkOrderMessage(message.message)) {
          const casted: WorkOrderMessageEventMessage = {
            type: "work_order_message_created",
            message: message.message,
          };
          for (const listener of workOrderMessageEventListenersRef.current) listener(casted);
          return;
        }
        if (message.type === "subscription_notification" && isSubscriptionNotification(message.notification)) {
          const casted: NotificationEventMessage = {
            type: "subscription_notification",
            notification: message.notification,
          };
          let handled = false;
          for (const listener of notificationEventListenersRef.current) {
            if (listener(casted) === true) handled = true;
          }
          if (!handled) setUnreadCount((current) => current + 1);
          return;
        }
        if (message.type === "chat_notification" && isChatNotification(message.notification)) {
          const casted: NotificationEventMessage = {
            type: "chat_notification",
            notification: message.notification,
          };
          let handled = false;
          for (const listener of notificationEventListenersRef.current) {
            if (listener(casted) === true) handled = true;
          }
          if (!handled) setUnreadCount((current) => current + 1);
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

  const onNotificationEvent = useCallback((handler: NotificationEventHandler) => {
    notificationEventListenersRef.current.add(handler);
    return () => {
      notificationEventListenersRef.current.delete(handler);
    };
  }, []);

  const onWorkOrderMessageEvent = useCallback(
    (handler: (message: WorkOrderMessageEventMessage) => void) => {
      workOrderMessageEventListenersRef.current.add(handler);
      return () => {
        workOrderMessageEventListenersRef.current.delete(handler);
      };
    },
    [],
  );

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
      onWorkOrderMessageEvent,
      onNotificationEvent,
    }),
    [
      isSubscribed,
      onNotificationEvent,
      onWorkOrderEvent,
      onWorkOrderMessageEvent,
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
