import type { PoolClient } from "pg";
import type { QueryResultRow } from "pg";

import type { AuditSessionMeta } from "../auditContext.js";
import {
  deleteWorkOrderDocumentEmbeddings,
  reindexWorkOrderDocument,
  scheduleReindex,
  shouldIngestDocumentForEntity,
} from "../assistant/embedding/index.js";
import { withAuditContext } from "../auditContext.js";
import { pool } from "../db.js";
import { siteAccessSql } from "../siteAccess.js";
import {
  assertEntityAccessible,
  getWorkOrderAssetId,
} from "./documentAccess.js";
import type {
  DocumentCategory,
  DocumentEntityType,
  DocumentSource,
  ReferenceApp,
} from "./documentTypes.js";
import { entityTypeToSource, isDocumentCategory } from "./documentTypes.js";

export type AssetDocumentListRow = {
  id: string;
  assetId: string;
  fileName: string;
  displayName: string;
  category: DocumentCategory;
  mimeType: string;
  fileSize: number;
  referenceApp: ReferenceApp;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type WorkOrderDocumentListRow = {
  id: string;
  source: DocumentSource;
  workOrderId: string | null;
  assetId: string | null;
  fileName: string;
  displayName: string;
  category: DocumentCategory;
  mimeType: string;
  fileSize: number;
  referenceApp: ReferenceApp;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type DocumentContentRow = {
  fileName: string;
  displayName: string;
  mimeType: string;
  fileSize: number;
  content: Buffer;
};

const documentMetadataSelect = `
  d."id",
  d."fileName",
  d."displayName",
  d."category",
  d."mimeType",
  d."fileSize",
  d."referenceApp",
  d."createdAt",
  COALESCE(created_by."loginName", d."createdBy"::text) AS "createdBy",
  d."updatedAt",
  COALESCE(updated_by."loginName", d."updatedBy"::text) AS "updatedBy"
`;

export async function listAssetDocuments(
  userId: string,
  assetId: string,
): Promise<AssetDocumentListRow[] | null> {
  const accessible = await assertEntityAccessible(userId, "asset", assetId);
  if (!accessible) return null;
  const { rows } = await pool.query<AssetDocumentListRow>(
    `
    SELECT
      ${documentMetadataSelect},
      dl."entityId" AS "assetId"
    FROM "document" d
    JOIN "documentLink" dl ON dl."documentId" = d."id"
      AND dl."entityType" = 'asset'
      AND dl."entityId" = $1::uuid
    LEFT JOIN "users" created_by ON created_by."id" = d."createdBy"
    LEFT JOIN "users" updated_by ON updated_by."id" = d."updatedBy"
    ORDER BY d."createdAt" DESC
    `,
    [assetId],
  );
  return rows;
}

export async function listWorkOrderDocumentsWithAsset(
  userId: string,
  workOrderId: string,
): Promise<WorkOrderDocumentListRow[] | null> {
  const accessible = await assertEntityAccessible(userId, "workOrder", workOrderId);
  if (!accessible) return null;
  const { rows } = await pool.query<WorkOrderDocumentListRow>(
    `
    SELECT
      d."id",
      dl."entityType"::text AS "source",
      CASE WHEN dl."entityType" = 'workOrder' THEN dl."entityId" ELSE NULL END AS "workOrderId",
      CASE WHEN dl."entityType" = 'asset' THEN dl."entityId" ELSE NULL END AS "assetId",
      d."fileName",
      d."displayName",
      d."category",
      d."mimeType",
      d."fileSize",
      d."referenceApp",
      d."createdAt",
      COALESCE(cu."loginName", d."createdBy"::text) AS "createdBy",
      d."updatedAt",
      COALESCE(uu."loginName", d."updatedBy"::text) AS "updatedBy"
    FROM "document" d
    JOIN "documentLink" dl ON dl."documentId" = d."id"
    LEFT JOIN "users" cu ON cu."id" = d."createdBy"
    LEFT JOIN "users" uu ON uu."id" = d."updatedBy"
    WHERE (
      dl."entityType" = 'workOrder' AND dl."entityId" = $1::uuid
    ) OR (
      dl."entityType" = 'asset'
      AND dl."entityId" = (SELECT w."assetId" FROM "workOrder" w WHERE w."id" = $1::uuid)
    )
    ORDER BY d."createdAt" DESC
    `,
    [workOrderId],
  );
  return rows;
}

export type CreateDocumentInput = {
  fileName: string;
  displayName: string;
  category: DocumentCategory;
  mimeType: string;
  fileSize: number;
  content: Buffer;
  referenceApp: ReferenceApp;
  entityType: DocumentEntityType;
  entityId: string;
};

function scheduleDocumentEmbeddingIngest(
  entityType: DocumentEntityType,
  entityId: string,
  documentId: string,
  action: "upsert" | "delete",
): void {
  if (action === "delete") {
    scheduleReindex(`delete document ${documentId}`, async () => {
      await deleteWorkOrderDocumentEmbeddings(documentId);
    });
    return;
  }
  scheduleReindex(`document ${documentId}`, async () => {
    if (await shouldIngestDocumentForEntity(entityType, entityId)) {
      await reindexWorkOrderDocument(documentId);
    } else {
      await deleteWorkOrderDocumentEmbeddings(documentId);
    }
  });
}

export async function createDocument(
  meta: AuditSessionMeta,
  input: CreateDocumentInput,
): Promise<AssetDocumentListRow | WorkOrderDocumentListRow | null> {
  const result = await withAuditContext(meta, async (client) => {
    const accessible = await assertEntityAccessible(
      meta.userId,
      input.entityType,
      input.entityId,
      client,
    );
    if (!accessible) return null;

    const ins = await client.query<{ id: string }>(
      `
      INSERT INTO "document" (
        "fileName", "displayName", "category", "mimeType", "fileSize", "content", "referenceApp"
      )
      VALUES ($1, $2, $3, $4, $5, $6::bytea, $7)
      RETURNING "id"
      `,
      [
        input.fileName,
        input.displayName,
        input.category,
        input.mimeType,
        input.fileSize,
        input.content,
        input.referenceApp,
      ],
    );
    const documentId = ins.rows[0]?.id;
    if (!documentId) return null;

    await client.query(
      `
      INSERT INTO "documentLink" ("documentId", "entityType", "entityId")
      VALUES ($1::uuid, $2, $3::uuid)
      `,
      [documentId, input.entityType, input.entityId],
    );

    if (input.entityType === "asset") {
      const { rows } = await client.query<AssetDocumentListRow>(
        `
        SELECT
          ${documentMetadataSelect},
          dl."entityId" AS "assetId"
        FROM "document" d
        JOIN "documentLink" dl ON dl."documentId" = d."id"
        LEFT JOIN "users" created_by ON created_by."id" = d."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = d."updatedBy"
        WHERE d."id" = $1::uuid
        `,
        [documentId],
      );
      return rows[0] ?? null;
    }

    const { rows } = await client.query<WorkOrderDocumentListRow>(
      `
      SELECT
        d."id",
        'workOrder'::text AS "source",
        dl."entityId" AS "workOrderId",
        NULL::uuid AS "assetId",
        d."fileName",
        d."displayName",
        d."category",
        d."mimeType",
        d."fileSize",
        d."referenceApp",
        d."createdAt",
        COALESCE(created_by."loginName", d."createdBy"::text) AS "createdBy",
        d."updatedAt",
        COALESCE(updated_by."loginName", d."updatedBy"::text) AS "updatedBy"
      FROM "document" d
      JOIN "documentLink" dl ON dl."documentId" = d."id"
      LEFT JOIN "users" created_by ON created_by."id" = d."createdBy"
      LEFT JOIN "users" updated_by ON updated_by."id" = d."updatedBy"
      WHERE d."id" = $1::uuid
      `,
      [documentId],
    );
    return rows[0] ?? null;
  });

  if (result?.id) {
    scheduleDocumentEmbeddingIngest(input.entityType, input.entityId, result.id, "upsert");
  }
  return result;
}

export async function getDocumentContentForAsset(
  userId: string,
  assetId: string,
  documentId: string,
): Promise<DocumentContentRow | null> {
  const accessible = await assertEntityAccessible(userId, "asset", assetId);
  if (!accessible) return null;
  const { rows } = await pool.query<DocumentContentRow>(
    `
    SELECT d."fileName", d."displayName", d."mimeType", d."fileSize", d."content"
    FROM "document" d
    JOIN "documentLink" dl ON dl."documentId" = d."id"
      AND dl."entityType" = 'asset'
      AND dl."entityId" = $2::uuid
    WHERE d."id" = $1::uuid
    `,
    [documentId, assetId],
  );
  return rows[0] ?? null;
}

export async function getDocumentContentForWorkOrder(
  userId: string,
  workOrderId: string,
  documentId: string,
): Promise<DocumentContentRow | null> {
  const accessible = await assertEntityAccessible(userId, "workOrder", workOrderId);
  if (!accessible) return null;
  const { rows } = await pool.query<DocumentContentRow>(
    `
    SELECT d."fileName", d."displayName", d."mimeType", d."fileSize", d."content"
    FROM "document" d
    JOIN "documentLink" dl ON dl."documentId" = d."id"
      AND dl."entityType" = 'workOrder'
      AND dl."entityId" = $2::uuid
    WHERE d."id" = $1::uuid
    `,
    [documentId, workOrderId],
  );
  return rows[0] ?? null;
}

export async function deleteDocumentForEntity(
  meta: AuditSessionMeta,
  entityType: DocumentEntityType,
  entityId: string,
  documentId: string,
): Promise<number> {
  const deleted = await withAuditContext(meta, async (client) => {
    const accessible = await assertEntityAccessible(
      meta.userId,
      entityType,
      entityId,
      client,
    );
    if (!accessible) return 0;

    const result = await client.query(
      `
      DELETE FROM "document" d
      USING "documentLink" dl
      WHERE d."id" = dl."documentId"
        AND d."id" = $1::uuid
        AND dl."entityType" = $2
        AND dl."entityId" = $3::uuid
      `,
      [documentId, entityType, entityId],
    );
    return result.rowCount ?? 0;
  });

  if (deleted > 0) {
    scheduleDocumentEmbeddingIngest(entityType, entityId, documentId, "delete");
  }
  return deleted;
}

export async function patchDocumentForEntity(
  meta: AuditSessionMeta,
  entityType: DocumentEntityType,
  entityId: string,
  documentId: string,
  patch: { displayName?: string; category?: DocumentCategory },
): Promise<AssetDocumentListRow | WorkOrderDocumentListRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (patch.displayName !== undefined) {
    sets.push(`"displayName" = $${i++}`);
    params.push(patch.displayName);
  }
  if (patch.category !== undefined) {
    sets.push(`"category" = $${i++}`);
    params.push(patch.category);
  }
  if (sets.length === 0) return null;

  const pDoc = i++;
  const pEntityType = i++;
  const pEntityId = i++;
  const pUser = i++;
  params.push(documentId, entityType, entityId, meta.userId);

  const result = await withAuditContext(meta, async (client) => {
    const entTable = entityType === "asset" ? `"asset"` : `"workOrder"`;
    const upd = await client.query<{ id: string }>(
      `
      UPDATE "document" d
      SET ${sets.join(", ")}
      FROM "documentLink" dl
      JOIN ${entTable} ent ON ent."id" = dl."entityId"
      WHERE d."id" = dl."documentId"
        AND d."id" = $${pDoc}::uuid
        AND dl."entityType" = $${pEntityType}
        AND dl."entityId" = $${pEntityId}::uuid
        AND ${siteAccessSql('ent."siteId"', `$${pUser}`)}
      RETURNING d."id"
      `,
      params,
    );
    if (upd.rowCount === 0) return null;

    if (entityType === "asset") {
      const { rows } = await client.query<AssetDocumentListRow>(
        `
        SELECT
          ${documentMetadataSelect},
          dl."entityId" AS "assetId"
        FROM "document" d
        JOIN "documentLink" dl ON dl."documentId" = d."id"
        LEFT JOIN "users" created_by ON created_by."id" = d."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = d."updatedBy"
        WHERE d."id" = $1::uuid
        `,
        [documentId],
      );
      return rows[0] ?? null;
    }

    const { rows } = await client.query<WorkOrderDocumentListRow>(
      `
      SELECT
        d."id",
        dl."entityType"::text AS "source",
        CASE WHEN dl."entityType" = 'workOrder' THEN dl."entityId" ELSE NULL END AS "workOrderId",
        CASE WHEN dl."entityType" = 'asset' THEN dl."entityId" ELSE NULL END AS "assetId",
        d."fileName",
        d."displayName",
        d."category",
        d."mimeType",
        d."fileSize",
        d."referenceApp",
        d."createdAt",
        COALESCE(created_by."loginName", d."createdBy"::text) AS "createdBy",
        d."updatedAt",
        COALESCE(updated_by."loginName", d."updatedBy"::text) AS "updatedBy"
      FROM "document" d
      JOIN "documentLink" dl ON dl."documentId" = d."id"
      LEFT JOIN "users" created_by ON created_by."id" = d."createdBy"
      LEFT JOIN "users" updated_by ON updated_by."id" = d."updatedBy"
      WHERE d."id" = $1::uuid
      `,
      [documentId],
    );
    return rows[0] ?? null;
  });

  if (result?.id) {
    scheduleDocumentEmbeddingIngest(entityType, entityId, result.id, "upsert");
  }
  return result;
}

/** Assistant: list documents for work order (own + linked asset) or asset only. */
export async function listDocumentsForAssistant(
  userId: string,
  sourceKind: "workOrder" | "asset",
  sourceId: string,
): Promise<
  Array<{
    id: string;
    source: DocumentSource;
    referenceApp: ReferenceApp;
    fileName: string;
    displayName: string;
    category: string;
    mimeType: string;
    fileSize: number;
    createdAt: string;
  }>
> {
  if (sourceKind === "workOrder") {
    const accessible = await assertEntityAccessible(userId, "workOrder", sourceId);
    if (!accessible) return [];
    const { rows } = await pool.query(
      `
      SELECT
        d."id",
        dl."entityType"::text AS "source",
        d."referenceApp",
        d."fileName",
        d."displayName",
        d."category",
        d."mimeType",
        d."fileSize",
        d."createdAt"
      FROM "document" d
      JOIN "documentLink" dl ON dl."documentId" = d."id"
      WHERE (
        dl."entityType" = 'workOrder' AND dl."entityId" = $1::uuid
      ) OR (
        dl."entityType" = 'asset'
        AND dl."entityId" = (SELECT w."assetId" FROM "workOrder" w WHERE w."id" = $1::uuid)
      )
      ORDER BY d."createdAt" DESC
      `,
      [sourceId],
    );
    return rows as typeof rows & { source: DocumentSource; referenceApp: ReferenceApp }[];
  }
  const accessible = await assertEntityAccessible(userId, "asset", sourceId);
  if (!accessible) return [];
  const { rows } = await pool.query(
    `
    SELECT
      d."id",
      'asset'::text AS "source",
      d."referenceApp",
      d."fileName",
      d."displayName",
      d."category",
      d."mimeType",
      d."fileSize",
      d."createdAt"
    FROM "document" d
    JOIN "documentLink" dl ON dl."documentId" = d."id"
      AND dl."entityType" = 'asset'
      AND dl."entityId" = $1::uuid
    ORDER BY d."createdAt" DESC
    `,
    [sourceId],
  );
  return rows as typeof rows & { source: DocumentSource; referenceApp: ReferenceApp }[];
}

export async function readDocumentTextForAssistant(
  userId: string,
  sourceKind: "workOrder" | "asset",
  sourceId: string,
  documentId: string,
): Promise<
  | { error: "not_found" }
  | {
      displayName: string;
      mimeType: string;
      textAvailable: false;
      note: string;
    }
  | {
      displayName: string;
      mimeType: string;
      textAvailable: true;
      content: string;
      referenceApp: ReferenceApp;
    }
> {
  let entityType: DocumentEntityType;
  let entityId: string;

  if (sourceKind === "workOrder") {
    const accessible = await assertEntityAccessible(userId, "workOrder", sourceId);
    if (!accessible) return { error: "not_found" };

    const link = await pool.query<QueryResultRow & { entityType: DocumentEntityType; entityId: string }>(
      `
      SELECT dl."entityType", dl."entityId"
      FROM "document" d
      JOIN "documentLink" dl ON dl."documentId" = d."id"
      WHERE d."id" = $1::uuid
        AND (
          (dl."entityType" = 'workOrder' AND dl."entityId" = $2::uuid)
          OR (
            dl."entityType" = 'asset'
            AND dl."entityId" = (SELECT w."assetId" FROM "workOrder" w WHERE w."id" = $2::uuid)
          )
        )
      LIMIT 1
      `,
      [documentId, sourceId],
    );
    const row = link.rows[0];
    if (!row) return { error: "not_found" };
    entityType = row.entityType;
    entityId = row.entityId;
  } else {
    const accessible = await assertEntityAccessible(userId, "asset", sourceId);
    if (!accessible) return { error: "not_found" };
    entityType = "asset";
    entityId = sourceId;
  }

  const { rows } = await pool.query<
    QueryResultRow & {
      displayName: string;
      mimeType: string;
      content: Buffer;
      referenceApp: ReferenceApp;
    }
  >(
    `
    SELECT d."displayName", d."mimeType", d."content", d."referenceApp"
    FROM "document" d
    JOIN "documentLink" dl ON dl."documentId" = d."id"
      AND dl."entityType" = $3
      AND dl."entityId" = $4::uuid
    WHERE d."id" = $1::uuid
    LIMIT 1
    `,
    [documentId, entityType, entityId],
  );
  const doc = rows[0];
  if (!doc) return { error: "not_found" };

  const isText = /^text\//i.test(doc.mimeType) || /json|xml|csv|markdown/i.test(doc.mimeType);
  if (!isText) {
    return {
      displayName: doc.displayName,
      mimeType: doc.mimeType,
      textAvailable: false,
      note: "The document is binary. Text extraction is not available yet.",
    };
  }
  return {
    displayName: doc.displayName,
    mimeType: doc.mimeType,
    textAvailable: true,
    content: doc.content.toString("utf8").slice(0, 24_000),
    referenceApp: doc.referenceApp,
  };
}
