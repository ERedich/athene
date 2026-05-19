import type { QueryResultRow } from "pg";

import { pool } from "../../db.js";
import {
  buildAssetText,
  buildWorkOrderDocumentText,
  buildWorkOrderText,
  type AssetEmbeddingRow,
  type WorkOrderDocumentEmbeddingRow,
  type WorkOrderEmbeddingRow,
} from "./buildEmbeddingText.js";
import { splitIntoChunks } from "./chunkText.js";
import { embedTexts } from "./embedClient.js";
import {
  EMBEDDING_SOURCE_KIND,
  type EmbeddingSourceKind,
  isEmbeddingIngestEnabled,
} from "./embeddingTypes.js";
import {
  selectAssetsForEmbeddingSql,
  selectWorkOrderDocumentIdsSql,
  selectWorkOrdersForEmbeddingSql,
} from "./ingestQueries.js";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return uuidRe.test(value);
}

export function scheduleReindex(label: string, fn: () => Promise<void>): void {
  if (!isEmbeddingIngestEnabled()) return;
  void fn().catch((err) => {
    console.warn(`[athene-embedding] ${label} failed:`, err);
  });
}

export async function deleteChunks(sourceKind: EmbeddingSourceKind, sourceId: string): Promise<void> {
  await pool.query(
    `
    DELETE FROM "assistantEmbeddingChunk"
    WHERE "sourceKind" = $1 AND "sourceId" = $2::uuid
    `,
    [sourceKind, sourceId],
  );
}

async function upsertEntityChunks(
  sourceKind: EmbeddingSourceKind,
  sourceId: string,
  siteId: string,
  fullText: string,
): Promise<void> {
  const chunks = splitIntoChunks(fullText);
  if (chunks.length === 0) {
    await deleteChunks(sourceKind, sourceId);
    return;
  }

  const vectors = await embedTexts(chunks);
  await deleteChunks(sourceKind, sourceId);

  for (let i = 0; i < chunks.length; i += 1) {
    await pool.query(
      `
      INSERT INTO "assistantEmbeddingChunk" ("sourceKind", "sourceId", "siteId", "chunkIndex", "content", "embedding")
      VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6::vector)
      `,
      [sourceKind, sourceId, siteId, i, chunks[i], `[${vectors[i]!.join(",")}]`],
    );
  }
}

async function loadAssetRow(assetId: string): Promise<AssetEmbeddingRow | null> {
  const { rows } = await pool.query<AssetEmbeddingRow>(
    `
    ${selectAssetsForEmbeddingSql}
    WHERE a."id" = $1::uuid
    LIMIT 1
    `,
    [assetId],
  );
  return rows[0] ?? null;
}

async function loadWorkOrderRow(workOrderId: string): Promise<WorkOrderEmbeddingRow | null> {
  const { rows } = await pool.query<WorkOrderEmbeddingRow>(
    `
    ${selectWorkOrdersForEmbeddingSql}
    WHERE w."id" = $1::uuid
    LIMIT 1
    `,
    [workOrderId],
  );
  return rows[0] ?? null;
}

async function assetHasWorkOrder(assetId: string): Promise<boolean> {
  const { rows } = await pool.query<{ ok: number }>(
    `
    SELECT 1 AS ok
    FROM "workOrder" w
    WHERE w."assetId" = $1::uuid
    LIMIT 1
    `,
    [assetId],
  );
  return rows.length > 0;
}

async function loadWorkOrderDocumentRow(
  documentId: string,
): Promise<WorkOrderDocumentEmbeddingRow | null> {
  const { rows } = await pool.query<
    QueryResultRow & {
      id: string;
      fileName: string;
      displayName: string;
      category: string;
      mimeType: string;
      fileSize: number;
      referenceApp: string;
      linkEntityType: string;
      linkEntityId: string;
      content: Buffer;
      siteId: string;
    }
  >(
    `
    SELECT
      d."id",
      d."fileName",
      d."displayName",
      d."category",
      d."mimeType",
      d."fileSize",
      d."referenceApp",
      d."content",
      dl."entityType" AS "linkEntityType",
      dl."entityId" AS "linkEntityId",
      CASE
        WHEN dl."entityType" = 'workOrder' THEN w_direct."siteId"
        ELSE a."siteId"
      END AS "siteId"
    FROM "document" d
    JOIN "documentLink" dl ON dl."documentId" = d."id"
    LEFT JOIN "workOrder" w_direct ON dl."entityType" = 'workOrder' AND w_direct."id" = dl."entityId"
    LEFT JOIN "asset" a ON dl."entityType" = 'asset' AND a."id" = dl."entityId"
    WHERE d."id" = $1::uuid
    LIMIT 1
    `,
    [documentId],
  );
  const base = rows[0];
  if (!base) return null;

  const woRows = await pool.query<{ id: string; orderNumber: number }>(
    `
    SELECT DISTINCT w."id", w."orderNumber"
    FROM "documentLink" dl
    JOIN "workOrder" w ON (
      (dl."entityType" = 'workOrder' AND dl."entityId" = w."id")
      OR (dl."entityType" = 'asset' AND dl."entityId" = w."assetId")
    )
    WHERE dl."documentId" = $1::uuid
    ORDER BY w."orderNumber" ASC
    `,
    [documentId],
  );

  if (woRows.rows.length === 0) return null;

  return {
    id: base.id,
    fileName: base.fileName,
    displayName: base.displayName,
    category: base.category,
    mimeType: base.mimeType,
    fileSize: base.fileSize,
    referenceApp: base.referenceApp,
    linkEntityType: base.linkEntityType,
    linkEntityId: base.linkEntityId,
    content: base.content,
    siteId: base.siteId,
    workOrderIds: woRows.rows.map((r) => r.id),
    workOrderNumbers: woRows.rows.map((r) => r.orderNumber),
  };
}

export async function reindexAsset(assetId: string): Promise<void> {
  if (!isEmbeddingIngestEnabled() || !isUuid(assetId)) return;
  const row = await loadAssetRow(assetId);
  if (!row) {
    await deleteChunks(EMBEDDING_SOURCE_KIND.asset, assetId);
    return;
  }
  await upsertEntityChunks(
    EMBEDDING_SOURCE_KIND.asset,
    row.id,
    row.siteId,
    buildAssetText(row),
  );
}

export async function deleteAssetEmbeddings(assetId: string): Promise<void> {
  if (!isUuid(assetId)) return;
  await deleteChunks(EMBEDDING_SOURCE_KIND.asset, assetId);
}

export async function reindexWorkOrder(workOrderId: string): Promise<void> {
  if (!isEmbeddingIngestEnabled() || !isUuid(workOrderId)) return;
  const row = await loadWorkOrderRow(workOrderId);
  if (!row) {
    await deleteChunks(EMBEDDING_SOURCE_KIND.workOrder, workOrderId);
    return;
  }
  await upsertEntityChunks(
    EMBEDDING_SOURCE_KIND.workOrder,
    row.id,
    row.siteId,
    buildWorkOrderText(row),
  );
}

export async function deleteWorkOrderEmbeddings(workOrderId: string): Promise<void> {
  if (!isUuid(workOrderId)) return;
  await deleteChunks(EMBEDDING_SOURCE_KIND.workOrder, workOrderId);
}

export async function reindexWorkOrderDocument(documentId: string): Promise<void> {
  if (!isEmbeddingIngestEnabled() || !isUuid(documentId)) return;
  const row = await loadWorkOrderDocumentRow(documentId);
  if (!row) {
    await deleteChunks(EMBEDDING_SOURCE_KIND.workOrderDocument, documentId);
    return;
  }
  await upsertEntityChunks(
    EMBEDDING_SOURCE_KIND.workOrderDocument,
    row.id,
    row.siteId,
    buildWorkOrderDocumentText(row),
  );
}

export async function deleteWorkOrderDocumentEmbeddings(documentId: string): Promise<void> {
  if (!isUuid(documentId)) return;
  await deleteChunks(EMBEDDING_SOURCE_KIND.workOrderDocument, documentId);
}

/** Reindex asset-linked documents that appear on at least one work order. */
export async function reindexWorkOrderDocumentsForAsset(assetId: string): Promise<void> {
  if (!isEmbeddingIngestEnabled() || !isUuid(assetId)) return;
  if (!(await assetHasWorkOrder(assetId))) return;

  const { rows } = await pool.query<{ id: string }>(
    `
    SELECT DISTINCT d."id"
    FROM "document" d
    JOIN "documentLink" dl ON dl."documentId" = d."id"
      AND dl."entityType" = 'asset'
      AND dl."entityId" = $1::uuid
    JOIN "workOrder" w ON w."assetId" = dl."entityId"
    `,
    [assetId],
  );

  for (const row of rows) {
    await reindexWorkOrderDocument(row.id);
  }
}

export async function shouldIngestDocumentForEntity(
  entityType: "asset" | "workOrder",
  entityId: string,
): Promise<boolean> {
  if (entityType === "workOrder") return true;
  return assetHasWorkOrder(entityId);
}

export type ReindexScope = "assets" | "workOrders" | "documents" | "all";

export async function reindexAll(options?: {
  only?: ReindexScope;
  limit?: number;
  onProgress?: (message: string) => void;
}): Promise<{ assets: number; workOrders: number; documents: number; errors: number }> {
  if (!isEmbeddingIngestEnabled()) {
    throw new Error("embedding_not_configured");
  }

  const only = options?.only ?? "all";
  const limit = options?.limit;
  const log = options?.onProgress ?? (() => undefined);
  let errors = 0;
  let assets = 0;
  let workOrders = 0;
  let documents = 0;

  const runAsset = only === "all" || only === "assets";
  const runWo = only === "all" || only === "workOrders";
  const runDoc = only === "all" || only === "documents";

  if (runAsset) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT a."id" FROM "asset" a ORDER BY a."key" ASC ${limit ? "LIMIT $1" : ""}`,
      limit ? [limit] : [],
    );
    for (const row of rows) {
      try {
        await reindexAsset(row.id);
        assets += 1;
        log(`asset ${row.id}`);
      } catch (err) {
        errors += 1;
        console.warn(`[athene-embedding] asset ${row.id}:`, err);
      }
    }
  }

  if (runWo) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT w."id" FROM "workOrder" w ORDER BY w."orderNumber" ASC ${limit ? "LIMIT $1" : ""}`,
      limit ? [limit] : [],
    );
    for (const row of rows) {
      try {
        await reindexWorkOrder(row.id);
        workOrders += 1;
        log(`workOrder ${row.id}`);
      } catch (err) {
        errors += 1;
        console.warn(`[athene-embedding] workOrder ${row.id}:`, err);
      }
    }
  }

  if (runDoc) {
    const { rows } = await pool.query<{ id: string }>(
      `
      ${selectWorkOrderDocumentIdsSql}
      ORDER BY d."id" ASC
      ${limit ? "LIMIT $1" : ""}
      `,
      limit ? [limit] : [],
    );
    for (const row of rows) {
      try {
        await reindexWorkOrderDocument(row.id);
        documents += 1;
        log(`document ${row.id}`);
      } catch (err) {
        errors += 1;
        console.warn(`[athene-embedding] document ${row.id}:`, err);
      }
    }
  }

  return { assets, workOrders, documents, errors };
}
