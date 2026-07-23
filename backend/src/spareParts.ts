import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { QueryResult, QueryResultRow } from "pg";
import sharp from "sharp";

import {
  getAllowChangeStockdata,
  getAllowSiteChange,
  getWorkingSiteId,
} from "./appParameters.js";
import { assertClassificationForSiteAndScope } from "./classificationAssert.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql, type SiteAccessClient } from "./siteAccess.js";
import {
  notifySparePartStockBelowReorder,
  snapshotSparePartStockScopes,
} from "./sparePartStockNotify.js";
import {
  quantityForPolicyScope,
  resolveEffectiveStockPolicy,
  type StockPolicyScopeType,
} from "./stockPolicy.js";
import {
  DOCUMENT_MAX_BYTES,
  createDocument,
  deleteDocumentForEntity,
  getDocumentContentForSparePart,
  isDocumentCategory,
  listSparePartDocuments,
  patchDocumentForEntity,
  sparePartDocumentCountSubquery,
  type DocumentCategory,
} from "./documents/index.js";
import {
  deleteSparePartEmbeddings,
  reindexSparePart,
  reindexWarehouse,
  reindexWarehousesForSparePart,
  scheduleReindex,
} from "./assistant/embedding/index.js";

export type StockControlLineRow = {
  id: string;
  warehouseId: string;
  warehouseKey: string;
  warehouseName: string;
  storageLocationId: string;
  storageLocationKey: string;
  quantity: string;
  valuationPrice: string | null;
  valuationCurrency: string;
};

export type StockPolicyRow = {
  id: string;
  scopeType: StockPolicyScopeType;
  warehouseId: string | null;
  warehouseKey: string | null;
  warehouseName: string | null;
  storageLocationId: string | null;
  storageLocationKey: string | null;
  reorderLevel: string;
  minStock: string;
  orderQuantity: string;
  responsibleEmployeeIds: string[];
};

export type EffectiveStockPolicyRow = {
  scopeType: StockPolicyScopeType;
  warehouseId: string | null;
  storageLocationId: string | null;
  storageLocationKey: string | null;
  reorderLevel: number;
  minStock: number;
  orderQuantity: number;
  onHandQuantity: number;
};

export type SparePartSupplierRow = {
  id: string;
  supplierId: string;
  supplierKey: string;
  supplierName: string;
  supplierArticleNumber: string | null;
  supplierArticleText: string | null;
  supplierArticleLongText: string | null;
  unitPrice: string | null;
  currency: string;
  priceValidFrom: string | null;
  minOrderQuantity: string | null;
  orderMultiple: string | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  isActive: boolean;
  remark: string | null;
};

export type SparePartRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  serialNumber: string | null;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  manufacturer: string | null;
  articleNumber: string | null;
  alternativeDesignation: string | null;
  longText: string | null;
  totalQuantity: string;
  siteQuantity: string;
  hasPhoto: boolean;
  documentCount: number;
  stockControlLines: StockControlLineRow[];
  stockPolicies: StockPolicyRow[];
  effectivePolicies: EffectiveStockPolicyRow[];
  suppliers: SparePartSupplierRow[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type StockControlLineInput = {
  warehouseId: string;
  storageLocationId: string;
  quantity: number;
  valuationPrice: number | null;
  valuationCurrency: string;
};

type StockPolicyInput = {
  scopeType: StockPolicyScopeType;
  warehouseId: string | null;
  storageLocationId: string | null;
  reorderLevel: number;
  minStock: number;
  orderQuantity: number;
  responsibleEmployeeIds: string[];
};

type SparePartSupplierInput = {
  supplierId: string;
  supplierArticleNumber: string | null;
  supplierArticleText: string | null;
  supplierArticleLongText: string | null;
  unitPrice: number | null;
  currency: string;
  priceValidFrom: string | null;
  minOrderQuantity: number | null;
  orderMultiple: number | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  isActive: boolean;
  remark: string | null;
};

type SparePartBody = {
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  serialNumber: string | null;
  classificationId: string | null;
  manufacturer: string | null;
  articleNumber: string | null;
  alternativeDesignation: string | null;
  longText: string | null;
  stockControlLines: StockControlLineInput[];
  stockPolicies: StockPolicyInput[];
  suppliers: SparePartSupplierInput[];
};

const router = Router();

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_MAX_BYTES },
});

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES },
});

const SCOPE_TYPES = new Set<StockPolicyScopeType>(["SITE", "WAREHOUSE", "STORAGE_LOCATION"]);

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("image/");
}

const PHOTO_THUMB_MAX_EDGE_PX = 256;

async function buildSparePartPhotoThumb(
  buffer: Buffer,
): Promise<{ mimeType: string; content: Buffer } | null> {
  try {
    const content = await sharp(buffer)
      .rotate()
      .resize({
        width: PHOTO_THUMB_MAX_EDGE_PX,
        height: PHOTO_THUMB_MAX_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return { mimeType: "image/jpeg", content };
  } catch {
    return null;
  }
}

function readTrimmedOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Parse a non-negative number; missing → 0; invalid → null. */
function parseNonNegativeNumber(value: unknown, defaultWhenMissing = 0): number | null {
  if (value === undefined || value === null || value === "") return defaultWhenMissing;
  const n =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Parse optional non-negative number; missing/empty → null; invalid → sentinel null via false return path. */
function parseOptionalNonNegativeNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const n =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;

function parseOptionalIsoDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!isoDateRe.test(trimmed)) return undefined;
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return trimmed;
}

function parseOptionalNonNegativeInt(value: unknown): number | null | undefined {
  const n = parseOptionalNonNegativeNumber(value);
  if (n === undefined) return undefined;
  if (n === null) return null;
  if (!Number.isInteger(n)) return undefined;
  return n;
}

function normalizeStockControlLines(value: unknown): StockControlLineInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: StockControlLineInput[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") return null;
    const o = entry as Record<string, unknown>;
    const warehouseId = typeof o.warehouseId === "string" ? o.warehouseId.trim() : "";
    const storageLocationId =
      typeof o.storageLocationId === "string" ? o.storageLocationId.trim() : "";
    if (!isUuid(warehouseId) || !isUuid(storageLocationId)) return null;
    const quantity = parseNonNegativeNumber(o.quantity);
    if (quantity === null) return null;
    const valuationPrice = parseOptionalNonNegativeNumber(o.valuationPrice);
    if (valuationPrice === undefined) return null;
    const currencyRaw =
      typeof o.valuationCurrency === "string" ? o.valuationCurrency.trim() : "";
    const valuationCurrency = currencyRaw || "EUR";
    const dedupeKey = storageLocationId;
    if (seen.has(dedupeKey)) return null;
    seen.add(dedupeKey);
    result.push({
      warehouseId,
      storageLocationId,
      quantity,
      valuationPrice,
      valuationCurrency,
    });
  }
  return result;
}

function normalizeEmployeeIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !isUuid(item.trim())) return null;
    const id = item.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function policyDedupeKey(policy: StockPolicyInput): string {
  if (policy.scopeType === "SITE") return "SITE";
  if (policy.scopeType === "WAREHOUSE") return `WAREHOUSE\0${policy.warehouseId}`;
  return `STORAGE_LOCATION\0${policy.storageLocationId}`;
}

function normalizeStockPolicies(value: unknown): StockPolicyInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: StockPolicyInput[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") return null;
    const o = entry as Record<string, unknown>;
    const scopeRaw = typeof o.scopeType === "string" ? o.scopeType.trim() : "";
    if (!SCOPE_TYPES.has(scopeRaw as StockPolicyScopeType)) return null;
    const scopeType = scopeRaw as StockPolicyScopeType;
    const warehouseIdRaw =
      typeof o.warehouseId === "string" && o.warehouseId.trim() ? o.warehouseId.trim() : null;
    const storageLocationIdRaw =
      typeof o.storageLocationId === "string" && o.storageLocationId.trim()
        ? o.storageLocationId.trim()
        : null;

    let warehouseId: string | null = null;
    let storageLocationId: string | null = null;
    if (scopeType === "SITE") {
      if (warehouseIdRaw !== null || storageLocationIdRaw !== null) return null;
    } else if (scopeType === "WAREHOUSE") {
      if (!warehouseIdRaw || !isUuid(warehouseIdRaw)) return null;
      if (storageLocationIdRaw !== null) return null;
      warehouseId = warehouseIdRaw;
    } else {
      if (!warehouseIdRaw || !isUuid(warehouseIdRaw)) return null;
      if (!storageLocationIdRaw || !isUuid(storageLocationIdRaw)) return null;
      warehouseId = warehouseIdRaw;
      storageLocationId = storageLocationIdRaw;
    }

    const reorderLevel = parseNonNegativeNumber(o.reorderLevel);
    const minStock = parseNonNegativeNumber(o.minStock);
    const orderQuantity = parseNonNegativeNumber(o.orderQuantity);
    if (reorderLevel === null || minStock === null || orderQuantity === null) return null;

    const responsibleEmployeeIds = normalizeEmployeeIds(o.responsibleEmployeeIds);
    if (responsibleEmployeeIds === null) return null;

    const policy: StockPolicyInput = {
      scopeType,
      warehouseId,
      storageLocationId,
      reorderLevel,
      minStock,
      orderQuantity,
      responsibleEmployeeIds,
    };
    const key = policyDedupeKey(policy);
    if (seen.has(key)) return null;
    seen.add(key);
    result.push(policy);
  }
  return result;
}

function normalizeSuppliers(value: unknown): SparePartSupplierInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: SparePartSupplierInput[] = [];
  const seen = new Set<string>();
  let preferredCount = 0;
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") return null;
    const o = entry as Record<string, unknown>;
    const supplierId = typeof o.supplierId === "string" ? o.supplierId.trim() : "";
    if (!isUuid(supplierId)) return null;
    if (seen.has(supplierId)) return null;
    seen.add(supplierId);

    const unitPrice = parseOptionalNonNegativeNumber(o.unitPrice);
    const minOrderQuantity = parseOptionalNonNegativeNumber(o.minOrderQuantity);
    const orderMultiple = parseOptionalNonNegativeNumber(o.orderMultiple);
    const leadTimeDays = parseOptionalNonNegativeInt(o.leadTimeDays);
    const priceValidFrom = parseOptionalIsoDate(o.priceValidFrom);
    if (
      unitPrice === undefined ||
      minOrderQuantity === undefined ||
      orderMultiple === undefined ||
      leadTimeDays === undefined ||
      priceValidFrom === undefined
    ) {
      return null;
    }

    const currencyRaw =
      typeof o.currency === "string" && o.currency.trim() ? o.currency.trim() : "EUR";
    if (currencyRaw.length === 0 || currencyRaw.length > 8) return null;

    const isPreferred = o.isPreferred === undefined ? false : Boolean(o.isPreferred);
    const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
    if (isPreferred) preferredCount += 1;
    if (preferredCount > 1) return null;

    result.push({
      supplierId,
      supplierArticleNumber: readTrimmedOptionalString(o.supplierArticleNumber),
      supplierArticleText: readTrimmedOptionalString(o.supplierArticleText),
      supplierArticleLongText: readTrimmedOptionalString(o.supplierArticleLongText),
      unitPrice,
      currency: currencyRaw,
      priceValidFrom,
      minOrderQuantity,
      orderMultiple,
      leadTimeDays,
      isPreferred,
      isActive,
      remark: readTrimmedOptionalString(o.remark),
    });
  }
  return result;
}

function parseBody(body: unknown): SparePartBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  const serialNumber = readTrimmedOptionalString(o.serialNumber);
  const manufacturer = readTrimmedOptionalString(o.manufacturer);
  const articleNumber = readTrimmedOptionalString(o.articleNumber);
  const alternativeDesignation = readTrimmedOptionalString(o.alternativeDesignation);
  const longText = readTrimmedOptionalString(o.longText);
  const classificationIdRaw = readTrimmedOptionalString(o.classificationId);
  const stockControlLines = normalizeStockControlLines(o.stockControlLines);
  const stockPolicies = normalizeStockPolicies(o.stockPolicies);
  const suppliers = normalizeSuppliers(o.suppliers);
  if (
    !key ||
    !name ||
    !isUuid(siteId) ||
    stockControlLines === null ||
    stockPolicies === null ||
    suppliers === null
  ) {
    return null;
  }
  if (classificationIdRaw !== null && !isUuid(classificationIdRaw)) return null;
  return {
    key,
    name,
    siteId,
    isActive,
    serialNumber,
    classificationId: classificationIdRaw,
    manufacturer,
    articleNumber,
    alternativeDesignation,
    longText,
    stockControlLines,
    stockPolicies,
    suppliers,
  };
}

function sendPgError(res: Response, err: unknown) {
  const e = err as { code?: string; detail?: string; message?: string };
  if (e.code === "23505") {
    res.status(409).json({ error: "duplicate_key", message: e.detail ?? e.message });
    return;
  }
  if (e.code === "23503") {
    res.status(409).json({ error: "foreign_key_violation", message: e.detail ?? e.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

function auditMeta(req: Request) {
  const userId = req.session.userId;
  if (!userId) {
    throw new Error("missing_session_user");
  }
  return {
    userId,
    requestId: randomUUID(),
    reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
    source: "api",
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? "",
  };
}

async function assertWarehousesForSite(
  client: SiteAccessClient,
  userId: string,
  siteId: string,
  warehouseIds: string[],
): Promise<void> {
  for (const warehouseId of warehouseIds) {
    const { rowCount } = await client.query(
      `
      SELECT 1
      FROM "warehouse" wh
      WHERE wh."id" = $1::uuid
        AND wh."siteId" = $2::uuid
        AND ${siteAccessSql('wh."siteId"', "$3")}
      `,
      [warehouseId, siteId, userId],
    );
    if ((rowCount ?? 0) === 0) {
      throw new Error("warehouse_site_mismatch");
    }
  }
}

async function assertSuppliersForSite(
  client: SiteAccessClient,
  userId: string,
  siteId: string,
  suppliers: SparePartSupplierInput[],
): Promise<void> {
  for (const supplier of suppliers) {
    const { rowCount } = await client.query(
      `
      SELECT 1
      FROM "supplier" su
      WHERE su."id" = $1::uuid
        AND su."siteId" = $2::uuid
        AND ${siteAccessSql('su."siteId"', "$3")}
      `,
      [supplier.supplierId, siteId, userId],
    );
    if ((rowCount ?? 0) === 0) {
      throw new Error("supplier_site_mismatch");
    }
  }
}

function collectWarehouseIds(
  lines: StockControlLineInput[],
  policies: StockPolicyInput[],
): string[] {
  const ids = new Set<string>();
  for (const line of lines) ids.add(line.warehouseId);
  for (const policy of policies) {
    if (policy.warehouseId) ids.add(policy.warehouseId);
  }
  return [...ids];
}

function normalizeQuantityForCompare(quantity: number | string | null): string {
  if (quantity === null || quantity === undefined) return "null";
  const n = typeof quantity === "number" ? quantity : Number(quantity);
  if (!Number.isFinite(n)) return "NaN";
  return n.toFixed(4);
}

function stockLineLocationKey(line: Pick<StockControlLineInput, "storageLocationId">): string {
  return line.storageLocationId;
}

/** When MT-ACSD is N: existing rows (by storage location) must be unchanged; new rows may be added. */
function assertExistingStockLinesUnchanged(
  existing: StockControlLineInput[],
  incoming: StockControlLineInput[],
): void {
  const incomingByKey = new Map(
    incoming.map((line) => [stockLineLocationKey(line), line] as const),
  );
  for (const ex of existing) {
    const key = stockLineLocationKey(ex);
    const inc = incomingByKey.get(key);
    if (!inc) {
      throw new Error("stock_data_locked");
    }
    if (ex.warehouseId !== inc.warehouseId) {
      throw new Error("stock_data_locked");
    }
    if (normalizeQuantityForCompare(ex.quantity) !== normalizeQuantityForCompare(inc.quantity)) {
      throw new Error("stock_data_locked");
    }
    if (
      normalizeQuantityForCompare(ex.valuationPrice) !==
      normalizeQuantityForCompare(inc.valuationPrice)
    ) {
      throw new Error("stock_data_locked");
    }
    if (ex.valuationCurrency !== inc.valuationCurrency) {
      throw new Error("stock_data_locked");
    }
  }
}

async function fetchStockControlLineInputs(
  client: SiteAccessClient,
  sparePartId: string,
): Promise<StockControlLineInput[]> {
  const { rows } = await client.query<{
    warehouseId: string;
    storageLocationId: string;
    quantity: string;
    valuationPrice: string | null;
    valuationCurrency: string;
  }>(
    `
    SELECT
      sc."warehouseId"::text AS "warehouseId",
      sc."storageLocationId"::text AS "storageLocationId",
      sc."quantity"::text AS "quantity",
      sc."valuationPrice"::text AS "valuationPrice",
      sc."valuationCurrency"
    FROM "stockControl" sc
    WHERE sc."sparePartId" = $1::uuid
    `,
    [sparePartId],
  );
  return rows.map((row) => ({
    warehouseId: row.warehouseId,
    storageLocationId: row.storageLocationId,
    quantity: Number(row.quantity),
    valuationPrice:
      row.valuationPrice != null && row.valuationPrice !== ""
        ? Number(row.valuationPrice)
        : null,
    valuationCurrency: row.valuationCurrency || "EUR",
  }));
}

async function setStockControlLines(
  client: SiteAccessClient,
  sparePartId: string,
  lines: StockControlLineInput[],
): Promise<void> {
  await client.query(`DELETE FROM "stockControl" WHERE "sparePartId" = $1::uuid`, [sparePartId]);
  for (const line of lines) {
    await client.query(
      `
      INSERT INTO "stockControl" (
        "sparePartId", "warehouseId", "storageLocationId", "quantity",
        "valuationPrice", "valuationCurrency"
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
      `,
      [
        sparePartId,
        line.warehouseId,
        line.storageLocationId,
        line.quantity,
        line.valuationPrice,
        line.valuationCurrency,
      ],
    );
  }
}

async function setStockPolicies(
  client: SiteAccessClient,
  sparePartId: string,
  policies: StockPolicyInput[],
): Promise<void> {
  await client.query(`DELETE FROM "sparePartStockPolicy" WHERE "sparePartId" = $1::uuid`, [
    sparePartId,
  ]);
  for (const policy of policies) {
    const { rows } = await client.query<{ id: string }>(
      `
      INSERT INTO "sparePartStockPolicy" (
        "sparePartId", "scopeType", "warehouseId", "storageLocationId",
        "reorderLevel", "minStock", "orderQuantity"
      )
      VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7)
      RETURNING "id"::text AS "id"
      `,
      [
        sparePartId,
        policy.scopeType,
        policy.warehouseId,
        policy.storageLocationId,
        policy.reorderLevel,
        policy.minStock,
        policy.orderQuantity,
      ],
    );
    const stockPolicyId = rows[0]?.id;
    if (!stockPolicyId || policy.responsibleEmployeeIds.length === 0) continue;
    const placeholders = policy.responsibleEmployeeIds
      .map((_, idx) => `($1::uuid, $${idx + 2}::uuid)`)
      .join(", ");
    await client.query(
      `
      INSERT INTO "sparePartStockPolicyResponsibleEmployee" ("stockPolicyId", "employeeId")
      VALUES ${placeholders}
      ON CONFLICT ("stockPolicyId", "employeeId") DO NOTHING
      `,
      [stockPolicyId, ...policy.responsibleEmployeeIds],
    );
  }
}

async function assertStockPolicyResponsibles(
  client: SiteAccessClient,
  userId: string,
  siteId: string,
  policies: StockPolicyInput[],
): Promise<void> {
  for (const policy of policies) {
    for (const employeeId of policy.responsibleEmployeeIds) {
      const employee = await client.query<{ id: string; siteId: string }>(
        `
        SELECT "id"::text AS "id", "siteId"::text AS "siteId"
        FROM "employee"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [employeeId, userId],
      );
      const row = employee.rows[0];
      if (!row) throw new Error("invalid_responsible_employee");
      if (row.siteId !== siteId) throw new Error("responsible_employee_site_mismatch");
    }
  }
}

async function setSparePartSuppliers(
  client: SiteAccessClient,
  sparePartId: string,
  suppliers: SparePartSupplierInput[],
): Promise<void> {
  await client.query(`DELETE FROM "sparePartSupplier" WHERE "sparePartId" = $1::uuid`, [
    sparePartId,
  ]);
  for (const supplier of suppliers) {
    await client.query(
      `
      INSERT INTO "sparePartSupplier" (
        "sparePartId",
        "supplierId",
        "supplierArticleNumber",
        "supplierArticleText",
        "supplierArticleLongText",
        "unitPrice",
        "currency",
        "priceValidFrom",
        "minOrderQuantity",
        "orderMultiple",
        "leadTimeDays",
        "isPreferred",
        "isActive",
        "remark"
      )
      VALUES (
        $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, $12, $13, $14
      )
      `,
      [
        sparePartId,
        supplier.supplierId,
        supplier.supplierArticleNumber,
        supplier.supplierArticleText,
        supplier.supplierArticleLongText,
        supplier.unitPrice,
        supplier.currency,
        supplier.priceValidFrom,
        supplier.minOrderQuantity,
        supplier.orderMultiple,
        supplier.leadTimeDays,
        supplier.isPreferred,
        supplier.isActive,
        supplier.remark,
      ],
    );
  }
}

async function assertStorageLocationsMatchWarehouse(
  client: SiteAccessClient,
  lines: StockControlLineInput[],
  policies: StockPolicyInput[],
): Promise<void> {
  const pairs = new Map<string, string>();
  for (const line of lines) {
    pairs.set(line.storageLocationId, line.warehouseId);
  }
  for (const policy of policies) {
    if (policy.storageLocationId && policy.warehouseId) {
      pairs.set(policy.storageLocationId, policy.warehouseId);
    }
  }
  for (const [storageLocationId, warehouseId] of pairs) {
    const { rowCount } = await client.query(
      `
      SELECT 1
      FROM "storageLocation" sl
      WHERE sl."id" = $1::uuid
        AND sl."warehouseId" = $2::uuid
      `,
      [storageLocationId, warehouseId],
    );
    if ((rowCount ?? 0) === 0) {
      throw new Error("storage_location_warehouse_mismatch");
    }
  }
}

const selectSparePartsSql = `
  SELECT
    sp."id",
    sp."key",
    sp."name",
    sp."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    sp."isActive",
    sp."serialNumber",
    sp."classificationId",
    clf."key" AS "classificationKey",
    clf."name" AS "classificationName",
    sp."manufacturer",
    sp."articleNumber",
    sp."alternativeDesignation",
    sp."longText",
    COALESCE(stock_qty."totalQuantity", 0)::text AS "totalQuantity",
    COALESCE(stock_qty."siteQuantity", 0)::text AS "siteQuantity",
    (sp."photoContent" IS NOT NULL) AS "hasPhoto",
    COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
    sp."createdAt",
    sp."updatedAt",
    COALESCE(created_by."loginName", sp."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", sp."updatedBy"::text) AS "updatedBy"
  FROM "sparePart" sp
  JOIN "site" s ON s."id" = sp."siteId"
  LEFT JOIN "classification" clf ON clf."id" = sp."classificationId"
  LEFT JOIN "users" created_by ON created_by."id" = sp."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = sp."updatedBy"
  ${sparePartDocumentCountSubquery}
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(sc."quantity"), 0) AS "totalQuantity",
      COALESCE(
        SUM(sc."quantity") FILTER (WHERE wh."siteId" = sp."siteId"),
        0
      ) AS "siteQuantity"
    FROM "stockControl" sc
    JOIN "warehouse" wh ON wh."id" = sc."warehouseId"
    WHERE sc."sparePartId" = sp."id"
  ) stock_qty ON TRUE
`;

type SparePartListRow = Omit<
  SparePartRow,
  "stockControlLines" | "stockPolicies" | "effectivePolicies" | "suppliers"
>;

async function fetchStockControlLines(
  client: SiteAccessClient,
  sparePartId: string,
): Promise<StockControlLineRow[]> {
  const { rows } = await client.query<StockControlLineRow>(
    `
    SELECT
      sc."id",
      sc."warehouseId",
      wh."key" AS "warehouseKey",
      wh."name" AS "warehouseName",
      sc."storageLocationId",
      sl."key" AS "storageLocationKey",
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

async function fetchStockPolicies(
  client: SiteAccessClient,
  sparePartId: string,
): Promise<StockPolicyRow[]> {
  const { rows } = await client.query<Omit<StockPolicyRow, "responsibleEmployeeIds"> & {
    responsibleEmployeeIds: string[] | null;
  }>(
    `
    SELECT
      p."id"::text AS "id",
      p."scopeType",
      p."warehouseId"::text AS "warehouseId",
      wh."key" AS "warehouseKey",
      wh."name" AS "warehouseName",
      p."storageLocationId"::text AS "storageLocationId",
      sl."key" AS "storageLocationKey",
      p."reorderLevel"::text AS "reorderLevel",
      p."minStock"::text AS "minStock",
      p."orderQuantity"::text AS "orderQuantity",
      (
        SELECT COALESCE(array_agg(r."employeeId"::text ORDER BY e."key"), ARRAY[]::text[])
        FROM "sparePartStockPolicyResponsibleEmployee" r
        JOIN "employee" e ON e."id" = r."employeeId"
        WHERE r."stockPolicyId" = p."id"
      ) AS "responsibleEmployeeIds"
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
  return rows.map((row) => ({
    ...row,
    responsibleEmployeeIds: Array.isArray(row.responsibleEmployeeIds)
      ? row.responsibleEmployeeIds
      : [],
  }));
}

async function fetchSparePartSuppliers(
  client: SiteAccessClient,
  sparePartId: string,
): Promise<SparePartSupplierRow[]> {
  const { rows } = await client.query<{
    id: string;
    supplierId: string;
    supplierKey: string;
    supplierName: string;
    supplierArticleNumber: string | null;
    supplierArticleText: string | null;
    supplierArticleLongText: string | null;
    unitPrice: string | null;
    currency: string;
    priceValidFrom: Date | string | null;
    minOrderQuantity: string | null;
    orderMultiple: string | null;
    leadTimeDays: number | null;
    isPreferred: boolean;
    isActive: boolean;
    remark: string | null;
  }>(
    `
    SELECT
      sps."id",
      sps."supplierId",
      su."key" AS "supplierKey",
      su."name" AS "supplierName",
      sps."supplierArticleNumber",
      sps."supplierArticleText",
      sps."supplierArticleLongText",
      sps."unitPrice"::text AS "unitPrice",
      sps."currency",
      sps."priceValidFrom",
      sps."minOrderQuantity"::text AS "minOrderQuantity",
      sps."orderMultiple"::text AS "orderMultiple",
      sps."leadTimeDays",
      sps."isPreferred",
      sps."isActive",
      sps."remark"
    FROM "sparePartSupplier" sps
    JOIN "supplier" su ON su."id" = sps."supplierId"
    WHERE sps."sparePartId" = $1::uuid
    ORDER BY sps."isPreferred" DESC, su."key" ASC
    `,
    [sparePartId],
  );
  return rows.map((row) => ({
    ...row,
    priceValidFrom:
      row.priceValidFrom == null
        ? null
        : typeof row.priceValidFrom === "string"
          ? row.priceValidFrom.slice(0, 10)
          : row.priceValidFrom.toISOString().slice(0, 10),
  }));
}

function buildEffectivePolicies(
  policies: StockPolicyRow[],
  lines: StockControlLineRow[],
): EffectiveStockPolicyRow[] {
  const quantityLines = lines.map((line) => ({
    warehouseId: line.warehouseId,
    storageLocationId: line.storageLocationId,
    quantity: Number(line.quantity) || 0,
  }));
  const policyRecords = policies.map((p) => ({
    id: p.id,
    scopeType: p.scopeType,
    warehouseId: p.warehouseId,
    storageLocationId: p.storageLocationId,
    reorderLevel: Number(p.reorderLevel) || 0,
    minStock: Number(p.minStock) || 0,
    orderQuantity: Number(p.orderQuantity) || 0,
  }));
  const keyById = new Map(lines.map((l) => [l.storageLocationId, l.storageLocationKey]));
  for (const p of policies) {
    if (p.storageLocationId && p.storageLocationKey) {
      keyById.set(p.storageLocationId, p.storageLocationKey);
    }
  }

  const results: EffectiveStockPolicyRow[] = [];
  const seen = new Set<string>();

  const pushResolved = (
    resolved: NonNullable<ReturnType<typeof resolveEffectiveStockPolicy>>,
  ) => {
    const key = `${resolved.scopeType}\0${resolved.warehouseId ?? ""}\0${resolved.storageLocationId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      scopeType: resolved.scopeType,
      warehouseId: resolved.warehouseId,
      storageLocationId: resolved.storageLocationId,
      storageLocationKey: resolved.storageLocationId
        ? (keyById.get(resolved.storageLocationId) ?? null)
        : null,
      reorderLevel: resolved.reorderLevel,
      minStock: resolved.minStock,
      orderQuantity: resolved.orderQuantity,
      onHandQuantity: quantityForPolicyScope(quantityLines, resolved),
    });
  };

  const siteResolved = resolveEffectiveStockPolicy(policyRecords);
  if (siteResolved?.scopeType === "SITE") pushResolved(siteResolved);

  const warehouseIds = new Set<string>();
  for (const line of quantityLines) warehouseIds.add(line.warehouseId);
  for (const policy of policyRecords) {
    if (policy.warehouseId) warehouseIds.add(policy.warehouseId);
  }
  for (const warehouseId of warehouseIds) {
    const resolved = resolveEffectiveStockPolicy(policyRecords, { warehouseId });
    if (resolved) pushResolved(resolved);
  }

  for (const line of quantityLines) {
    const resolved = resolveEffectiveStockPolicy(policyRecords, {
      warehouseId: line.warehouseId,
      storageLocationId: line.storageLocationId,
    });
    if (resolved) pushResolved(resolved);
  }

  return results;
}

async function fetchSparePartById(
  client: SiteAccessClient,
  id: string,
): Promise<SparePartRow | null> {
  const { rows } = await client.query<SparePartListRow>(
    `
    ${selectSparePartsSql}
    WHERE sp."id" = $1::uuid
    `,
    [id],
  );
  const base = rows[0];
  if (!base) return null;
  const stockControlLines = await fetchStockControlLines(client, id);
  const stockPolicies = await fetchStockPolicies(client, id);
  const effectivePolicies = buildEffectivePolicies(stockPolicies, stockControlLines);
  const suppliers = await fetchSparePartSuppliers(client, id);
  return { ...base, stockControlLines, stockPolicies, effectivePolicies, suppliers };
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<SparePartListRow>(
      `
      ${selectSparePartsSql}
      WHERE ${siteAccessSql('sp."siteId"', "$1")}
      ORDER BY sp."key" ASC
      `,
      [userId],
    );
    res.json(
      rows.map((row) => ({
        ...row,
        stockControlLines: [] as StockControlLineRow[],
        stockPolicies: [] as StockPolicyRow[],
        effectivePolicies: [] as EffectiveStockPolicyRow[],
        suppliers: [] as SparePartSupplierRow[],
      })),
    );
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/by-key", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const key = typeof req.query.key === "string" ? req.query.key.trim() : "";
  if (!key) {
    res.status(400).json({ error: "invalid_key" });
    return;
  }
  try {
    const { rows } = await pool.query<{
      id: string;
      key: string;
      name: string;
      siteId: string;
    }>(
      `
      SELECT
        sp."id",
        sp."key",
        sp."name",
        sp."siteId"
      FROM "sparePart" sp
      WHERE sp."key" = $2
        AND ${siteAccessSql('sp."siteId"', "$1")}
      LIMIT 1
      `,
      [userId, key],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/suggest", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) {
    res.json([]);
    return;
  }

  const siteIdRaw = typeof req.query.siteId === "string" ? req.query.siteId.trim() : "";
  if (siteIdRaw && !isUuid(siteIdRaw)) {
    res.status(400).json({ error: "invalid_site_id" });
    return;
  }

  const limitRaw =
    typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : Number.NaN;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 25;

  try {
    const params: unknown[] = [userId];
    let i = 2;
    let siteFilter = "";
    if (siteIdRaw) {
      siteFilter = `AND sp."siteId" = $${i++}::uuid`;
      params.push(siteIdRaw);
    }
    const keyPrefixParam = i++;
    const nameContainsParam = i++;
    const limitParam = i;
    params.push(`${q}%`, `%${q}%`, limit);

    const { rows } = await pool.query<{
      id: string;
      key: string;
      name: string;
      siteId: string;
    }>(
      `
      SELECT
        sp."id",
        sp."key",
        sp."name",
        sp."siteId"
      FROM "sparePart" sp
      WHERE ${siteAccessSql('sp."siteId"', "$1")}
        ${siteFilter}
        AND (
          sp."key" ILIKE $${keyPrefixParam}
          OR sp."name" ILIKE $${nameContainsParam}
        )
      ORDER BY
        CASE WHEN sp."key" ILIKE $${keyPrefixParam} THEN 0 ELSE 1 END,
        sp."key" ASC
      LIMIT $${limitParam}::int
      `,
      params,
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<SparePartListRow>(
      `
      ${selectSparePartsSql}
      WHERE sp."id" = $1::uuid
        AND ${siteAccessSql('sp."siteId"', "$2")}
      `,
      [id, userId],
    );
    const base = rows[0];
    if (!base) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const stockControlLines = await fetchStockControlLines(pool, id);
    const stockPolicies = await fetchStockPolicies(pool, id);
    const effectivePolicies = buildEffectivePolicies(stockPolicies, stockControlLines);
    const suppliers = await fetchSparePartSuppliers(pool, id);
    res.json({ ...base, stockControlLines, stockPolicies, effectivePolicies, suppliers });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = parseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const {
    key,
    name,
    siteId,
    isActive,
    serialNumber,
    classificationId,
    manufacturer,
    articleNumber,
    alternativeDesignation,
    longText,
    stockControlLines,
    stockPolicies,
    suppliers,
  } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertClassificationForSiteAndScope(
        client,
        meta.userId,
        effectiveSiteId,
        classificationId,
        "material",
      );
      await assertWarehousesForSite(
        client,
        meta.userId,
        effectiveSiteId,
        collectWarehouseIds(stockControlLines, stockPolicies),
      );
      await assertStorageLocationsMatchWarehouse(client, stockControlLines, stockPolicies);
      await assertSuppliersForSite(client, meta.userId, effectiveSiteId, suppliers);
      await assertStockPolicyResponsibles(client, meta.userId, effectiveSiteId, stockPolicies);
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "sparePart" (
          "key", "name", "siteId", "isActive",
          "serialNumber", "classificationId", "manufacturer", "articleNumber", "alternativeDesignation",
          "longText"
        )
        VALUES ($1, $2, $3::uuid, $4, $5, $6::uuid, $7, $8, $9, $10)
        RETURNING "id"
        `,
        [
          key,
          name,
          effectiveSiteId,
          isActive,
          serialNumber,
          classificationId,
          manufacturer,
          articleNumber,
          alternativeDesignation,
          longText,
        ],
      );
      const sparePartId = inserted.rows[0]?.id;
      if (!sparePartId) return null;
      await setStockControlLines(client, sparePartId, stockControlLines);
      await setStockPolicies(client, sparePartId, stockPolicies);
      await setSparePartSuppliers(client, sparePartId, suppliers);
      return await fetchSparePartById(client, sparePartId);
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    scheduleReindex(`sparePart ${row.id}`, async () => {
      await reindexSparePart(row.id);
      await reindexWarehousesForSparePart(row.id);
    });
    res.status(201).json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "user_not_found" || message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (message === "invalid_classification") {
      res.status(409).json({ error: "invalid_classification" });
      return;
    }
    if (message === "warehouse_site_mismatch") {
      res.status(409).json({ error: "warehouse_site_mismatch" });
      return;
    }
    if (message === "storage_location_warehouse_mismatch") {
      res.status(409).json({ error: "storage_location_warehouse_mismatch" });
      return;
    }
    if (message === "supplier_site_mismatch") {
      res.status(409).json({ error: "supplier_site_mismatch" });
      return;
    }
    if (
      message === "invalid_responsible_employee" ||
      message === "responsible_employee_site_mismatch"
    ) {
      res.status(400).json({ error: message });
      return;
    }
    sendPgError(res, err);
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = parseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const {
    key,
    name,
    siteId,
    isActive,
    serialNumber,
    classificationId,
    manufacturer,
    articleNumber,
    alternativeDesignation,
    longText,
    stockControlLines,
    stockPolicies,
    suppliers,
  } = parsed;
  try {
    const meta = auditMeta(req);
    const beforeScopes = await snapshotSparePartStockScopes(id);
    const existingQtyByLocation = new Map(
      (await fetchStockControlLineInputs(pool, id)).map((line) => [
        `${line.warehouseId}\0${line.storageLocationId}`,
        line.quantity,
      ]),
    );
    const stockDecreased = stockControlLines.some((line) => {
      const prev = existingQtyByLocation.get(`${line.warehouseId}\0${line.storageLocationId}`);
      return prev != null && line.quantity < prev;
    });
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string; siteId: string }>(
        `
        SELECT sp."id", sp."siteId"::text AS "siteId"
        FROM "sparePart" sp
        WHERE sp."id" = $1::uuid
          AND ${siteAccessSql('sp."siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (existing.rowCount === 0) {
        return null;
      }
      const storedSiteId = existing.rows[0]!.siteId;
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : storedSiteId;
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertClassificationForSiteAndScope(
        client,
        meta.userId,
        effectiveSiteId,
        classificationId,
        "material",
      );
      const existingStockLines = await fetchStockControlLineInputs(client, id);
      const allowChangeStockdata = await getAllowChangeStockdata(client);
      if (!allowChangeStockdata && existingStockLines.length > 0) {
        assertExistingStockLinesUnchanged(existingStockLines, stockControlLines);
      }
      await assertWarehousesForSite(
        client,
        meta.userId,
        effectiveSiteId,
        collectWarehouseIds(stockControlLines, stockPolicies),
      );
      await assertStorageLocationsMatchWarehouse(client, stockControlLines, stockPolicies);
      await assertSuppliersForSite(client, meta.userId, effectiveSiteId, suppliers);
      await assertStockPolicyResponsibles(client, meta.userId, effectiveSiteId, stockPolicies);
      await client.query(
        `
        UPDATE "sparePart"
        SET
          "key" = $1,
          "name" = $2,
          "siteId" = $3::uuid,
          "isActive" = $4,
          "serialNumber" = $5,
          "classificationId" = $6::uuid,
          "manufacturer" = $7,
          "articleNumber" = $8,
          "alternativeDesignation" = $9,
          "longText" = $10
        WHERE "id" = $11::uuid
        `,
        [
          key,
          name,
          effectiveSiteId,
          isActive,
          serialNumber,
          classificationId,
          manufacturer,
          articleNumber,
          alternativeDesignation,
          longText,
          id,
        ],
      );
      await setStockControlLines(client, id, stockControlLines);
      await setStockPolicies(client, id, stockPolicies);
      await setSparePartSuppliers(client, id, suppliers);
      return await fetchSparePartById(client, id);
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    scheduleReindex(`sparePart ${row.id}`, async () => {
      await reindexSparePart(row.id);
      await reindexWarehousesForSparePart(row.id);
    });
    if (stockDecreased) {
      void notifySparePartStockBelowReorder(id, beforeScopes).catch((err) => {
        console.error(err);
      });
    }
    res.json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "user_not_found" || message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (message === "invalid_classification") {
      res.status(409).json({ error: "invalid_classification" });
      return;
    }
    if (message === "warehouse_site_mismatch") {
      res.status(409).json({ error: "warehouse_site_mismatch" });
      return;
    }
    if (message === "storage_location_warehouse_mismatch") {
      res.status(409).json({ error: "storage_location_warehouse_mismatch" });
      return;
    }
    if (message === "supplier_site_mismatch") {
      res.status(409).json({ error: "supplier_site_mismatch" });
      return;
    }
    if (message === "stock_data_locked") {
      res.status(409).json({ error: "stock_data_locked" });
      return;
    }
    if (
      message === "invalid_responsible_employee" ||
      message === "responsible_employee_site_mismatch"
    ) {
      res.status(400).json({ error: message });
      return;
    }
    sendPgError(res, err);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const warehouseIds = await pool.query<{ warehouseId: string }>(
      `
      SELECT DISTINCT sc."warehouseId"::text AS "warehouseId"
      FROM "stockControl" sc
      WHERE sc."sparePartId" = $1::uuid
      `,
      [id],
    );
    const deleted = await withAuditContext(meta, async (client) => {
      const result: QueryResult<QueryResultRow> = await client.query(
        `
        DELETE FROM "sparePart"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      return result.rowCount ?? 0;
    });
    if (deleted === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    scheduleReindex(`delete sparePart ${id}`, async () => {
      await deleteSparePartEmbeddings(id);
      for (const row of warehouseIds.rows) {
        await reindexWarehouse(row.warehouseId);
      }
    });
    res.status(204).send();
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

router.get(
  "/:id/stock-control/:stockControlId/moving-average-history",
  async (req: Request, res: Response) => {
    const userId = req.session.userId;
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const { id, stockControlId } = req.params;
    if (!isUuid(id) || !isUuid(stockControlId)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    try {
      const stockRes = await pool.query<{ id: string }>(
        `
        SELECT sc."id"
        FROM "stockControl" sc
        JOIN "sparePart" sp ON sp."id" = sc."sparePartId"
        WHERE sc."id" = $1::uuid
          AND sc."sparePartId" = $2::uuid
          AND ${siteAccessSql('sp."siteId"', "$3")}
        LIMIT 1
        `,
        [stockControlId, id, userId],
      );
      if (!stockRes.rows[0]) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const { rows } = await pool.query<{
        id: string;
        bookedAt: string;
        quantity: string;
        unitPrice: string | null;
        movingAveragePrice: string;
      }>(
        `
        SELECT
          h."id",
          h."bookedAt",
          h."quantity"::text AS "quantity",
          h."unitPrice"::text AS "unitPrice",
          h."movingAveragePrice"::text AS "movingAveragePrice"
        FROM "stockControlMovingAverageHistory" h
        WHERE h."stockControlId" = $1::uuid
        ORDER BY h."bookedAt" DESC, h."createdAt" DESC
        `,
        [stockControlId],
      );
      res.json({ rows });
    } catch (err) {
      sendPgError(res, err);
    }
  },
);

type HistoryCascadeRow = {
  id: string;
  bookedAt: string;
  createdAt: string;
  quantity: string;
  unitPrice: string | null;
  movingAveragePrice: string;
  transactionId: string | null;
  transactionType: string | null;
};

function resolveHistoryMovementKind(row: HistoryCascadeRow): "ZU" | "RM" {
  if (row.transactionType === "ZU" || row.transactionType === "RM") {
    return row.transactionType;
  }
  return row.unitPrice != null && row.unitPrice !== "" ? "ZU" : "RM";
}

router.patch(
  "/:id/stock-control/:stockControlId/moving-average-history/:historyId",
  async (req: Request, res: Response) => {
    const { id, stockControlId, historyId } = req.params;
    if (!isUuid(id) || !isUuid(stockControlId) || !isUuid(historyId)) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const unitPrice = parseOptionalNonNegativeNumber(req.body?.unitPrice);
    if (unitPrice === undefined || unitPrice === null) {
      res.status(400).json({ error: "invalid_unit_price" });
      return;
    }

    try {
      const meta = auditMeta(req);
      const result = await withAuditContext(meta, async (client) => {
        const stockRes = await client.query<{ id: string; quantity: string }>(
          `
          SELECT sc."id", sc."quantity"::text AS "quantity"
          FROM "stockControl" sc
          JOIN "sparePart" sp ON sp."id" = sc."sparePartId"
          WHERE sc."id" = $1::uuid
            AND sc."sparePartId" = $2::uuid
            AND ${siteAccessSql('sp."siteId"', "$3")}
          FOR UPDATE OF sc
          `,
          [stockControlId, id, meta.userId],
        );
        const stock = stockRes.rows[0];
        if (!stock) {
          return { kind: "not_found" as const };
        }

        const historyRes = await client.query<HistoryCascadeRow>(
          `
          SELECT
            h."id",
            h."bookedAt",
            h."createdAt",
            h."quantity"::text AS "quantity",
            h."unitPrice"::text AS "unitPrice",
            h."movingAveragePrice"::text AS "movingAveragePrice",
            h."transactionId",
            t."type" AS "transactionType"
          FROM "stockControlMovingAverageHistory" h
          LEFT JOIN "transaction" t ON t."id" = h."transactionId"
          WHERE h."stockControlId" = $1::uuid
          ORDER BY h."bookedAt" ASC, h."createdAt" ASC
          `,
          [stockControlId],
        );
        const history = historyRes.rows;
        const editedIndex = history.findIndex((row) => row.id === historyId);
        if (editedIndex < 0) {
          return { kind: "history_not_found" as const };
        }

        const editedRow = history[editedIndex]!;
        if (resolveHistoryMovementKind(editedRow) !== "ZU") {
          return { kind: "unit_price_not_editable" as const };
        }

        const currentQty = Number(stock.quantity);
        if (!Number.isFinite(currentQty)) {
          return { kind: "invalid_stock_quantity" as const };
        }

        // qtyAfter[i] = on-hand quantity after history[i] was booked
        const qtyAfter: number[] = new Array(history.length);
        let qty = currentQty;
        for (let i = history.length - 1; i >= 0; i--) {
          qtyAfter[i] = qty;
          const row = history[i]!;
          const movementQty = Number(row.quantity);
          if (!Number.isFinite(movementQty) || movementQty <= 0) {
            return { kind: "invalid_history_quantity" as const };
          }
          const kind = resolveHistoryMovementKind(row);
          qty = kind === "ZU" ? qty - movementQty : qty + movementQty;
        }

        editedRow.unitPrice = String(unitPrice);

        let prevGld = 0;
        if (editedIndex > 0) {
          const prevRaw = Number(history[editedIndex - 1]!.movingAveragePrice);
          prevGld = Number.isFinite(prevRaw) && prevRaw >= 0 ? prevRaw : 0;
        }

        for (let i = editedIndex; i < history.length; i++) {
          const row = history[i]!;
          const movementQty = Number(row.quantity);
          const kind = resolveHistoryMovementKind(row);
          const qtyBefore = i > 0 ? qtyAfter[i - 1]! : qty;

          let newGld = prevGld;
          if (kind === "ZU") {
            const unitPriceRaw = row.unitPrice != null ? Number(row.unitPrice) : 0;
            const rowUnitPrice =
              Number.isFinite(unitPriceRaw) && unitPriceRaw >= 0 ? unitPriceRaw : 0;
            newGld = computeMovingAverage(qtyBefore, prevGld, movementQty, rowUnitPrice);
          }
          row.movingAveragePrice = String(newGld);
          prevGld = newGld;
        }

        await client.query(
          `
          UPDATE "stockControlMovingAverageHistory"
          SET
            "unitPrice" = $1::numeric,
            "movingAveragePrice" = $2::numeric
          WHERE "id" = $3::uuid
          `,
          [unitPrice, Number(editedRow.movingAveragePrice), editedRow.id],
        );

        if (editedRow.transactionId) {
          await client.query(
            `
            UPDATE "transaction"
            SET "unitPrice" = $1::numeric
            WHERE "id" = $2::uuid
            `,
            [unitPrice, editedRow.transactionId],
          );
        }

        for (let i = editedIndex + 1; i < history.length; i++) {
          const row = history[i]!;
          await client.query(
            `
            UPDATE "stockControlMovingAverageHistory"
            SET "movingAveragePrice" = $1::numeric
            WHERE "id" = $2::uuid
            `,
            [Number(row.movingAveragePrice), row.id],
          );
        }

        const lastGld = Number(history[history.length - 1]!.movingAveragePrice);
        await client.query(
          `
          UPDATE "stockControl"
          SET "valuationPrice" = $1::numeric
          WHERE "id" = $2::uuid
          `,
          [lastGld, stock.id],
        );

        const rowsDesc = [...history].reverse().map((row) => ({
          id: row.id,
          bookedAt: row.bookedAt,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          movingAveragePrice: row.movingAveragePrice,
        }));

        return {
          kind: "ok" as const,
          rows: rowsDesc,
          valuationPrice: lastGld,
        };
      });

      if (
        result.kind === "not_found" ||
        result.kind === "history_not_found"
      ) {
        res.status(404).json({ error: result.kind });
        return;
      }
      if (result.kind === "unit_price_not_editable") {
        res.status(400).json({ error: result.kind });
        return;
      }
      if (result.kind === "invalid_stock_quantity" || result.kind === "invalid_history_quantity") {
        res.status(409).json({ error: result.kind });
        return;
      }

      res.json({
        rows: result.rows,
        valuationPrice: result.valuationPrice,
      });
    } catch (err) {
      if ((err as Error).message === "missing_session_user") {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      sendPgError(res, err);
    }
  },
);

router.get("/:id/photo", async (req: Request, res: Response) => {
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
  const wantThumb = String(req.query.size ?? "").trim().toLowerCase() === "thumb";
  try {
    const { rows } = await pool.query<{
      photoMimeType: string | null;
      photoContent: Buffer | null;
      photoThumbMimeType: string | null;
      photoThumbContent: Buffer | null;
    }>(
      `
      SELECT
        sp."photoMimeType",
        sp."photoContent",
        sp."photoThumbMimeType",
        sp."photoThumbContent"
      FROM "sparePart" sp
      WHERE sp."id" = $1::uuid
        AND sp."photoContent" IS NOT NULL
        AND ${siteAccessSql('sp."siteId"', "$2")}
      `,
      [id, userId],
    );
    const row = rows[0];
    if (!row?.photoContent) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (wantThumb) {
      let thumbContent = row.photoThumbContent;
      let thumbMime = row.photoThumbMimeType?.trim() || null;
      if (!thumbContent) {
        const built = await buildSparePartPhotoThumb(row.photoContent);
        if (built) {
          thumbContent = built.content;
          thumbMime = built.mimeType;
          try {
            const meta = auditMeta(req);
            await withAuditContext(meta, async (client) => {
              await client.query(
                `
                UPDATE "sparePart"
                SET "photoThumbMimeType" = $1, "photoThumbContent" = $2
                WHERE "id" = $3::uuid
                  AND ${siteAccessSql('"siteId"', "$4")}
                `,
                [built.mimeType, built.content, id, meta.userId],
              );
            });
          } catch {
            /* still serve generated thumb even if persist fails */
          }
        } else {
          thumbContent = row.photoContent;
          thumbMime = row.photoMimeType?.trim() || "application/octet-stream";
        }
      }
      const mimeType = thumbMime || "image/jpeg";
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Length", String(thumbContent.length));
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(thumbContent);
      return;
    }

    const mimeType = row.photoMimeType?.trim() || "application/octet-stream";
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", String(row.photoContent.length));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(row.photoContent);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/:id/photo", photoUpload.single("file"), async (req: Request, res: Response) => {
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
  if (!req.file) {
    res.status(400).json({ error: "missing_file" });
    return;
  }
  const mimeType = req.file.mimetype?.trim() || "application/octet-stream";
  if (!isImageMimeType(mimeType)) {
    res.status(400).json({ error: "invalid_mime_type" });
    return;
  }
  const content = req.file.buffer;
  const thumb = await buildSparePartPhotoThumb(content);
  try {
    const meta = auditMeta(req);
    const updated = await withAuditContext(meta, async (client) => {
      const result = await client.query(
        `
        UPDATE "sparePart"
        SET
          "photoMimeType" = $1,
          "photoContent" = $2,
          "photoThumbMimeType" = $3,
          "photoThumbContent" = $4
        WHERE "id" = $5::uuid
          AND ${siteAccessSql('"siteId"', "$6")}
        `,
        [
          mimeType,
          content,
          thumb?.mimeType ?? null,
          thumb?.content ?? null,
          id,
          meta.userId,
        ],
      );
      return result.rowCount ?? 0;
    });
    if (updated === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    scheduleReindex(`sparePart photo ${id}`, () => reindexSparePart(id));
    res.status(204).send();
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

router.delete("/:id/photo", async (req: Request, res: Response) => {
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
    const meta = auditMeta(req);
    const updated = await withAuditContext(meta, async (client) => {
      const result = await client.query(
        `
        UPDATE "sparePart"
        SET
          "photoMimeType" = NULL,
          "photoContent" = NULL,
          "photoThumbMimeType" = NULL,
          "photoThumbContent" = NULL
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      return result.rowCount ?? 0;
    });
    if (updated === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    scheduleReindex(`sparePart photo delete ${id}`, () => reindexSparePart(id));
    res.status(204).send();
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

router.get("/:id/documents", async (req: Request, res: Response) => {
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
    const rows = await listSparePartDocuments(userId, id);
    if (rows === null) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/:id/documents", documentUpload.single("file"), async (req: Request, res: Response) => {
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
  if (!req.file) {
    res.status(400).json({ error: "missing_file" });
    return;
  }

  const fileName = req.file.originalname?.trim() || "document";
  const displayNameRaw = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
  const displayName = displayNameRaw || fileName;
  const categoryRaw = typeof req.body?.category === "string" ? req.body.category : "general";
  if (!isDocumentCategory(categoryRaw)) {
    res.status(400).json({ error: "invalid_document_category" });
    return;
  }
  const mimeType = req.file.mimetype?.trim() || "application/octet-stream";
  const content = req.file.buffer;
  const fileSize = req.file.size;

  try {
    const meta = auditMeta(req);
    const row = await createDocument(meta, {
      fileName,
      displayName,
      category: categoryRaw as DocumentCategory,
      mimeType,
      fileSize,
      content,
      referenceApp: "spareParts",
      entityType: "sparePart",
      entityId: id,
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

router.get("/:id/documents/:documentId/content", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { id, documentId } = req.params;
  if (!isUuid(id) || !isUuid(documentId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const doc = await getDocumentContentForSparePart(userId, id, documentId);
    if (!doc) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const encodedName = encodeURIComponent(doc.displayName || doc.fileName);
    res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", String(doc.fileSize));
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodedName}`);
    res.send(doc.content);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.delete("/:id/documents/:documentId", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { id, documentId } = req.params;
  if (!isUuid(id) || !isUuid(documentId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const deleted = await deleteDocumentForEntity(meta, "sparePart", id, documentId);
    if (deleted === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

router.patch("/:id/documents/:documentId", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { id, documentId } = req.params;
  if (!isUuid(id) || !isUuid(documentId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const body = req.body;
  const displayNameRaw =
    typeof body?.displayName === "string" ? (body.displayName as string).trim() : undefined;
  const categoryRaw = typeof body?.category === "string" ? (body.category as string).trim() : undefined;
  if (displayNameRaw === undefined && categoryRaw === undefined) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  if (displayNameRaw !== undefined && !displayNameRaw) {
    res.status(400).json({ error: "invalid_display_name" });
    return;
  }
  if (categoryRaw !== undefined && !isDocumentCategory(categoryRaw)) {
    res.status(400).json({ error: "invalid_document_category" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await patchDocumentForEntity(meta, "sparePart", id, documentId, {
      displayName: displayNameRaw,
      category: categoryRaw as DocumentCategory | undefined,
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

export const sparePartsRouter = router;
