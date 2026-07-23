import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import {
  defaultContextMenuPayload,
  defaultModalPayload,
  defaultTablePayload,
  defaultTabsPayload,
  getFieldCatalog,
  isAppLayoutAppKey,
  KNOWN_APP_KEYS,
  parseContextMenuPayload,
  parseModalPayload,
  parseTablePayload,
  parseTabsPayload,
  type ContextMenuLayoutPayload,
  type ModalLayoutPayload,
  type TableLayoutPayload,
  type TabsLayoutPayload,
} from "./appLayoutCatalog.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
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

export type AppLayoutRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  appKey: string;
  isSystem: boolean;
  modal: ModalLayoutPayload;
  table: TableLayoutPayload;
  contextMenu: ContextMenuLayoutPayload;
  tabs: TabsLayoutPayload;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

const selectSql = `
  SELECT
    l."id",
    l."key",
    l."name",
    l."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    l."appKey",
    l."isSystem",
    l."modal",
    l."table",
    l."contextMenu",
    l."tabs",
    l."createdAt",
    l."updatedAt",
    COALESCE(created_by."loginName", l."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", l."updatedBy"::text) AS "updatedBy"
  FROM "appLayout" l
  JOIN "site" s ON s."id" = l."siteId"
  LEFT JOIN "users" created_by ON created_by."id" = l."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = l."updatedBy"
`;

async function isAdminUser(client: { query: typeof pool.query }, userId: string): Promise<boolean> {
  const { rows } = await client.query<{ loginName: string }>(
    `SELECT u."loginName" FROM "users" u WHERE u."id" = $1::uuid LIMIT 1`,
    [userId],
  );
  return rows[0]?.loginName === "admin";
}

type ParsedWriteBody = {
  key: string;
  name: string;
  siteId: string;
  appKey: string;
  modal: ModalLayoutPayload;
  table: TableLayoutPayload;
  contextMenu: ContextMenuLayoutPayload;
  tabs: TabsLayoutPayload;
};

function parseWriteBody(body: unknown): ParsedWriteBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const appKey = typeof o.appKey === "string" ? o.appKey.trim() : "";
  if (!key || key.length > 100 || !name || name.length > 200 || !isUuid(siteId)) return null;
  if (!isAppLayoutAppKey(appKey)) return null;
  const catalog = getFieldCatalog(appKey);
  if (!catalog) return null;
  const modal = parseModalPayload(o.modal, catalog);
  const table = parseTablePayload(o.table, catalog);
  const contextMenu = parseContextMenuPayload(o.contextMenu);
  const tabs = parseTabsPayload(o.tabs ?? defaultTabsPayload());
  if (!modal || !table || !contextMenu || !tabs) return null;
  return { key, name, siteId, appKey, modal, table, contextMenu, tabs };
}

router.get("/meta", (_req: Request, res: Response) => {
  res.json({
    appKeys: KNOWN_APP_KEYS,
    catalogs: Object.fromEntries(
      KNOWN_APP_KEYS.map((appKey) => [appKey, getFieldCatalog(appKey)]),
    ),
  });
});

router.get("/active", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const siteIdRaw = typeof req.query.siteId === "string" ? req.query.siteId.trim() : "";
  const appKeyRaw = typeof req.query.appKey === "string" ? req.query.appKey.trim() : "";
  if (!isUuid(siteIdRaw)) {
    res.status(400).json({ error: "invalid_siteId" });
    return;
  }
  if (!isAppLayoutAppKey(appKeyRaw)) {
    res.status(400).json({ error: "invalid_appKey" });
    return;
  }
  try {
    await assertSiteAccess(pool, userId, siteIdRaw);
    const { rows: customRows } = await pool.query<AppLayoutRow>(
      `
      ${selectSql}
      WHERE l."siteId" = $2::uuid
        AND l."appKey" = $3
        AND l."isSystem" = false
        AND ${siteAccessSql('l."siteId"', "$1")}
      ORDER BY l."updatedAt" DESC
      LIMIT 1
      `,
      [userId, siteIdRaw, appKeyRaw],
    );
    if (customRows[0]) {
      res.json(customRows[0]);
      return;
    }
    const { rows: systemRows } = await pool.query<AppLayoutRow>(
      `
      ${selectSql}
      WHERE l."siteId" = $2::uuid
        AND l."appKey" = $3
        AND l."isSystem" = true
        AND ${siteAccessSql('l."siteId"', "$1")}
      ORDER BY l."updatedAt" DESC
      LIMIT 1
      `,
      [userId, siteIdRaw, appKeyRaw],
    );
    if (!systemRows[0]) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(systemRows[0]);
  } catch (err) {
    if ((err as Error).message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    sendPgError(res, err);
  }
});

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const siteIdRaw = typeof req.query.siteId === "string" ? req.query.siteId.trim() : "";
  const appKeyRaw = typeof req.query.appKey === "string" ? req.query.appKey.trim() : "";
  try {
    const params: unknown[] = [userId];
    let where = `WHERE ${siteAccessSql('l."siteId"', "$1")}`;
    if (siteIdRaw) {
      if (!isUuid(siteIdRaw)) {
        res.status(400).json({ error: "invalid_siteId" });
        return;
      }
      params.push(siteIdRaw);
      where += ` AND l."siteId" = $${params.length}::uuid`;
    }
    if (appKeyRaw) {
      if (!isAppLayoutAppKey(appKeyRaw)) {
        res.status(400).json({ error: "invalid_appKey" });
        return;
      }
      params.push(appKeyRaw);
      where += ` AND l."appKey" = $${params.length}`;
    }
    const { rows } = await pool.query<AppLayoutRow>(
      `
      ${selectSql}
      ${where}
      ORDER BY l."appKey" ASC, l."isSystem" DESC, l."name" ASC
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
  const id = req.params.id;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const { rows } = await pool.query<AppLayoutRow>(
      `
      ${selectSql}
      WHERE l."id" = $2::uuid
        AND ${siteAccessSql('l."siteId"', "$1")}
      LIMIT 1
      `,
      [userId, id],
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
  const parsed = parseWriteBody(req.body);
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
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "appLayout" (
          "key", "name", "siteId", "appKey", "isSystem", "modal", "table", "contextMenu", "tabs",
          "createdBy", "updatedBy"
        )
        VALUES ($1, $2, $3::uuid, $4, false, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::uuid, $9::uuid)
        RETURNING "id"
        `,
        [
          parsed.key,
          parsed.name,
          effectiveSiteId,
          parsed.appKey,
          JSON.stringify(parsed.modal),
          JSON.stringify(parsed.table),
          JSON.stringify(parsed.contextMenu),
          JSON.stringify(parsed.tabs),
          meta.userId,
        ],
      );
      const id = inserted.rows[0]!.id;
      const { rows } = await client.query<AppLayoutRow>(
        `
        ${selectSql}
        WHERE l."id" = $1::uuid
        LIMIT 1
        `,
        [id],
      );
      return rows[0]!;
    });
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof Error && err.message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    sendPgError(res, err);
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = parseWriteBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string; siteId: string; isSystem: boolean; appKey: string }>(
        `
        SELECT l."id", l."siteId"::text AS "siteId", l."isSystem", l."appKey"
        FROM "appLayout" l
        WHERE l."id" = $1::uuid
          AND ${siteAccessSql('l."siteId"', "$2")}
        LIMIT 1
        `,
        [id, meta.userId],
      );
      if (!existing.rows[0]) {
        throw new Error("not_found");
      }
      const stored = existing.rows[0];
      if (stored.isSystem) {
        const admin = await isAdminUser(client, meta.userId);
        if (!admin) {
          throw new Error("system_layout_forbidden");
        }
      }
      if (parsed.appKey !== stored.appKey) {
        throw new Error("appKey_immutable");
      }
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? parsed.siteId : stored.siteId;
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await client.query(
        `
        UPDATE "appLayout"
        SET "key" = $1,
            "name" = $2,
            "siteId" = $3::uuid,
            "modal" = $4::jsonb,
            "table" = $5::jsonb,
            "contextMenu" = $6::jsonb,
            "tabs" = $7::jsonb
        WHERE "id" = $8::uuid
        `,
        [
          parsed.key,
          parsed.name,
          effectiveSiteId,
          JSON.stringify(parsed.modal),
          JSON.stringify(parsed.table),
          JSON.stringify(parsed.contextMenu),
          JSON.stringify(parsed.tabs),
          id,
        ],
      );
      const { rows } = await client.query<AppLayoutRow>(
        `
        ${selectSql}
        WHERE l."id" = $1::uuid
        LIMIT 1
        `,
        [id],
      );
      return rows[0]!;
    });
    res.json(row);
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (err instanceof Error && err.message === "system_layout_forbidden") {
      res.status(403).json({ error: "system_layout_forbidden" });
      return;
    }
    if (err instanceof Error && err.message === "appKey_immutable") {
      res.status(400).json({ error: "appKey_immutable" });
      return;
    }
    if (err instanceof Error && err.message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    sendPgError(res, err);
  }
});

router.post("/:id/copy", async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const body = req.body as Record<string, unknown> | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const siteIdRaw = typeof body?.siteId === "string" ? body.siteId.trim() : "";
  if (!key || key.length > 100 || !name || name.length > 200 || !isUuid(siteIdRaw)) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const source = await client.query<{
        appKey: string;
        modal: unknown;
        table: unknown;
        contextMenu: unknown;
        tabs: unknown;
      }>(
        `
        SELECT l."appKey", l."modal", l."table", l."contextMenu", l."tabs"
        FROM "appLayout" l
        WHERE l."id" = $1::uuid
          AND ${siteAccessSql('l."siteId"', "$2")}
        LIMIT 1
        `,
        [id, meta.userId],
      );
      if (!source.rows[0]) {
        throw new Error("not_found");
      }
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange
        ? siteIdRaw
        : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      const src = source.rows[0];
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "appLayout" (
          "key", "name", "siteId", "appKey", "isSystem", "modal", "table", "contextMenu", "tabs",
          "createdBy", "updatedBy"
        )
        VALUES ($1, $2, $3::uuid, $4, false, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::uuid, $9::uuid)
        RETURNING "id"
        `,
        [
          key,
          name,
          effectiveSiteId,
          src.appKey,
          JSON.stringify(src.modal),
          JSON.stringify(src.table),
          JSON.stringify(src.contextMenu),
          JSON.stringify(src.tabs ?? defaultTabsPayload()),
          meta.userId,
        ],
      );
      const newId = inserted.rows[0]!.id;
      const { rows } = await client.query<AppLayoutRow>(
        `
        ${selectSql}
        WHERE l."id" = $1::uuid
        LIMIT 1
        `,
        [newId],
      );
      return rows[0]!;
    });
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (err instanceof Error && err.message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    sendPgError(res, err);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const id = req.params.id;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ isSystem: boolean }>(
        `
        SELECT l."isSystem"
        FROM "appLayout" l
        WHERE l."id" = $1::uuid
          AND ${siteAccessSql('l."siteId"', "$2")}
        LIMIT 1
        `,
        [id, userId],
      );
      if (!existing.rows[0]) {
        throw new Error("not_found");
      }
      if (existing.rows[0].isSystem) {
        const admin = await isAdminUser(client, userId);
        if (!admin) {
          throw new Error("system_layout_forbidden");
        }
      }
      await client.query(`DELETE FROM "appLayout" WHERE "id" = $1::uuid`, [id]);
    });
    res.status(204).send();
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (err instanceof Error && err.message === "system_layout_forbidden") {
      res.status(403).json({ error: "system_layout_forbidden" });
      return;
    }
    sendPgError(res, err);
  }
});

/** Helpers exported for tests / future resolve endpoint */
export function buildEmptyLayoutPayloads(appKey: string) {
  const catalog = getFieldCatalog(appKey);
  if (!catalog) return null;
  return {
    modal: defaultModalPayload(catalog),
    table: defaultTablePayload(catalog),
    contextMenu: defaultContextMenuPayload(),
    tabs: defaultTabsPayload(),
  };
}

export const appLayoutsRouter = router;
