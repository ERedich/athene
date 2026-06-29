import { pool } from "./db.js";
import type { WorkOrderRealtimePayload } from "./workOrderRealtime.js";

const CHANGE_KINDS = ["status", "temporal", "data", "references"] as const;
export type WorkOrderSubscriptionChangeKind = (typeof CHANGE_KINDS)[number];

export type WorkOrderSubscriptionSnapshot = {
  status: WorkOrderRealtimePayload["status"];
  plannedStart: string;
  plannedEnd: string;
  plannedDurationMinutes: number | null;
  name: string;
  description: string | null;
  orderType: WorkOrderRealtimePayload["orderType"];
  assetId: string;
  costCenterId: string;
  classificationId: string | null;
  workgroupId: string | null;
  responsibleEmployeeId: string | null;
  originalWo: string | null;
  originalWoOrderNumber: number | null;
  pauseRemark: string | null;
  doneBy: string | null;
  documentCount: number;
  assetDocumentCount: number;
  assignedEmployeeCount: number;
  transactionCount: number;
};

type WorkOrderSubscriptionSource = Pick<
  WorkOrderRealtimePayload,
  | "status"
  | "plannedStart"
  | "plannedEnd"
  | "plannedDurationMinutes"
  | "name"
  | "description"
  | "orderType"
  | "assetId"
  | "costCenterId"
  | "classificationId"
  | "workgroupId"
  | "responsibleEmployeeId"
  | "originalWo"
  | "originalWoOrderNumber"
  | "pauseRemark"
  | "doneBy"
  | "documentCount"
  | "assetDocumentCount"
  | "assignedEmployeeCount"
  | "transactionCount"
>;

type SubscriptionRow = {
  userId: string;
  lastSnapshot: unknown;
};

export type WorkOrderSubscriptionNotificationPayload = {
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

function isKnownChangeKind(value: unknown): value is WorkOrderSubscriptionChangeKind {
  return typeof value === "string" && (CHANGE_KINDS as readonly string[]).includes(value);
}

export function buildSubscriptionSnapshot(workOrder: WorkOrderSubscriptionSource): WorkOrderSubscriptionSnapshot {
  return {
    status: workOrder.status,
    plannedStart: workOrder.plannedStart,
    plannedEnd: workOrder.plannedEnd,
    plannedDurationMinutes: workOrder.plannedDurationMinutes ?? null,
    name: workOrder.name,
    description: workOrder.description ?? null,
    orderType: workOrder.orderType,
    assetId: workOrder.assetId,
    costCenterId: workOrder.costCenterId,
    classificationId: workOrder.classificationId ?? null,
    workgroupId: workOrder.workgroupId ?? null,
    responsibleEmployeeId: workOrder.responsibleEmployeeId ?? null,
    originalWo: workOrder.originalWo ?? null,
    originalWoOrderNumber: workOrder.originalWoOrderNumber ?? null,
    pauseRemark: workOrder.pauseRemark ?? null,
    doneBy: workOrder.doneBy ?? null,
    documentCount: workOrder.documentCount ?? 0,
    assetDocumentCount: workOrder.assetDocumentCount ?? 0,
    assignedEmployeeCount: workOrder.assignedEmployeeCount ?? 0,
    transactionCount: workOrder.transactionCount ?? 0,
  };
}

function normalizeSnapshot(value: unknown): WorkOrderSubscriptionSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.status !== "string") return null;
  if (typeof row.plannedStart !== "string" || typeof row.plannedEnd !== "string") return null;
  if (typeof row.name !== "string") return null;
  if (typeof row.assetId !== "string" || typeof row.costCenterId !== "string") return null;
  if (typeof row.orderType !== "string") return null;
  return {
    status: row.status as WorkOrderRealtimePayload["status"],
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    plannedDurationMinutes: typeof row.plannedDurationMinutes === "number" ? row.plannedDurationMinutes : null,
    name: row.name,
    description: typeof row.description === "string" ? row.description : null,
    orderType: row.orderType as WorkOrderRealtimePayload["orderType"],
    assetId: row.assetId,
    costCenterId: row.costCenterId,
    classificationId: typeof row.classificationId === "string" ? row.classificationId : null,
    workgroupId: typeof row.workgroupId === "string" ? row.workgroupId : null,
    responsibleEmployeeId: typeof row.responsibleEmployeeId === "string" ? row.responsibleEmployeeId : null,
    originalWo: typeof row.originalWo === "string" ? row.originalWo : null,
    originalWoOrderNumber: typeof row.originalWoOrderNumber === "number" ? row.originalWoOrderNumber : null,
    pauseRemark: typeof row.pauseRemark === "string" ? row.pauseRemark : null,
    doneBy: typeof row.doneBy === "string" ? row.doneBy : null,
    documentCount: typeof row.documentCount === "number" ? row.documentCount : 0,
    assetDocumentCount: typeof row.assetDocumentCount === "number" ? row.assetDocumentCount : 0,
    assignedEmployeeCount: typeof row.assignedEmployeeCount === "number" ? row.assignedEmployeeCount : 0,
    transactionCount: typeof row.transactionCount === "number" ? row.transactionCount : 0,
  };
}

export function detectSubscriptionChangeKinds(
  previous: WorkOrderSubscriptionSnapshot | null,
  next: WorkOrderSubscriptionSnapshot,
): WorkOrderSubscriptionChangeKind[] {
  if (!previous) return ["data"];
  const out: WorkOrderSubscriptionChangeKind[] = [];
  if (previous.status !== next.status) out.push("status");
  if (
    previous.plannedStart !== next.plannedStart ||
    previous.plannedEnd !== next.plannedEnd ||
    previous.plannedDurationMinutes !== next.plannedDurationMinutes
  ) {
    out.push("temporal");
  }
  if (
    previous.name !== next.name ||
    previous.description !== next.description ||
    previous.orderType !== next.orderType ||
    previous.assetId !== next.assetId ||
    previous.costCenterId !== next.costCenterId ||
    previous.classificationId !== next.classificationId ||
    previous.workgroupId !== next.workgroupId ||
    previous.responsibleEmployeeId !== next.responsibleEmployeeId ||
    previous.originalWo !== next.originalWo ||
    previous.originalWoOrderNumber !== next.originalWoOrderNumber ||
    previous.pauseRemark !== next.pauseRemark ||
    previous.doneBy !== next.doneBy
  ) {
    out.push("data");
  }
  if (
    previous.documentCount !== next.documentCount ||
    previous.assetDocumentCount !== next.assetDocumentCount ||
    previous.assignedEmployeeCount !== next.assignedEmployeeCount ||
    previous.transactionCount !== next.transactionCount
  ) {
    out.push("references");
  }
  return out;
}

export async function notifyWorkOrderSubscribers(
  workOrder: WorkOrderRealtimePayload,
): Promise<WorkOrderSubscriptionNotificationPayload[]> {
  const nextSnapshot = buildSubscriptionSnapshot(workOrder);
  const emitted: WorkOrderSubscriptionNotificationPayload[] = [];
  const { rows } = await pool.query<SubscriptionRow>(
    `
    SELECT "userId"::text AS "userId", "lastSnapshot" AS "lastSnapshot"
    FROM "workOrderSubscription"
    WHERE "workOrderId" = $1::uuid
    `,
    [workOrder.id],
  );
  if (!rows.length) return emitted;

  const updates: Promise<unknown>[] = [];
  for (const row of rows) {
    if (row.userId === workOrder.updatedBy) {
      updates.push(
        pool.query(
          `
          UPDATE "workOrderSubscription"
          SET "lastSnapshot" = $3::jsonb
          WHERE "userId" = $1::uuid AND "workOrderId" = $2::uuid
          `,
          [row.userId, workOrder.id, JSON.stringify(nextSnapshot)],
        ),
      );
      continue;
    }

    const previous = normalizeSnapshot(row.lastSnapshot);
    const changeKinds = detectSubscriptionChangeKinds(previous, nextSnapshot);
    if (changeKinds.length === 0) {
      updates.push(
        pool.query(
          `
          UPDATE "workOrderSubscription"
          SET "lastSnapshot" = $3::jsonb
          WHERE "userId" = $1::uuid AND "workOrderId" = $2::uuid
          `,
          [row.userId, workOrder.id, JSON.stringify(nextSnapshot)],
        ),
      );
      continue;
    }

    const notificationPromise = pool.query<WorkOrderSubscriptionNotificationPayload>(
      `
      INSERT INTO "workOrderSubscriptionNotification" (
        "userId",
        "workOrderId",
        "changeKinds",
        "orderNumber",
        "workOrderName",
        "siteKey",
        "siteName"
      )
      VALUES ($1::uuid, $2::uuid, $3::text[], $4::int, $5::text, $6::text, $7::text)
      RETURNING
        "id"::text AS "id",
        "userId"::text AS "userId",
        "workOrderId"::text AS "workOrderId",
        "orderNumber",
        "workOrderName",
        "siteKey",
        "siteName",
        "changeKinds",
        "createdAt"::text AS "createdAt",
        "readAt"::text AS "readAt"
      `,
      [
        row.userId,
        workOrder.id,
        changeKinds,
        workOrder.orderNumber,
        workOrder.name,
        workOrder.siteKey,
        workOrder.siteName,
        JSON.stringify(nextSnapshot),
      ],
    );

    updates.push(
      notificationPromise.then(({ rows: notificationRows }) => {
        const notification = notificationRows[0];
        if (!notification) return;
        const sanitizedKinds = notification.changeKinds.filter(isKnownChangeKind);
        emitted.push({ ...notification, changeKinds: sanitizedKinds });
        return pool.query(
          `
          UPDATE "workOrderSubscription"
          SET "lastSnapshot" = $3::jsonb
          WHERE "userId" = $1::uuid AND "workOrderId" = $2::uuid
          `,
          [row.userId, workOrder.id, JSON.stringify(nextSnapshot)],
        );
      }),
    );
  }
  await Promise.all(updates);
  return emitted;
}
