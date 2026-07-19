import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { assertClassificationForSiteAndScope } from "./classificationAssert.js";
import { pool } from "./db.js";
import {
  generateDueMaintenancePlans,
  generateWorkOrderForPlan,
  getMaintenancePlanSweepStatus,
  rolloutMaintenancePlan,
  type MaintenanceIntervalUnit,
} from "./maintenancePlanGenerate.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";
import {
  assertAssetAndCostCenterContext,
  assertResponsibleEmployeesContext,
  assertWorkgroupForOrderSite,
  type DbClient,
} from "./workOrderCreate.js";
import { assertInspectionRoundForSite } from "./inspectionRoundSnapshot.js";

export type MaintenancePlanStatus = "active" | "paused" | "ended";

export type MaintenancePlanRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  assetId: string;
  assetKey: string;
  assetName: string;
  costCenterId: string;
  costCenterKey: string;
  costCenterName: string;
  workgroupId: string;
  workgroupKey: string;
  workgroupName: string;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  inspectionRoundId: string | null;
  inspectionRoundKey: string | null;
  inspectionRoundName: string | null;
  plannedDurationMinutes: number | null;
  intervalUnit: MaintenanceIntervalUnit;
  intervalValue: number;
  anchorDate: string;
  nextDueAt: string;
  leadTimeDays: number;
  status: MaintenancePlanStatus;
  executionCount: number;
  ignoreOpenWorkOrders: boolean;
  responsibleEmployeeIds: string[];
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  hasOpenWorkOrder: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type ParsedBody = {
  key: string;
  name: string;
  description: string | null;
  siteId: string;
  assetId: string;
  costCenterId: string;
  workgroupId: string;
  classificationId: string | null;
  inspectionRoundId: string | null;
  plannedDurationMinutes: number | null;
  intervalUnit: MaintenanceIntervalUnit;
  intervalValue: number;
  anchorDate: string;
  nextDueAt: string;
  leadTimeDays: number;
  status: MaintenancePlanStatus;
  ignoreOpenWorkOrders: boolean;
  responsibleEmployeeIds: string[];
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const intervalUnits: MaintenanceIntervalUnit[] = ["day", "week", "month", "year"];
const statuses: MaintenancePlanStatus[] = ["active", "paused", "ended"];

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function readTrimmedOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmployeeIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !isUuid(item.trim())) return null;
    const id = item.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function parseAnchorDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return raw;
}

function parseIsoDatetime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function anchorDateFromNextDueAt(nextDueAtIso: string): string {
  return nextDueAtIso.slice(0, 10);
}

function resolveStatus(o: Record<string, unknown>): MaintenancePlanStatus | null {
  if (typeof o.isActive === "boolean") {
    return o.isActive ? "active" : "paused";
  }
  if (o.status === undefined) return "active";
  if (typeof o.status === "string" && statuses.includes(o.status as MaintenancePlanStatus)) {
    return o.status as MaintenancePlanStatus;
  }
  return null;
}

function parseBody(body: unknown): ParsedBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;

  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!key || !name || name.length > 200) return null;

  const descriptionRaw = readTrimmedOptionalString(o.description);
  if (descriptionRaw !== null && descriptionRaw.length > 2000) return null;

  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const assetId = typeof o.assetId === "string" ? o.assetId.trim() : "";
  const costCenterId = typeof o.costCenterId === "string" ? o.costCenterId.trim() : "";
  const workgroupId = typeof o.workgroupId === "string" ? o.workgroupId.trim() : "";
  if (!isUuid(siteId) || !isUuid(assetId) || !isUuid(costCenterId) || !isUuid(workgroupId)) {
    return null;
  }

  const classificationIdRaw = readTrimmedOptionalString(o.classificationId);
  if (classificationIdRaw !== null && !isUuid(classificationIdRaw)) return null;

  const inspectionRoundIdRaw = readTrimmedOptionalString(o.inspectionRoundId);
  if (inspectionRoundIdRaw !== null && !isUuid(inspectionRoundIdRaw)) return null;

  const rawDuration = o.plannedDurationMinutes;
  const plannedDurationMinutes =
    rawDuration === null || rawDuration === undefined
      ? null
      : typeof rawDuration === "number" && Number.isInteger(rawDuration) && rawDuration >= 0
        ? rawDuration
        : null;
  if (rawDuration !== null && rawDuration !== undefined && plannedDurationMinutes === null) {
    return null;
  }

  const intervalUnit = o.intervalUnit;
  if (typeof intervalUnit !== "string" || !intervalUnits.includes(intervalUnit as MaintenanceIntervalUnit)) {
    return null;
  }
  const intervalValue =
    typeof o.intervalValue === "number" && Number.isInteger(o.intervalValue) && o.intervalValue >= 1
      ? o.intervalValue
      : null;
  if (intervalValue === null) return null;

  const nextDueAt = parseIsoDatetime(o.nextDueAt);
  if (!nextDueAt) return null;
  const anchorDate =
    parseAnchorDate(o.anchorDate) ?? anchorDateFromNextDueAt(nextDueAt);

  const leadTimeDays =
    o.leadTimeDays === undefined
      ? 7
      : typeof o.leadTimeDays === "number" && Number.isInteger(o.leadTimeDays) && o.leadTimeDays >= 0
        ? o.leadTimeDays
        : null;
  if (leadTimeDays === null) return null;

  const status = resolveStatus(o);
  if (!status) return null;

  const ignoreOpenWorkOrders =
    typeof o.ignoreOpenWorkOrders === "boolean" ? o.ignoreOpenWorkOrders : false;

  const responsibleEmployeeIds = normalizeEmployeeIds(o.responsibleEmployeeIds);
  if (!responsibleEmployeeIds || responsibleEmployeeIds.length === 0) return null;

  return {
    key,
    name,
    description: descriptionRaw,
    siteId,
    assetId,
    costCenterId,
    workgroupId,
    classificationId: classificationIdRaw,
    inspectionRoundId: inspectionRoundIdRaw,
    plannedDurationMinutes,
    intervalUnit: intervalUnit as MaintenanceIntervalUnit,
    intervalValue,
    anchorDate,
    nextDueAt,
    leadTimeDays,
    status,
    ignoreOpenWorkOrders,
    responsibleEmployeeIds,
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

function sendCreateError(res: Response, err: unknown) {
  const message = (err as Error).message;
  const mapped: Record<string, number> = {
    missing_session_user: 401,
    user_not_found: 401,
    site_access_denied: 403,
    invalid_asset: 400,
    invalid_cost_center: 400,
    invalid_classification: 400,
    asset_cost_center_mismatch: 400,
    asset_site_mismatch: 400,
    invalid_responsible_employee: 400,
    responsible_employee_site_mismatch: 400,
    invalid_workgroup: 400,
    responsible_required: 400,
    responsible_employee_not_leader: 400,
    invalid_anchor_date: 400,
    invalid_next_due_at: 400,
  };
  if (message in mapped) {
    res.status(mapped[message]).json({ error: message });
    return;
  }
  sendPgError(res, err);
}

const responsibleColumnsSql = `
  (
    SELECT COALESCE(array_agg(r."employeeId"::text ORDER BY e."key"), ARRAY[]::text[])
    FROM "maintenancePlanResponsibleEmployee" r
    JOIN "employee" e ON e."id" = r."employeeId"
    WHERE r."maintenancePlanId" = p."id"
  ) AS "responsibleEmployeeIds",
  (
    SELECT NULLIF(COALESCE(string_agg(e."key", ', ' ORDER BY e."key"), ''), '')
    FROM "maintenancePlanResponsibleEmployee" r
    JOIN "employee" e ON e."id" = r."employeeId"
    WHERE r."maintenancePlanId" = p."id"
  ) AS "responsibleEmployeeKey",
  (
    SELECT NULLIF(COALESCE(string_agg(e."name", ', ' ORDER BY e."key"), ''), '')
    FROM "maintenancePlanResponsibleEmployee" r
    JOIN "employee" e ON e."id" = r."employeeId"
    WHERE r."maintenancePlanId" = p."id"
  ) AS "responsibleEmployeeName",
  EXISTS (
    SELECT 1
    FROM "workOrder" w
    WHERE w."maintenancePlanId" = p."id"
      AND w."status" IN ('open', 'assigned', 'started', 'paused', 'continued')
  ) AS "hasOpenWorkOrder"
`;

const selectPlansSql = `
  SELECT
    p."id",
    p."key",
    p."name",
    p."description",
    p."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    p."assetId",
    a."key" AS "assetKey",
    a."name" AS "assetName",
    p."costCenterId",
    c."key" AS "costCenterKey",
    c."name" AS "costCenterName",
    p."workgroupId",
    wg."key" AS "workgroupKey",
    wg."name" AS "workgroupName",
    p."classificationId",
    cl."key" AS "classificationKey",
    cl."name" AS "classificationName",
    p."inspectionRoundId",
    ir."key" AS "inspectionRoundKey",
    ir."name" AS "inspectionRoundName",
    p."plannedDurationMinutes",
    p."intervalUnit",
    p."intervalValue",
    p."anchorDate"::text AS "anchorDate",
    p."nextDueAt",
    p."leadTimeDays",
    p."status",
    p."executionCount",
    p."ignoreOpenWorkOrders",
    ${responsibleColumnsSql},
    p."createdAt",
    p."updatedAt",
    COALESCE(created_by."loginName", p."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", p."updatedBy"::text) AS "updatedBy"
  FROM "maintenancePlan" p
  JOIN "site" s ON s."id" = p."siteId"
  JOIN "asset" a ON a."id" = p."assetId"
  JOIN "costCenter" c ON c."id" = p."costCenterId"
  JOIN "workgroup" wg ON wg."id" = p."workgroupId"
  LEFT JOIN "classification" cl ON cl."id" = p."classificationId"
  LEFT JOIN "inspectionRound" ir ON ir."id" = p."inspectionRoundId"
  LEFT JOIN "users" created_by ON created_by."id" = p."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = p."updatedBy"
`;

async function setPlanResponsibles(
  client: DbClient,
  planId: string,
  employeeIds: string[],
): Promise<void> {
  await client.query(
    `DELETE FROM "maintenancePlanResponsibleEmployee" WHERE "maintenancePlanId" = $1::uuid`,
    [planId],
  );
  if (employeeIds.length === 0) return;
  const placeholders = employeeIds.map((_, idx) => `($1::uuid, $${idx + 2}::uuid)`).join(", ");
  await client.query(
    `
    INSERT INTO "maintenancePlanResponsibleEmployee" ("maintenancePlanId", "employeeId")
    VALUES ${placeholders}
    ON CONFLICT ("maintenancePlanId", "employeeId") DO NOTHING
    `,
    [planId, ...employeeIds],
  );
}

async function fetchPlanRow(client: DbClient, planId: string): Promise<MaintenancePlanRow | null> {
  const { rows } = await client.query<MaintenancePlanRow>(
    `
    ${selectPlansSql}
    WHERE p."id" = $1::uuid
    LIMIT 1
    `,
    [planId],
  );
  return rows[0] ?? null;
}

async function assertPlanContext(
  client: DbClient,
  userId: string,
  parsed: ParsedBody,
): Promise<string> {
  const allowSiteChange = await getAllowSiteChange(client);
  const effectiveSiteId = allowSiteChange ? parsed.siteId : await getWorkingSiteId(client, userId);
  await assertSiteAccess(client, userId, effectiveSiteId);

  const relationSiteId = await assertAssetAndCostCenterContext(
    client,
    userId,
    parsed.assetId,
    parsed.costCenterId,
    effectiveSiteId,
  );
  if (relationSiteId !== effectiveSiteId) {
    throw new Error("asset_site_mismatch");
  }

  await assertWorkgroupForOrderSite(client, userId, parsed.workgroupId, effectiveSiteId);
  await assertResponsibleEmployeesContext(
    client,
    userId,
    parsed.responsibleEmployeeIds,
    effectiveSiteId,
    parsed.workgroupId,
  );
  await assertClassificationForSiteAndScope(
    client,
    userId,
    effectiveSiteId,
    parsed.classificationId,
    "work_order",
  );
  await assertInspectionRoundForSite(
    client,
    userId,
    parsed.inspectionRoundId,
    effectiveSiteId,
    siteAccessSql,
  );
  return effectiveSiteId;
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<MaintenancePlanRow>(
      `
      ${selectPlansSql}
      WHERE ${siteAccessSql('p."siteId"', "$1")}
      ORDER BY p."key" ASC
      `,
      [userId],
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/sweep-status", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  res.json(getMaintenancePlanSweepStatus());
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
    const { rows } = await pool.query<MaintenancePlanRow>(
      `
      ${selectPlansSql}
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

router.post("/generate-due", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const results = await generateDueMaintenancePlans({
      actorUserId: userId,
      systemSweep: false,
    });
    res.json({ results });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/:id/generate", async (req: Request, res: Response) => {
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
  const force = Boolean((req.body as { force?: unknown } | null)?.force);
  try {
    const result = await generateWorkOrderForPlan({
      planId: id,
      actorUserId: userId,
      force,
      systemSweep: false,
    });
    res.json(result);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/:id/rollout", async (req: Request, res: Response) => {
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
  const untilDate =
    typeof (req.body as { untilDate?: unknown } | null)?.untilDate === "string"
      ? (req.body as { untilDate: string }).untilDate.trim()
      : "";
  if (!untilDate) {
    res.status(400).json({ error: "invalid_until_date" });
    return;
  }
  try {
    const result = await rolloutMaintenancePlan({
      planId: id,
      actorUserId: userId,
      untilDate,
    });
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "invalid_until_date" || message === "until_date_in_past") {
      res.status(400).json({ error: message });
      return;
    }
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
    const nextDueAt = parsed.nextDueAt;
    const anchorDate = parsed.anchorDate;

    const row = await withAuditContext(meta, async (client) => {
      const effectiveSiteId = await assertPlanContext(client, meta.userId, parsed);
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "maintenancePlan"
          ("key", "name", "description", "siteId", "assetId", "costCenterId", "workgroupId",
           "classificationId", "inspectionRoundId", "plannedDurationMinutes", "intervalUnit", "intervalValue",
           "anchorDate", "nextDueAt", "leadTimeDays", "status", "ignoreOpenWorkOrders")
        VALUES
          ($1, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::integer,
           $11, $12::integer, $13::date, $14::timestamptz, $15::integer, $16, $17)
        RETURNING "id"
        `,
        [
          parsed.key,
          parsed.name,
          parsed.description,
          effectiveSiteId,
          parsed.assetId,
          parsed.costCenterId,
          parsed.workgroupId,
          parsed.classificationId,
          parsed.inspectionRoundId,
          parsed.plannedDurationMinutes,
          parsed.intervalUnit,
          parsed.intervalValue,
          anchorDate,
          nextDueAt,
          parsed.leadTimeDays,
          parsed.status,
          parsed.ignoreOpenWorkOrders,
        ],
      );
      const planId = inserted.rows[0]?.id;
      if (!planId) return null;
      await setPlanResponsibles(client, planId, parsed.responsibleEmployeeIds);
      return await fetchPlanRow(client, planId);
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    sendCreateError(res, err);
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
      const existing = await client.query<{ id: string }>(
        `
        SELECT "id"
        FROM "maintenancePlan"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        LIMIT 1
        `,
        [id, meta.userId],
      );
      if (!existing.rows[0]) return null;

      const nextDueAt = parsed.nextDueAt;
      const anchorDate = parsed.anchorDate;

      const effectiveSiteId = await assertPlanContext(client, meta.userId, parsed);
      await client.query(
        `
        UPDATE "maintenancePlan"
        SET
          "key" = $1,
          "name" = $2,
          "description" = $3,
          "siteId" = $4::uuid,
          "assetId" = $5::uuid,
          "costCenterId" = $6::uuid,
          "workgroupId" = $7::uuid,
          "classificationId" = $8::uuid,
          "inspectionRoundId" = $9::uuid,
          "plannedDurationMinutes" = $10::integer,
          "intervalUnit" = $11,
          "intervalValue" = $12::integer,
          "anchorDate" = $13::date,
          "nextDueAt" = $14::timestamptz,
          "leadTimeDays" = $15::integer,
          "status" = $16,
          "ignoreOpenWorkOrders" = $17
        WHERE "id" = $18::uuid
        `,
        [
          parsed.key,
          parsed.name,
          parsed.description,
          effectiveSiteId,
          parsed.assetId,
          parsed.costCenterId,
          parsed.workgroupId,
          parsed.classificationId,
          parsed.inspectionRoundId,
          parsed.plannedDurationMinutes,
          parsed.intervalUnit,
          parsed.intervalValue,
          anchorDate,
          nextDueAt,
          parsed.leadTimeDays,
          parsed.status,
          parsed.ignoreOpenWorkOrders,
          id,
        ],
      );
      await setPlanResponsibles(client, id, parsed.responsibleEmployeeIds);
      return await fetchPlanRow(client, id);
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    sendCreateError(res, err);
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
      const existing = await client.query<{ id: string; status: string }>(
        `
        SELECT "id", "status"
        FROM "maintenancePlan"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        LIMIT 1
        `,
        [id, meta.userId],
      );
      const row = existing.rows[0];
      if (!row) return 0;
      if (row.status !== "paused" && row.status !== "ended") {
        throw new Error("delete_requires_inactive");
      }
      const openWo = await client.query<{ id: string }>(
        `
        SELECT "id"
        FROM "workOrder"
        WHERE "maintenancePlanId" = $1::uuid
          AND "status" IN ('open', 'assigned', 'started', 'paused', 'continued')
        LIMIT 1
        `,
        [id],
      );
      if (openWo.rows[0]) {
        throw new Error("delete_blocked_open_work_order");
      }
      const result: QueryResult = await client.query(
        `DELETE FROM "maintenancePlan" WHERE "id" = $1::uuid`,
        [id],
      );
      return result.rowCount ?? 0;
    });
    if (deleted === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    const message = (err as Error).message;
    if (message === "delete_requires_inactive" || message === "delete_requires_paused_or_ended") {
      res.status(400).json({ error: "delete_requires_inactive" });
      return;
    }
    if (message === "delete_blocked_open_work_order") {
      res.status(409).json({ error: "delete_blocked_open_work_order" });
      return;
    }
    sendCreateError(res, err);
  }
});

export const maintenancePlansRouter = router;
