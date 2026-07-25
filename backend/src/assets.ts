import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { QueryResult, QueryResultRow } from "pg";

import {
  getAllowSiteChange,
  getAssetKeyGenerationMode,
  getShowAssetKeyPath,
  getWorkingSiteId,
} from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertClassificationForSiteAndScope } from "./classificationAssert.js";
import {
  DOCUMENT_MAX_BYTES,
  assetDocumentCountSubquery,
  assetDocumentCountSubqueryOnInsert,
  assetDocumentCountSubqueryOnUpdate,
  assetWorkOrderCountSubquery,
  assetWorkOrderCountSubqueryOnInsert,
  assetWorkOrderCountSubqueryOnUpdate,
  assetInspectionPointCountSubquery,
  assetInspectionPointCountSubqueryOnInsert,
  assetInspectionPointCountSubqueryOnUpdate,
  createDocument,
  deleteDocumentForEntity,
  getDocumentContentForAsset,
  isDocumentCategory,
  listAssetDocuments,
  patchDocumentForEntity,
  type DocumentCategory,
} from "./documents/index.js";
import {
  deleteAssetEmbeddings,
  reindexAsset,
  scheduleReindex,
} from "./assistant/embedding/index.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

type AssetType = "site" | "structure" | "line" | "maintenanceObject";

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
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
  workOrderCount: number;
  inspectionPointCount: number;
  /** Present when GN-SAKP enabled; computed server-side. */
  keyPath: string | null;
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
  classificationId: string | null;
};

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES },
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
function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function isAssetType(value: unknown): value is AssetType {
  return typeof value === "string" && (allowedTypes as string[]).includes(value);
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
  const classificationIdRaw = readTrimmedOptionalString(o.classificationId);

  if (!name || !isUuid(siteId) || !isAssetType(type)) return null;
  if (parentAssetIdRaw !== null && !isUuid(parentAssetIdRaw)) return null;
  if (costCenterIdRaw !== null && !isUuid(costCenterIdRaw)) return null;
  if (classificationIdRaw !== null && !isUuid(classificationIdRaw)) return null;
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
    classificationId: classificationIdRaw,
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

const selectAssetsSqlBase = `
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
    a."classificationId",
    clf."key" AS "classificationKey",
    clf."name" AS "classificationName",
    a."createdAt",
    a."updatedAt",
    COALESCE(created_by."loginName", a."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", a."updatedBy"::text) AS "updatedBy",
    COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
    COALESCE(wo_counts."workOrderCount", 0)::int AS "workOrderCount",
    COALESCE(ip_counts."inspectionPointCount", 0)::int AS "inspectionPointCount",
    NULL::text AS "keyPath"
  FROM "asset" a
  JOIN "site" s ON s."id" = a."siteId"
  LEFT JOIN "costCenter" cc ON cc."id" = a."costCenterId"
  LEFT JOIN "classification" clf ON clf."id" = a."classificationId"
  LEFT JOIN "asset" parent ON parent."id" = a."parentAssetId"
  LEFT JOIN "users" created_by ON created_by."id" = a."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = a."updatedBy"
  ${assetDocumentCountSubquery}
  ${assetWorkOrderCountSubquery}
  ${assetInspectionPointCountSubquery}
`;

/** Same as selectAssetsSql but computes keyPath when $2 is the separator character. $1 = site-access user id. */
const selectAssetsSqlWithKeyPath = `
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
    a."classificationId",
    clf."key" AS "classificationKey",
    clf."name" AS "classificationName",
    a."createdAt",
    a."updatedAt",
    COALESCE(created_by."loginName", a."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", a."updatedBy"::text) AS "updatedBy",
    COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
    COALESCE(wo_counts."workOrderCount", 0)::int AS "workOrderCount",
    COALESCE(ip_counts."inspectionPointCount", 0)::int AS "inspectionPointCount",
    (
      s."key" || $2::text || COALESCE(
        (
          WITH RECURSIVE up AS (
            SELECT a2."id", a2."parentAssetId", a2."key", 0 AS lvl
            FROM "asset" a2
            WHERE a2."id" = a."id"
            UNION ALL
            SELECT p."id", p."parentAssetId", p."key", up.lvl + 1
            FROM "asset" p
            INNER JOIN up ON p."id" = up."parentAssetId"
          )
          SELECT string_agg(up."key", $2::text ORDER BY up.lvl DESC)
          FROM up
        ),
        ''
      )
    ) AS "keyPath"
  FROM "asset" a
  JOIN "site" s ON s."id" = a."siteId"
  LEFT JOIN "costCenter" cc ON cc."id" = a."costCenterId"
  LEFT JOIN "classification" clf ON clf."id" = a."classificationId"
  LEFT JOIN "asset" parent ON parent."id" = a."parentAssetId"
  LEFT JOIN "users" created_by ON created_by."id" = a."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = a."updatedBy"
  ${assetDocumentCountSubquery}
  ${assetWorkOrderCountSubquery}
  ${assetInspectionPointCountSubquery}
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

async function allocateNextPlantAssetKey(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  siteId: string,
  siteKey: string,
): Promise<string> {
  await client.query(
    `
    INSERT INTO "assetPlantKeySeq" ("siteId", "nextNum")
    VALUES ($1::uuid, 100001)
    ON CONFLICT ("siteId") DO NOTHING
    `,
    [siteId],
  );
  const locked = await client.query<{ nextNum: number }>(
    `
    SELECT "nextNum" FROM "assetPlantKeySeq"
    WHERE "siteId" = $1::uuid
    FOR UPDATE
    `,
    [siteId],
  );
  const nextNum = locked.rows[0]?.nextNum;
  if (nextNum === undefined) {
    throw new Error("asset_seq_missing");
  }
  await client.query(
    `
    UPDATE "assetPlantKeySeq"
    SET "nextNum" = "nextNum" + 1
    WHERE "siteId" = $1::uuid
    `,
    [siteId],
  );
  const padded = String(nextNum).padStart(6, "0");
  return `${siteKey}-${padded}`;
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const sakp = await getShowAssetKeyPath(pool);
    const listSql = sakp.show ? selectAssetsSqlWithKeyPath : selectAssetsSqlBase;
    const listParams: unknown[] = sakp.show ? [userId, sakp.separator] : [userId];
    const { rows } = await pool.query<AssetRow>(
      `
      ${listSql}
      WHERE ${siteAccessSql('a."siteId"', "$1")}
      ORDER BY a."key" ASC
      `,
      listParams,
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

/** Compact lookup by business key for SelItem direct entry (must be before /:id routes). */
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
      costCenterId: string | null;
    }>(
      `
      SELECT
        a."id",
        a."key",
        a."name",
        a."siteId",
        a."costCenterId"
      FROM "asset" a
      WHERE a."key" = $2
        AND ${siteAccessSql('a."siteId"', "$1")}
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

/** Thin typeahead for search panels — must stay before `/:id` routes. */
router.get("/suggest", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 1) {
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
      siteFilter = `AND a."siteId" = $${i++}::uuid`;
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
        a."id",
        a."key",
        a."name",
        a."siteId"
      FROM "asset" a
      WHERE ${siteAccessSql('a."siteId"', "$1")}
        ${siteFilter}
        AND (
          a."key" ILIKE $${keyPrefixParam}
          OR a."name" ILIKE $${nameContainsParam}
        )
      ORDER BY
        CASE WHEN a."key" ILIKE $${keyPrefixParam} THEN 0 ELSE 1 END,
        a."key" ASC
      LIMIT $${limitParam}::int
      `,
      params,
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

/** Hydrate MultiSelect chips for selected asset UUIDs without a full asset dump. */
router.get("/by-ids", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const raw = req.query.ids;
  const idList = (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [])
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => isUuid(v));
  const uniqueIds = [...new Set(idList)].slice(0, 100);
  if (uniqueIds.length === 0) {
    res.json([]);
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
        a."id",
        a."key",
        a."name",
        a."siteId"
      FROM "asset" a
      WHERE ${siteAccessSql('a."siteId"', "$1")}
        AND a."id" = ANY($2::uuid[])
      ORDER BY a."key" ASC
      `,
      [userId, uniqueIds],
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
    const rows = await listAssetDocuments(userId, id);
    if (rows === null) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

export type InspectionPointType = "inspection" | "lubrication";

export type InspectionPointRow = {
  id: string;
  assetId: string;
  key: string;
  name: string;
  type: InspectionPointType;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

function isInspectionPointType(value: unknown): value is InspectionPointType {
  return value === "inspection" || value === "lubrication";
}

function parseInspectionPointBody(
  body: unknown,
): { key: string; name: string; type: InspectionPointType } | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const typeRaw = o.type === undefined ? "inspection" : o.type;
  if (!key || !name || !isInspectionPointType(typeRaw)) return null;
  return { key, name, type: typeRaw };
}

const selectInspectionPointSql = `
  SELECT
    ip."id",
    ip."assetId",
    ip."key",
    ip."name",
    ip."type",
    ip."createdAt",
    ip."updatedAt",
    COALESCE(created_by."loginName", ip."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", ip."updatedBy"::text) AS "updatedBy"
  FROM "inspectionPoint" ip
  LEFT JOIN "users" created_by ON created_by."id" = ip."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = ip."updatedBy"
`;

router.get("/:id/inspection-points", async (req: Request, res: Response) => {
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
    const { rows } = await pool.query<InspectionPointRow>(
      `
      ${selectInspectionPointSql}
      WHERE ip."assetId" = $1::uuid
      ORDER BY ip."key" ASC
      `,
      [id],
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/:id/inspection-points", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = parseInspectionPointBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const asset = await getAccessibleAsset(meta.userId, id);
      if (!asset) throw new Error("not_found");
      const { rows } = await client.query<InspectionPointRow>(
        `
        WITH inserted AS (
          INSERT INTO "inspectionPoint" ("assetId", "key", "name", "type")
          VALUES ($1::uuid, $2, $3, $4)
          RETURNING *
        )
        ${selectInspectionPointSql.replace('FROM "inspectionPoint" ip', "FROM inserted ip")}
        `,
        [id, parsed.key, parsed.name, parsed.type],
      );
      return rows[0];
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    if ((err as Error).message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

router.put("/:id/inspection-points/:pointId", async (req: Request, res: Response) => {
  const { id, pointId } = req.params;
  if (!isUuid(id) || !isUuid(pointId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = parseInspectionPointBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const asset = await getAccessibleAsset(meta.userId, id);
      if (!asset) throw new Error("not_found");
      const { rows } = await client.query<InspectionPointRow>(
        `
        WITH updated AS (
          UPDATE "inspectionPoint"
          SET "key" = $1, "name" = $2, "type" = $3
          WHERE "id" = $4::uuid AND "assetId" = $5::uuid
          RETURNING *
        )
        ${selectInspectionPointSql.replace('FROM "inspectionPoint" ip', "FROM updated ip")}
        `,
        [parsed.key, parsed.name, parsed.type, pointId, id],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    if ((err as Error).message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

router.delete("/:id/inspection-points/:pointId", async (req: Request, res: Response) => {
  const { id, pointId } = req.params;
  if (!isUuid(id) || !isUuid(pointId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const deleted = await withAuditContext(meta, async (client) => {
      const asset = await getAccessibleAsset(meta.userId, id);
      if (!asset) throw new Error("not_found");
      const { rowCount } = await client.query(
        `DELETE FROM "inspectionPoint" WHERE "id" = $1::uuid AND "assetId" = $2::uuid`,
        [pointId, id],
      );
      return (rowCount ?? 0) > 0;
    });
    if (!deleted) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    if ((err as Error).message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
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
      category: categoryRaw,
      mimeType,
      fileSize,
      content,
      referenceApp: "assets",
      entityType: "asset",
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
    const doc = await getDocumentContentForAsset(userId, id, documentId);
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
    const deleted = await deleteDocumentForEntity(meta, "asset", id, documentId);
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

  const patch: { displayName?: string; category?: DocumentCategory } = {};
  if (displayNameRaw !== undefined) patch.displayName = displayNameRaw;
  if (categoryRaw !== undefined) patch.category = categoryRaw;

  try {
    const meta = auditMeta(req);
    const row = await patchDocumentForEntity(meta, "asset", id, documentId, patch);
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
      await assertClassificationForSiteAndScope(
        client,
        meta.userId,
        effectiveSiteId,
        parsed.classificationId,
        "asset",
      );
      const mode = await getAssetKeyGenerationMode(client);
      const siteRow = await client.query<{ isPlant: boolean; key: string }>(
        `SELECT "isPlant", "key" FROM "site" WHERE "id" = $1::uuid LIMIT 1`,
        [effectiveSiteId],
      );
      const siteMeta = siteRow.rows[0];
      if (!siteMeta) {
        throw new Error("site_not_found");
      }
      let resolvedKey = parsed.key.trim();
      if (mode === "auto_incremental") {
        if (!siteMeta.isPlant) {
          throw new Error("asset_key_auto_requires_plant_site");
        }
        resolvedKey = await allocateNextPlantAssetKey(client, effectiveSiteId, siteMeta.key);
      } else if (!resolvedKey) {
        throw new Error("invalid_asset_key");
      }
      const { rows } = await client.query<AssetRow>(
        `
        WITH inserted AS (
          INSERT INTO "asset"
            ("key", "name", "siteId", "type", "parentAssetId", "costCenterId", "serialNumber", "buildDate", "manufacturer", "remark", "classificationId")
          VALUES
            ($1, $2, $3::uuid, $4, $5::uuid, $6::uuid, $7, $8::date, $9, $10, $11::uuid)
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
          i."classificationId",
          clf."key" AS "classificationKey",
          clf."name" AS "classificationName",
          i."serialNumber",
          i."buildDate"::text AS "buildDate",
          i."manufacturer",
          i."remark",
          i."createdAt",
          i."updatedAt",
          COALESCE(created_by."loginName", i."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", i."updatedBy"::text) AS "updatedBy",
          COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
          COALESCE(wo_counts."workOrderCount", 0)::int AS "workOrderCount",
          COALESCE(ip_counts."inspectionPointCount", 0)::int AS "inspectionPointCount",
          NULL::text AS "keyPath"
        FROM inserted i
        JOIN "site" s ON s."id" = i."siteId"
        LEFT JOIN "costCenter" cc ON cc."id" = i."costCenterId"
        LEFT JOIN "classification" clf ON clf."id" = i."classificationId"
        LEFT JOIN "asset" parent ON parent."id" = i."parentAssetId"
        LEFT JOIN "users" created_by ON created_by."id" = i."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = i."updatedBy"
        ${assetDocumentCountSubqueryOnInsert}
        ${assetWorkOrderCountSubqueryOnInsert}
        ${assetInspectionPointCountSubqueryOnInsert}
        `,
        [
          resolvedKey,
          parsed.name,
          effectiveSiteId,
          parsed.type,
          parsed.parentAssetId,
          parsed.costCenterId,
          parsed.serialNumber,
          parsed.buildDate,
          parsed.manufacturer,
          parsed.remark,
          parsed.classificationId,
        ],
      );
      return rows[0];
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
    scheduleReindex(`asset ${row.id}`, () => reindexAsset(row.id));
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
    if ((err as Error).message === "invalid_classification") {
      res.status(400).json({ error: "invalid_classification" });
      return;
    }
    if ((err as Error).message === "asset_key_auto_requires_plant_site") {
      res.status(400).json({ error: "asset_key_auto_requires_plant_site" });
      return;
    }
    if ((err as Error).message === "invalid_asset_key") {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    if ((err as Error).message === "site_not_found") {
      res.status(400).json({ error: "invalid_body" });
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
      const existing = await client.query<Pick<AssetRow, "id" | "siteId" | "key">>(
        `
        SELECT "id", "siteId"::text AS "siteId", "key"
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
      const storedKey = existing.rows[0]!.key;
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
      await assertClassificationForSiteAndScope(
        client,
        meta.userId,
        effectiveSiteId,
        parsed.classificationId,
        "asset",
      );

      const mode = await getAssetKeyGenerationMode(client);
      const sitePlant = await client.query<{ isPlant: boolean }>(
        `SELECT "isPlant" FROM "site" WHERE "id" = $1::uuid LIMIT 1`,
        [effectiveSiteId],
      );
      const isPlantSite = sitePlant.rows[0]?.isPlant === true;
      let keyForUpdate: string;
      if (mode === "auto_incremental" && isPlantSite) {
        keyForUpdate = storedKey;
      } else {
        const trimmed = parsed.key.trim();
        if (!trimmed) {
          throw new Error("invalid_asset_key");
        }
        keyForUpdate = trimmed;
      }

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
            "remark" = $10,
            "classificationId" = $11::uuid
          WHERE "id" = $12::uuid
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
          u."classificationId",
          clf."key" AS "classificationKey",
          clf."name" AS "classificationName",
          u."serialNumber",
          u."buildDate"::text AS "buildDate",
          u."manufacturer",
          u."remark",
          u."createdAt",
          u."updatedAt",
          COALESCE(created_by."loginName", u."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", u."updatedBy"::text) AS "updatedBy",
          COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
          COALESCE(wo_counts."workOrderCount", 0)::int AS "workOrderCount",
          COALESCE(ip_counts."inspectionPointCount", 0)::int AS "inspectionPointCount",
          NULL::text AS "keyPath"
        FROM updated u
        JOIN "site" s ON s."id" = u."siteId"
        LEFT JOIN "costCenter" cc ON cc."id" = u."costCenterId"
        LEFT JOIN "classification" clf ON clf."id" = u."classificationId"
        LEFT JOIN "asset" parent ON parent."id" = u."parentAssetId"
        LEFT JOIN "users" created_by ON created_by."id" = u."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = u."updatedBy"
        ${assetDocumentCountSubqueryOnUpdate}
        ${assetWorkOrderCountSubqueryOnUpdate}
        ${assetInspectionPointCountSubqueryOnUpdate}
        `,
        [
          keyForUpdate,
          parsed.name,
          effectiveSiteId,
          parsed.type,
          parsed.parentAssetId,
          parsed.costCenterId,
          parsed.serialNumber,
          parsed.buildDate,
          parsed.manufacturer,
          parsed.remark,
          parsed.classificationId,
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
    scheduleReindex(`asset ${row.id}`, () => reindexAsset(row.id));
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
    if (message === "invalid_classification") {
      res.status(400).json({ error: "invalid_classification" });
      return;
    }
    if (message === "invalid_asset_key") {
      res.status(400).json({ error: "invalid_body" });
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
    scheduleReindex(`delete asset ${id}`, () => deleteAssetEmbeddings(id));
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

export const assetsRouter = router;
