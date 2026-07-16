import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";
import {
  broadcastChatNotification,
  broadcastWorkOrderMessageCreated,
  type ChatNotificationPayload,
} from "./workOrderRealtime.js";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const messageBodyMax = 4000;
const photoPreviewFallback = "Photo";

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

/** Trimmed body, or empty string if omitted/blank. Null only when over max length. */
function parseOptionalMessageBody(raw: unknown): string | null {
  if (raw == null || raw === "") return "";
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length > messageBodyMax) return null;
  return trimmed;
}

type WorkOrderMetaRow = {
  id: string;
  siteId: string;
  orderNumber: number;
  name: string;
  siteKey: string;
  siteName: string;
  responsibleEmployeeIds: string[];
};

type MessageDocumentMeta = {
  documentId: string | null;
  documentDisplayName: string | null;
  documentMimeType: string | null;
  documentFileName: string | null;
};

type MessageRow = {
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
} & MessageDocumentMeta;

async function loadWorkOrderMeta(workOrderId: string): Promise<WorkOrderMetaRow | null> {
  const { rows } = await pool.query<WorkOrderMetaRow>(
    `
    SELECT
      w."id"::text AS "id",
      w."siteId"::text AS "siteId",
      w."orderNumber",
      w."name",
      s."key" AS "siteKey",
      s."name" AS "siteName",
      COALESCE(
        (
          SELECT array_agg(wre."employeeId"::text ORDER BY wre."employeeId")
          FROM "workOrderResponsibleEmployee" wre
          WHERE wre."workOrderId" = w."id"
        ),
        ARRAY[]::text[]
      ) AS "responsibleEmployeeIds"
    FROM "workOrder" w
    JOIN "site" s ON s."id" = w."siteId"
    WHERE w."id" = $1::uuid
    LIMIT 1
    `,
    [workOrderId],
  );
  return rows[0] ?? null;
}

async function hasWorkOrderAccess(userId: string, workOrderId: string): Promise<boolean> {
  const { rows } = await pool.query<{ ok: number }>(
    `
    SELECT 1 AS "ok"
    FROM "workOrder"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    LIMIT 1
    `,
    [workOrderId, userId],
  );
  return rows.length > 0;
}

async function resolveUserIdsForEmployees(employeeIds: string[]): Promise<string[]> {
  if (employeeIds.length === 0) return [];
  const { rows } = await pool.query<{ id: string }>(
    `
    SELECT u."id"::text AS "id"
    FROM "users" u
    WHERE u."employeeId" = ANY($1::uuid[])
    `,
    [employeeIds],
  );
  return rows.map((row) => row.id);
}

async function loadDocumentForWorkOrder(
  workOrderId: string,
  documentId: string,
): Promise<MessageDocumentMeta | null> {
  const { rows } = await pool.query<{
    documentId: string;
    documentDisplayName: string;
    documentMimeType: string;
    documentFileName: string;
  }>(
    `
    SELECT
      d."id"::text AS "documentId",
      d."displayName" AS "documentDisplayName",
      d."mimeType" AS "documentMimeType",
      d."fileName" AS "documentFileName"
    FROM "document" d
    JOIN "documentLink" dl ON dl."documentId" = d."id"
    WHERE d."id" = $1::uuid
      AND dl."entityType" = 'workOrder'
      AND dl."entityId" = $2::uuid
    LIMIT 1
    `,
    [documentId, workOrderId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    documentId: row.documentId,
    documentDisplayName: row.documentDisplayName,
    documentMimeType: row.documentMimeType,
    documentFileName: row.documentFileName,
  };
}

async function loadMessages(workOrderId: string): Promise<MessageRow[]> {
  const { rows } = await pool.query<MessageRow>(
    `
    SELECT
      m."id"::text AS "id",
      m."workOrderId"::text AS "workOrderId",
      m."authorUserId"::text AS "authorUserId",
      author_u."name" AS "authorUserName",
      m."body",
      m."replyToMessageId"::text AS "replyToMessageId",
      reply_author."name" AS "replyToAuthorUserName",
      CASE
        WHEN reply_m."id" IS NULL THEN NULL
        WHEN length(trim(reply_m."body")) > 0 AND length(reply_m."body") > 120 THEN left(reply_m."body", 117) || '...'
        WHEN length(trim(reply_m."body")) > 0 THEN reply_m."body"
        WHEN reply_doc."displayName" IS NOT NULL THEN reply_doc."displayName"
        ELSE NULL
      END AS "replyToBodyPreview",
      reply_m."createdAt"::text AS "replyToCreatedAt",
      m."createdAt"::text AS "createdAt",
      m."documentId"::text AS "documentId",
      d."displayName" AS "documentDisplayName",
      d."mimeType" AS "documentMimeType",
      d."fileName" AS "documentFileName"
    FROM "workOrderMessage" m
    JOIN "users" author_u ON author_u."id" = m."authorUserId"
    LEFT JOIN "workOrderMessage" reply_m ON reply_m."id" = m."replyToMessageId"
    LEFT JOIN "users" reply_author ON reply_author."id" = reply_m."authorUserId"
    LEFT JOIN "document" d ON d."id" = m."documentId"
    LEFT JOIN "document" reply_doc ON reply_doc."id" = reply_m."documentId"
    WHERE m."workOrderId" = $1::uuid
    ORDER BY m."createdAt" ASC
    `,
    [workOrderId],
  );
  return rows;
}

function messagePreview(body: string, documentDisplayName: string | null): string {
  const trimmed = body.trim();
  if (trimmed) {
    if (trimmed.length <= 120) return trimmed;
    return `${trimmed.slice(0, 117)}...`;
  }
  return documentDisplayName?.trim() || photoPreviewFallback;
}

async function createMessageNotifications(
  client: import("pg").PoolClient,
  params: {
    recipientUserIds: string[];
    messageId: string;
    workOrderId: string;
    orderNumber: number;
    workOrderName: string;
    siteKey: string;
    siteName: string;
    authorUserName: string;
    body: string;
    documentDisplayName: string | null;
    isReply: boolean;
  },
): Promise<ChatNotificationPayload[]> {
  const emitted: ChatNotificationPayload[] = [];
  for (const recipientUserId of params.recipientUserIds) {
    const { rows } = await client.query<{
      id: string;
      createdAt: string;
      readAt: string | null;
    }>(
      `
      INSERT INTO "workOrderMessageNotification" ("userId", "workOrderId", "messageId")
      VALUES ($1::uuid, $2::uuid, $3::uuid)
      RETURNING "id"::text AS "id", "createdAt"::text AS "createdAt", "readAt"::text AS "readAt"
      `,
      [recipientUserId, params.workOrderId, params.messageId],
    );
    const row = rows[0];
    if (!row) continue;
    emitted.push({
      id: row.id,
      userId: recipientUserId,
      workOrderId: params.workOrderId,
      messageId: params.messageId,
      orderNumber: params.orderNumber,
      workOrderName: params.workOrderName,
      siteKey: params.siteKey,
      siteName: params.siteName,
      messagePreview: messagePreview(params.body, params.documentDisplayName),
      authorUserName: params.authorUserName,
      isReply: params.isReply,
      createdAt: row.createdAt,
      readAt: row.readAt,
    });
  }
  return emitted;
}

const router = Router();

router.get("/:id/messages", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const accessible = await hasWorkOrderAccess(userId, id);
    if (!accessible) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const rows = await loadMessages(id);
    res.json({ rows });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/:id/messages", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { id: workOrderId } = req.params;
  if (!isUuid(workOrderId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const body = parseOptionalMessageBody(req.body?.body);
  if (body === null) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const documentIdRaw =
    typeof req.body?.documentId === "string" ? req.body.documentId.trim() : "";
  const documentId = documentIdRaw && isUuid(documentIdRaw) ? documentIdRaw : null;
  if (!body && !documentId) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  if (documentIdRaw && !documentId) {
    res.status(400).json({ error: "invalid_document_id" });
    return;
  }
  const replyToMessageIdRaw =
    typeof req.body?.replyToMessageId === "string" ? req.body.replyToMessageId.trim() : "";
  const replyToMessageId = replyToMessageIdRaw && isUuid(replyToMessageIdRaw) ? replyToMessageIdRaw : null;

  const client = await pool.connect();
  try {
    const meta = await loadWorkOrderMeta(workOrderId);
    if (!meta) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await assertSiteAccess(pool, userId, meta.siteId);

    let documentMeta: MessageDocumentMeta = {
      documentId: null,
      documentDisplayName: null,
      documentMimeType: null,
      documentFileName: null,
    };
    if (documentId) {
      const linked = await loadDocumentForWorkOrder(workOrderId, documentId);
      if (!linked) {
        res.status(400).json({ error: "invalid_document_id" });
        return;
      }
      documentMeta = linked;
    }

    let replyAuthorUserId: string | null = null;
    if (replyToMessageId) {
      const { rows: replyRows } = await client.query<{ authorUserId: string }>(
        `
        SELECT "authorUserId"::text AS "authorUserId"
        FROM "workOrderMessage"
        WHERE "id" = $1::uuid AND "workOrderId" = $2::uuid
        LIMIT 1
        `,
        [replyToMessageId, workOrderId],
      );
      if (!replyRows[0]) {
        res.status(400).json({ error: "invalid_reply_to" });
        return;
      }
      replyAuthorUserId = replyRows[0].authorUserId;
    }

    await client.query("BEGIN");

    const { rows: authorRows } = await client.query<{ name: string }>(
      `SELECT "name" FROM "users" WHERE "id" = $1::uuid LIMIT 1`,
      [userId],
    );
    const authorUserName = authorRows[0]?.name ?? "";

    const { rows: insertedRows } = await client.query<{ id: string; createdAt: string }>(
      `
      INSERT INTO "workOrderMessage" ("workOrderId", "authorUserId", "body", "replyToMessageId", "documentId")
      VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid)
      RETURNING "id"::text AS "id", "createdAt"::text AS "createdAt"
      `,
      [workOrderId, userId, body, replyToMessageId, documentMeta.documentId],
    );
    const inserted = insertedRows[0];
    if (!inserted) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: "internal_error" });
      return;
    }

    let recipientUserIds: string[];
    const isReply = replyToMessageId !== null;
    if (isReply && replyAuthorUserId && replyAuthorUserId !== userId) {
      recipientUserIds = [replyAuthorUserId];
    } else if (!isReply) {
      const responsibleUserIds = await resolveUserIdsForEmployees(meta.responsibleEmployeeIds);
      recipientUserIds = responsibleUserIds.filter((id) => id !== userId);
      // Sole sender or no linked responsible users: keep a copy in the author's inbox.
      if (recipientUserIds.length === 0) {
        recipientUserIds = [userId];
      }
    } else {
      recipientUserIds = [];
    }

    const notifications = await createMessageNotifications(client, {
      recipientUserIds,
      messageId: inserted.id,
      workOrderId: meta.id,
      orderNumber: meta.orderNumber,
      workOrderName: meta.name,
      siteKey: meta.siteKey,
      siteName: meta.siteName,
      authorUserName,
      body,
      documentDisplayName: documentMeta.documentDisplayName,
      isReply,
    });

    await client.query("COMMIT");

    const messageRow: MessageRow = {
      id: inserted.id,
      workOrderId: meta.id,
      authorUserId: userId,
      authorUserName,
      body,
      replyToMessageId,
      replyToAuthorUserName: null,
      replyToBodyPreview: null,
      replyToCreatedAt: null,
      createdAt: inserted.createdAt,
      ...documentMeta,
    };

    if (replyToMessageId) {
      const { rows: replyMeta } = await pool.query<{
        replyToAuthorUserName: string | null;
        replyToBodyPreview: string | null;
        replyToCreatedAt: string | null;
      }>(
        `
        SELECT
          reply_author."name" AS "replyToAuthorUserName",
          CASE
            WHEN length(trim(reply_m."body")) > 0 AND length(reply_m."body") > 120 THEN left(reply_m."body", 117) || '...'
            WHEN length(trim(reply_m."body")) > 0 THEN reply_m."body"
            WHEN reply_doc."displayName" IS NOT NULL THEN reply_doc."displayName"
            ELSE NULL
          END AS "replyToBodyPreview",
          reply_m."createdAt"::text AS "replyToCreatedAt"
        FROM "workOrderMessage" reply_m
        LEFT JOIN "users" reply_author ON reply_author."id" = reply_m."authorUserId"
        LEFT JOIN "document" reply_doc ON reply_doc."id" = reply_m."documentId"
        WHERE reply_m."id" = $1::uuid
        LIMIT 1
        `,
        [replyToMessageId],
      );
      messageRow.replyToAuthorUserName = replyMeta[0]?.replyToAuthorUserName ?? null;
      messageRow.replyToBodyPreview = replyMeta[0]?.replyToBodyPreview ?? null;
      messageRow.replyToCreatedAt = replyMeta[0]?.replyToCreatedAt ?? null;
    }

    await Promise.all([
      broadcastWorkOrderMessageCreated(meta.siteId, messageRow),
      ...notifications.map((notification) => broadcastChatNotification(notification)),
    ]);

    res.status(201).json(messageRow);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendPgError(res, err);
  } finally {
    client.release();
  }
});

export const workOrderMessagesRouter = router;
