import type { QueryResultRow } from "pg";

import { pool } from "../../db.js";
import { loadWorkOrderTodoTextsForEmbedding } from "../../todos.js";
import {
  buildAssetText,
  buildSparePartText,
  buildWarehouseText,
  buildWorkOrderDocumentText,
  buildWorkOrderText,
  type AssetEmbeddingRow,
  type SparePartEmbeddingRow,
  type WarehouseEmbeddingRow,
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
  selectSparePartsForEmbeddingSql,
  selectWarehousesForEmbeddingSql,
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
  const todoTexts = await loadWorkOrderTodoTextsForEmbedding(workOrderId);
  await upsertEntityChunks(
    EMBEDDING_SOURCE_KIND.workOrder,
    row.id,
    row.siteId,
    buildWorkOrderText(row, todoTexts),
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

async function loadSparePartStockLines(sparePartId: string): Promise<SparePartEmbeddingRow["stockLines"]> {
  const { rows } = await pool.query<{
    warehouseKey: string;
    warehouseName: string;
    storageLocation: string;
    quantity: string;
    valuationPrice: string | null;
    valuationCurrency: string;
  }>(
    `
    SELECT
      wh."key" AS "warehouseKey",
      wh."name" AS "warehouseName",
      sl."key" AS "storageLocation",
      sc."quantity"::text AS "quantity",
      sc."valuationPrice"::text AS "valuationPrice",
      sc."valuationCurrency"
    FROM "stockControl" sc
    JOIN "warehouse" wh ON wh."id" = sc."warehouseId"
    JOIN "storageLocation" sl ON sl."id" = sc."storageLocationId"
    WHERE sc."sparePartId" = $1::uuid
    ORDER BY wh."key" ASC, sl."key" ASC
    `,
    [sparePartId],
  );
  return rows;
}

async function loadSparePartStockPolicies(
  sparePartId: string,
): Promise<SparePartEmbeddingRow["stockPolicies"]> {
  const { rows } = await pool.query<{
    scopeType: string;
    warehouseKey: string | null;
    warehouseName: string | null;
    storageLocation: string | null;
    reorderLevel: string;
    minStock: string;
    orderQuantity: string;
  }>(
    `
    SELECT
      p."scopeType",
      wh."key" AS "warehouseKey",
      wh."name" AS "warehouseName",
      sl."key" AS "storageLocation",
      p."reorderLevel"::text AS "reorderLevel",
      p."minStock"::text AS "minStock",
      p."orderQuantity"::text AS "orderQuantity"
    FROM "sparePartStockPolicy" p
    LEFT JOIN "warehouse" wh ON wh."id" = p."warehouseId"
    LEFT JOIN "storageLocation" sl ON sl."id" = p."storageLocationId"
    WHERE p."sparePartId" = $1::uuid
    ORDER BY
      CASE p."scopeType"
        WHEN 'SITE' THEN 1
        WHEN 'WAREHOUSE' THEN 2
        ELSE 3
      END,
      wh."key" ASC NULLS LAST,
      sl."key" ASC NULLS LAST
    `,
    [sparePartId],
  );
  return rows;
}

async function loadSparePartSuppliers(
  sparePartId: string,
): Promise<SparePartEmbeddingRow["suppliers"]> {
  const { rows } = await pool.query<{
    supplierKey: string;
    supplierName: string;
    supplierArticleNumber: string | null;
    supplierArticleText: string | null;
    unitPrice: string | null;
    currency: string;
    isPreferred: boolean;
    isActive: boolean;
  }>(
    `
    SELECT
      su."key" AS "supplierKey",
      su."name" AS "supplierName",
      sps."supplierArticleNumber",
      sps."supplierArticleText",
      sps."unitPrice"::text AS "unitPrice",
      sps."currency",
      sps."isPreferred",
      sps."isActive"
    FROM "sparePartSupplier" sps
    JOIN "supplier" su ON su."id" = sps."supplierId"
    WHERE sps."sparePartId" = $1::uuid
    ORDER BY sps."isPreferred" DESC, su."key" ASC
    `,
    [sparePartId],
  );
  return rows;
}

async function loadSparePartRow(sparePartId: string): Promise<SparePartEmbeddingRow | null> {
  const { rows } = await pool.query<
    Omit<SparePartEmbeddingRow, "stockLines" | "stockPolicies" | "suppliers" | "totalQuantity">
  >(
    `
    ${selectSparePartsForEmbeddingSql}
    WHERE sp."id" = $1::uuid
    LIMIT 1
    `,
    [sparePartId],
  );
  const base = rows[0];
  if (!base) return null;
  const stockLines = await loadSparePartStockLines(sparePartId);
  const stockPolicies = await loadSparePartStockPolicies(sparePartId);
  const suppliers = await loadSparePartSuppliers(sparePartId);
  const totalQuantity = stockLines
    .reduce((sum, line) => sum + Number(line.quantity || 0), 0)
    .toFixed(4);
  return { ...base, stockLines, stockPolicies, suppliers, totalQuantity };
}

async function loadWarehouseStockLines(
  warehouseId: string,
): Promise<WarehouseEmbeddingRow["stockLines"]> {
  const { rows } = await pool.query<{
    sparePartKey: string;
    sparePartName: string;
    articleNumber: string | null;
    storageLocation: string;
    quantity: string;
  }>(
    `
    SELECT
      sp."key" AS "sparePartKey",
      sp."name" AS "sparePartName",
      sp."articleNumber",
      sl."key" AS "storageLocation",
      sc."quantity"::text AS "quantity"
    FROM "stockControl" sc
    JOIN "sparePart" sp ON sp."id" = sc."sparePartId"
    JOIN "storageLocation" sl ON sl."id" = sc."storageLocationId"
    WHERE sc."warehouseId" = $1::uuid
    ORDER BY sp."key" ASC, sl."key" ASC
    `,
    [warehouseId],
  );
  return rows;
}

async function loadWarehouseRow(warehouseId: string): Promise<WarehouseEmbeddingRow | null> {
  const { rows } = await pool.query<
    Omit<WarehouseEmbeddingRow, "stockLines" | "totalQuantity" | "distinctSparePartCount">
  >(
    `
    ${selectWarehousesForEmbeddingSql}
    WHERE w."id" = $1::uuid
    LIMIT 1
    `,
    [warehouseId],
  );
  const base = rows[0];
  if (!base) return null;
  const stockLines = await loadWarehouseStockLines(warehouseId);
  const totalQuantity = stockLines
    .reduce((sum, line) => sum + Number(line.quantity || 0), 0)
    .toFixed(4);
  return {
    ...base,
    stockLines,
    totalQuantity,
    distinctSparePartCount: new Set(stockLines.map((line) => line.sparePartKey)).size,
  };
}

export async function reindexSparePart(sparePartId: string): Promise<void> {
  if (!isEmbeddingIngestEnabled() || !isUuid(sparePartId)) return;
  const row = await loadSparePartRow(sparePartId);
  if (!row) {
    await deleteChunks(EMBEDDING_SOURCE_KIND.sparePart, sparePartId);
    return;
  }
  await upsertEntityChunks(
    EMBEDDING_SOURCE_KIND.sparePart,
    row.id,
    row.siteId,
    buildSparePartText(row),
  );
}

export async function deleteSparePartEmbeddings(sparePartId: string): Promise<void> {
  if (!isUuid(sparePartId)) return;
  await deleteChunks(EMBEDDING_SOURCE_KIND.sparePart, sparePartId);
}

export async function reindexWarehouse(warehouseId: string): Promise<void> {
  if (!isEmbeddingIngestEnabled() || !isUuid(warehouseId)) return;
  const row = await loadWarehouseRow(warehouseId);
  if (!row) {
    await deleteChunks(EMBEDDING_SOURCE_KIND.warehouse, warehouseId);
    return;
  }
  await upsertEntityChunks(
    EMBEDDING_SOURCE_KIND.warehouse,
    row.id,
    row.siteId,
    buildWarehouseText(row),
  );
}

export async function deleteWarehouseEmbeddings(warehouseId: string): Promise<void> {
  if (!isUuid(warehouseId)) return;
  await deleteChunks(EMBEDDING_SOURCE_KIND.warehouse, warehouseId);
}

export async function reindexWarehousesForSparePart(sparePartId: string): Promise<void> {
  if (!isEmbeddingIngestEnabled() || !isUuid(sparePartId)) return;
  const { rows } = await pool.query<{ warehouseId: string }>(
    `
    SELECT DISTINCT sc."warehouseId"::text AS "warehouseId"
    FROM "stockControl" sc
    WHERE sc."sparePartId" = $1::uuid
    `,
    [sparePartId],
  );
  for (const row of rows) {
    await reindexWarehouse(row.warehouseId);
  }
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
  entityType: "asset" | "workOrder" | "sparePart",
  entityId: string,
): Promise<boolean> {
  if (entityType === "sparePart") return false;
  if (entityType === "workOrder") return true;
  return assetHasWorkOrder(entityId);
}

export type ReindexScope = "assets" | "workOrders" | "documents" | "spareParts" | "warehouses" | "all";

export async function reindexAll(options?: {
  only?: ReindexScope;
  limit?: number;
  onProgress?: (message: string) => void;
}): Promise<{
  assets: number;
  workOrders: number;
  documents: number;
  spareParts: number;
  warehouses: number;
  errors: number;
}> {
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
  let spareParts = 0;
  let warehouses = 0;

  const runAsset = only === "all" || only === "assets";
  const runWo = only === "all" || only === "workOrders";
  const runDoc = only === "all" || only === "documents";
  const runSp = only === "all" || only === "spareParts";
  const runWh = only === "all" || only === "warehouses";

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

  if (runSp) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT sp."id" FROM "sparePart" sp ORDER BY sp."key" ASC ${limit ? "LIMIT $1" : ""}`,
      limit ? [limit] : [],
    );
    for (const row of rows) {
      try {
        await reindexSparePart(row.id);
        spareParts += 1;
        log(`sparePart ${row.id}`);
      } catch (err) {
        errors += 1;
        console.warn(`[athene-embedding] sparePart ${row.id}:`, err);
      }
    }
  }

  if (runWh) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT w."id" FROM "warehouse" w ORDER BY w."key" ASC ${limit ? "LIMIT $1" : ""}`,
      limit ? [limit] : [],
    );
    for (const row of rows) {
      try {
        await reindexWarehouse(row.id);
        warehouses += 1;
        log(`warehouse ${row.id}`);
      } catch (err) {
        errors += 1;
        console.warn(`[athene-embedding] warehouse ${row.id}:`, err);
      }
    }
  }

  return { assets, workOrders, documents, spareParts, warehouses, errors };
}
