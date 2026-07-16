import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { evaluateKpiDefinition } from "./kpiQueryEngine.js";
import {
  buildKpiMeta,
  parseKpiDefinition,
  parseKpiStyle,
  type KpiDefinition,
  type KpiStyle,
} from "./kpiSemanticRegistry.js";
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

export type CustomKpiRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  definition: unknown;
  style: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

const selectSql = `
  SELECT
    k."id",
    k."key",
    k."name",
    k."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    k."definition",
    k."style",
    k."isActive",
    k."createdAt",
    k."updatedAt",
    COALESCE(u."loginName", k."createdBy"::text) AS "createdBy"
  FROM "customKpi" k
  JOIN "site" s ON s."id" = k."siteId"
  LEFT JOIN "users" u ON u."id" = k."createdBy"
`;

type ParsedBody = {
  key: string;
  name: string;
  siteId: string;
  definition: KpiDefinition;
  style: KpiStyle;
  isActive: boolean;
};

function parseBody(body: unknown): ParsedBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  const definition = parseKpiDefinition(o.definition);
  const style = parseKpiStyle(o.style);
  if (!key || !name || !isUuid(siteId) || !definition || !style) return null;
  return { key, name, siteId, definition, style, isActive };
}

router.get("/meta", (_req: Request, res: Response) => {
  res.json(buildKpiMeta());
});

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const siteIdRaw = typeof req.query.siteId === "string" ? req.query.siteId.trim() : "";
  const activeOnly = req.query.activeOnly === "1" || req.query.activeOnly === "true";
  try {
    const params: unknown[] = [userId];
    let where = `WHERE ${siteAccessSql('k."siteId"', "$1")}`;
    if (siteIdRaw) {
      if (!isUuid(siteIdRaw)) {
        res.status(400).json({ error: "invalid_siteId" });
        return;
      }
      params.push(siteIdRaw);
      where += ` AND k."siteId" = $${params.length}::uuid`;
    }
    if (activeOnly) {
      where += ` AND k."isActive" = true`;
    }
    const { rows } = await pool.query<CustomKpiRow>(
      `
      ${selectSql}
      ${where}
      ORDER BY k."name" ASC
      `,
      params,
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/preview", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as Record<string, unknown> | null;
  const definition = parseKpiDefinition(body?.definition);
  const style = parseKpiStyle(body?.style);
  const siteId =
    typeof body?.siteId === "string" && isUuid(body.siteId.trim()) ? body.siteId.trim() : null;
  if (!definition || !style) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    if (siteId) {
      await assertSiteAccess(pool, userId, siteId);
    }
    const result = await evaluateKpiDefinition(pool, userId, definition, style, { siteId });
    if (!result) {
      res.status(400).json({ error: "invalid_definition" });
      return;
    }
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    sendPgError(res, err);
  }
});

router.post("/evaluate", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as Record<string, unknown> | null;
  const idsRaw = body?.ids;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0 || idsRaw.length > 32) {
    res.status(400).json({ error: "invalid_ids" });
    return;
  }
  const ids = idsRaw.filter((x): x is string => isUuid(x));
  if (ids.length !== idsRaw.length) {
    res.status(400).json({ error: "invalid_ids" });
    return;
  }
  try {
    const { rows } = await pool.query<{
      id: string;
      siteId: string;
      name: string;
      definition: unknown;
      style: unknown;
      isActive: boolean;
    }>(
      `
      SELECT k."id", k."siteId"::text AS "siteId", k."name", k."definition", k."style", k."isActive"
      FROM "customKpi" k
      WHERE k."id" = ANY($2::uuid[])
        AND ${siteAccessSql('k."siteId"', "$1")}
      `,
      [userId, ids],
    );

    const byId = new Map(rows.map((r) => [r.id, r]));
    const results: Record<
      string,
      {
        id: string;
        name: string;
        style: unknown;
        definition: unknown;
        result: Awaited<ReturnType<typeof evaluateKpiDefinition>>;
        error?: string;
      }
    > = {};

    for (const id of ids) {
      const row = byId.get(id);
      if (!row) {
        results[id] = {
          id,
          name: "",
          style: null,
          definition: null,
          result: null,
          error: "not_found",
        };
        continue;
      }
      if (!row.isActive) {
        results[id] = {
          id,
          name: row.name,
          style: row.style,
          definition: row.definition,
          result: null,
          error: "inactive",
        };
        continue;
      }
      const definition = parseKpiDefinition(row.definition);
      const style = parseKpiStyle(row.style);
      if (!definition || !style) {
        results[id] = {
          id,
          name: row.name,
          style: row.style,
          definition: row.definition,
          result: null,
          error: "invalid_definition",
        };
        continue;
      }
      const evaluated = await evaluateKpiDefinition(pool, userId, definition, style, {
        siteId: row.siteId,
      });
      results[id] = {
        id,
        name: row.name,
        style,
        definition,
        result: evaluated,
        error: evaluated ? undefined : "evaluate_failed",
      };
    }

    res.json({ results });
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
    const { rows } = await pool.query<CustomKpiRow>(
      `
      ${selectSql}
      WHERE k."id" = $2::uuid
        AND ${siteAccessSql('k."siteId"', "$1")}
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
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "customKpi" ("key", "name", "siteId", "definition", "style", "isActive", "createdBy")
        VALUES ($1, $2, $3::uuid, $4::jsonb, $5::jsonb, $6, $7::uuid)
        RETURNING "id"
        `,
        [
          parsed.key,
          parsed.name,
          effectiveSiteId,
          JSON.stringify(parsed.definition),
          JSON.stringify(parsed.style),
          parsed.isActive,
          meta.userId,
        ],
      );
      const id = inserted.rows[0]!.id;
      const { rows } = await client.query<CustomKpiRow>(
        `
        ${selectSql}
        WHERE k."id" = $1::uuid
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

router.patch("/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
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
        SELECT k."id", k."siteId"::text AS "siteId"
        FROM "customKpi" k
        WHERE k."id" = $1::uuid
          AND ${siteAccessSql('k."siteId"', "$2")}
        LIMIT 1
        `,
        [id, meta.userId],
      );
      if (!existing.rows[0]) {
        throw new Error("not_found");
      }
      const storedSiteId = existing.rows[0].siteId;
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? parsed.siteId : storedSiteId;
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await client.query(
        `
        UPDATE "customKpi"
        SET "key" = $1,
            "name" = $2,
            "siteId" = $3::uuid,
            "definition" = $4::jsonb,
            "style" = $5::jsonb,
            "isActive" = $6
        WHERE "id" = $7::uuid
        `,
        [
          parsed.key,
          parsed.name,
          effectiveSiteId,
          JSON.stringify(parsed.definition),
          JSON.stringify(parsed.style),
          parsed.isActive,
          id,
        ],
      );
      const { rows } = await client.query<CustomKpiRow>(
        `
        ${selectSql}
        WHERE k."id" = $1::uuid
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
      const { rowCount } = await client.query(
        `
        DELETE FROM "customKpi"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, userId],
      );
      if ((rowCount ?? 0) === 0) {
        throw new Error("not_found");
      }
    });
    res.status(204).send();
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    sendPgError(res, err);
  }
});

export const customKpisRouter = router;
