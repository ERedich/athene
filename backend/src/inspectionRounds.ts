import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResultRow } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

export type InspectionRoundActivityRow = {
  id: string;
  pos: number;
  name: string;
  assetId: string | null;
  assetKey: string | null;
  assetName: string | null;
  inspectionPointId: string | null;
  inspectionPointKey: string | null;
  inspectionPointName: string | null;
};

export type InspectionRoundRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  assetId: string | null;
  assetKey: string | null;
  assetName: string | null;
  activityCount: number;
  activities: InspectionRoundActivityRow[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type ActivityInput = {
  pos: number;
  name: string;
  assetId: string | null;
  inspectionPointId: string | null;
};

type ParsedBody = {
  key: string;
  name: string;
  siteId: string;
  assetId: string | null;
  activities: ActivityInput[];
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function readTrimmedOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeActivities(value: unknown): ActivityInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: ActivityInput[] = [];
  const seenPos = new Set<number>();
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") return null;
    const o = entry as Record<string, unknown>;
    const posRaw = o.pos;
    let pos: number;
    if (typeof posRaw === "number" && Number.isInteger(posRaw)) {
      pos = posRaw;
    } else if (typeof posRaw === "string" && /^\d{1,4}$/.test(posRaw.trim())) {
      pos = Number.parseInt(posRaw.trim(), 10);
    } else {
      return null;
    }
    if (pos < 1 || pos > 9999 || seenPos.has(pos)) return null;
    seenPos.add(pos);
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) return null;
    const assetId = readTrimmedOptionalString(o.assetId);
    const inspectionPointId = readTrimmedOptionalString(o.inspectionPointId);
    if (assetId !== null && !isUuid(assetId)) return null;
    if (inspectionPointId !== null && !isUuid(inspectionPointId)) return null;
    if (inspectionPointId !== null && assetId === null) return null;
    result.push({ pos, name, assetId, inspectionPointId });
  }
  result.sort((a, b) => a.pos - b.pos);
  return result;
}

function parseBody(body: unknown): ParsedBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const assetId = readTrimmedOptionalString(o.assetId);
  const activities = normalizeActivities(o.activities);
  if (!key || !name || !isUuid(siteId) || activities === null) return null;
  if (assetId !== null && !isUuid(assetId)) return null;
  if (name.length > 200) return null;
  return { key, name, siteId, assetId, activities };
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
  if (e.code === "23514") {
    res.status(400).json({ error: "check_violation", message: e.detail ?? e.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

function auditMeta(req: Request) {
  const userId = req.session.userId;
  if (!userId) throw new Error("missing_session_user");
  return {
    userId,
    requestId: randomUUID(),
    reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
    source: "api",
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? "",
  };
}

type DbClient = {
  query: <T extends QueryResultRow>(
    queryText: string,
    values?: unknown[],
  ) => Promise<{ rows: T[]; rowCount: number | null }>;
};

const selectRoundBaseSql = `
  SELECT
    r."id",
    r."key",
    r."name",
    r."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    r."assetId",
    a."key" AS "assetKey",
    a."name" AS "assetName",
    (
      SELECT COUNT(*)::int FROM "inspectionRoundActivity" act
      WHERE act."inspectionRoundId" = r."id"
    ) AS "activityCount",
    r."createdAt",
    r."updatedAt",
    COALESCE(created_by."loginName", r."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", r."updatedBy"::text) AS "updatedBy"
  FROM "inspectionRound" r
  JOIN "site" s ON s."id" = r."siteId"
  LEFT JOIN "asset" a ON a."id" = r."assetId"
  LEFT JOIN "users" created_by ON created_by."id" = r."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = r."updatedBy"
`;

async function fetchActivities(
  client: DbClient,
  roundId: string,
): Promise<InspectionRoundActivityRow[]> {
  const { rows } = await client.query<InspectionRoundActivityRow>(
    `
    SELECT
      act."id",
      act."pos",
      act."name",
      act."assetId",
      a."key" AS "assetKey",
      a."name" AS "assetName",
      act."inspectionPointId",
      ip."key" AS "inspectionPointKey",
      ip."name" AS "inspectionPointName"
    FROM "inspectionRoundActivity" act
    LEFT JOIN "asset" a ON a."id" = act."assetId"
    LEFT JOIN "inspectionPoint" ip ON ip."id" = act."inspectionPointId"
    WHERE act."inspectionRoundId" = $1::uuid
    ORDER BY act."pos" ASC
    `,
    [roundId],
  );
  return rows;
}

async function assertAssetForSite(
  client: DbClient,
  userId: string,
  siteId: string,
  assetId: string | null,
): Promise<void> {
  if (!assetId) return;
  const { rows } = await client.query<{ id: string }>(
    `
    SELECT "id"
    FROM "asset"
    WHERE "id" = $1::uuid
      AND "siteId" = $2::uuid
      AND ${siteAccessSql('"siteId"', "$3")}
    `,
    [assetId, siteId, userId],
  );
  if (!rows[0]) throw new Error("invalid_asset");
}

async function assertAssetInHeaderSubtree(
  client: DbClient,
  headerAssetId: string,
  activityAssetId: string,
): Promise<void> {
  const { rows } = await client.query<{ ok: number }>(
    `
    WITH RECURSIVE subtree AS (
      SELECT "id" FROM "asset" WHERE "id" = $1::uuid
      UNION ALL
      SELECT c."id"
      FROM "asset" c
      JOIN subtree s ON c."parentAssetId" = s."id"
    )
    SELECT 1 AS ok FROM subtree WHERE "id" = $2::uuid
    LIMIT 1
    `,
    [headerAssetId, activityAssetId],
  );
  if (!rows[0]) throw new Error("activity_asset_outside_header");
}

async function assertActivitiesContext(
  client: DbClient,
  userId: string,
  siteId: string,
  activities: ActivityInput[],
  headerAssetId: string | null,
): Promise<void> {
  for (const activity of activities) {
    if (activity.assetId) {
      await assertAssetForSite(client, userId, siteId, activity.assetId);
      if (headerAssetId) {
        await assertAssetInHeaderSubtree(client, headerAssetId, activity.assetId);
      }
    }
    if (activity.inspectionPointId) {
      const { rows } = await client.query<{ id: string; assetId: string }>(
        `
        SELECT ip."id", ip."assetId"
        FROM "inspectionPoint" ip
        JOIN "asset" a ON a."id" = ip."assetId"
        WHERE ip."id" = $1::uuid
          AND ${siteAccessSql('a."siteId"', "$2")}
        `,
        [activity.inspectionPointId, userId],
      );
      const point = rows[0];
      if (!point) throw new Error("invalid_inspection_point");
      if (!activity.assetId || point.assetId !== activity.assetId) {
        throw new Error("inspection_point_asset_mismatch");
      }
    }
  }
}

async function setActivities(
  client: DbClient,
  roundId: string,
  activities: ActivityInput[],
): Promise<void> {
  await client.query(`DELETE FROM "inspectionRoundActivity" WHERE "inspectionRoundId" = $1::uuid`, [
    roundId,
  ]);
  for (const activity of activities) {
    await client.query(
      `
      INSERT INTO "inspectionRoundActivity"
        ("inspectionRoundId", "pos", "name", "assetId", "inspectionPointId")
      VALUES ($1::uuid, $2::integer, $3, $4::uuid, $5::uuid)
      `,
      [roundId, activity.pos, activity.name, activity.assetId, activity.inspectionPointId],
    );
  }
}

async function loadRound(
  client: DbClient,
  userId: string,
  id: string,
): Promise<InspectionRoundRow | null> {
  const { rows } = await client.query<Omit<InspectionRoundRow, "activities">>(
    `
    ${selectRoundBaseSql}
    WHERE r."id" = $1::uuid
      AND ${siteAccessSql('r."siteId"', "$2")}
    `,
    [id, userId],
  );
  const base = rows[0];
  if (!base) return null;
  const activities = await fetchActivities(client, id);
  return { ...base, activities };
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<Omit<InspectionRoundRow, "activities">>(
      `
      ${selectRoundBaseSql}
      WHERE ${siteAccessSql('r."siteId"', "$1")}
      ORDER BY r."key" ASC
      `,
      [userId],
    );
    res.json(rows.map((row) => ({ ...row, activities: [] as InspectionRoundActivityRow[] })));
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
    const row = await loadRound(pool, userId, id);
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
    const row = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange
        ? parsed.siteId
        : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertAssetForSite(client, meta.userId, effectiveSiteId, parsed.assetId);
      await assertActivitiesContext(
        client,
        meta.userId,
        effectiveSiteId,
        parsed.activities,
        parsed.assetId,
      );
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "inspectionRound" ("key", "name", "siteId", "assetId")
        VALUES ($1, $2, $3::uuid, $4::uuid)
        RETURNING "id"
        `,
        [parsed.key, parsed.name, effectiveSiteId, parsed.assetId],
      );
      const roundId = inserted.rows[0]?.id;
      if (!roundId) throw new Error("no_row");
      await setActivities(client, roundId, parsed.activities);
      return loadRound(client, meta.userId, roundId);
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user" || message === "user_not_found") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (message === "invalid_asset") {
      res.status(400).json({ error: "invalid_asset" });
      return;
    }
    if (
      message === "invalid_inspection_point" ||
      message === "inspection_point_asset_mismatch" ||
      message === "activity_asset_outside_header"
    ) {
      res.status(400).json({ error: message });
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
        SELECT "id", "siteId"
        FROM "inspectionRound"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (!existing.rows[0]) throw new Error("not_found");
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange
        ? parsed.siteId
        : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertAssetForSite(client, meta.userId, effectiveSiteId, parsed.assetId);
      await assertActivitiesContext(
        client,
        meta.userId,
        effectiveSiteId,
        parsed.activities,
        parsed.assetId,
      );
      await client.query(
        `
        UPDATE "inspectionRound"
        SET "key" = $1, "name" = $2, "siteId" = $3::uuid, "assetId" = $4::uuid
        WHERE "id" = $5::uuid
        `,
        [parsed.key, parsed.name, effectiveSiteId, parsed.assetId, id],
      );
      await setActivities(client, id, parsed.activities);
      return loadRound(client, meta.userId, id);
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (message === "missing_session_user" || message === "user_not_found") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (message === "invalid_asset") {
      res.status(400).json({ error: "invalid_asset" });
      return;
    }
    if (
      message === "invalid_inspection_point" ||
      message === "inspection_point_asset_mismatch" ||
      message === "activity_asset_outside_header"
    ) {
      res.status(400).json({ error: message });
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
      const { rowCount } = await client.query(
        `
        DELETE FROM "inspectionRound"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      return (rowCount ?? 0) > 0;
    });
    if (!deleted) {
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

export default router;
