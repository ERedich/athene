import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";
import type { WorkOrderSubscriptionChangeKind } from "./workOrderSubscriptionNotify.js";

const router = Router();

type InboxKind = "subscription" | "chat" | "stock";

type InboxRow = {
  id: string;
  kind: InboxKind;
  workOrderId: string | null;
  orderNumber: number | null;
  workOrderName: string | null;
  siteKey: string;
  siteName: string;
  createdAt: string;
  readAt: string | null;
  changeKinds: WorkOrderSubscriptionChangeKind[] | null;
  messageId: string | null;
  messagePreview: string | null;
  authorUserName: string | null;
  isReply: boolean | null;
  sparePartId: string | null;
  sparePartKey: string | null;
  sparePartName: string | null;
  scopeType: string | null;
  warehouseKey: string | null;
  storageLocationKey: string | null;
  onHandQuantity: string | null;
  reorderLevel: string | null;
};

function parseKindFilter(raw: unknown): InboxKind | null {
  if (raw === "subscription" || raw === "chat" || raw === "stock") return raw;
  return null;
}

function sendPgError(res: Response, err: unknown) {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

router.get("/inbox", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const page = Math.max(0, Number(req.query.page) || 0);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const offset = page * limit;
  const kindFilter = parseKindFilter(req.query.kind);

  const subscriptionPart =
    kindFilter === "chat" || kindFilter === "stock"
      ? ""
      : `
      SELECT
        n."id"::text AS "id",
        'subscription'::text AS "kind",
        n."workOrderId"::text AS "workOrderId",
        n."orderNumber",
        n."workOrderName",
        n."siteKey",
        n."siteName",
        n."createdAt"::text AS "createdAt",
        n."readAt"::text AS "readAt",
        n."changeKinds",
        NULL::text AS "messageId",
        NULL::text AS "messagePreview",
        NULL::text AS "authorUserName",
        NULL::boolean AS "isReply",
        NULL::text AS "sparePartId",
        NULL::text AS "sparePartKey",
        NULL::text AS "sparePartName",
        NULL::text AS "scopeType",
        NULL::text AS "warehouseKey",
        NULL::text AS "storageLocationKey",
        NULL::text AS "onHandQuantity",
        NULL::text AS "reorderLevel"
      FROM "workOrderSubscriptionNotification" n
      WHERE n."userId" = $1::uuid
    `;

  const chatPart =
    kindFilter === "subscription" || kindFilter === "stock"
      ? ""
      : `
      SELECT
        cn."id"::text AS "id",
        'chat'::text AS "kind",
        cn."workOrderId"::text AS "workOrderId",
        w."orderNumber",
        w."name" AS "workOrderName",
        s."key" AS "siteKey",
        s."name" AS "siteName",
        cn."createdAt"::text AS "createdAt",
        cn."readAt"::text AS "readAt",
        NULL::text[] AS "changeKinds",
        cn."messageId"::text AS "messageId",
        CASE
          WHEN m."body" IS NULL THEN NULL
          WHEN length(m."body") > 120 THEN left(m."body", 117) || '...'
          ELSE m."body"
        END AS "messagePreview",
        author_u."name" AS "authorUserName",
        (m."replyToMessageId" IS NOT NULL) AS "isReply",
        NULL::text AS "sparePartId",
        NULL::text AS "sparePartKey",
        NULL::text AS "sparePartName",
        NULL::text AS "scopeType",
        NULL::text AS "warehouseKey",
        NULL::text AS "storageLocationKey",
        NULL::text AS "onHandQuantity",
        NULL::text AS "reorderLevel"
      FROM "workOrderMessageNotification" cn
      JOIN "workOrder" w ON w."id" = cn."workOrderId"
      JOIN "site" s ON s."id" = w."siteId"
      JOIN "workOrderMessage" m ON m."id" = cn."messageId"
      JOIN "users" author_u ON author_u."id" = m."authorUserId"
      WHERE cn."userId" = $1::uuid
    `;

  const stockPart =
    kindFilter === "subscription" || kindFilter === "chat"
      ? ""
      : `
      SELECT
        sn."id"::text AS "id",
        'stock'::text AS "kind",
        NULL::text AS "workOrderId",
        NULL::int AS "orderNumber",
        NULL::text AS "workOrderName",
        sn."siteKey",
        sn."siteName",
        sn."createdAt"::text AS "createdAt",
        sn."readAt"::text AS "readAt",
        NULL::text[] AS "changeKinds",
        NULL::text AS "messageId",
        NULL::text AS "messagePreview",
        NULL::text AS "authorUserName",
        NULL::boolean AS "isReply",
        sn."sparePartId"::text AS "sparePartId",
        sn."sparePartKey",
        sn."sparePartName",
        sn."scopeType",
        sn."warehouseKey",
        sn."storageLocationKey",
        sn."onHandQuantity"::text AS "onHandQuantity",
        sn."reorderLevel"::text AS "reorderLevel"
      FROM "sparePartStockNotification" sn
      WHERE sn."userId" = $1::uuid
    `;

  const parts = [subscriptionPart, chatPart, stockPart].filter(Boolean);
  if (parts.length === 0) {
    res.json({ rows: [], total: 0, page, limit });
    return;
  }
  const unionSql = parts.join("\nUNION ALL\n");

  try {
    const [rowsResult, totalResult] = await Promise.all([
      pool.query<InboxRow>(
        `
        SELECT *
        FROM (${unionSql}) inbox
        ORDER BY "createdAt" DESC
        LIMIT $2 OFFSET $3
        `,
        [userId, limit, offset],
      ),
      pool.query<{ count: number }>(
        `
        SELECT COUNT(*)::int AS "count"
        FROM (${unionSql}) inbox
        `,
        [userId],
      ),
    ]);

    res.json({
      rows: rowsResult.rows.map((row) => {
        if (row.kind === "subscription") {
          return {
            id: row.id,
            kind: row.kind,
            workOrderId: row.workOrderId,
            orderNumber: row.orderNumber,
            workOrderName: row.workOrderName,
            siteKey: row.siteKey,
            siteName: row.siteName,
            createdAt: row.createdAt,
            readAt: row.readAt,
            changeKinds: row.changeKinds ?? [],
          };
        }
        if (row.kind === "chat") {
          return {
            id: row.id,
            kind: row.kind,
            workOrderId: row.workOrderId,
            orderNumber: row.orderNumber,
            workOrderName: row.workOrderName,
            siteKey: row.siteKey,
            siteName: row.siteName,
            createdAt: row.createdAt,
            readAt: row.readAt,
            messageId: row.messageId ?? undefined,
            messagePreview: row.messagePreview ?? undefined,
            authorUserName: row.authorUserName ?? undefined,
            isReply: row.isReply ?? false,
          };
        }
        return {
          id: row.id,
          kind: "stock" as const,
          workOrderId: null,
          orderNumber: null,
          workOrderName: null,
          siteKey: row.siteKey,
          siteName: row.siteName,
          createdAt: row.createdAt,
          readAt: row.readAt,
          sparePartId: row.sparePartId,
          sparePartKey: row.sparePartKey,
          sparePartName: row.sparePartName,
          scopeType: row.scopeType,
          warehouseKey: row.warehouseKey,
          storageLocationKey: row.storageLocationKey,
          onHandQuantity: row.onHandQuantity,
          reorderLevel: row.reorderLevel,
        };
      }),
      total: totalResult.rows[0]?.count ?? 0,
      page,
      limit,
    });
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
      SELECT (
        (SELECT COUNT(*)::int FROM "workOrderSubscriptionNotification" WHERE "userId" = $1::uuid AND "readAt" IS NULL)
        +
        (SELECT COUNT(*)::int FROM "workOrderMessageNotification" WHERE "userId" = $1::uuid AND "readAt" IS NULL)
        +
        (SELECT COUNT(*)::int FROM "sparePartStockNotification" WHERE "userId" = $1::uuid AND "readAt" IS NULL)
      ) AS "count"
      `,
      [userId],
    );
    res.json({ count: rows[0]?.count ?? 0 });
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
      WHERE "userId" = $1::uuid AND "readAt" IS NULL;

      UPDATE "workOrderMessageNotification"
      SET "readAt" = now()
      WHERE "userId" = $1::uuid AND "readAt" IS NULL;

      UPDATE "sparePartStockNotification"
      SET "readAt" = now()
      WHERE "userId" = $1::uuid AND "readAt" IS NULL;
      `,
      [userId],
    );
    res.json({ ok: true });
  } catch (err) {
    sendPgError(res, err);
  }
});

export const notificationCenterRouter = router;
