import { apiFetch } from "./api";

export type WorkOrderMessage = {
  id: string;
  workOrderId: string;
  authorUserId: string;
  authorUserName: string;
  body: string;
  replyToMessageId: string | null;
  replyToAuthorUserName: string | null;
  replyToBodyPreview: string | null;
  replyToCreatedAt: string | null;
  createdAt: string;
  documentId: string | null;
  documentDisplayName: string | null;
  documentMimeType: string | null;
  documentFileName: string | null;
};

type MessagesResponse = {
  rows: WorkOrderMessage[];
};

export async function fetchWorkOrderMessages(workOrderId: string): Promise<WorkOrderMessage[]> {
  const res = await apiFetch(`/api/work-orders/${workOrderId}/messages`);
  if (!res.ok) throw new Error("load_messages");
  const body = (await res.json()) as MessagesResponse;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  return rows.map((row) => ({
    ...row,
    documentId: row.documentId ?? null,
    documentDisplayName: row.documentDisplayName ?? null,
    documentMimeType: row.documentMimeType ?? null,
    documentFileName: row.documentFileName ?? null,
  }));
}

export async function sendWorkOrderMessage(
  workOrderId: string,
  payload: { body: string; replyToMessageId?: string | null; documentId?: string | null },
): Promise<WorkOrderMessage> {
  const res = await apiFetch(`/api/work-orders/${workOrderId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      body: payload.body,
      ...(payload.replyToMessageId ? { replyToMessageId: payload.replyToMessageId } : {}),
      ...(payload.documentId ? { documentId: payload.documentId } : {}),
    }),
  });
  if (!res.ok) throw new Error("send_message");
  return (await res.json()) as WorkOrderMessage;
}

export type NotificationInboxItem = {
  id: string;
  kind: "subscription" | "chat" | "stock";
  workOrderId: string | null;
  orderNumber: number | null;
  workOrderName: string | null;
  siteKey: string;
  siteName: string;
  createdAt: string;
  readAt: string | null;
  changeKinds?: string[];
  messageId?: string;
  messagePreview?: string;
  authorUserName?: string;
  isReply?: boolean;
  sparePartId?: string | null;
  sparePartKey?: string | null;
  sparePartName?: string | null;
  scopeType?: string | null;
  warehouseKey?: string | null;
  storageLocationKey?: string | null;
  onHandQuantity?: string | null;
  reorderLevel?: string | null;
};

type SubscriptionNotificationSource = {
  id: string;
  workOrderId: string;
  orderNumber: number;
  workOrderName: string;
  siteKey: string;
  siteName: string;
  changeKinds: string[];
  createdAt: string;
  readAt: string | null;
};

type ChatNotificationSource = {
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

type StockNotificationSource = {
  id: string;
  sparePartId: string;
  sparePartKey: string;
  sparePartName: string;
  siteKey: string;
  siteName: string;
  scopeType: string;
  warehouseId: string | null;
  storageLocationId: string | null;
  warehouseKey: string | null;
  storageLocationKey: string | null;
  onHandQuantity: number;
  reorderLevel: number;
  createdAt: string;
  readAt: string | null;
};

export function inboxItemFromSubscriptionNotification(
  notification: SubscriptionNotificationSource,
  options?: { readAt?: string | null },
): NotificationInboxItem {
  return {
    id: notification.id,
    kind: "subscription",
    workOrderId: notification.workOrderId,
    orderNumber: notification.orderNumber,
    workOrderName: notification.workOrderName,
    siteKey: notification.siteKey,
    siteName: notification.siteName,
    createdAt: notification.createdAt,
    readAt: options?.readAt !== undefined ? options.readAt : notification.readAt,
    changeKinds: notification.changeKinds,
  };
}

export function inboxItemFromChatNotification(
  notification: ChatNotificationSource,
  options?: { readAt?: string | null },
): NotificationInboxItem {
  return {
    id: notification.id,
    kind: "chat",
    workOrderId: notification.workOrderId,
    orderNumber: notification.orderNumber,
    workOrderName: notification.workOrderName,
    siteKey: notification.siteKey,
    siteName: notification.siteName,
    createdAt: notification.createdAt,
    readAt: options?.readAt !== undefined ? options.readAt : notification.readAt,
    messageId: notification.messageId,
    messagePreview: notification.messagePreview,
    authorUserName: notification.authorUserName,
    isReply: notification.isReply,
  };
}

export function inboxItemFromStockNotification(
  notification: StockNotificationSource,
  options?: { readAt?: string | null },
): NotificationInboxItem {
  return {
    id: notification.id,
    kind: "stock",
    workOrderId: null,
    orderNumber: null,
    workOrderName: null,
    siteKey: notification.siteKey,
    siteName: notification.siteName,
    createdAt: notification.createdAt,
    readAt: options?.readAt !== undefined ? options.readAt : notification.readAt,
    sparePartId: notification.sparePartId,
    sparePartKey: notification.sparePartKey,
    sparePartName: notification.sparePartName,
    scopeType: notification.scopeType,
    warehouseKey: notification.warehouseKey,
    storageLocationKey: notification.storageLocationKey,
    onHandQuantity: String(notification.onHandQuantity),
    reorderLevel: String(notification.reorderLevel),
  };
}

type InboxResponse = {
  rows: NotificationInboxItem[];
  total: number;
  page: number;
  limit: number;
};

export async function fetchNotificationInbox(params?: {
  page?: number;
  limit?: number;
  kind?: "subscription" | "chat" | "stock";
}): Promise<InboxResponse> {
  const search = new URLSearchParams();
  if (params?.page != null) search.set("page", String(params.page));
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.kind) search.set("kind", params.kind);
  const qs = search.toString();
  const res = await apiFetch(`/api/notification-center/inbox${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("load_inbox");
  return (await res.json()) as InboxResponse;
}

export async function fetchNotificationUnreadCount(): Promise<number> {
  const res = await apiFetch("/api/notification-center/unread-count");
  if (!res.ok) throw new Error("unread_count");
  const body = (await res.json()) as { count?: number };
  return typeof body.count === "number" ? body.count : 0;
}

export async function markNotificationsRead(): Promise<void> {
  const res = await apiFetch("/api/notification-center/mark-read", { method: "POST" });
  if (!res.ok) throw new Error("mark_read");
}
