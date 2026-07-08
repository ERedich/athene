import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { QueryResult } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

export type EmployeeRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  isShiftPlanning: boolean;
  hasPhoto: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_MAX_BYTES },
});

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function parseBody(
  body: unknown,
): { key: string; name: string; siteId: string; isActive: boolean; isShiftPlanning: boolean } | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  const isShiftPlanning = o.isShiftPlanning === undefined ? false : Boolean(o.isShiftPlanning);
  if (!key || !name || !isUuid(siteId)) return null;
  return { key, name, siteId, isActive, isShiftPlanning };
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

const selectEmployeesSql = `
  SELECT
    e."id",
    e."key",
    e."name",
    e."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    e."isActive",
    e."isShiftPlanning",
    (e."photoContent" IS NOT NULL) AS "hasPhoto",
    e."createdAt",
    e."updatedAt",
    COALESCE(created_by."loginName", e."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", e."updatedBy"::text) AS "updatedBy"
  FROM "employee" e
  JOIN "site" s ON s."id" = e."siteId"
  LEFT JOIN "users" created_by ON created_by."id" = e."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = e."updatedBy"
`;

function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("image/");
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<EmployeeRow>(
      `
      ${selectEmployeesSql}
      WHERE ${siteAccessSql('e."siteId"', "$1")}
      ORDER BY e."key" ASC
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
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { key, name, siteId, isActive, isShiftPlanning } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      const { rows } = await client.query<EmployeeRow>(
        `
        WITH inserted AS (
          INSERT INTO "employee" ("key", "name", "siteId", "isActive", "isShiftPlanning")
          VALUES ($1, $2, $3::uuid, $4, $5)
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
          i."isActive",
          i."isShiftPlanning",
          (i."photoContent" IS NOT NULL) AS "hasPhoto",
          i."createdAt",
          i."updatedAt",
          COALESCE(created_by."loginName", i."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", i."updatedBy"::text) AS "updatedBy"
        FROM inserted i
        JOIN "site" s ON s."id" = i."siteId"
        LEFT JOIN "users" created_by ON created_by."id" = i."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = i."updatedBy"
        `,
        [key, name, effectiveSiteId, isActive, isShiftPlanning],
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
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { key, name, siteId, isActive, isShiftPlanning } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<Pick<EmployeeRow, "id" | "siteId">>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "employee"
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
      const { rows } = await client.query<EmployeeRow>(
        `
        WITH updated AS (
          UPDATE "employee"
          SET "key" = $1, "name" = $2, "siteId" = $3::uuid, "isActive" = $4, "isShiftPlanning" = $5
          WHERE "id" = $6::uuid
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
          u."isActive",
          u."isShiftPlanning",
          (u."photoContent" IS NOT NULL) AS "hasPhoto",
          u."createdAt",
          u."updatedAt",
          COALESCE(created_by."loginName", u."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", u."updatedBy"::text) AS "updatedBy"
        FROM updated u
        JOIN "site" s ON s."id" = u."siteId"
        LEFT JOIN "users" created_by ON created_by."id" = u."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = u."updatedBy"
        `,
        [key, name, effectiveSiteId, isActive, isShiftPlanning, id],
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
  try {
    const { rows } = await pool.query<{
      photoMimeType: string | null;
      photoContent: Buffer | null;
    }>(
      `
      SELECT e."photoMimeType", e."photoContent"
      FROM "employee" e
      WHERE e."id" = $1::uuid
        AND e."photoContent" IS NOT NULL
        AND ${siteAccessSql('e."siteId"', "$2")}
      `,
      [id, userId],
    );
    const row = rows[0];
    if (!row?.photoContent) {
      res.status(404).json({ error: "not_found" });
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

router.post("/:id/photo", upload.single("file"), async (req: Request, res: Response) => {
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
  try {
    const meta = auditMeta(req);
    const updated = await withAuditContext(meta, async (client) => {
      const result = await client.query(
        `
        UPDATE "employee"
        SET "photoMimeType" = $1, "photoContent" = $2
        WHERE "id" = $3::uuid
          AND ${siteAccessSql('"siteId"', "$4")}
        `,
        [mimeType, content, id, meta.userId],
      );
      return result.rowCount ?? 0;
    });
    if (updated === 0) {
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
        UPDATE "employee"
        SET "photoMimeType" = NULL, "photoContent" = NULL
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
    res.status(204).send();
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
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
        DELETE FROM "employee"
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

export const employeesRouter = router;
