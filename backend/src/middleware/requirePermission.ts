import type { Request, RequestHandler, Response } from "express";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import { pool } from "../db.js";
import { isKnownPermissionKey, permissionKey } from "../permissionCatalog.js";

type Queryable = {
  query: <T extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[],
  ) => Promise<{ rows: T[]; rowCount: number | null }>;
};

declare global {
  // eslint-disable-next-line no-var
  var __athenePermCache: undefined;
}

export type RequestWithPermissions = Request & {
  permissionSet?: Set<string>;
};

export async function loadUserPermissions(
  client: Queryable,
  userId: string,
): Promise<Set<string>> {
  const { rows } = await client.query<{ permissionKey: string }>(
    `
    SELECT "permissionKey"
    FROM "userPermission"
    WHERE "userId" = $1::uuid
    `,
    [userId],
  );
  return new Set(rows.map((r) => r.permissionKey));
}

export async function getRequestPermissions(req: Request): Promise<Set<string>> {
  const r = req as RequestWithPermissions;
  if (r.permissionSet) return r.permissionSet;
  const userId = req.session?.userId;
  if (!userId) {
    r.permissionSet = new Set();
    return r.permissionSet;
  }
  r.permissionSet = await loadUserPermissions(pool, userId);
  return r.permissionSet;
}

export async function userHasPermission(
  req: Request,
  key: string,
): Promise<boolean> {
  const set = await getRequestPermissions(req);
  return set.has(key);
}

export function requirePermission(key: string): RequestHandler {
  return async (req, res, next) => {
    try {
      if (!isKnownPermissionKey(key)) {
        res.status(500).json({ error: "unknown_permission", permission: key });
        return;
      }
      const ok = await userHasPermission(req, key);
      if (!ok) {
        res.status(403).json({ error: "forbidden", permission: key });
        return;
      }
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal_error" });
    }
  };
}

export function requireAnyPermission(keys: string[]): RequestHandler {
  return async (req, res, next) => {
    try {
      const set = await getRequestPermissions(req);
      const hit = keys.find((k) => set.has(k));
      if (!hit) {
        res.status(403).json({ error: "forbidden", permission: keys[0] ?? null });
        return;
      }
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal_error" });
    }
  };
}

/**
 * Maps HTTP method + path to view/create/update/delete for a standard CRUD app.
 * Subresource writes (documents, points) count as update; DELETE /:id is delete.
 */
export function requireAppCrud(appKey: string): RequestHandler {
  return async (req, res, next) => {
    try {
      const method = req.method.toUpperCase();
      const path = (req.path || "/").replace(/\/+$/, "") || "/";
      // Mounted routers see path relative to mount; baseUrl is the mount path.
      const rel = path;

      let action: string;
      if (method === "GET" || method === "HEAD") {
        action = "view";
      } else if (method === "POST" && (rel === "/" || rel === "")) {
        action = "create";
      } else if (method === "DELETE") {
        // DELETE /:id → delete; DELETE /:id/sub/... → update
        const parts = rel.split("/").filter(Boolean);
        action = parts.length === 1 ? "delete" : "update";
      } else {
        // PUT/PATCH/POST on /:id or nested → update
        action = "update";
      }

      const key = permissionKey(appKey, action);
      const ok = await userHasPermission(req, key);
      if (!ok) {
        res.status(403).json({ error: "forbidden", permission: key });
        return;
      }
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal_error" });
    }
  };
}

export async function replaceUserPermissions(
  client: Pool | PoolClient,
  userId: string,
  keys: string[],
): Promise<void> {
  const unique = [...new Set(keys.filter((k) => isKnownPermissionKey(k)))];
  await client.query(`DELETE FROM "userPermission" WHERE "userId" = $1::uuid`, [userId]);
  if (unique.length === 0) return;
  await client.query(
    `
    INSERT INTO "userPermission" ("userId", "permissionKey")
    SELECT $1::uuid, x
    FROM unnest($2::text[]) AS x
    ON CONFLICT DO NOTHING
    `,
    [userId, unique],
  );
}

export async function countUsersWithPermission(
  client: Queryable,
  key: string,
): Promise<number> {
  const { rows } = await client.query<{ c: number }>(
    `
    SELECT COUNT(*)::int AS c
    FROM "userPermission"
    WHERE "permissionKey" = $1
    `,
    [key],
  );
  return rows[0]?.c ?? 0;
}

/**
 * Validates that an actor may assign the given keys to a target user.
 * - Actor needs permissions.manage
 * - Actor may only grant keys they themselves hold
 * - Cannot remove the last permissions.manage from the system (when replacing target)
 */
export async function assertCanAssignPermissions(
  client: Queryable,
  actorUserId: string,
  nextKeys: string[],
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actorPerms = await loadUserPermissions(client, actorUserId);
  if (!actorPerms.has("permissions.manage")) {
    return { ok: false, error: "forbidden" };
  }
  for (const key of nextKeys) {
    if (!isKnownPermissionKey(key)) {
      return { ok: false, error: "unknown_permission" };
    }
    if (!actorPerms.has(key)) {
      return { ok: false, error: "cannot_grant_unowned" };
    }
  }

  const hadManage = (
    await client.query<{ c: number }>(
      `
      SELECT COUNT(*)::int AS c
      FROM "userPermission"
      WHERE "userId" = $1::uuid AND "permissionKey" = 'permissions.manage'
      `,
      [targetUserId],
    )
  ).rows[0]?.c;

  const willHaveManage = nextKeys.includes("permissions.manage");
  if (hadManage && !willHaveManage) {
    const total = await countUsersWithPermission(client, "permissions.manage");
    if (total <= 1) {
      return { ok: false, error: "last_permissions_manage" };
    }
  }

  return { ok: true };
}

export function sendForbidden(res: Response, permission: string): void {
  res.status(403).json({ error: "forbidden", permission });
}
