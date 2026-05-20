import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult, QueryResultRow } from "pg";

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
  storageLocation: string;
  quantity: string;
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
  stockControlLines: StockControlLineRow[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type StockControlLineInput = {
  warehouseId: string;
  storageLocation: string;
  quantity: number;
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
  stockControlLines: StockControlLineInput[];
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function readTrimmedOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
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
    const storageLocation = typeof o.storageLocation === "string" ? o.storageLocation.trim() : "";
    const quantityRaw = o.quantity;
    if (!isUuid(warehouseId)) return null;
    const quantity =
      typeof quantityRaw === "number"
        ? quantityRaw
        : typeof quantityRaw === "string"
          ? Number(quantityRaw)
          : NaN;
    if (!Number.isFinite(quantity) || quantity < 0) return null;
    const dedupeKey = `${warehouseId}\0${storageLocation}`;
    if (seen.has(dedupeKey)) return null;
    seen.add(dedupeKey);
    result.push({ warehouseId, storageLocation, quantity });
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
  const classificationIdRaw = readTrimmedOptionalString(o.classificationId);
  const stockControlLines = normalizeStockControlLines(o.stockControlLines);
  if (!key || !name || !isUuid(siteId) || stockControlLines === null) return null;
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
    stockControlLines,
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
  lines: StockControlLineInput[],
): Promise<void> {
  for (const line of lines) {
    const { rowCount } = await client.query(
      `
      SELECT 1
      FROM "warehouse" wh
      WHERE wh."id" = $1::uuid
        AND wh."siteId" = $2::uuid
        AND ${siteAccessSql('wh."siteId"', "$3")}
      `,
      [line.warehouseId, siteId, userId],
    );
    if ((rowCount ?? 0) === 0) {
      throw new Error("warehouse_site_mismatch");
    }
  }
}

function normalizeQuantityForCompare(quantity: number | string): string {
  const n = typeof quantity === "number" ? quantity : Number(quantity);
  if (!Number.isFinite(n)) return "NaN";
  return n.toFixed(4);
}

function stockLineLocationKey(line: Pick<StockControlLineInput, "warehouseId" | "storageLocation">): string {
  return `${line.warehouseId}\0${line.storageLocation}`;
}

/** When MT-ACSD is N: existing rows (by warehouse+location) must be unchanged; new rows may be added. */
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
    if (normalizeQuantityForCompare(ex.quantity) !== normalizeQuantityForCompare(inc.quantity)) {
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
    storageLocation: string;
    quantity: string;
  }>(
    `
    SELECT
      sc."warehouseId"::text AS "warehouseId",
      sc."storageLocation",
      sc."quantity"::text AS "quantity"
    FROM "stockControl" sc
    WHERE sc."sparePartId" = $1::uuid
    `,
    [sparePartId],
  );
  return rows.map((row) => ({
    warehouseId: row.warehouseId,
    storageLocation: row.storageLocation,
    quantity: Number(row.quantity),
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
      INSERT INTO "stockControl" ("sparePartId", "warehouseId", "storageLocation", "quantity")
      VALUES ($1::uuid, $2::uuid, $3, $4)
      `,
      [sparePartId, line.warehouseId, line.storageLocation, line.quantity],
    );
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
    sp."createdAt",
    sp."updatedAt",
    COALESCE(created_by."loginName", sp."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", sp."updatedBy"::text) AS "updatedBy"
  FROM "sparePart" sp
  JOIN "site" s ON s."id" = sp."siteId"
  LEFT JOIN "classification" clf ON clf."id" = sp."classificationId"
  LEFT JOIN "users" created_by ON created_by."id" = sp."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = sp."updatedBy"
`;

type SparePartListRow = Omit<SparePartRow, "stockControlLines">;

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
      sc."storageLocation",
      sc."quantity"::text AS "quantity"
    FROM "stockControl" sc
    JOIN "warehouse" wh ON wh."id" = sc."warehouseId"
    WHERE sc."sparePartId" = $1::uuid
    ORDER BY wh."key" ASC, sc."storageLocation" ASC
    `,
    [sparePartId],
  );
  return rows;
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
  return { ...base, stockControlLines };
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
    res.json(rows.map((row) => ({ ...row, stockControlLines: [] as StockControlLineRow[] })));
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
    res.json({ ...base, stockControlLines });
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
    stockControlLines,
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
      await assertWarehousesForSite(client, meta.userId, effectiveSiteId, stockControlLines);
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "sparePart" (
          "key", "name", "siteId", "isActive",
          "serialNumber", "classificationId", "manufacturer", "articleNumber", "alternativeDesignation"
        )
        VALUES ($1, $2, $3::uuid, $4, $5, $6::uuid, $7, $8, $9)
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
        ],
      );
      const sparePartId = inserted.rows[0]?.id;
      if (!sparePartId) return null;
      await setStockControlLines(client, sparePartId, stockControlLines);
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
    stockControlLines,
  } = parsed;
  try {
    const meta = auditMeta(req);
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
      await assertWarehousesForSite(client, meta.userId, effectiveSiteId, stockControlLines);
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
          "alternativeDesignation" = $9
        WHERE "id" = $10::uuid
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
          id,
        ],
      );
      await setStockControlLines(client, id, stockControlLines);
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
    if (message === "stock_data_locked") {
      res.status(409).json({ error: "stock_data_locked" });
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

export const sparePartsRouter = router;
