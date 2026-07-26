import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

export type CustomerRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type CustomerWriteBody = {
  key: string;
  name: string;
  siteId: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseBody(body: unknown): CustomerWriteBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  if (!key || !name || !isUuid(siteId)) return null;
  return {
    key,
    name,
    siteId,
    street: optionalText(o.street),
    zip: optionalText(o.zip),
    city: optionalText(o.city),
    country: optionalText(o.country),
    contactName: optionalText(o.contactName),
    phone: optionalText(o.phone),
    email: optionalText(o.email),
    isActive,
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

const selectCustomersSql = `
  SELECT
    c."id",
    c."key",
    c."name",
    c."siteId",
    site."key" AS "siteKey",
    site."name" AS "siteName",
    site."colorHex" AS "siteColorHex",
    c."street",
    c."zip",
    c."city",
    c."country",
    c."contactName",
    c."phone",
    c."email",
    c."isActive",
    c."createdAt",
    c."updatedAt",
    COALESCE(created_by."loginName", c."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", c."updatedBy"::text) AS "updatedBy"
  FROM "customer" c
  JOIN "site" site ON site."id" = c."siteId"
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
    const { rows } = await pool.query<CustomerRow>(
      `
      ${selectCustomersSql}
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
    const { rows } = await pool.query<CustomerRow>(
      `
      ${selectCustomersSql}
      WHERE c."id" = $1::uuid
        AND ${siteAccessSql('c."siteId"', "$2")}
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
      const { rows } = await client.query<CustomerRow>(
        `
        WITH inserted AS (
          INSERT INTO "customer" (
            "key", "name", "siteId", "street", "zip", "city", "country",
            "contactName", "phone", "email", "isActive"
          )
          VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        )
        SELECT
          i."id", i."key", i."name", i."siteId",
          site."key" AS "siteKey", site."name" AS "siteName", site."colorHex" AS "siteColorHex",
          i."street", i."zip", i."city", i."country",
          i."contactName", i."phone", i."email", i."isActive",
          i."createdAt", i."updatedAt",
          COALESCE(created_by."loginName", i."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", i."updatedBy"::text) AS "updatedBy"
        FROM inserted i
        JOIN "site" site ON site."id" = i."siteId"
        LEFT JOIN "users" created_by ON created_by."id" = i."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = i."updatedBy"
        `,
        [
          parsed.key,
          parsed.name,
          effectiveSiteId,
          parsed.street,
          parsed.zip,
          parsed.city,
          parsed.country,
          parsed.contactName,
          parsed.phone,
          parsed.email,
          parsed.isActive,
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
    const msg = (err as Error).message;
    if (msg === "user_not_found" || msg === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (msg === "site_access_denied") {
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
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "customer"
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
      const { rows } = await client.query<CustomerRow>(
        `
        WITH updated AS (
          UPDATE "customer"
          SET
            "key" = $1,
            "name" = $2,
            "siteId" = $3::uuid,
            "street" = $4,
            "zip" = $5,
            "city" = $6,
            "country" = $7,
            "contactName" = $8,
            "phone" = $9,
            "email" = $10,
            "isActive" = $11
          WHERE "id" = $12::uuid
          RETURNING *
        )
        SELECT
          u."id", u."key", u."name", u."siteId",
          site."key" AS "siteKey", site."name" AS "siteName", site."colorHex" AS "siteColorHex",
          u."street", u."zip", u."city", u."country",
          u."contactName", u."phone", u."email", u."isActive",
          u."createdAt", u."updatedAt",
          COALESCE(created_by."loginName", u."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", u."updatedBy"::text) AS "updatedBy"
        FROM updated u
        JOIN "site" site ON site."id" = u."siteId"
        LEFT JOIN "users" created_by ON created_by."id" = u."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = u."updatedBy"
        `,
        [
          parsed.key,
          parsed.name,
          effectiveSiteId,
          parsed.street,
          parsed.zip,
          parsed.city,
          parsed.country,
          parsed.contactName,
          parsed.phone,
          parsed.email,
          parsed.isActive,
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
    const msg = (err as Error).message;
    if (msg === "user_not_found" || msg === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (msg === "site_access_denied") {
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
        DELETE FROM "customer"
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

export const customersRouter = router;
