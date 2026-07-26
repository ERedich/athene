import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

export type ServiceContractBillingModel = "flat" | "timeAndMaterial";

export type ServiceContractRow = {
  id: string;
  key: string;
  name: string;
  customerId: string;
  customerKey: string;
  customerName: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  validFrom: string;
  validTo: string | null;
  reactionMinutes: number;
  resolutionMinutes: number;
  billingModel: ServiceContractBillingModel;
  hourlyRate: string | null;
  travelRate: string | null;
  materialMarkupPercent: string | null;
  flatRate: string | null;
  isActive: boolean;
  assetIds: string[];
  coveredSiteIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type ServiceContractWriteBody = {
  key: string;
  name: string;
  customerId: string;
  siteId: string;
  validFrom: string;
  validTo: string | null;
  reactionMinutes: number;
  resolutionMinutes: number;
  billingModel: ServiceContractBillingModel;
  hourlyRate: number | null;
  travelRate: number | null;
  materialMarkupPercent: number | null;
  flatRate: number | null;
  isActive: boolean;
  assetIds: string[];
  coveredSiteIds: string[];
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseUuidArray(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (!isUuid(item)) return null;
    out.push(item);
  }
  return out;
}

function parseBody(body: unknown): ServiceContractWriteBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const customerId = typeof o.customerId === "string" ? o.customerId.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const validFromRaw = typeof o.validFrom === "string" ? o.validFrom.trim() : "";
  const validFrom = validFromRaw || new Date().toISOString();
  const validTo =
    o.validTo === null || o.validTo === undefined || o.validTo === ""
      ? null
      : typeof o.validTo === "string"
        ? o.validTo.trim()
        : null;
  const reactionMinutes =
    typeof o.reactionMinutes === "number"
      ? o.reactionMinutes
      : Number(o.reactionMinutes ?? 240);
  const resolutionMinutes =
    typeof o.resolutionMinutes === "number"
      ? o.resolutionMinutes
      : Number(o.resolutionMinutes ?? 1440);
  const billingModel =
    o.billingModel === "flat" || o.billingModel === "timeAndMaterial"
      ? o.billingModel
      : null;
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  const assetIds = parseUuidArray(o.assetIds);
  const coveredSiteIds = parseUuidArray(o.coveredSiteIds);
  if (
    !key ||
    !name ||
    !isUuid(customerId) ||
    !isUuid(siteId) ||
    !Number.isFinite(reactionMinutes) ||
    reactionMinutes < 0 ||
    !Number.isFinite(resolutionMinutes) ||
    resolutionMinutes < 0 ||
    !billingModel ||
    assetIds === null ||
    coveredSiteIds === null
  ) {
    return null;
  }
  if (validTo !== null && !validTo) return null;
  return {
    key,
    name,
    customerId,
    siteId,
    validFrom,
    validTo,
    reactionMinutes,
    resolutionMinutes,
    billingModel,
    hourlyRate: optionalNumber(o.hourlyRate),
    travelRate: optionalNumber(o.travelRate),
    materialMarkupPercent: optionalNumber(o.materialMarkupPercent),
    flatRate: optionalNumber(o.flatRate),
    isActive,
    assetIds,
    coveredSiteIds,
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

const selectContractsSql = `
  SELECT
    sc."id",
    sc."key",
    sc."name",
    sc."customerId",
    cust."key" AS "customerKey",
    cust."name" AS "customerName",
    sc."siteId",
    site."key" AS "siteKey",
    site."name" AS "siteName",
    site."colorHex" AS "siteColorHex",
    sc."validFrom",
    sc."validTo",
    sc."reactionMinutes",
    sc."resolutionMinutes",
    sc."billingModel",
    sc."hourlyRate"::text AS "hourlyRate",
    sc."travelRate"::text AS "travelRate",
    sc."materialMarkupPercent"::text AS "materialMarkupPercent",
    sc."flatRate"::text AS "flatRate",
    sc."isActive",
    COALESCE(
      (
        SELECT array_agg(sca."assetId"::text ORDER BY sca."assetId")
        FROM "serviceContractAsset" sca
        WHERE sca."serviceContractId" = sc."id"
      ),
      ARRAY[]::text[]
    ) AS "assetIds",
    COALESCE(
      (
        SELECT array_agg(scs."siteId"::text ORDER BY scs."siteId")
        FROM "serviceContractSite" scs
        WHERE scs."serviceContractId" = sc."id"
      ),
      ARRAY[]::text[]
    ) AS "coveredSiteIds",
    sc."createdAt",
    sc."updatedAt",
    COALESCE(created_by."loginName", sc."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", sc."updatedBy"::text) AS "updatedBy"
  FROM "serviceContract" sc
  JOIN "customer" cust ON cust."id" = sc."customerId"
  JOIN "site" site ON site."id" = sc."siteId"
  LEFT JOIN "users" created_by ON created_by."id" = sc."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = sc."updatedBy"
`;

async function syncCoverage(
  client: { query: (sql: string, params?: unknown[]) => Promise<QueryResult> },
  contractId: string,
  assetIds: string[],
  coveredSiteIds: string[],
) {
  await client.query(`DELETE FROM "serviceContractAsset" WHERE "serviceContractId" = $1::uuid`, [
    contractId,
  ]);
  await client.query(`DELETE FROM "serviceContractSite" WHERE "serviceContractId" = $1::uuid`, [
    contractId,
  ]);
  for (const assetId of assetIds) {
    await client.query(
      `
      INSERT INTO "serviceContractAsset" ("serviceContractId", "assetId")
      VALUES ($1::uuid, $2::uuid)
      `,
      [contractId, assetId],
    );
  }
  for (const coveredSiteId of coveredSiteIds) {
    await client.query(
      `
      INSERT INTO "serviceContractSite" ("serviceContractId", "siteId")
      VALUES ($1::uuid, $2::uuid)
      `,
      [contractId, coveredSiteId],
    );
  }
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const customerId =
    typeof req.query.customerId === "string" && isUuid(req.query.customerId)
      ? req.query.customerId
      : null;
  try {
    const params: unknown[] = [userId];
    let filter = `WHERE ${siteAccessSql('sc."siteId"', "$1")}`;
    if (customerId) {
      params.push(customerId);
      filter += ` AND sc."customerId" = $${params.length}::uuid`;
    }
    const { rows } = await pool.query<ServiceContractRow>(
      `
      ${selectContractsSql}
      ${filter}
      ORDER BY sc."key" ASC
      `,
      params,
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/:id", async (req: Request, res: Response) => {
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
    const { rows } = await pool.query<ServiceContractRow>(
      `
      ${selectContractsSql}
      WHERE sc."id" = $1::uuid
        AND ${siteAccessSql('sc."siteId"', "$2")}
      `,
      [id, userId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(rows[0]);
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
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange
        ? parsed.siteId
        : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      const cust = await client.query<{ id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "customer"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [parsed.customerId, meta.userId],
      );
      if (!cust.rows[0]) throw new Error("customer_not_found");
      const { rows } = await client.query<{ id: string }>(
        `
        INSERT INTO "serviceContract" (
          "key", "name", "customerId", "siteId", "validFrom", "validTo",
          "reactionMinutes", "resolutionMinutes", "billingModel",
          "hourlyRate", "travelRate", "materialMarkupPercent", "flatRate", "isActive"
        )
        VALUES (
          $1, $2, $3::uuid, $4::uuid, $5::timestamptz, $6::timestamptz,
          $7, $8, $9, $10, $11, $12, $13, $14
        )
        RETURNING "id"
        `,
        [
          parsed.key,
          parsed.name,
          parsed.customerId,
          effectiveSiteId,
          parsed.validFrom,
          parsed.validTo,
          parsed.reactionMinutes,
          parsed.resolutionMinutes,
          parsed.billingModel,
          parsed.hourlyRate,
          parsed.travelRate,
          parsed.materialMarkupPercent,
          parsed.flatRate,
          parsed.isActive,
        ],
      );
      const contractId = rows[0]!.id;
      await syncCoverage(client, contractId, parsed.assetIds, parsed.coveredSiteIds);
      const full = await client.query<ServiceContractRow>(
        `
        ${selectContractsSql}
        WHERE sc."id" = $1::uuid
        `,
        [contractId],
      );
      return full.rows[0];
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "user_not_found" || msg === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (msg === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (msg === "customer_not_found") {
      res.status(400).json({ error: "customer_not_found" });
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
      const existing = await client.query<{ id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "serviceContract"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (existing.rowCount === 0) return null;
      const storedSiteId = existing.rows[0]!.siteId;
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? parsed.siteId : storedSiteId;
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      const cust = await client.query<{ id: string }>(
        `
        SELECT "id"
        FROM "customer"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [parsed.customerId, meta.userId],
      );
      if (!cust.rows[0]) throw new Error("customer_not_found");
      await client.query(
        `
        UPDATE "serviceContract"
        SET
          "key" = $1,
          "name" = $2,
          "customerId" = $3::uuid,
          "siteId" = $4::uuid,
          "validFrom" = $5::timestamptz,
          "validTo" = $6::timestamptz,
          "reactionMinutes" = $7,
          "resolutionMinutes" = $8,
          "billingModel" = $9,
          "hourlyRate" = $10,
          "travelRate" = $11,
          "materialMarkupPercent" = $12,
          "flatRate" = $13,
          "isActive" = $14
        WHERE "id" = $15::uuid
        `,
        [
          parsed.key,
          parsed.name,
          parsed.customerId,
          effectiveSiteId,
          parsed.validFrom,
          parsed.validTo,
          parsed.reactionMinutes,
          parsed.resolutionMinutes,
          parsed.billingModel,
          parsed.hourlyRate,
          parsed.travelRate,
          parsed.materialMarkupPercent,
          parsed.flatRate,
          parsed.isActive,
          id,
        ],
      );
      await syncCoverage(client, id, parsed.assetIds, parsed.coveredSiteIds);
      const full = await client.query<ServiceContractRow>(
        `
        ${selectContractsSql}
        WHERE sc."id" = $1::uuid
        `,
        [id],
      );
      return full.rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "user_not_found" || msg === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (msg === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (msg === "customer_not_found") {
      res.status(400).json({ error: "customer_not_found" });
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
        DELETE FROM "serviceContract"
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

export const serviceContractsRouter = router;
