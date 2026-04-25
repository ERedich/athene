import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult } from "pg";

import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";

export type SiteRow = {
  id: string;
  key: string;
  name: string;
  isPlant: boolean;
  colorHex: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const defaultColorHex = "#64748b";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

/** Accepts #RGB / #RRGGBB or without #; returns normalized #rrggbb or null if invalid. */
function parseColorHexStrict(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(s);
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return `#${h.toLowerCase()}`;
}

function parseBody(body: unknown): { key: string; name: string; isPlant: boolean; colorHex: string } | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const isPlant = Boolean(o.isPlant);
  const colorHexRaw = o.colorHex;
  const colorHex =
    colorHexRaw === undefined || colorHexRaw === null || colorHexRaw === ""
      ? defaultColorHex
      : parseColorHexStrict(colorHexRaw);
  if (!key || !name || !colorHex) return null;
  return { key, name, isPlant, colorHex };
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

const selectSitesSql = `
  SELECT
    s."id",
    s."key",
    s."name",
    s."isPlant",
    s."colorHex",
    s."createdAt",
    s."updatedAt",
    COALESCE(created_by."loginName", s."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", s."updatedBy"::text) AS "updatedBy"
  FROM "site" s
  LEFT JOIN "users" created_by ON created_by."id" = s."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = s."updatedBy"
`;

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<SiteRow>(
      `
      ${selectSitesSql}
      WHERE ${siteAccessSql('s."id"', "$1")}
      ORDER BY s."key" ASC
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
  const { key, name, isPlant, colorHex } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const { rows } = await client.query<SiteRow>(
        `
        WITH inserted AS (
          INSERT INTO "site" ("key", "name", "isPlant", "colorHex")
          VALUES ($1, $2, $3, $4)
          RETURNING *
        ),
        linked AS (
          INSERT INTO "userSite" ("userId", "siteId")
          SELECT $5::uuid, i."id"
          FROM inserted i
          ON CONFLICT ("userId", "siteId") DO NOTHING
          RETURNING "siteId"
        )
        SELECT
          i."id",
          i."key",
          i."name",
          i."isPlant",
          i."colorHex",
          i."createdAt",
          i."updatedAt",
          COALESCE(created_by."loginName", i."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", i."updatedBy"::text) AS "updatedBy"
        FROM inserted i
        LEFT JOIN "users" created_by ON created_by."id" = i."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = i."updatedBy"
        `,
        [key, name, isPlant, colorHex, meta.userId],
      );
      return rows[0];
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
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
  const { key, name, isPlant, colorHex } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<Pick<SiteRow, "id">>(
        `
        SELECT "id"
        FROM "site"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"id"', "$2")}
        `,
        [id, meta.userId],
      );
      if (existing.rowCount === 0) {
        return null;
      }
      const { rows } = await client.query<SiteRow>(
        `
        WITH updated AS (
          UPDATE "site"
          SET "key" = $1, "name" = $2, "isPlant" = $3, "colorHex" = $4
          WHERE "id" = $5::uuid
          RETURNING *
        )
        SELECT
          u."id",
          u."key",
          u."name",
          u."isPlant",
          u."colorHex",
          u."createdAt",
          u."updatedAt",
          COALESCE(created_by."loginName", u."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", u."updatedBy"::text) AS "updatedBy"
        FROM updated u
        LEFT JOIN "users" created_by ON created_by."id" = u."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = u."updatedBy"
        `,
        [key, name, isPlant, colorHex, id],
      );
      return rows[0] ?? null;
    });
    if (row === null) {
      res.status(404).json({ error: "not_found" });
      return;
    }
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
        DELETE FROM "site"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"id"', "$2")}
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

export const sitesRouter = router;
