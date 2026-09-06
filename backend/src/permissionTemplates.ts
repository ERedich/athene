import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { Pool, PoolClient, QueryResult } from "pg";

import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { isKnownPermissionKey } from "./permissionCatalog.js";
import {
  assertCanAssignPermissions,
  loadUserPermissions,
  replaceUserPermissions,
  userHasPermission,
} from "./middleware/requirePermission.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

type DbClient = Pool | PoolClient;

/** Load grant keys for a template (caller must ensure template is visible). */
export async function loadTemplateGrantKeys(
  client: DbClient,
  templateId: string,
): Promise<string[]> {
  const { rows } = await client.query<{ permissionKey: string }>(
    `
    SELECT "permissionKey"
    FROM "permissionTemplateGrant"
    WHERE "templateId" = $1::uuid
    ORDER BY "permissionKey" ASC
    `,
    [templateId],
  );
  return rows.map((r) => r.permissionKey);
}

/**
 * Copy-on-apply: replace target userPermission with template keys and set
 * users.permissionTemplateId (last-applied marker).
 */
export async function applyTemplateToUser(
  client: DbClient,
  actorUserId: string,
  templateId: string,
  keys: string[],
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const check = await assertCanAssignPermissions(client, actorUserId, keys, targetUserId);
  if (!check.ok) return check;
  await replaceUserPermissions(client, targetUserId, keys);
  await client.query(
    `
    UPDATE "users"
    SET "permissionTemplateId" = $1::uuid
    WHERE "id" = $2::uuid
    `,
    [templateId, targetUserId],
  );
  return { ok: true };
}

/** Clear last-applied template FK only (grants stay — copy-on-apply semantics). */
export async function clearPermissionTemplateAssignment(
  client: DbClient,
  targetUserIds: string[],
  templateId: string,
): Promise<void> {
  if (targetUserIds.length === 0) return;
  await client.query(
    `
    UPDATE "users"
    SET "permissionTemplateId" = NULL
    WHERE "id" = ANY($1::uuid[])
      AND "permissionTemplateId" = $2::uuid
    `,
    [targetUserIds, templateId],
  );
}

export type PermissionTemplateRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  permissionKeys: string[];
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

function parsePermissionKeys(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const keys: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim()) return null;
    const k = entry.trim();
    if (!isKnownPermissionKey(k)) return null;
    keys.push(k);
  }
  return [...new Set(keys)];
}

function parseBody(
  body: unknown,
): { key: string; name: string; siteId: string; permissionKeys: string[] } | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const permissionKeys = parsePermissionKeys(o.permissionKeys);
  if (!key || !name || !isUuid(siteId) || permissionKeys === null) return null;
  return { key, name, siteId, permissionKeys };
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

const selectSql = `
  SELECT
    t."id",
    t."key",
    t."name",
    t."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    COALESCE(
      (
        SELECT array_agg(g."permissionKey" ORDER BY g."permissionKey")
        FROM "permissionTemplateGrant" g
        WHERE g."templateId" = t."id"
      ),
      ARRAY[]::text[]
    ) AS "permissionKeys",
    t."createdAt",
    t."updatedAt",
    COALESCE(created_by."loginName", t."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", t."updatedBy"::text) AS "updatedBy"
  FROM "permissionTemplate" t
  JOIN "site" s ON s."id" = t."siteId"
  LEFT JOIN "users" created_by ON created_by."id" = t."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = t."updatedBy"
`;

async function replaceTemplateGrants(
  client: { query: typeof pool.query },
  templateId: string,
  keys: string[],
): Promise<void> {
  await client.query(`DELETE FROM "permissionTemplateGrant" WHERE "templateId" = $1::uuid`, [
    templateId,
  ]);
  if (keys.length === 0) return;
  await client.query(
    `
    INSERT INTO "permissionTemplateGrant" ("templateId", "permissionKey")
    SELECT $1::uuid, x
    FROM unnest($2::text[]) AS x
    ON CONFLICT DO NOTHING
    `,
    [templateId, keys],
  );
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<PermissionTemplateRow>(
      `
      ${selectSql}
      WHERE ${siteAccessSql('t."siteId"', "$1")}
      ORDER BY t."key" ASC
      `,
      [userId],
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
    const { rows } = await pool.query<PermissionTemplateRow>(
      `
      ${selectSql}
      WHERE t."id" = $1::uuid
        AND ${siteAccessSql('t."siteId"', "$2")}
      `,
      [id, userId],
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

router.post("/", async (req: Request, res: Response) => {
  const parsed = parseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    if (!(await userHasPermission(req, "permission-templates.create"))) {
      res.status(403).json({ error: "forbidden", permission: "permission-templates.create" });
      return;
    }
    const actorPerms = await loadUserPermissions(pool, meta.userId);
    for (const k of parsed.permissionKeys) {
      if (!actorPerms.has(k)) {
        res.status(403).json({ error: "cannot_grant_unowned", permission: k });
        return;
      }
    }
    const row = await withAuditContext(meta, async (client) => {
      await assertSiteAccess(client, meta.userId, parsed.siteId);
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "permissionTemplate" ("key", "name", "siteId")
        VALUES ($1, $2, $3::uuid)
        RETURNING "id"
        `,
        [parsed.key, parsed.name, parsed.siteId],
      );
      const id = inserted.rows[0]?.id;
      if (!id) return null;
      await replaceTemplateGrants(client, id, parsed.permissionKeys);
      const { rows } = await client.query<PermissionTemplateRow>(
        `${selectSql} WHERE t."id" = $1::uuid`,
        [id],
      );
      return rows[0] ?? null;
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
  try {
    const meta = auditMeta(req);
    if (!(await userHasPermission(req, "permission-templates.update"))) {
      res.status(403).json({ error: "forbidden", permission: "permission-templates.update" });
      return;
    }
    const actorPerms = await loadUserPermissions(pool, meta.userId);
    for (const k of parsed.permissionKeys) {
      if (!actorPerms.has(k)) {
        res.status(403).json({ error: "cannot_grant_unowned", permission: k });
        return;
      }
    }
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string }>(
        `
        SELECT t."id"
        FROM "permissionTemplate" t
        WHERE t."id" = $1::uuid
          AND ${siteAccessSql('t."siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if ((existing.rowCount ?? 0) === 0) return null;
      await assertSiteAccess(client, meta.userId, parsed.siteId);
      await client.query(
        `
        UPDATE "permissionTemplate"
        SET "key" = $1, "name" = $2, "siteId" = $3::uuid
        WHERE "id" = $4::uuid
        `,
        [parsed.key, parsed.name, parsed.siteId, id],
      );
      await replaceTemplateGrants(client, id, parsed.permissionKeys);
      const { rows } = await client.query<PermissionTemplateRow>(
        `${selectSql} WHERE t."id" = $1::uuid`,
        [id],
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
    if ((err as Error).message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    sendPgError(res, err);
  }
});

router.put("/:id/grants", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const keys = parsePermissionKeys((req.body as { permissionKeys?: unknown })?.permissionKeys);
  if (keys === null) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    if (!(await userHasPermission(req, "permission-templates.update"))) {
      res.status(403).json({ error: "forbidden", permission: "permission-templates.update" });
      return;
    }
    const actorPerms = await loadUserPermissions(pool, meta.userId);
    for (const k of keys) {
      if (!actorPerms.has(k)) {
        res.status(403).json({ error: "cannot_grant_unowned", permission: k });
        return;
      }
    }
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string }>(
        `
        SELECT t."id"
        FROM "permissionTemplate" t
        WHERE t."id" = $1::uuid
          AND ${siteAccessSql('t."siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if ((existing.rowCount ?? 0) === 0) return null;
      await replaceTemplateGrants(client, id, keys);
      // touch updatedAt via no-op update for audit
      await client.query(
        `UPDATE "permissionTemplate" SET "name" = "name" WHERE "id" = $1::uuid`,
        [id],
      );
      const { rows } = await client.query<PermissionTemplateRow>(
        `${selectSql} WHERE t."id" = $1::uuid`,
        [id],
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

router.post("/:id/apply", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const body = req.body as { userIds?: unknown };
  if (!Array.isArray(body?.userIds) || body.userIds.some((u) => !isUuid(u))) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const userIds = [...new Set(body.userIds as string[])];
  try {
    const meta = auditMeta(req);
    if (!(await userHasPermission(req, "permissions.manage"))) {
      res.status(403).json({ error: "forbidden", permission: "permissions.manage" });
      return;
    }
    const applied = await withAuditContext(meta, async (client) => {
      const tpl = await client.query<{ id: string }>(
        `
        SELECT t."id"
        FROM "permissionTemplate" t
        WHERE t."id" = $1::uuid
          AND ${siteAccessSql('t."siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if ((tpl.rowCount ?? 0) === 0) return null;

      const keys = await loadTemplateGrantKeys(client, id);

      const results: Array<{ userId: string; ok: boolean; error?: string }> = [];
      for (const targetId of userIds) {
        const appliedOne = await applyTemplateToUser(
          client,
          meta.userId,
          id,
          keys,
          targetId,
        );
        if (!appliedOne.ok) {
          results.push({ userId: targetId, ok: false, error: appliedOne.error });
          continue;
        }
        results.push({ userId: targetId, ok: true });
      }
      return results;
    });
    if (applied === null) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ results: applied });
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
    if (!(await userHasPermission(req, "permission-templates.delete"))) {
      res.status(403).json({ error: "forbidden", permission: "permission-templates.delete" });
      return;
    }
    const deleted = await withAuditContext(meta, async (client) => {
      const result: QueryResult = await client.query(
        `
        DELETE FROM "permissionTemplate" t
        WHERE t."id" = $1::uuid
          AND ${siteAccessSql('t."siteId"', "$2")}
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

export const permissionTemplatesRouter = router;
