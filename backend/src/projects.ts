import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult, QueryResultRow } from "pg";

import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";

export type ProjectRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  status: ProjectStatus;
  plannedStart: string;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  responsibleEmployeeId: string | null;
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  costCenterId: string | null;
  costCenterKey: string | null;
  costCenterName: string | null;
  taskCount: number;
  milestoneCount: number;
  completedTaskCount: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type ParsedProjectBody = {
  key: string;
  name: string;
  description: string | null;
  siteId: string;
  status: ProjectStatus;
  plannedStart: string;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  responsibleEmployeeId: string | null;
  costCenterId: string | null;
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedStatuses: ProjectStatus[] = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
];

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (allowedStatuses as string[]).includes(value);
}

function readTrimmedOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseIsoDatetime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseProjectBody(body: unknown): ParsedProjectBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;

  const key = typeof o.key === "string" ? o.key.trim() : "";
  if (!key || key.length > 50) return null;

  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name || name.length > 200) return null;

  const descriptionRaw = readTrimmedOptionalString(o.description);
  if (descriptionRaw !== null && descriptionRaw.length > 2000) return null;

  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  if (!isUuid(siteId)) return null;

  const statusRaw = o.status ?? "planning";
  if (!isProjectStatus(statusRaw)) return null;

  const plannedStart = parseIsoDatetime(o.plannedStart);
  if (!plannedStart) return null;

  const plannedEnd =
    o.plannedEnd === null || o.plannedEnd === undefined
      ? null
      : parseIsoDatetime(o.plannedEnd);
  if (o.plannedEnd !== null && o.plannedEnd !== undefined && !plannedEnd) return null;

  const actualStart =
    o.actualStart === null || o.actualStart === undefined
      ? null
      : parseIsoDatetime(o.actualStart);
  if (o.actualStart !== null && o.actualStart !== undefined && !actualStart) return null;

  const actualEnd =
    o.actualEnd === null || o.actualEnd === undefined
      ? null
      : parseIsoDatetime(o.actualEnd);
  if (o.actualEnd !== null && o.actualEnd !== undefined && !actualEnd) return null;

  const responsibleEmployeeIdRaw = readTrimmedOptionalString(o.responsibleEmployeeId);
  if (responsibleEmployeeIdRaw !== null && !isUuid(responsibleEmployeeIdRaw)) return null;

  const costCenterIdRaw = readTrimmedOptionalString(o.costCenterId);
  if (costCenterIdRaw !== null && !isUuid(costCenterIdRaw)) return null;

  return {
    key,
    name,
    description: descriptionRaw,
    siteId,
    status: statusRaw,
    plannedStart,
    plannedEnd,
    actualStart,
    actualEnd,
    responsibleEmployeeId: responsibleEmployeeIdRaw,
    costCenterId: costCenterIdRaw,
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
  if (e.code === "23514") {
    res.status(400).json({ error: "check_violation", message: e.detail ?? e.message });
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

const selectProjectsSql = `
  SELECT
    p."id",
    p."key",
    p."name",
    p."description",
    p."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    p."status",
    p."plannedStart",
    p."plannedEnd",
    p."actualStart",
    p."actualEnd",
    p."responsibleEmployeeId",
    e."key" AS "responsibleEmployeeKey",
    e."name" AS "responsibleEmployeeName",
    p."costCenterId",
    cc."key" AS "costCenterKey",
    cc."name" AS "costCenterName",
    COALESCE(task_counts."taskCount", 0)::int AS "taskCount",
    COALESCE(task_counts."milestoneCount", 0)::int AS "milestoneCount",
    COALESCE(task_counts."completedTaskCount", 0)::int AS "completedTaskCount",
    CASE
      WHEN COALESCE(task_counts."taskCount", 0) = 0 THEN 0
      ELSE ROUND((COALESCE(task_counts."completedTaskCount", 0)::numeric / task_counts."taskCount") * 100)::int
    END AS "progress",
    p."createdAt",
    p."updatedAt",
    COALESCE(created_by."loginName", p."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", p."updatedBy"::text) AS "updatedBy"
  FROM "project" p
  JOIN "site" s ON s."id" = p."siteId"
  LEFT JOIN "employee" e ON e."id" = p."responsibleEmployeeId"
  LEFT JOIN "costCenter" cc ON cc."id" = p."costCenterId"
  LEFT JOIN "users" created_by ON created_by."id" = p."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = p."updatedBy"
  LEFT JOIN (
    SELECT
      pt."projectId",
      COUNT(*) FILTER (WHERE pt."taskType" = 'task')::int AS "taskCount",
      COUNT(*) FILTER (WHERE pt."taskType" = 'milestone')::int AS "milestoneCount",
      COUNT(*) FILTER (WHERE pt."status" = 'completed')::int AS "completedTaskCount"
    FROM "projectTask" pt
    GROUP BY pt."projectId"
  ) task_counts ON task_counts."projectId" = p."id"
`;

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<ProjectRow>(
      `
      ${selectProjectsSql}
      WHERE ${siteAccessSql('p."siteId"', "$1")}
      ORDER BY p."plannedStart" DESC, p."key" ASC
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
    const { rows } = await pool.query<ProjectRow>(
      `
      ${selectProjectsSql}
      WHERE p."id" = $1::uuid
        AND ${siteAccessSql('p."siteId"', "$2")}
      LIMIT 1
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
  const parsed = parseProjectBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      await assertSiteAccess(client, meta.userId, parsed.siteId);

      if (parsed.responsibleEmployeeId) {
        const emp = await client.query<{ id: string }>(
          `
          SELECT "id" FROM "employee"
          WHERE "id" = $1::uuid AND "siteId" = $2::uuid
          LIMIT 1
          `,
          [parsed.responsibleEmployeeId, parsed.siteId],
        );
        if (!emp.rows[0]) throw new Error("invalid_responsible_employee");
      }

      if (parsed.costCenterId) {
        const cc = await client.query<{ id: string }>(
          `
          SELECT "id" FROM "costCenter"
          WHERE "id" = $1::uuid AND "siteId" = $2::uuid
          LIMIT 1
          `,
          [parsed.costCenterId, parsed.siteId],
        );
        if (!cc.rows[0]) throw new Error("invalid_cost_center");
      }

      const id = randomUUID();
      await client.query(
        `
        INSERT INTO "project" (
          "id", "key", "name", "description", "siteId", "status",
          "plannedStart", "plannedEnd", "actualStart", "actualEnd",
          "responsibleEmployeeId", "costCenterId"
        )
        VALUES (
          $1::uuid, $2, $3, $4, $5::uuid, $6,
          $7::timestamptz, $8::timestamptz, $9::timestamptz, $10::timestamptz,
          $11::uuid, $12::uuid
        )
        `,
        [
          id,
          parsed.key,
          parsed.name,
          parsed.description,
          parsed.siteId,
          parsed.status,
          parsed.plannedStart,
          parsed.plannedEnd,
          parsed.actualStart,
          parsed.actualEnd,
          parsed.responsibleEmployeeId,
          parsed.costCenterId,
        ],
      );

      const { rows } = await client.query<ProjectRow>(
        `
        ${selectProjectsSql}
        WHERE p."id" = $1::uuid
        LIMIT 1
        `,
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
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (message === "invalid_responsible_employee") {
      res.status(400).json({ error: "invalid_responsible_employee" });
      return;
    }
    if (message === "invalid_cost_center") {
      res.status(400).json({ error: "invalid_cost_center" });
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
  const parsed = parseProjectBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<QueryResultRow & { id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "project"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      const existingRow = existing.rows[0];
      if (!existingRow) return null;

      await assertSiteAccess(client, meta.userId, parsed.siteId);

      if (parsed.responsibleEmployeeId) {
        const emp = await client.query<{ id: string }>(
          `
          SELECT "id" FROM "employee"
          WHERE "id" = $1::uuid AND "siteId" = $2::uuid
          LIMIT 1
          `,
          [parsed.responsibleEmployeeId, parsed.siteId],
        );
        if (!emp.rows[0]) throw new Error("invalid_responsible_employee");
      }

      if (parsed.costCenterId) {
        const cc = await client.query<{ id: string }>(
          `
          SELECT "id" FROM "costCenter"
          WHERE "id" = $1::uuid AND "siteId" = $2::uuid
          LIMIT 1
          `,
          [parsed.costCenterId, parsed.siteId],
        );
        if (!cc.rows[0]) throw new Error("invalid_cost_center");
      }

      await client.query(
        `
        UPDATE "project"
        SET
          "key" = $1,
          "name" = $2,
          "description" = $3,
          "siteId" = $4::uuid,
          "status" = $5,
          "plannedStart" = $6::timestamptz,
          "plannedEnd" = $7::timestamptz,
          "actualStart" = $8::timestamptz,
          "actualEnd" = $9::timestamptz,
          "responsibleEmployeeId" = $10::uuid,
          "costCenterId" = $11::uuid
        WHERE "id" = $12::uuid
        `,
        [
          parsed.key,
          parsed.name,
          parsed.description,
          parsed.siteId,
          parsed.status,
          parsed.plannedStart,
          parsed.plannedEnd,
          parsed.actualStart,
          parsed.actualEnd,
          parsed.responsibleEmployeeId,
          parsed.costCenterId,
          id,
        ],
      );

      const { rows } = await client.query<ProjectRow>(
        `
        ${selectProjectsSql}
        WHERE p."id" = $1::uuid
        LIMIT 1
        `,
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
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (message === "invalid_responsible_employee") {
      res.status(400).json({ error: "invalid_responsible_employee" });
      return;
    }
    if (message === "invalid_cost_center") {
      res.status(400).json({ error: "invalid_cost_center" });
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
        DELETE FROM "project"
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

export const projectsRouter = router;
