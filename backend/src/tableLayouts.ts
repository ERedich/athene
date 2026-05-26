import { Router, type Request, type Response } from "express";
import type { Pool } from "pg";

import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";
import {
  isAllowedTableKey,
  LAYOUT_CONTEXT_MONITORING,
  normalizeMonitoringPayload,
  parseTableLayoutPayload,
  resolveMonitoringPayload,
  STANDARD_MONITORING_LAYOUT_NAME,
  TABLE_KEY_MONITORING_WORK_ORDERS,
  type TableLayoutPayloadV1,
} from "./tableLayoutRegistry.js";

function finalizePayload(tableKey: string, payload: TableLayoutPayloadV1): TableLayoutPayloadV1 {
  if (tableKey === TABLE_KEY_MONITORING_WORK_ORDERS) {
    return normalizeMonitoringPayload(payload);
  }
  return payload;
}

function parsePayloadForTable(raw: unknown, tableKey: string): TableLayoutPayloadV1 | null {
  const parsed = parseTableLayoutPayload(raw, tableKey);
  if (!parsed) return null;
  return finalizePayload(tableKey, parsed);
}

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
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

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

type LayoutListRow = { id: string; name: string; tableKey: string; isOwner: boolean };

type LayoutDetailRow = {
  id: string;
  name: string;
  tableKey: string;
  isOwner: boolean;
  payload: unknown;
};

async function cleanupStaleLayoutDefaults(client: Pick<Pool, "query">, userId: string) {
  await client.query(
    `
    DELETE FROM "userTableLayoutDefault" d
    WHERE d."userId" = $1::uuid
      AND NOT EXISTS (
        SELECT 1
        FROM "tableLayout" l
        LEFT JOIN "tableLayoutShare" s ON s."layoutId" = l."id" AND s."userId" = $1::uuid
        WHERE l."id" = d."layoutId"
          AND (l."createdBy" = $1::uuid OR s."userId" IS NOT NULL)
      )
    `,
    [userId],
  );
}

async function layoutAccessibleToUser(
  client: Pick<Pool, "query">,
  userId: string,
  layoutId: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `
    SELECT TRUE AS ok
    FROM "tableLayout" l
    LEFT JOIN "tableLayoutShare" s ON s."layoutId" = l."id" AND s."userId" = $2::uuid
    WHERE l."id" = $1::uuid
      AND (l."createdBy" = $2::uuid OR s."userId" IS NOT NULL)
    LIMIT 1
    `,
    [layoutId, userId],
  );
  return Boolean(rows[0]?.ok);
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const tableKeyRaw = typeof req.query.tableKey === "string" ? req.query.tableKey.trim() : "";
  if (tableKeyRaw && !isAllowedTableKey(tableKeyRaw)) {
    res.status(400).json({ error: "invalid_table_key" });
    return;
  }
  try {
    const params: unknown[] = [userId];
    let filterSql = "";
    if (tableKeyRaw) {
      filterSql = ` AND l."tableKey" = $2`;
      params.push(tableKeyRaw);
    }
    const { rows } = await pool.query<LayoutListRow>(
      `
      SELECT l."id", l."name", l."tableKey", (l."createdBy" = $1::uuid) AS "isOwner"
      FROM "tableLayout" l
      LEFT JOIN "tableLayoutShare" s ON s."layoutId" = l."id" AND s."userId" = $1::uuid
      WHERE (l."createdBy" = $1::uuid OR s."userId" IS NOT NULL)${filterSql}
      ORDER BY l."name" ASC
      `,
      params,
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/defaults", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    await cleanupStaleLayoutDefaults(pool, userId);
    const { rows } = await pool.query<{ context: string; layoutId: string }>(
      `
      SELECT d."context", d."layoutId"::text AS "layoutId"
      FROM "userTableLayoutDefault" d
      WHERE d."userId" = $1::uuid
      `,
      [userId],
    );
    let monitoringLayoutId: string | null = null;
    for (const r of rows) {
      if (r.context === LAYOUT_CONTEXT_MONITORING) monitoringLayoutId = r.layoutId;
    }
    res.json({ monitoringLayoutId });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.put("/defaults", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body === null || typeof body !== "object") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  if (!("monitoringLayoutId" in body)) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const raw = body.monitoringLayoutId;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (raw === null || raw === undefined) {
      await client.query(
        `
        DELETE FROM "userTableLayoutDefault"
        WHERE "userId" = $1::uuid AND "context" = $2
        `,
        [userId, LAYOUT_CONTEXT_MONITORING],
      );
    } else {
      if (typeof raw !== "string" || !isUuid(raw)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "invalid_layout_id" });
        return;
      }
      const ok = await layoutAccessibleToUser(client, userId, raw);
      if (!ok) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "layout_not_accessible" });
        return;
      }
      await client.query(
        `
        INSERT INTO "userTableLayoutDefault" ("userId", "context", "layoutId")
        VALUES ($1::uuid, $2, $3::uuid)
        ON CONFLICT ("userId", "context") DO UPDATE SET "layoutId" = EXCLUDED."layoutId"
        `,
        [userId, LAYOUT_CONTEXT_MONITORING, raw],
      );
    }
    await cleanupStaleLayoutDefaults(client, userId);
    const { rows } = await client.query<{ context: string; layoutId: string }>(
      `
      SELECT d."context", d."layoutId"::text AS "layoutId"
      FROM "userTableLayoutDefault" d
      WHERE d."userId" = $1::uuid
      `,
      [userId],
    );
    await client.query("COMMIT");
    let monitoringLayoutId: string | null = null;
    for (const r of rows) {
      if (r.context === LAYOUT_CONTEXT_MONITORING) monitoringLayoutId = r.layoutId;
    }
    res.json({ monitoringLayoutId });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendPgError(res, err);
  } finally {
    client.release();
  }
});

router.get("/:id/shares", async (req: Request, res: Response) => {
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
    const { rows: own } = await pool.query<{ c: string }>(
      `SELECT 1 AS c FROM "tableLayout" WHERE "id" = $1::uuid AND "createdBy" = $2::uuid`,
      [id, userId],
    );
    if (!own.length) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const { rows } = await pool.query<{ userId: string; loginName: string; name: string }>(
      `
      SELECT s."userId", u."loginName", u."name"
      FROM "tableLayoutShare" s
      JOIN "users" u ON u."id" = s."userId"
      WHERE s."layoutId" = $1::uuid
      ORDER BY u."loginName" ASC
      `,
      [id],
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
    const { rows } = await pool.query<LayoutDetailRow>(
      `
      SELECT l."id", l."name", l."tableKey", (l."createdBy" = $2::uuid) AS "isOwner", l."payload"
      FROM "tableLayout" l
      LEFT JOIN "tableLayoutShare" s ON s."layoutId" = l."id" AND s."userId" = $2::uuid
      WHERE l."id" = $1::uuid
        AND (l."createdBy" = $2::uuid OR s."userId" IS NOT NULL)
      LIMIT 1
      `,
      [id, userId],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const payload =
      row.tableKey === TABLE_KEY_MONITORING_WORK_ORDERS
        ? resolveMonitoringPayload(row.payload)
        : (() => {
            const parsed = parseTableLayoutPayload(row.payload, row.tableKey);
            if (!parsed) return null;
            return parsed;
          })();
    if (!payload) {
      res.status(500).json({ error: "invalid_stored_payload" });
      return;
    }
    res.json({ id: row.id, name: row.name, tableKey: row.tableKey, isOwner: row.isOwner, payload });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as Record<string, unknown> | null | undefined;
  const nameRaw = typeof body?.name === "string" ? body.name.trim() : "";
  const tableKey = typeof body?.tableKey === "string" ? body.tableKey.trim() : "";
  if (!nameRaw || nameRaw.length > 200) {
    res.status(400).json({ error: "invalid_name" });
    return;
  }
  if (nameRaw === STANDARD_MONITORING_LAYOUT_NAME) {
    res.status(400).json({ error: "reserved_layout_name" });
    return;
  }
  if (!isAllowedTableKey(tableKey)) {
    res.status(400).json({ error: "invalid_table_key" });
    return;
  }
  const payload = parsePayloadForTable(body?.payload, tableKey);
  if (!payload) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  try {
    const { rows } = await pool.query<{ id: string; name: string; tableKey: string }>(
      `
      INSERT INTO "tableLayout" ("name", "tableKey", "createdBy", "payload")
      VALUES ($1, $2, $3::uuid, $4::jsonb)
      RETURNING "id", "name", "tableKey"
      `,
      [nameRaw, tableKey, userId, JSON.stringify(payload)],
    );
    const row = rows[0];
    if (!row) {
      res.status(500).json({ error: "internal_error" });
      return;
    }
    res.status(201).json({ id: row.id, name: row.name, tableKey: row.tableKey, isOwner: true, payload });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
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
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body === null || typeof body !== "object") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const nameRaw = body.name !== undefined ? (typeof body.name === "string" ? body.name.trim() : "") : undefined;
  if (nameRaw !== undefined && (!nameRaw || nameRaw.length > 200)) {
    res.status(400).json({ error: "invalid_name" });
    return;
  }
  const { rows: existingLayoutRows } = await pool.query<{ tableKey: string; name: string }>(
    `SELECT "tableKey", "name" FROM "tableLayout" WHERE "id" = $1::uuid AND "createdBy" = $2::uuid`,
    [id, userId],
  );
  const existingLayout = existingLayoutRows[0];
  if (!existingLayout) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (existingLayout.name === STANDARD_MONITORING_LAYOUT_NAME) {
    res.status(403).json({ error: "standard_layout_locked" });
    return;
  }

  let payload: TableLayoutPayloadV1 | undefined;
  if (body.payload !== undefined) {
    const p = parsePayloadForTable(body.payload, existingLayout.tableKey);
    if (!p) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    payload = p;
  }
  if (nameRaw === undefined && payload === undefined) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (nameRaw !== undefined) {
      sets.push(`"name" = $${i++}`);
      params.push(nameRaw);
    }
    if (payload !== undefined) {
      sets.push(`"payload" = $${i++}::jsonb`);
      params.push(JSON.stringify(payload));
    }
    params.push(id, userId);
    const pId = i++;
    const pUser = i++;
    const { rows } = await pool.query<{ id: string; name: string; tableKey: string; payload: unknown }>(
      `
      UPDATE "tableLayout"
      SET ${sets.join(", ")}
      WHERE "id" = $${pId}::uuid AND "createdBy" = $${pUser}::uuid
      RETURNING "id", "name", "tableKey", "payload"
      `,
      params,
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const outPayload =
      row.tableKey === TABLE_KEY_MONITORING_WORK_ORDERS
        ? resolveMonitoringPayload(row.payload)
        : (() => {
            const parsed = parseTableLayoutPayload(row.payload, row.tableKey);
            if (!parsed) return null;
            return parsed;
          })();
    if (!outPayload) {
      res.status(500).json({ error: "invalid_stored_payload" });
      return;
    }
    res.json({ id: row.id, name: row.name, tableKey: row.tableKey, isOwner: true, payload: outPayload });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
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
    const { rowCount } = await pool.query(
      `DELETE FROM "tableLayout" WHERE "id" = $1::uuid AND "createdBy" = $2::uuid`,
      [id, userId],
    );
    if (!rowCount) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    sendPgError(res, err);
  }
});

router.put("/:id/shares", async (req: Request, res: Response) => {
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
  const body = req.body as Record<string, unknown> | null | undefined;
  const rawIds = body?.userIds;
  if (!Array.isArray(rawIds)) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const userIds: string[] = [];
  for (const x of rawIds) {
    if (typeof x !== "string" || !isUuid(x.trim())) {
      res.status(400).json({ error: "invalid_user_ids" });
      return;
    }
    userIds.push(x.trim());
  }
  const targets = [...new Set(userIds)].filter((uid) => uid !== userId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ownerCheck = await client.query<{ createdBy: string }>(
      `SELECT "createdBy" FROM "tableLayout" WHERE "id" = $1::uuid FOR UPDATE`,
      [id],
    );
    const owner = ownerCheck.rows[0]?.createdBy;
    if (!owner || owner !== userId) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "not_found" });
      return;
    }

    const visible = await countUsersVisibleToActor(client, userId, targets);
    if (visible !== targets.length) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "assignee_not_visible" });
      return;
    }

    await client.query(`DELETE FROM "tableLayoutShare" WHERE "layoutId" = $1::uuid`, [id]);
    for (const uid of targets) {
      await client.query(
        `
        INSERT INTO "tableLayoutShare" ("layoutId", "userId", "createdBy")
        VALUES ($1::uuid, $2::uuid, $3::uuid)
        `,
        [id, uid, userId],
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, userIds: targets });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendPgError(res, err);
  } finally {
    client.release();
  }
});

export const tableLayoutsRouter = router;
