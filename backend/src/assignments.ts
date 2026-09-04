import { Router, type Request, type Response } from "express";
import type { Pool } from "pg";

import {
  ASSIGNMENT_TYPES,
  getAssignmentType,
  isAssignmentTypeId,
  type AssignmentTypeId,
} from "./assignmentCatalog.js";
import {
  applyShareMode,
  expandAll,
  expandByWorkgroup,
  expandByWorkingSite,
  isAssignMode,
  normalizeExclusiveMode,
  type AssignMode,
  type AssignmentUserRow,
} from "./assignmentTargets.js";
import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";

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

/** Same visibility as GET /api/users for the given actor. */
async function countUsersVisibleToActor(
  client: Pick<Pool, "query">,
  actorUserId: string,
  targetUserIds: string[],
): Promise<number> {
  if (targetUserIds.length === 0) return 0;
  const uniq = [...new Set(targetUserIds)];
  const { rows } = await client.query<{ c: number }>(
    `
    SELECT COUNT(*)::int AS c
    FROM (
      SELECT DISTINCT u."id"
      FROM "users" u
      WHERE u."id" = ANY($2::uuid[])
        AND (
          ${siteAccessSql('u."workingSiteId"', "$1")}
          OR EXISTS (
            SELECT 1
            FROM "userSite" target_us
            WHERE target_us."userId" = u."id"
              AND ${siteAccessSql('target_us."siteId"', "$1")}
          )
        )
    ) t
    `,
    [actorUserId, uniq],
  );
  return rows[0]?.c ?? 0;
}

async function listVisibleUsers(
  client: Pick<Pool, "query">,
  actorUserId: string,
): Promise<
  Array<
    AssignmentUserRow & {
      loginName: string;
      name: string;
      workingSiteKey: string;
      workingSiteName: string;
      workingSiteColorHex: string;
    }
  >
> {
  const { rows } = await client.query<{
    id: string;
    loginName: string;
    name: string;
    workingSiteId: string;
    workingSiteKey: string;
    workingSiteName: string;
    workingSiteColorHex: string;
    employeeId: string | null;
  }>(
    `
    SELECT
      u."id"::text AS "id",
      u."loginName",
      u."name",
      u."workingSiteId"::text AS "workingSiteId",
      s."key" AS "workingSiteKey",
      s."name" AS "workingSiteName",
      s."colorHex" AS "workingSiteColorHex",
      u."employeeId"::text AS "employeeId"
    FROM "users" u
    JOIN "site" s ON s."id" = u."workingSiteId"
    WHERE (
      ${siteAccessSql('u."workingSiteId"', "$1")}
      OR EXISTS (
        SELECT 1
        FROM "userSite" target_us
        WHERE target_us."userId" = u."id"
          AND ${siteAccessSql('target_us."siteId"', "$1")}
      )
    )
    ORDER BY u."loginName" ASC
    `,
    [actorUserId],
  );
  return rows;
}

async function expandTargets(
  client: Pick<Pool, "query">,
  actorUserId: string,
  body: Record<string, unknown>,
): Promise<{ userIds: string[]; skippedWithoutEmployee: number } | { error: string; status: number }> {
  const visible = await listVisibleUsers(client, actorUserId);
  const visibleRows: AssignmentUserRow[] = visible.map((u) => ({
    id: u.id,
    workingSiteId: u.workingSiteId,
    employeeId: u.employeeId,
  }));

  if (Array.isArray(body.userIds)) {
    const userIds: string[] = [];
    for (const x of body.userIds) {
      if (typeof x !== "string" || !isUuid(x.trim())) {
        return { error: "invalid_user_ids", status: 400 };
      }
      userIds.push(x.trim());
    }
    return { userIds: [...new Set(userIds)], skippedWithoutEmployee: 0 };
  }

  if (body.all === true) {
    return expandAll(visibleRows);
  }

  if (typeof body.siteId === "string" && isUuid(body.siteId.trim())) {
    return expandByWorkingSite(visibleRows, body.siteId.trim());
  }

  if (typeof body.workgroupId === "string" && isUuid(body.workgroupId.trim())) {
    const wgId = body.workgroupId.trim();
    const { rows } = await client.query<{ employeeId: string }>(
      `
      SELECT wu."employeeId"::text AS "employeeId"
      FROM "workgroupUser" wu
      JOIN "workgroup" w ON w."id" = wu."workgroupId"
      WHERE wu."workgroupId" = $1::uuid
        AND ${siteAccessSql('w."siteId"', "$2")}
      `,
      [wgId, actorUserId],
    );
    const employeeIds = new Set(rows.map((r) => r.employeeId));
    return expandByWorkgroup(visibleRows, employeeIds);
  }

  return { error: "invalid_targets", status: 400 };
}

router.get("/catalog", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const visible = await listVisibleUsers(pool, userId);
    const userCount = visible.length;
    const visibleIds = visible.map((u) => u.id);

    const { rows: menuCountRows } = await pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM "navMenuConfig"`,
    );
    const { rows: menuAssignedRows } = await pool.query<{ c: number }>(
      `
      SELECT COUNT(*)::int AS c
      FROM "users" u
      WHERE u."navMenuConfigId" IS NOT NULL
        AND u."id" = ANY($1::uuid[])
      `,
      [visibleIds],
    );

    const { rows: presetCountRows } = await pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM "workOrderSearchPreset"`,
    );
    const { rows: presetAssignedRows } = await pool.query<{ c: number }>(
      `
      SELECT COUNT(DISTINCT s."userId")::int AS c
      FROM "workOrderSearchPresetShare" s
      WHERE s."userId" = ANY($1::uuid[])
      `,
      [visibleIds],
    );

    const items = ASSIGNMENT_TYPES.map((t) => {
      if (t.id === "menu") {
        return {
          ...t,
          recordCount: menuCountRows[0]?.c ?? 0,
          assignedUserCount: menuAssignedRows[0]?.c ?? 0,
          userCount,
        };
      }
      if (t.id === "search-preset") {
        return {
          ...t,
          recordCount: presetCountRows[0]?.c ?? 0,
          assignedUserCount: presetAssignedRows[0]?.c ?? 0,
          userCount,
        };
      }
      return {
        ...t,
        recordCount: 0,
        assignedUserCount: 0,
        userCount,
      };
    });

    res.json(items);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/users", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const visible = await listVisibleUsers(pool, userId);
    if (visible.length === 0) {
      res.json([]);
      return;
    }
    const ids = visible.map((u) => u.id);
    const { rows: menus } = await pool.query<{
      userId: string;
      menuConfigId: string | null;
      menuConfigKey: string | null;
      menuConfigName: string | null;
    }>(
      `
      SELECT
        u."id"::text AS "userId",
        u."navMenuConfigId"::text AS "menuConfigId",
        c."key" AS "menuConfigKey",
        c."name" AS "menuConfigName"
      FROM "users" u
      LEFT JOIN "navMenuConfig" c ON c."id" = u."navMenuConfigId"
      WHERE u."id" = ANY($1::uuid[])
      `,
      [ids],
    );
    const menuByUser = new Map(menus.map((m) => [m.userId, m]));

    const { rows: presetCounts } = await pool.query<{ userId: string; c: number }>(
      `
      SELECT s."userId"::text AS "userId", COUNT(*)::int AS c
      FROM "workOrderSearchPresetShare" s
      WHERE s."userId" = ANY($1::uuid[])
      GROUP BY s."userId"
      `,
      [ids],
    );
    const presetCountByUser = new Map(presetCounts.map((r) => [r.userId, r.c]));

    res.json(
      visible.map((u) => {
        const m = menuByUser.get(u.id);
        return {
          id: u.id,
          loginName: u.loginName,
          name: u.name,
          workingSiteId: u.workingSiteId,
          workingSiteKey: u.workingSiteKey,
          workingSiteName: u.workingSiteName,
          workingSiteColorHex: u.workingSiteColorHex,
          employeeId: u.employeeId,
          menuConfigId: m?.menuConfigId ?? null,
          menuConfigKey: m?.menuConfigKey ?? null,
          menuConfigName: m?.menuConfigName ?? null,
          searchPresetShareCount: presetCountByUser.get(u.id) ?? 0,
        };
      }),
    );
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/users/:userId", async (req: Request, res: Response) => {
  const actorId = req.session.userId;
  if (!actorId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const targetId = String(req.params.userId ?? "");
  if (!isUuid(targetId)) {
    res.status(400).json({ error: "invalid_user_id" });
    return;
  }
  try {
    const visible = await countUsersVisibleToActor(pool, actorId, [targetId]);
    if (visible !== 1) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const { rows: userRows } = await pool.query<{
      id: string;
      loginName: string;
      name: string;
      menuConfigId: string | null;
      menuConfigKey: string | null;
      menuConfigName: string | null;
    }>(
      `
      SELECT
        u."id"::text AS "id",
        u."loginName",
        u."name",
        u."navMenuConfigId"::text AS "menuConfigId",
        c."key" AS "menuConfigKey",
        c."name" AS "menuConfigName"
      FROM "users" u
      LEFT JOIN "navMenuConfig" c ON c."id" = u."navMenuConfigId"
      WHERE u."id" = $1::uuid
      `,
      [targetId],
    );
    const user = userRows[0];
    if (!user) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const { rows: presets } = await pool.query<{
      id: string;
      name: string;
      ownerLoginName: string;
    }>(
      `
      SELECT
        p."id"::text AS "id",
        p."name",
        COALESCE(owner."loginName", p."createdBy"::text) AS "ownerLoginName"
      FROM "workOrderSearchPresetShare" s
      JOIN "workOrderSearchPreset" p ON p."id" = s."presetId"
      LEFT JOIN "users" owner ON owner."id" = p."createdBy"
      WHERE s."userId" = $1::uuid
      ORDER BY p."name" ASC
      `,
      [targetId],
    );

    res.json({
      id: user.id,
      loginName: user.loginName,
      name: user.name,
      menu: user.menuConfigId
        ? {
            id: user.menuConfigId,
            key: user.menuConfigKey,
            name: user.menuConfigName,
          }
        : null,
      searchPresets: presets,
    });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/:type/records", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const typeParam = String(req.params.type ?? "");
  if (!isAssignmentTypeId(typeParam)) {
    res.status(400).json({ error: "invalid_type" });
    return;
  }
  const typeDef = getAssignmentType(typeParam)!;
  if (!typeDef.enabled) {
    res.status(400).json({ error: "type_disabled" });
    return;
  }

  try {
    const visible = await listVisibleUsers(pool, userId);
    const visibleIds = visible.map((u) => u.id);

    if (typeParam === "menu") {
      const { rows } = await pool.query<{
        id: string;
        key: string;
        name: string;
        assignedUserCount: number;
      }>(
        `
        SELECT
          c."id"::text AS "id",
          c."key",
          c."name",
          (
            SELECT COUNT(*)::int
            FROM "users" u
            WHERE u."navMenuConfigId" = c."id"
              AND u."id" = ANY($1::uuid[])
          ) AS "assignedUserCount"
        FROM "navMenuConfig" c
        ORDER BY c."name" ASC
        `,
        [visibleIds],
      );
      res.json(
        rows.map((r) => ({
          ...r,
          sourcePath: `${typeDef.sourcePath}/${r.id}`,
        })),
      );
      return;
    }

    // search-preset
    const { rows } = await pool.query<{
      id: string;
      name: string;
      ownerLoginName: string;
      assignedUserCount: number;
    }>(
      `
      SELECT
        p."id"::text AS "id",
        p."name",
        COALESCE(owner."loginName", p."createdBy"::text) AS "ownerLoginName",
        (
          SELECT COUNT(*)::int
          FROM "workOrderSearchPresetShare" s
          WHERE s."presetId" = p."id"
            AND s."userId" = ANY($1::uuid[])
        ) AS "assignedUserCount"
      FROM "workOrderSearchPreset" p
      LEFT JOIN "users" owner ON owner."id" = p."createdBy"
      ORDER BY p."name" ASC
      `,
      [visibleIds],
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        key: r.name,
        name: r.name,
        ownerLoginName: r.ownerLoginName,
        assignedUserCount: r.assignedUserCount,
        sourcePath: typeDef.sourcePath,
      })),
    );
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/:type/records/:id/users", async (req: Request, res: Response) => {
  const actorId = req.session.userId;
  if (!actorId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const typeParam = String(req.params.type ?? "");
  const recordId = String(req.params.id ?? "");
  if (!isAssignmentTypeId(typeParam) || !isUuid(recordId)) {
    res.status(400).json({ error: "invalid_params" });
    return;
  }
  const typeDef = getAssignmentType(typeParam)!;
  if (!typeDef.enabled) {
    res.status(400).json({ error: "type_disabled" });
    return;
  }

  try {
    const visible = await listVisibleUsers(pool, actorId);
    const visibleIds = visible.map((u) => u.id);

    if (typeParam === "menu") {
      const { rows: exists } = await pool.query<{ c: number }>(
        `SELECT 1 AS c FROM "navMenuConfig" WHERE "id" = $1::uuid`,
        [recordId],
      );
      if (!exists.length) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const { rows: assigned } = await pool.query<{ userId: string }>(
        `
        SELECT u."id"::text AS "userId"
        FROM "users" u
        WHERE u."navMenuConfigId" = $1::uuid
          AND u."id" = ANY($2::uuid[])
        `,
        [recordId, visibleIds],
      );

      const { rows: conflicts } = await pool.query<{
        userId: string;
        currentRecordId: string;
        currentName: string;
      }>(
        `
        SELECT
          u."id"::text AS "userId",
          u."navMenuConfigId"::text AS "currentRecordId",
          c."name" AS "currentName"
        FROM "users" u
        JOIN "navMenuConfig" c ON c."id" = u."navMenuConfigId"
        WHERE u."navMenuConfigId" IS NOT NULL
          AND u."navMenuConfigId" <> $1::uuid
          AND u."id" = ANY($2::uuid[])
        `,
        [recordId, visibleIds],
      );

      res.json({
        assignedUserIds: assigned.map((r) => r.userId),
        conflicts,
      });
      return;
    }

    const { rows: exists } = await pool.query<{ c: number }>(
      `SELECT 1 AS c FROM "workOrderSearchPreset" WHERE "id" = $1::uuid`,
      [recordId],
    );
    if (!exists.length) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const { rows: assigned } = await pool.query<{ userId: string }>(
      `
      SELECT s."userId"::text AS "userId"
      FROM "workOrderSearchPresetShare" s
      WHERE s."presetId" = $1::uuid
        AND s."userId" = ANY($2::uuid[])
      `,
      [recordId, visibleIds],
    );

    res.json({
      assignedUserIds: assigned.map((r) => r.userId),
      conflicts: [],
    });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.put("/:type/records/:id", async (req: Request, res: Response) => {
  const actorId = req.session.userId;
  if (!actorId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const typeParam = String(req.params.type ?? "") as AssignmentTypeId;
  const recordId = String(req.params.id ?? "");
  if (!isAssignmentTypeId(typeParam) || !isUuid(recordId)) {
    res.status(400).json({ error: "invalid_params" });
    return;
  }
  const typeDef = getAssignmentType(typeParam)!;
  if (!typeDef.enabled) {
    res.status(400).json({ error: "type_disabled" });
    return;
  }

  const body =
    req.body === null || typeof req.body !== "object"
      ? null
      : (req.body as Record<string, unknown>);
  if (!body || !isAssignMode(body.mode)) {
    res.status(400).json({ error: "invalid_mode" });
    return;
  }
  const mode: AssignMode = body.mode;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const expanded = await expandTargets(client, actorId, body);
    if ("error" in expanded) {
      await client.query("ROLLBACK");
      res.status(expanded.status).json({ error: expanded.error });
      return;
    }
    const { userIds: targets, skippedWithoutEmployee } = expanded;

    const visible = await countUsersVisibleToActor(client, actorId, targets);
    if (visible !== targets.length) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "assignee_not_visible" });
      return;
    }

    if (typeParam === "menu") {
      const { rows: exists } = await client.query<{ c: number }>(
        `SELECT 1 AS c FROM "navMenuConfig" WHERE "id" = $1::uuid FOR UPDATE`,
        [recordId],
      );
      if (!exists.length) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "not_found" });
        return;
      }

      const exclusiveMode = normalizeExclusiveMode(mode);
      if (targets.length > 0) {
        if (exclusiveMode === "set") {
          await client.query(
            `
            UPDATE "users"
            SET "navMenuConfigId" = $1::uuid
            WHERE "id" = ANY($2::uuid[])
            `,
            [recordId, targets],
          );
        } else {
          await client.query(
            `
            UPDATE "users"
            SET "navMenuConfigId" = NULL
            WHERE "id" = ANY($1::uuid[])
              AND "navMenuConfigId" = $2::uuid
            `,
            [targets, recordId],
          );
        }
      }

      await client.query("COMMIT");
      res.json({
        ok: true,
        userIds: targets,
        skippedWithoutEmployee,
        selfAffected: targets.includes(actorId),
      });
      return;
    }

    // search-preset — no owner check
    const { rows: exists } = await client.query<{ c: number }>(
      `SELECT 1 AS c FROM "workOrderSearchPreset" WHERE "id" = $1::uuid FOR UPDATE`,
      [recordId],
    );
    if (!exists.length) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "not_found" });
      return;
    }

    const { rows: currentShares } = await client.query<{ userId: string }>(
      `SELECT "userId"::text AS "userId" FROM "workOrderSearchPresetShare" WHERE "presetId" = $1::uuid`,
      [recordId],
    );
    const nextShares = applyShareMode(
      currentShares.map((r) => r.userId),
      targets,
      mode,
      actorId,
    );

    await client.query(`DELETE FROM "workOrderSearchPresetShare" WHERE "presetId" = $1::uuid`, [
      recordId,
    ]);
    for (const uid of nextShares) {
      await client.query(
        `
        INSERT INTO "workOrderSearchPresetShare" ("presetId", "userId", "createdBy")
        VALUES ($1::uuid, $2::uuid, $3::uuid)
        `,
        [recordId, uid, actorId],
      );
    }

    await client.query("COMMIT");
    res.json({
      ok: true,
      userIds: nextShares,
      skippedWithoutEmployee,
      selfAffected: false,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendPgError(res, err);
  } finally {
    client.release();
  }
});

export { router as assignmentsRouter };
