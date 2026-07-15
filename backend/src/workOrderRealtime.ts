import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";
import { readSessionUserIdFromCookieHeader } from "./sessionToken.js";
import { notifyWorkOrderSubscribers, type WorkOrderSubscriptionChangeKind } from "./workOrderSubscriptionNotify.js";

export type WorkOrderRealtimePayload = {
  id: string;
  orderNumber: number;
  name: string;
  description: string | null;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  assetId: string;
  assetKey: string;
  assetName: string;
  costCenterId: string;
  costCenterKey: string;
  costCenterName: string;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationMinutes: number | null;
  orderType: "maintenance" | "repair" | "breakdown";
  status: "open" | "assigned" | "started" | "paused" | "continued" | "ended" | "done" | "cancelled";
  responsibleEmployeeIds: string[];
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  doneBy: string | null;
  doneByEmployeeKey: string | null;
  doneByEmployeeName: string | null;
  pauseRemark?: string | null;
  workgroupId: string | null;
  workgroupKey: string | null;
  workgroupName: string | null;
  originalWo?: string | null;
  originalWoOrderNumber?: number | null;
  originalWoName?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
  assetDocumentCount: number;
  assignedEmployeeCount: number;
  transactionCount?: number;
};

const sockets = new Map<WebSocket, string>();

export function registerWorkOrderRealtime(
  req: IncomingMessage,
  ws: WebSocket,
  sessionSecret: string,
): boolean {
  const userId = readSessionUserIdFromCookieHeader(req.headers.cookie, sessionSecret);
  if (!userId) return false;
  sockets.set(ws, userId);
  ws.on("close", () => {
    sockets.delete(ws);
  });
  return true;
}

export async function broadcastWorkOrderCreated(
  siteId: string,
  workOrder: WorkOrderRealtimePayload,
): Promise<void> {
  await broadcastWorkOrderEvent(siteId, "work_order_created", workOrder);
}

export async function broadcastWorkOrderUpdated(
  siteId: string,
  workOrder: WorkOrderRealtimePayload,
): Promise<void> {
  const notifications = await notifyWorkOrderSubscribers(workOrder);
  await Promise.all(
    notifications.map((notification) =>
      broadcastSubscriptionNotification(notification.userId, notification),
    ),
  );
  await broadcastWorkOrderEvent(siteId, "work_order_updated", workOrder);
}

type SubscriptionNotificationPayload = {
  id: string;
  userId: string;
  workOrderId: string;
  orderNumber: number;
  workOrderName: string;
  siteKey: string;
  siteName: string;
  changeKinds: WorkOrderSubscriptionChangeKind[];
  createdAt: string;
  readAt: string | null;
};

export async function broadcastSubscriptionNotification(
  userId: string,
  notification: SubscriptionNotificationPayload,
): Promise<void> {
  if (sockets.size === 0) return;
  const message = JSON.stringify({
    type: "subscription_notification",
    notification,
  });
  for (const [socket, socketUserId] of sockets.entries()) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    if (socketUserId !== userId) continue;
    socket.send(message);
  }
}

export type ChatNotificationPayload = {
  id: string;
  userId: string;
  workOrderId: string;
  messageId: string;
  orderNumber: number;
  workOrderName: string;
  siteKey: string;
  siteName: string;
  messagePreview: string;
  authorUserName: string;
  isReply: boolean;
  createdAt: string;
  readAt: string | null;
};

export async function broadcastChatNotification(notification: ChatNotificationPayload): Promise<void> {
  if (sockets.size === 0) return;
  const message = JSON.stringify({
    type: "chat_notification",
    notification,
  });
  for (const [socket, socketUserId] of sockets.entries()) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    if (socketUserId !== notification.userId) continue;
    socket.send(message);
  }
}

export type WorkOrderMessageRealtimePayload = {
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
};

/** Fan-out new thread messages to all users with site access (not only inbox recipients). */
export async function broadcastWorkOrderMessageCreated(
  siteId: string,
  messageRow: WorkOrderMessageRealtimePayload,
): Promise<void> {
  if (sockets.size === 0) return;
  const recipientUserIds = await getRecipientUserIds(siteId);
  if (recipientUserIds.size === 0) return;
  const payload = JSON.stringify({
    type: "work_order_message_created",
    message: messageRow,
  });
  for (const [socket, userId] of sockets.entries()) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    if (!recipientUserIds.has(userId)) continue;
    socket.send(payload);
  }
}

async function broadcastWorkOrderEvent(
  siteId: string,
  type: "work_order_created" | "work_order_updated",
  workOrder: WorkOrderRealtimePayload,
): Promise<void> {
  if (sockets.size === 0) return;
  const recipientUserIds = await getRecipientUserIds(siteId);
  if (recipientUserIds.size === 0) return;
  const message = JSON.stringify({ type, workOrder });
  for (const [socket, userId] of sockets.entries()) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    if (!recipientUserIds.has(userId)) continue;
    socket.send(message);
  }
}

async function getRecipientUserIds(siteId: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ id: string }>(
    `
    SELECT u."id"::text AS "id"
    FROM "users" u
    WHERE ${siteAccessSql("$1::uuid", 'u."id"')}
    `,
    [siteId],
  );
  return new Set(rows.map((row) => row.id));
}

export function createWorkOrderWebSocketServer(pathname: string): WebSocketServer {
  return new WebSocketServer({ noServer: true, path: pathname });
}
