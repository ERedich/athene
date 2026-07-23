import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { renderReportPdf } from "./reportPdf.js";
import { executeReportQuery } from "./reportQueryEngine.js";
import {
  buildReportMeta,
  defaultReportLayout,
  defaultReportQuery,
  parseReportLayout,
  parseReportQueryDefinition,
  type ReportLayout,
  type ReportQueryDefinition,
} from "./reportSemanticRegistry.js";
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

export type ReportDefinitionRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  queryDefinition: unknown;
  layout: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

const selectSql = `
  SELECT
    r."id",
    r."key",
    r."name",
    r."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    r."queryDefinition",
    r."layout",
    r."isActive",
    r."createdAt",
    r."updatedAt",
    COALESCE(u."loginName", r."createdBy"::text) AS "createdBy"
  FROM "reportDefinition" r
  JOIN "site" s ON s."id" = r."siteId"
  LEFT JOIN "users" u ON u."id" = r."createdBy"
`;

type ParsedBody = {
  key: string;
  name: string;
  siteId: string;
  queryDefinition: ReportQueryDefinition;
  layout: ReportLayout;
  isActive: boolean;
};

function parseBody(body: unknown): ParsedBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  const queryDefinition = parseReportQueryDefinition(o.queryDefinition);
  const layout = parseReportLayout(o.layout);
  if (!key || !name || !isUuid(siteId) || !queryDefinition || !layout) return null;
  return { key, name, siteId, queryDefinition, layout, isActive };
}

function validateLayoutFields(query: ReportQueryDefinition, layout: ReportLayout): boolean {
  const allowed = new Set(query.fields);
  for (const el of layout.elements) {
    if (el.type === "field" && el.fieldId && !allowed.has(el.fieldId)) {
      return false;
    }
  }
  return true;
}

router.get("/meta", (_req: Request, res: Response) => {
  res.json(buildReportMeta());
});

router.get("/defaults", (_req: Request, res: Response) => {
  res.json({
    queryDefinition: defaultReportQuery("workOrder"),
    layout: defaultReportLayout(),
  });
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
    let where = `WHERE ${siteAccessSql('r."siteId"', "$1")}`;
    if (siteIdRaw) {
      if (!isUuid(siteIdRaw)) {
        res.status(400).json({ error: "invalid_siteId" });
        return;
      }
      params.push(siteIdRaw);
      where += ` AND r."siteId" = $${params.length}::uuid`;
    }
    if (activeOnly) {
      where += ` AND r."isActive" = true`;
    }
    const { rows } = await pool.query<ReportDefinitionRow>(
      `
      ${selectSql}
      ${where}
      ORDER BY r."name" ASC
      `,
      params,
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/preview-query", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as Record<string, unknown> | null;
  const queryDefinition = parseReportQueryDefinition(body?.queryDefinition);
  const siteId =
    typeof body?.siteId === "string" && isUuid(body.siteId.trim()) ? body.siteId.trim() : null;
  if (!queryDefinition) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    if (siteId) {
      await assertSiteAccess(pool, userId, siteId);
    }
    const result = await executeReportQuery(pool, userId, queryDefinition, { siteId });
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

router.post("/preview-pdf", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as Record<string, unknown> | null;
  const queryDefinition = parseReportQueryDefinition(body?.queryDefinition);
  const layout = parseReportLayout(body?.layout);
  const siteId =
    typeof body?.siteId === "string" && isUuid(body.siteId.trim()) ? body.siteId.trim() : null;
  const title = typeof body?.name === "string" ? body.name.trim() : "Report Preview";
  if (!queryDefinition || !layout) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  if (!validateLayoutFields(queryDefinition, layout)) {
    res.status(400).json({ error: "layout_field_mismatch" });
    return;
  }
  try {
    if (siteId) {
      await assertSiteAccess(pool, userId, siteId);
    }
    const result = await executeReportQuery(pool, userId, queryDefinition, { siteId });
    if (!result) {
      res.status(400).json({ error: "invalid_definition" });
      return;
    }
    const pdf = await renderReportPdf({
      layout,
      rows: result.rows,
      columns: result.columns,
      title,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="report-preview.pdf"`);
    res.send(pdf);
  } catch (err) {
    if (err instanceof Error && err.message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
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
    const { rows } = await pool.query<ReportDefinitionRow>(
      `
      ${selectSql}
      WHERE r."id" = $2::uuid
        AND ${siteAccessSql('r."siteId"', "$1")}
      `,
      [userId, id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/:id/pdf", async (req: Request, res: Response) => {
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
    const { rows } = await pool.query<{
      key: string;
      name: string;
      siteId: string;
      queryDefinition: unknown;
      layout: unknown;
      isActive: boolean;
    }>(
      `
      SELECT r."key", r."name", r."siteId"::text AS "siteId", r."queryDefinition", r."layout", r."isActive"
      FROM "reportDefinition" r
      WHERE r."id" = $2::uuid
        AND ${siteAccessSql('r."siteId"', "$1")}
      `,
      [userId, id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const row = rows[0];
    if (!row.isActive) {
      res.status(400).json({ error: "inactive" });
      return;
    }
    const queryDefinition = parseReportQueryDefinition(row.queryDefinition);
    const layout = parseReportLayout(row.layout);
    if (!queryDefinition || !layout) {
      res.status(400).json({ error: "invalid_definition" });
      return;
    }
    const result = await executeReportQuery(pool, userId, queryDefinition, {
      siteId: row.siteId,
    });
    if (!result) {
      res.status(400).json({ error: "invalid_definition" });
      return;
    }
    const pdf = await renderReportPdf({
      layout,
      rows: result.rows,
      columns: result.columns,
      title: row.name,
    });
    const safeKey = row.key.replace(/[^a-zA-Z0-9_-]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${safeKey}.pdf"`);
    res.send(pdf);
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
  if (!validateLayoutFields(parsed.queryDefinition, parsed.layout)) {
    res.status(400).json({ error: "layout_field_mismatch" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const created = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange
        ? parsed.siteId
        : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "reportDefinition" ("key", "name", "siteId", "queryDefinition", "layout", "isActive", "createdBy")
        VALUES ($1, $2, $3::uuid, $4::jsonb, $5::jsonb, $6, $7::uuid)
        RETURNING "id"
        `,
        [
          parsed.key,
          parsed.name,
          effectiveSiteId,
          JSON.stringify(parsed.queryDefinition),
          JSON.stringify(parsed.layout),
          parsed.isActive,
          meta.userId,
        ],
      );
      const id = inserted.rows[0]!.id;
      const { rows } = await client.query<ReportDefinitionRow>(
        `
        ${selectSql}
        WHERE r."id" = $1::uuid
        LIMIT 1
        `,
        [id],
      );
      return rows[0]!;
    });
    res.status(201).json(created);
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
  const parsed = parseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  if (!validateLayoutFields(parsed.queryDefinition, parsed.layout)) {
    res.status(400).json({ error: "layout_field_mismatch" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const updated = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string; siteId: string }>(
        `
        SELECT r."id", r."siteId"::text AS "siteId"
        FROM "reportDefinition" r
        WHERE r."id" = $2::uuid
          AND ${siteAccessSql('r."siteId"', "$1")}
        `,
        [meta.userId, id],
      );
      if (existing.rows.length === 0) return null;
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? parsed.siteId : existing.rows[0].siteId;
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await client.query(
        `
        UPDATE "reportDefinition"
        SET
          "key" = $3,
          "name" = $4,
          "siteId" = $5::uuid,
          "queryDefinition" = $6::jsonb,
          "layout" = $7::jsonb,
          "isActive" = $8
        WHERE "id" = $2::uuid
          AND ${siteAccessSql('"siteId"', "$1")}
        `,
        [
          meta.userId,
          id,
          parsed.key,
          parsed.name,
          effectiveSiteId,
          JSON.stringify(parsed.queryDefinition),
          JSON.stringify(parsed.layout),
          parsed.isActive,
        ],
      );
      const { rows } = await client.query<ReportDefinitionRow>(
        `
        ${selectSql}
        WHERE r."id" = $1::uuid
        LIMIT 1
        `,
        [id],
      );
      return rows[0] ?? null;
    });
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    sendPgError(res, err);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const deleted = await withAuditContext(meta, async (client) => {
      const { rowCount } = await client.query(
        `
        DELETE FROM "reportDefinition"
        WHERE "id" = $2::uuid
          AND ${siteAccessSql('"siteId"', "$1")}
        `,
        [meta.userId, id],
      );
      return (rowCount ?? 0) > 0;
    });
    if (!deleted) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    sendPgError(res, err);
  }
});

export const reportsRouter = router;
