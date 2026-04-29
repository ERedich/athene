import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

export type ClassificationRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  appliesToMaterial: boolean;
  appliesToAsset: boolean;
  appliesToWorkOrder: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function parseBody(body: unknown): {
  key: string;
  name: string;
  siteId: string;
  appliesToMaterial: boolean;
  appliesToAsset: boolean;
  appliesToWorkOrder: boolean;
} | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const appliesToMaterial = Boolean(o.appliesToMaterial);
  const appliesToAsset = Boolean(o.appliesToAsset);
  const appliesToWorkOrder = Boolean(o.appliesToWorkOrder);
  if (!key || !name || !isUuid(siteId)) return null;
  if (!appliesToMaterial && !appliesToAsset && !appliesToWorkOrder) return null;
  return {
    key,
    name,
    siteId,
    appliesToMaterial,
    appliesToAsset,
    appliesToWorkOrder,
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

const selectClassificationsSql = `
  SELECT
    c."id",
    c."key",
    c."name",
    c."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    c."appliesToMaterial",
    c."appliesToAsset",
    c."appliesToWorkOrder",
    c."createdAt",
    c."updatedAt",
    COALESCE(created_by."loginName", c."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", c."updatedBy"::text) AS "updatedBy"
  FROM "classification" c
  JOIN "site" s ON s."id" = c."siteId"
  LEFT JOIN "users" created_by ON created_by."id" = c."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = c."updatedBy"
`;

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<ClassificationRow>(
      `
      ${selectClassificationsSql}
      WHERE ${siteAccessSql('c."siteId"', "$1")}
      ORDER BY c."key" ASC
      `,
      [userId],
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = parseBody(req.body);
  if (!parsed) {
    const o = req.body === null || typeof req.body !== "object" ? null : (req.body as Record<string, unknown>);
    const siteId = typeof o?.siteId === "string" ? o.siteId.trim() : "";
    const key = typeof o?.key === "string" ? o.key.trim() : "";
    const name = typeof o?.name === "string" ? o.name.trim() : "";
    const appliesToMaterial = Boolean(o?.appliesToMaterial);
    const appliesToAsset = Boolean(o?.appliesToAsset);
    const appliesToWorkOrder = Boolean(o?.appliesToWorkOrder);
    if (key && name && isUuid(siteId) && !appliesToMaterial && !appliesToAsset && !appliesToWorkOrder) {
      res.status(400).json({ error: "classification_scope_required" });
      return;
    }
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { key, name, siteId, appliesToMaterial, appliesToAsset, appliesToWorkOrder } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      const { rows } = await client.query<ClassificationRow>(
        `
        WITH inserted AS (
          INSERT INTO "classification" (
            "key",
            "name",
            "siteId",
            "appliesToMaterial",
            "appliesToAsset",
            "appliesToWorkOrder"
          )
          VALUES ($1, $2, $3::uuid, $4, $5, $6)
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
          i."appliesToMaterial",
          i."appliesToAsset",
          i."appliesToWorkOrder",
          i."createdAt",
          i."updatedAt",
          COALESCE(created_by."loginName", i."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", i."updatedBy"::text) AS "updatedBy"
        FROM inserted i
        JOIN "site" s ON s."id" = i."siteId"
        LEFT JOIN "users" created_by ON created_by."id" = i."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = i."updatedBy"
        `,
        [key, name, effectiveSiteId, appliesToMaterial, appliesToAsset, appliesToWorkOrder],
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
    const o = req.body === null || typeof req.body !== "object" ? null : (req.body as Record<string, unknown>);
    const siteId = typeof o?.siteId === "string" ? o.siteId.trim() : "";
    const key = typeof o?.key === "string" ? o.key.trim() : "";
    const name = typeof o?.name === "string" ? o.name.trim() : "";
    const appliesToMaterial = Boolean(o?.appliesToMaterial);
    const appliesToAsset = Boolean(o?.appliesToAsset);
    const appliesToWorkOrder = Boolean(o?.appliesToWorkOrder);
    if (key && name && isUuid(siteId) && !appliesToMaterial && !appliesToAsset && !appliesToWorkOrder) {
      res.status(400).json({ error: "classification_scope_required" });
      return;
    }
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { key, name, siteId, appliesToMaterial, appliesToAsset, appliesToWorkOrder } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<Pick<ClassificationRow, "id" | "siteId">>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "classification"
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
      const effectiveSiteId = allowSiteChange ? siteId : storedSiteId;
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      const { rows } = await client.query<ClassificationRow>(
        `
        WITH updated AS (
          UPDATE "classification"
          SET
            "key" = $1,
            "name" = $2,
            "siteId" = $3::uuid,
            "appliesToMaterial" = $4,
            "appliesToAsset" = $5,
            "appliesToWorkOrder" = $6
          WHERE "id" = $7::uuid
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
          u."appliesToMaterial",
          u."appliesToAsset",
          u."appliesToWorkOrder",
          u."createdAt",
          u."updatedAt",
          COALESCE(created_by."loginName", u."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", u."updatedBy"::text) AS "updatedBy"
        FROM updated u
        JOIN "site" s ON s."id" = u."siteId"
        LEFT JOIN "users" created_by ON created_by."id" = u."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = u."updatedBy"
        `,
        [key, name, effectiveSiteId, appliesToMaterial, appliesToAsset, appliesToWorkOrder, id],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
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
        DELETE FROM "classification"
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

export const classificationsRouter = router;
