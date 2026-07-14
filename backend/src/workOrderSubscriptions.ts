import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";
import { assertSiteAccess } from "./siteAccess.js";
import {
  buildSubscriptionSnapshot,
  type WorkOrderSubscriptionChangeKind,
} from "./workOrderSubscriptionNotify.js";

const router = Router();
const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function sendPgError(res: Response, err: unknown) {
  const e = err as { code?: string; detail?: string; message?: string };
  if (e.code === "23505") {
    res.status(409).json({ error: "duplicate_key", message: e.detail ?? e.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

type WorkOrderRow = {
  id: string;
  orderNumber: number;
  name: string;
  description: string | null;
  siteId: string;
  siteKey: string;
  siteName: string;
  assetId: string;
  costCenterId: string;
  classificationId: string | null;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationMinutes: number | null;
  orderType: "maintenance" | "repair" | "breakdown";
  status: "open" | "assigned" | "started" | "paused" | "continued" | "ended" | "done" | "cancelled";
  responsibleEmployeeIds: string[];
  doneBy: string | null;
  workgroupId: string | null;
  pauseRemark: string | null;
  documentCount: number;
  assetDocumentCount: number;
  assignedEmployeeCount: number;
  transactionCount: number;
  originalWo: string | null;
  originalWoOrderNumber: number | null;
  updatedBy: string;
};

type NotificationRow = {
  id: string;
  workOrderId: string;
  orderNumber: number;
  workOrderName: string;
  siteKey: string;
  siteName: string;
  changeKinds: WorkOrderSubscriptionChangeKind[];
  readAt: string | null;
  createdAt: string;
};

async function loadWorkOrderById(workOrderId: string): Promise<WorkOrderRow | null> {
  const { rows } = await pool.query<WorkOrderRow>(
    `
    SELECT
      w."id"::text AS "id",
      w."orderNumber",
      w."name",
      w."description",
      w."siteId"::text AS "siteId",
      s."key" AS "siteKey",
      s."name" AS "siteName",
      w."assetId"::text AS "assetId",
      w."costCenterId"::text AS "costCenterId",
      w."classificationId"::text AS "classificationId",
      w."plannedStart"::text AS "plannedStart",
      w."plannedEnd"::text AS "plannedEnd",
      CASE
        WHEN w."plannedDurationMinutes" IS NULL THEN NULL
        ELSE w."plannedDurationMinutes"::int
      END AS "plannedDurationMinutes",
      w."orderType",
      w."status",
      (
        SELECT COALESCE(array_agg(wor."employeeId"::text ORDER BY e."key"), ARRAY[]::text[])
        FROM "workOrderResponsibleEmployee" wor
        JOIN "employee" e ON e."id" = wor."employeeId"
        WHERE wor."workOrderId" = w."id"
      ) AS "responsibleEmployeeIds",
      w."doneBy"::text AS "doneBy",
      w."workgroupId"::text AS "workgroupId",
      w."pauseRemark",
      COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
      COALESCE(asset_doc_counts."assetDocumentCount", 0)::int AS "assetDocumentCount",
      COALESCE(assign_counts."assignedEmployeeCount", 0)::int AS "assignedEmployeeCount",
      COALESCE(tx_counts."transactionCount", 0)::int AS "transactionCount",
      w."originalWo",
      ow."orderNumber" AS "originalWoOrderNumber",
      w."updatedBy"::text AS "updatedBy"
    FROM "workOrder" w
    JOIN "site" s ON s."id" = w."siteId"
    LEFT JOIN "workOrder" ow ON ow."id" = w."originalWo"
    LEFT JOIN (
      SELECT "workOrderId", COUNT(*)::int AS "documentCount"
      FROM "document"
      WHERE "ownerEntityType" = 'workOrder'
      GROUP BY "workOrderId"
    ) doc_counts ON doc_counts."workOrderId" = w."id"
    LEFT JOIN (
      SELECT "assetId", COUNT(*)::int AS "assetDocumentCount"
      FROM "document"
      WHERE "ownerEntityType" = 'asset'
      GROUP BY "assetId"
    ) asset_doc_counts ON asset_doc_counts."assetId" = w."assetId"
    LEFT JOIN (
      SELECT "workOrderId", COUNT(*)::int AS "assignedEmployeeCount"
      FROM "workOrderAssignment"
      GROUP BY "workOrderId"
    ) assign_counts ON assign_counts."workOrderId" = w."id"
    LEFT JOIN (
      SELECT "workOrderId", COUNT(*)::int AS "transactionCount"
      FROM "transaction"
      GROUP BY "workOrderId"
    ) tx_counts ON tx_counts."workOrderId" = w."id"
    WHERE w."id" = $1::uuid
    `,
    [workOrderId],
  );
  return rows[0] ?? null;
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<{ workOrderId: string }>(
      `
      SELECT "workOrderId"::text AS "workOrderId"
      FROM "workOrderSubscription"
      WHERE "userId" = $1::uuid
      ORDER BY "createdAt" DESC
      `,
      [userId],
    );
    res.json(rows.map((row) => row.workOrderId));
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/unread-count", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<{ count: number }>(
      `
      SELECT COUNT(*)::int AS "count"
      FROM "workOrderSubscriptionNotification"
      WHERE "userId" = $1::uuid AND "readAt" IS NULL
      `,
      [userId],
    );
    res.json({ count: rows[0]?.count ?? 0 });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/notifications", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const pageRaw = Number(req.query.page);
  const limitRaw = Number(req.query.limit);
  const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? Math.floor(limitRaw) : 50;
  const offset = page * limit;
  try {
    const [rowsResult, totalResult] = await Promise.all([
      pool.query<NotificationRow>(
        `
        SELECT
          "id"::text AS "id",
          "workOrderId"::text AS "workOrderId",
          "orderNumber",
          "workOrderName",
          "siteKey",
          "siteName",
          "changeKinds",
          "readAt"::text AS "readAt",
          "createdAt"::text AS "createdAt"
        FROM "workOrderSubscriptionNotification"
        WHERE "userId" = $1::uuid
        ORDER BY "createdAt" DESC
        LIMIT $2 OFFSET $3
        `,
        [userId, limit, offset],
      ),
      pool.query<{ count: number }>(
        `
        SELECT COUNT(*)::int AS "count"
        FROM "workOrderSubscriptionNotification"
        WHERE "userId" = $1::uuid
        `,
        [userId],
      ),
    ]);
    res.json({ rows: rowsResult.rows, total: totalResult.rows[0]?.count ?? 0, page, limit });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/mark-read", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    await pool.query(
      `
      UPDATE "workOrderSubscriptionNotification"
      SET "readAt" = now()
      WHERE "userId" = $1::uuid AND "readAt" IS NULL
      `,
      [userId],
    );
    res.json({ ok: true });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const workOrderId = typeof req.body?.workOrderId === "string" ? req.body.workOrderId.trim() : "";
  if (!isUuid(workOrderId)) {
    res.status(400).json({ error: "invalid_work_order_id" });
    return;
  }
  try {
    const row = await loadWorkOrderById(workOrderId);
    if (!row) {
      res.status(404).json({ error: "work_order_not_found" });
      return;
    }
    await assertSiteAccess(pool, userId, row.siteId);
    const snapshot = buildSubscriptionSnapshot(row);
    await pool.query(
      `
      INSERT INTO "workOrderSubscription" ("userId", "workOrderId", "lastSnapshot")
      VALUES ($1::uuid, $2::uuid, $3::jsonb)
      ON CONFLICT ("userId", "workOrderId")
      DO UPDATE SET "lastSnapshot" = EXCLUDED."lastSnapshot"
      `,
      [userId, workOrderId, JSON.stringify(snapshot)],
    );
    res.json({ ok: true });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.delete("/:workOrderId", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { workOrderId } = req.params;
  if (!isUuid(workOrderId)) {
    res.status(400).json({ error: "invalid_work_order_id" });
    return;
  }
  try {
    await pool.query(
      `
      DELETE FROM "workOrderSubscription"
      WHERE "userId" = $1::uuid AND "workOrderId" = $2::uuid
      `,
      [userId, workOrderId],
    );
    res.status(204).end();
  } catch (err) {
    sendPgError(res, err);
  }
});

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

export const workOrderSubscriptionsRouter = router;
