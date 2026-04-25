import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { QueryResult, QueryResultRow } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

type AssetType = "site" | "structure" | "line" | "maintenanceObject";
type AssetDocumentCategory =
  | "general"
  | "protocols"
  | "drawings"
  | "instructions"
  | "nameplates"
  | "certificates";

export type AssetRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  type: AssetType;
  parentAssetId: string | null;
  parentAssetKey: string | null;
  parentAssetName: string | null;
  parentAssetType: AssetType | null;
  serialNumber: string | null;
  buildDate: string | null;
  manufacturer: string | null;
  remark: string | null;
  costCenterId: string | null;
  costCenterKey: string | null;
  costCenterName: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
};

type AssetDocumentRow = {
  id: string;
  assetId: string;
  fileName: string;
  displayName: string;
  category: AssetDocumentCategory;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

type ParsedBody = {
  key: string;
  name: string;
  siteId: string;
  type: AssetType;
  parentAssetId: string | null;
  serialNumber: string | null;
  buildDate: string | null;
  manufacturer: string | null;
  remark: string | null;
  costCenterId: string | null;
};

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.ASSET_DOCUMENT_MAX_BYTES) || 25 * 1024 * 1024,
  },
});

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const allowedTypes: AssetType[] = ["site", "structure", "line", "maintenanceObject"];
const parentTypeRules: Record<AssetType, AssetType[]> = {
  site: ["site"],
  structure: ["site", "structure"],
  line: ["site", "structure", "line"],
  maintenanceObject: ["site", "structure", "line", "maintenanceObject"],
};
const allowedDocumentCategories: AssetDocumentCategory[] = [
  "general",
  "protocols",
  "drawings",
  "instructions",
  "nameplates",
  "certificates",
];

const assetDocumentSelectJoin = `
      SELECT
        d."id",
        d."assetId",
        d."fileName",
        d."displayName",
        d."category",
        d."mimeType",
        d."fileSize",
        d."createdAt",
        COALESCE(created_by."loginName", d."createdBy"::text) AS "createdBy",
        d."updatedAt",
        COALESCE(updated_by."loginName", d."updatedBy"::text) AS "updatedBy"
      FROM "assetDocument" d
      LEFT JOIN "users" created_by ON created_by."id" = d."createdBy"
      LEFT JOIN "users" updated_by ON updated_by."id" = d."updatedBy"
`;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function isAssetType(value: unknown): value is AssetType {
  return typeof value === "string" && (allowedTypes as string[]).includes(value);
}

function isAssetDocumentCategory(value: unknown): value is AssetDocumentCategory {
  return typeof value === "string" && (allowedDocumentCategories as string[]).includes(value);
}

function readTrimmedOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isValidDateOnly(value: string): boolean {
  if (!dateRe.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === value;
}

function parseBody(body: unknown): ParsedBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const type = o.type;

  const parentAssetIdRaw = readTrimmedOptionalString(o.parentAssetId);
  const serialNumber = readTrimmedOptionalString(o.serialNumber);
  const buildDate = readTrimmedOptionalString(o.buildDate);
  const manufacturer = readTrimmedOptionalString(o.manufacturer);
  const remark = readTrimmedOptionalString(o.remark);
  const costCenterIdRaw = readTrimmedOptionalString(o.costCenterId);

  if (!key || !name || !isUuid(siteId) || !isAssetType(type)) return null;
  if (parentAssetIdRaw !== null && !isUuid(parentAssetIdRaw)) return null;
  if (costCenterIdRaw !== null && !isUuid(costCenterIdRaw)) return null;
  if (buildDate !== null && !isValidDateOnly(buildDate)) return null;
  if (remark !== null && remark.length > 2000) return null;

  return {
    key,
    name,
    siteId,
    type,
    parentAssetId: parentAssetIdRaw,
    serialNumber,
    buildDate,
    manufacturer,
    remark,
    costCenterId: costCenterIdRaw,
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
  if (e.code === "23514") {
    res.status(400).json({ error: "check_violation", message: e.detail ?? e.message });
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

const selectAssetsSql = `
  SELECT
    a."id",
    a."key",
    a."name",
    a."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    a."type",
    a."parentAssetId",
    parent."key" AS "parentAssetKey",
    parent."name" AS "parentAssetName",
    parent."type" AS "parentAssetType",
    a."serialNumber",
    a."buildDate"::text AS "buildDate",
    a."manufacturer",
    a."remark",
    a."costCenterId",
    cc."key" AS "costCenterKey",
    cc."name" AS "costCenterName",
    a."createdAt",
    a."updatedAt",
    COALESCE(created_by."loginName", a."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", a."updatedBy"::text) AS "updatedBy",
    COALESCE(doc_counts."documentCount", 0)::int AS "documentCount"
  FROM "asset" a
  JOIN "site" s ON s."id" = a."siteId"
  LEFT JOIN "costCenter" cc ON cc."id" = a."costCenterId"
  LEFT JOIN "asset" parent ON parent."id" = a."parentAssetId"
  LEFT JOIN "users" created_by ON created_by."id" = a."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = a."updatedBy"
  LEFT JOIN (
    SELECT "assetId", COUNT(*)::int AS "documentCount"
    FROM "assetDocument"
    GROUP BY "assetId"
  ) doc_counts ON doc_counts."assetId" = a."id"
`;

type AssetTypeRow = QueryResultRow & { type: AssetType; id: string; siteId: string };
type AssetParentPointerRow = QueryResultRow & { parentAssetId: string | null };
type AssetAccessRow = QueryResultRow & { id: string; siteId: string };

async function getAccessibleAsset(
  userId: string,
  assetId: string,
): Promise<AssetAccessRow | null> {
  const result = await pool.query<AssetAccessRow>(
    `
    SELECT "id", "siteId"
    FROM "asset"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    `,
    [assetId, userId],
  );
  return result.rows[0] ?? null;
}

async function assertParentRules(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  childType: AssetType,
  childSiteId: string,
  parentAssetId: string | null,
  childIdForUpdate?: string,
) {
  if (parentAssetId === null) return;
  if (childIdForUpdate && parentAssetId === childIdForUpdate) {
    throw new Error("asset_parent_self");
  }

  const parentResult = await client.query<AssetTypeRow>(
    `SELECT "id", "type", "siteId" FROM "asset" WHERE "id" = $1::uuid`,
    [parentAssetId],
  );
  const parent = parentResult.rows[0];
  if (!parent) {
    throw new Error("asset_parent_not_found");
  }
  if (parent.siteId !== childSiteId) {
    throw new Error("asset_parent_site_mismatch");
  }

  const allowedParentTypes = parentTypeRules[childType];
  if (!allowedParentTypes.includes(parent.type)) {
    throw new Error("asset_parent_type_invalid");
  }

  if (!childIdForUpdate) return;

  let currentParentId: string | null = parentAssetId;
  while (currentParentId) {
    if (currentParentId === childIdForUpdate) {
      throw new Error("asset_parent_cycle");
    }
    const ancestor: QueryResult<AssetParentPointerRow> = await client.query<AssetParentPointerRow>(
      `SELECT "parentAssetId" FROM "asset" WHERE "id" = $1::uuid`,
      [currentParentId],
    );
    currentParentId = ancestor.rows[0]?.parentAssetId ?? null;
  }
}

async function assertCostCenterForAssetSite(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  userId: string,
  assetSiteId: string,
  costCenterId: string | null,
) {
  if (costCenterId === null) return;
  const { rows } = await client.query<{ id: string }>(
    `
    SELECT c."id"
    FROM "costCenter" c
    WHERE c."id" = $1::uuid
      AND c."siteId" = $2::uuid
      AND ${siteAccessSql('c."siteId"', "$3")}
    `,
    [costCenterId, assetSiteId, userId],
  );
  if (!rows[0]) {
    throw new Error("asset_cost_center_invalid");
  }
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<AssetRow>(
      `
      ${selectAssetsSql}
      WHERE ${siteAccessSql('a."siteId"', "$1")}
      ORDER BY a."key" ASC
      `,
      [userId],
    );
    res.json(rows);
  } catch (err) {
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
    const asset = await getAccessibleAsset(userId, id);
    if (!asset) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const { rows } = await pool.query<AssetDocumentRow>(
      `
      ${assetDocumentSelectJoin}
      WHERE d."assetId" = $1::uuid
      ORDER BY d."createdAt" DESC
      `,
      [asset.id],
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/:id/documents", upload.single("file"), async (req: Request, res: Response) => {
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
  if (!isAssetDocumentCategory(categoryRaw)) {
    res.status(400).json({ error: "invalid_document_category" });
    return;
  }
  const mimeType = req.file.mimetype?.trim() || "application/octet-stream";
  const content = req.file.buffer;
  const fileSize = req.file.size;

  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const asset = await client.query<AssetAccessRow>(
        `
        SELECT "id", "siteId"
        FROM "asset"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (asset.rowCount === 0) return null;
      const ins = await client.query<{ id: string }>(
        `
        INSERT INTO "assetDocument" ("assetId", "fileName", "displayName", "category", "mimeType", "fileSize", "content")
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::bytea)
        RETURNING "id"
        `,
        [id, fileName, displayName, categoryRaw, mimeType, fileSize, content],
      );
      const newId = ins.rows[0]?.id;
      if (!newId) return null;
      const { rows } = await client.query<AssetDocumentRow>(
        `${assetDocumentSelectJoin}
        WHERE d."id" = $1::uuid`,
        [newId],
      );
      return rows[0] ?? null;
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
    const asset = await getAccessibleAsset(userId, id);
    if (!asset) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const result = await pool.query<
      QueryResultRow & { fileName: string; displayName: string; mimeType: string; fileSize: number; content: Buffer }
    >(
      `
      SELECT "fileName", "displayName", "mimeType", "fileSize", "content"
      FROM "assetDocument"
      WHERE "id" = $1::uuid
        AND "assetId" = $2::uuid
      `,
      [documentId, asset.id],
    );
    const doc = result.rows[0];
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
    const deleted = await withAuditContext(meta, async (client) => {
      const asset = await client.query<AssetAccessRow>(
        `
        SELECT "id", "siteId"
        FROM "asset"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (asset.rowCount === 0) return 0;
      const result: QueryResult = await client.query(
        `
        DELETE FROM "assetDocument"
        WHERE "id" = $1::uuid
          AND "assetId" = $2::uuid
        `,
        [documentId, id],
      );
      return result.rowCount ?? 0;
    });
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
  if (categoryRaw !== undefined && !isAssetDocumentCategory(categoryRaw)) {
    res.status(400).json({ error: "invalid_document_category" });
    return;
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (displayNameRaw !== undefined) {
    sets.push(`"displayName" = $${i++}`);
    params.push(displayNameRaw);
  }
  if (categoryRaw !== undefined) {
    sets.push(`"category" = $${i++}`);
    params.push(categoryRaw);
  }
  const pDoc = i++;
  const pAsset = i++;
  const pUser = i++;
  params.push(documentId, id, userId);

  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const upd = await client.query<{ id: string }>(
        `
        UPDATE "assetDocument" d
        SET ${sets.join(", ")}
        FROM "asset" a
        WHERE d."id" = $${pDoc}::uuid
          AND d."assetId" = $${pAsset}::uuid
          AND a."id" = d."assetId"
          AND ${siteAccessSql('a."siteId"', `$${pUser}`)}
        RETURNING d."id"
        `,
        params,
      );
      if (upd.rowCount === 0) return null;
      const { rows } = await client.query<AssetDocumentRow>(
        `${assetDocumentSelectJoin}
        WHERE d."id" = $1::uuid`,
        [documentId],
      );
      return rows[0] ?? null;
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

router.post("/", async (req: Request, res: Response) => {
  const parsed = parseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange
        ? parsed.siteId
        : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertParentRules(
        client,
        parsed.type,
        effectiveSiteId,
        parsed.parentAssetId,
      );
      await assertCostCenterForAssetSite(client, meta.userId, effectiveSiteId, parsed.costCenterId);
      const { rows } = await client.query<AssetRow>(
        `
        WITH inserted AS (
          INSERT INTO "asset"
            ("key", "name", "siteId", "type", "parentAssetId", "costCenterId", "serialNumber", "buildDate", "manufacturer", "remark")
          VALUES
            ($1, $2, $3::uuid, $4, $5::uuid, $6::uuid, $7, $8::date, $9, $10)
          RETURNING *
        )
        SELECT
          i."id",
          i."key",
          i."name",
          i."siteId",
          s."key" AS "siteKey",
          s."name" AS "siteName",
          s."colorHex" AS "siteColorHex",
          i."type",
          i."parentAssetId",
          parent."key" AS "parentAssetKey",
          parent."name" AS "parentAssetName",
          parent."type" AS "parentAssetType",
          i."costCenterId",
          cc."key" AS "costCenterKey",
          cc."name" AS "costCenterName",
          i."serialNumber",
          i."buildDate"::text AS "buildDate",
          i."manufacturer",
          i."remark",
          i."createdAt",
          i."updatedAt",
          COALESCE(created_by."loginName", i."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", i."updatedBy"::text) AS "updatedBy",
          COALESCE(doc_counts."documentCount", 0)::int AS "documentCount"
        FROM inserted i
        JOIN "site" s ON s."id" = i."siteId"
        LEFT JOIN "costCenter" cc ON cc."id" = i."costCenterId"
        LEFT JOIN "asset" parent ON parent."id" = i."parentAssetId"
        LEFT JOIN "users" created_by ON created_by."id" = i."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = i."updatedBy"
        LEFT JOIN (
          SELECT "assetId", COUNT(*)::int AS "documentCount"
          FROM "assetDocument"
          GROUP BY "assetId"
        ) doc_counts ON doc_counts."assetId" = i."id"
        `,
        [
          parsed.key,
          parsed.name,
          effectiveSiteId,
          parsed.type,
          parsed.parentAssetId,
          parsed.costCenterId,
          parsed.serialNumber,
          parsed.buildDate,
          parsed.manufacturer,
          parsed.remark,
        ],
      );
      return rows[0];
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    if ((err as Error).message === "user_not_found") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if ((err as Error).message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if ((err as Error).message === "asset_parent_not_found") {
      res.status(400).json({ error: "invalid_parent_asset" });
      return;
    }
    if ((err as Error).message === "asset_parent_type_invalid") {
      res.status(400).json({ error: "invalid_parent_type" });
      return;
    }
    if ((err as Error).message === "asset_parent_site_mismatch") {
      res.status(400).json({ error: "invalid_parent_site" });
      return;
    }
    if ((err as Error).message === "asset_cost_center_invalid") {
      res.status(400).json({ error: "invalid_cost_center" });
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
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<Pick<AssetRow, "id" | "siteId">>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "asset"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (existing.rowCount === 0) {
        return null;
      }
      const storedSiteId = existing.rows[0]!.siteId;
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? parsed.siteId : storedSiteId;

      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertParentRules(
        client,
        parsed.type,
        effectiveSiteId,
        parsed.parentAssetId,
        id,
      );
      await assertCostCenterForAssetSite(client, meta.userId, effectiveSiteId, parsed.costCenterId);

      const { rows } = await client.query<AssetRow>(
        `
        WITH updated AS (
          UPDATE "asset"
          SET
            "key" = $1,
            "name" = $2,
            "siteId" = $3::uuid,
            "type" = $4,
            "parentAssetId" = $5::uuid,
            "costCenterId" = $6::uuid,
            "serialNumber" = $7,
            "buildDate" = $8::date,
            "manufacturer" = $9,
            "remark" = $10
          WHERE "id" = $11::uuid
          RETURNING *
        )
        SELECT
          u."id",
          u."key",
          u."name",
          u."siteId",
          s."key" AS "siteKey",
          s."name" AS "siteName",
          s."colorHex" AS "siteColorHex",
          u."type",
          u."parentAssetId",
          parent."key" AS "parentAssetKey",
          parent."name" AS "parentAssetName",
          parent."type" AS "parentAssetType",
          u."costCenterId",
          cc."key" AS "costCenterKey",
          cc."name" AS "costCenterName",
          u."serialNumber",
          u."buildDate"::text AS "buildDate",
          u."manufacturer",
          u."remark",
          u."createdAt",
          u."updatedAt",
          COALESCE(created_by."loginName", u."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", u."updatedBy"::text) AS "updatedBy",
          COALESCE(doc_counts."documentCount", 0)::int AS "documentCount"
        FROM updated u
        JOIN "site" s ON s."id" = u."siteId"
        LEFT JOIN "costCenter" cc ON cc."id" = u."costCenterId"
        LEFT JOIN "asset" parent ON parent."id" = u."parentAssetId"
        LEFT JOIN "users" created_by ON created_by."id" = u."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = u."updatedBy"
        LEFT JOIN (
          SELECT "assetId", COUNT(*)::int AS "documentCount"
          FROM "assetDocument"
          GROUP BY "assetId"
        ) doc_counts ON doc_counts."assetId" = u."id"
        `,
        [
          parsed.key,
          parsed.name,
          effectiveSiteId,
          parsed.type,
          parsed.parentAssetId,
          parsed.costCenterId,
          parsed.serialNumber,
          parsed.buildDate,
          parsed.manufacturer,
          parsed.remark,
          id,
        ],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "user_not_found") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (message === "asset_parent_not_found") {
      res.status(400).json({ error: "invalid_parent_asset" });
      return;
    }
    if (message === "asset_parent_type_invalid") {
      res.status(400).json({ error: "invalid_parent_type" });
      return;
    }
    if (message === "asset_parent_site_mismatch") {
      res.status(400).json({ error: "invalid_parent_site" });
      return;
    }
    if (message === "asset_parent_self") {
      res.status(400).json({ error: "invalid_parent_self" });
      return;
    }
    if (message === "asset_parent_cycle") {
      res.status(400).json({ error: "invalid_parent_cycle" });
      return;
    }
    if (message === "asset_cost_center_invalid") {
      res.status(400).json({ error: "invalid_cost_center" });
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
    const deleted = await withAuditContext(meta, async (client) => {
      const result: QueryResult = await client.query(
        `
        DELETE FROM "asset"
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
    res.status(204).send();
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

export const assetsRouter = router;
