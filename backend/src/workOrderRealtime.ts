import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";
import { readSessionUserIdFromCookieHeader } from "./sessionToken.js";

type WorkOrderRealtimePayload = {
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
  responsibleEmployeeId: string | null;
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  doneBy: string | null;
  doneByEmployeeKey: string | null;
  doneByEmployeeName: string | null;
  workgroupId: string | null;
  workgroupKey: string | null;
  workgroupName: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
  assetDocumentCount: number;
  assignedEmployeeCount: number;
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
  await broadcastWorkOrderEvent(siteId, "work_order_updated", workOrder);
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
