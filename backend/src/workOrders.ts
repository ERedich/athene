import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { QueryResult, QueryResultRow } from "pg";

import {
  deleteWorkOrderEmbeddings,
  reindexWorkOrder,
  reindexWorkOrderDocumentsForAsset,
  scheduleReindex,
} from "./assistant/embedding/index.js";
import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { assertClassificationForSiteAndScope } from "./classificationAssert.js";
import { withAuditContext, type AuditSessionMeta } from "./auditContext.js";
import { pool } from "./db.js";
import {
  DOCUMENT_MAX_BYTES,
  createDocument,
  deleteDocumentForEntity,
  getDocumentContentForWorkOrder,
  isDocumentCategory,
  listWorkOrderDocumentsWithAsset,
  patchDocumentForEntity,
  workOrderAssetDocumentCountSubquery,
  workOrderAssetDocumentCountSubqueryOnInsert,
  workOrderAssetDocumentCountSubqueryOnUpdate,
  workOrderDocumentCountSubquery,
  workOrderDocumentCountSubqueryOnInsert,
  workOrderDocumentCountSubqueryOnUpdate,
  type DocumentCategory,
} from "./documents/index.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";
import { broadcastWorkOrderCreated, broadcastWorkOrderUpdated } from "./workOrderRealtime.js";
import { buildWorkOrderListFilters } from "./workOrderListQuery.js";
import {
  calendarDayKey,
  computePlannedDurationMinutes,
  DEFAULT_PLANNING_TIME_ZONE,
  effectivePlannedEnd,
  getAssetPlanningConflicts,
  isBeforeLocalToday,
  type PlanningConflict,
  type PlanningOrderRow,
} from "./workOrderScheduling.js";

type WorkOrderType = "maintenance" | "repair" | "breakdown";
type WorkOrderStatus =
  | "open"
  | "assigned"
  | "started"
  | "paused"
  | "continued"
  | "ended"
  | "done"
  | "cancelled";
type WorkOrderRow = {
  id: string;
  orderNumber: number;
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
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationMinutes: number | null;
  orderType: WorkOrderType;
  status: WorkOrderStatus;
  responsibleEmployeeId: string | null;
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  doneBy: string | null;
  doneByEmployeeKey: string | null;
  doneByEmployeeName: string | null;
  pauseRemark: string | null;
  currentSegmentStartedAt: string | null;
  workgroupId: string | null;
  workgroupKey: string | null;
  workgroupName: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
  assetDocumentCount: number;
  assignedEmployeeCount: number;
  transactionCount: number;
  originalWo: string | null;
  originalWoOrderNumber: number | null;
  originalWoName: string | null;
};

type WorkOrderAssignmentRow = {
  id: string;
  workOrderId: string;
  employeeId: string;
  employeeKey: string;
  employeeName: string;
  createdAt: string;
  createdBy: string;
};

type ParsedBody = {
  name: string;
  description: string | null;
  assetId: string;
  costCenterId: string;
  plannedStart: string;
  plannedEnd: string | null;
  plannedDurationMinutes: number | null;
  orderType: WorkOrderType;
  responsibleEmployeeId: string | null;
  workgroupId: string;
  classificationId: string | null;
  originalWo: string | null;
};

type AssetSiteRow = QueryResultRow & { id: string; siteId: string };
type CostCenterSiteRow = QueryResultRow & { id: string; siteId: string };
type WorkOrderAccessRow = QueryResultRow & { id: string; siteId: string };

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES },
});

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedOrderTypes: WorkOrderType[] = ["maintenance", "repair", "breakdown"];
const allowedWorkOrderStatuses: WorkOrderStatus[] = [
  "open",
  "assigned",
  "started",
  "paused",
  "continued",
  "ended",
  "done",
  "cancelled",
];
function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function isWorkOrderType(value: unknown): value is WorkOrderType {
  return typeof value === "string" && (allowedOrderTypes as string[]).includes(value);
}

function isWorkOrderStatus(value: unknown): value is WorkOrderStatus {
  return typeof value === "string" && (allowedWorkOrderStatuses as string[]).includes(value);
}

function workOrderAssignmentsLocked(status: WorkOrderStatus): boolean {
  return status === "ended" || status === "done" || status === "cancelled";
}

type FeedbackStatusAction = "none" | "pause" | "end";

type ParsedAdditionalHours = { employeeId: string; hours: number };

type ParsedFeedbackBody = {
  hours: number;
  remark: string | null;
  statusAction: FeedbackStatusAction;
  pauseRemark: string | null;
  additionalHours: ParsedAdditionalHours[];
};

function parseFeedbackHours(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (value > 99999.9999) return null;
  return value;
}

function parsePauseRemark(value: unknown): string | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return "invalid";
  const t = value.trim();
  if (!t.length) return null;
  if (t.length > 2000) return "invalid";
  return t;
}

function parseFeedbackBody(body: unknown): ParsedFeedbackBody | "pause_remark_required" | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const hours = parseFeedbackHours(o.hours);
  if (hours === null) return null;

  let remark: string | null = null;
  if (o.remark !== undefined && o.remark !== null) {
    if (typeof o.remark !== "string") return null;
    const t = o.remark.trim();
    if (t.length > 2000) return null;
    remark = t.length ? t : null;
  }

  let statusAction: FeedbackStatusAction = "none";
  if (o.statusAction === "none" || o.statusAction === "pause" || o.statusAction === "end") {
    statusAction = o.statusAction;
  } else if (o.completeOrder === true) {
    statusAction = "end";
  }

  const pauseRemarkParsed = parsePauseRemark(o.pauseRemark);
  if (pauseRemarkParsed === "invalid") return null;
  if (statusAction === "pause" && pauseRemarkParsed === null) {
    return "pause_remark_required";
  }

  const additionalHours: ParsedAdditionalHours[] = [];
  if (o.additionalHours !== undefined && o.additionalHours !== null) {
    if (!Array.isArray(o.additionalHours)) return null;
    const seenEmployeeIds = new Set<string>();
    for (const item of o.additionalHours) {
      if (item === null || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const employeeId = typeof row.employeeId === "string" ? row.employeeId.trim() : "";
      if (!isUuid(employeeId)) return null;
      if (seenEmployeeIds.has(employeeId)) return null;
      seenEmployeeIds.add(employeeId);
      const rowHours = parseFeedbackHours(row.hours);
      if (rowHours === null) return null;
      additionalHours.push({ employeeId, hours: rowHours });
    }
  }

  return {
    hours,
    remark,
    statusAction,
    pauseRemark: pauseRemarkParsed,
    additionalHours,
  };
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

function parseBody(body: unknown): ParsedBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;

  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name || name.length > 200) return null;

  const descriptionRaw = readTrimmedOptionalString(o.description);
  if (descriptionRaw !== null && descriptionRaw.length > 2000) return null;

  const assetId = typeof o.assetId === "string" ? o.assetId.trim() : "";
  const costCenterId = typeof o.costCenterId === "string" ? o.costCenterId.trim() : "";
  if (!isUuid(assetId) || !isUuid(costCenterId)) return null;

  const plannedStart = parseIsoDatetime(o.plannedStart);
  if (!plannedStart) return null;

  const plannedEnd = o.plannedEnd === null || o.plannedEnd === undefined ? null : parseIsoDatetime(o.plannedEnd);
  if (o.plannedEnd !== null && o.plannedEnd !== undefined && !plannedEnd) return null;

  const rawDuration = o.plannedDurationMinutes;
  const plannedDurationMinutes =
    rawDuration === null || rawDuration === undefined
      ? null
      : typeof rawDuration === "number" && Number.isInteger(rawDuration) && rawDuration >= 0
        ? rawDuration
        : null;
  if (rawDuration !== null && rawDuration !== undefined && plannedDurationMinutes === null) return null;

  const orderType = o.orderType;
  if (!isWorkOrderType(orderType)) return null;

  const responsibleEmployeeIdRaw =
    typeof o.responsibleEmployeeId === "string" ? o.responsibleEmployeeId.trim() : "";
  const responsibleEmployeeId = responsibleEmployeeIdRaw ? responsibleEmployeeIdRaw : null;
  if (responsibleEmployeeId !== null && !isUuid(responsibleEmployeeId)) return null;

  if (typeof o.workgroupId !== "string") return null;
  const workgroupIdTrimmed = o.workgroupId.trim();
  if (!isUuid(workgroupIdTrimmed)) return null;

  const classificationIdRaw = readTrimmedOptionalString(o.classificationId);
  if (classificationIdRaw !== null && !isUuid(classificationIdRaw)) return null;

  const originalWoRaw = readTrimmedOptionalString(o.originalWo);
  if (originalWoRaw !== null && !isUuid(originalWoRaw)) return null;

  return {
    name,
    description: descriptionRaw,
    assetId,
    costCenterId,
    plannedStart,
    plannedEnd,
    plannedDurationMinutes,
    orderType,
    responsibleEmployeeId,
    workgroupId: workgroupIdTrimmed,
    classificationId: classificationIdRaw,
    originalWo: originalWoRaw,
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

const selectWorkOrdersSql = `
  SELECT
    w."id",
    w."orderNumber",
    w."name",
    w."description",
    w."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    w."assetId",
    a."key" AS "assetKey",
    a."name" AS "assetName",
    w."costCenterId",
    c."key" AS "costCenterKey",
    c."name" AS "costCenterName",
    w."classificationId",
    cl."key" AS "classificationKey",
    cl."name" AS "classificationName",
    w."plannedStart",
    w."plannedEnd",
    w."plannedDurationMinutes",
    w."orderType",
    w."status",
    w."responsibleEmployeeId",
    re."key" AS "responsibleEmployeeKey",
    re."name" AS "responsibleEmployeeName",
    w."doneBy",
    dbe."key" AS "doneByEmployeeKey",
    dbe."name" AS "doneByEmployeeName",
    w."pauseRemark",
    (
      SELECT h."occurredAt"
      FROM "workOrderStatusHistory" h
      WHERE h."workOrderId" = w."id"
        AND h."status" IN ('started', 'continued')
      ORDER BY h."occurredAt" DESC
      LIMIT 1
    ) AS "currentSegmentStartedAt",
    w."workgroupId",
    wg."key" AS "workgroupKey",
    wg."name" AS "workgroupName",
    w."originalWo",
    orig."orderNumber" AS "originalWoOrderNumber",
    orig."name" AS "originalWoName",
    w."createdAt",
    w."updatedAt",
    COALESCE(created_by."loginName", w."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", w."updatedBy"::text) AS "updatedBy",
    COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
    COALESCE(asset_doc_counts."assetDocumentCount", 0)::int AS "assetDocumentCount",
    COALESCE(assign_counts."assignedEmployeeCount", 0)::int AS "assignedEmployeeCount",
    COALESCE(tx_counts."transactionCount", 0)::int AS "transactionCount"
  FROM "workOrder" w
  JOIN "site" s ON s."id" = w."siteId"
  JOIN "asset" a ON a."id" = w."assetId"
  JOIN "costCenter" c ON c."id" = w."costCenterId"
  LEFT JOIN "classification" cl ON cl."id" = w."classificationId"
  LEFT JOIN "employee" re ON re."id" = w."responsibleEmployeeId"
  LEFT JOIN "employee" dbe ON dbe."id" = w."doneBy"
  LEFT JOIN "workgroup" wg ON wg."id" = w."workgroupId"
  LEFT JOIN "workOrder" orig ON orig."id" = w."originalWo"
  LEFT JOIN "users" created_by ON created_by."id" = w."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = w."updatedBy"
  ${workOrderDocumentCountSubquery}
  ${workOrderAssetDocumentCountSubquery}
  LEFT JOIN (
    SELECT "workOrderId", COUNT(*)::int AS "assignedEmployeeCount"
    FROM "workOrderEmployeeAssignment"
    GROUP BY "workOrderId"
  ) assign_counts ON assign_counts."workOrderId" = w."id"
  LEFT JOIN (
    SELECT "workOrderId", COUNT(*)::int AS "transactionCount"
    FROM "transaction"
    GROUP BY "workOrderId"
  ) tx_counts ON tx_counts."workOrderId" = w."id"
`;

async function assertAssetAndCostCenterContext(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  userId: string,
  assetId: string,
  costCenterId: string,
  siteIdOverride?: string,
): Promise<string> {
  const asset = await client.query<AssetSiteRow>(
    `
    SELECT "id", "siteId"
    FROM "asset"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    `,
    [assetId, userId],
  );
  const assetRow = asset.rows[0];
  if (!assetRow) throw new Error("invalid_asset");

  if (siteIdOverride && assetRow.siteId !== siteIdOverride) {
    throw new Error("asset_site_mismatch");
  }

  const cc = await client.query<CostCenterSiteRow>(
    `
    SELECT "id", "siteId"
    FROM "costCenter"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    `,
    [costCenterId, userId],
  );
  const ccRow = cc.rows[0];
  if (!ccRow) throw new Error("invalid_cost_center");
  if (ccRow.siteId !== assetRow.siteId) throw new Error("asset_cost_center_mismatch");

  return assetRow.siteId;
}

async function assertWorkgroupForOrderSite(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  userId: string,
  workgroupId: string | null,
  orderSiteId: string,
): Promise<void> {
  if (!workgroupId) return;
  const { rows } = await client.query<{ id: string }>(
    `
    SELECT w."id"
    FROM "workgroup" w
    WHERE w."id" = $1::uuid
      AND w."siteId" = $2::uuid
      AND ${siteAccessSql('w."siteId"', "$3")}
    `,
    [workgroupId, orderSiteId, userId],
  );
  if (!rows[0]) throw new Error("invalid_workgroup");
}

async function assertResponsibleEmployeeContext(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  userId: string,
  responsibleEmployeeId: string | null,
  siteId: string,
  workgroupId: string | null,
  kind: "responsible" | "assignment" = "responsible",
): Promise<void> {
  if (!responsibleEmployeeId) return;
  const employee = await client.query<QueryResultRow & { id: string; siteId: string }>(
    `
    SELECT "id", "siteId"::text AS "siteId"
    FROM "employee"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    `,
    [responsibleEmployeeId, userId],
  );
  const employeeRow = employee.rows[0];
  if (!employeeRow) throw new Error("invalid_responsible_employee");
  if (employeeRow.siteId !== siteId) throw new Error("responsible_employee_site_mismatch");
  if (workgroupId) {
    const m = await client.query<{ ok: string }>(
      `
      SELECT '1' AS ok
      FROM "workgroupUser"
      WHERE "workgroupId" = $1::uuid AND "employeeId" = $2::uuid
      LIMIT 1
      `,
      [workgroupId, responsibleEmployeeId],
    );
    if (!m.rows[0]) {
      throw new Error(
        kind === "responsible"
          ? "responsible_employee_not_in_workgroup"
          : "employee_not_in_workgroup",
      );
    }
  }
}

async function assertAssignmentsCompatibleWithWorkgroup(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  workOrderId: string,
  workgroupId: string | null,
): Promise<void> {
  if (!workgroupId) return;
  const { rowCount } = await client.query(
    `
    SELECT 1
    FROM "workOrderEmployeeAssignment" a
    WHERE a."workOrderId" = $1::uuid
      AND NOT EXISTS (
        SELECT 1
        FROM "workgroupUser" wu
        WHERE wu."workgroupId" = $2::uuid AND wu."employeeId" = a."employeeId"
      )
    LIMIT 1
    `,
    [workOrderId, workgroupId],
  );
  if ((rowCount ?? 0) > 0) throw new Error("assignments_incompatible_with_workgroup");
}

async function getAccessibleWorkOrder(
  userId: string,
  workOrderId: string,
): Promise<WorkOrderAccessRow | null> {
  const result = await pool.query<WorkOrderAccessRow>(
    `
    SELECT "id", "siteId"
    FROM "workOrder"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    `,
    [workOrderId, userId],
  );
  return result.rows[0] ?? null;
}

async function getWorkOrderRowForRealtime(workOrderId: string): Promise<WorkOrderRow | null> {
  const { rows } = await pool.query<WorkOrderRow>(
    `
    ${selectWorkOrdersSql}
    WHERE w."id" = $1::uuid
    LIMIT 1
    `,
    [workOrderId],
  );
  return rows[0] ?? null;
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const built = await buildWorkOrderListFilters(req.query, userId, pool);
    if (!built.ok) {
      res.status(built.status).json({ error: built.error });
      return;
    }
    const extraWhere = built.conditions.length ? ` AND ${built.conditions.join(" AND ")}` : "";
    const { rows } = await pool.query<WorkOrderRow>(
      `
      ${selectWorkOrdersSql}
      WHERE ${siteAccessSql('w."siteId"', "$1")}
      ${extraWhere}
      ORDER BY w."orderNumber" DESC
      `,
      [userId, ...built.params],
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/:id/planning-conflicts", async (req: Request, res: Response) => {
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
  const plannedStart = parseIsoDatetime(req.query.plannedStart);
  const plannedEnd =
    req.query.plannedEnd === undefined || req.query.plannedEnd === ""
      ? null
      : parseIsoDatetime(req.query.plannedEnd);
  if (!plannedStart || (req.query.plannedEnd && !plannedEnd)) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const assetIdRaw = typeof req.query.assetId === "string" ? req.query.assetId.trim() : "";
  const assetIdOverride = isUuid(assetIdRaw) ? assetIdRaw : undefined;
  try {
    const check = await checkWorkOrderAssetPlanningConflicts(
      userId,
      id,
      plannedStart,
      plannedEnd,
      [],
      assetIdOverride ? { assetId: assetIdOverride } : undefined,
    );
    if ("error" in check) {
      res.status(check.error === "not_found" ? 404 : 400).json({ error: check.error });
      return;
    }
    res.json(check);
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
    const access = await getAccessibleWorkOrder(userId, id);
    if (!access) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const row = await getWorkOrderRowForRealtime(id);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/:id/assignments", async (req: Request, res: Response) => {
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
    const workOrder = await getAccessibleWorkOrder(userId, id);
    if (!workOrder) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const { rows } = await pool.query<WorkOrderAssignmentRow>(
      `
      SELECT
        a."id",
        a."workOrderId",
        a."employeeId",
        e."key" AS "employeeKey",
        e."name" AS "employeeName",
        a."createdAt",
        COALESCE(cu."loginName", a."createdBy"::text) AS "createdBy"
      FROM "workOrderEmployeeAssignment" a
      JOIN "employee" e ON e."id" = a."employeeId"
      LEFT JOIN "users" cu ON cu."id" = a."createdBy"
      WHERE a."workOrderId" = $1::uuid
      ORDER BY e."key" ASC
      `,
      [id],
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/:id/status-history", async (req: Request, res: Response) => {
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
    const workOrder = await getAccessibleWorkOrder(userId, id);
    if (!workOrder) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const { rows } = await pool.query<{ status: string; occurredAt: string }>(
      `
      SELECT h."status", h."occurredAt"::text AS "occurredAt"
      FROM "workOrderStatusHistory" h
      WHERE h."workOrderId" = $1::uuid
      ORDER BY h."occurredAt" ASC
      `,
      [id],
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/:id/assignments", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { id } = req.params;
  const employeeId = typeof req.body?.employeeId === "string" ? req.body.employeeId.trim() : "";
  if (!isUuid(id) || !isUuid(employeeId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const workOrder = await client.query<
        QueryResultRow & { id: string; siteId: string; status: string; workgroupId: string | null }
      >(
        `
        SELECT "id", "siteId"::text AS "siteId", "status", "workgroupId"::text AS "workgroupId"
        FROM "workOrder"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      const wo = workOrder.rows[0];
      if (!wo) return null;
      if (!isWorkOrderStatus(wo.status)) throw new Error("invalid_status");
      if (workOrderAssignmentsLocked(wo.status)) throw new Error("assignment_locked_by_status");
      await assertResponsibleEmployeeContext(
        client,
        meta.userId,
        employeeId,
        wo.siteId,
        wo.workgroupId,
        "assignment",
      );
      await client.query(
        `
        INSERT INTO "workOrderEmployeeAssignment" ("workOrderId", "employeeId")
        VALUES ($1::uuid, $2::uuid)
        ON CONFLICT ("workOrderId", "employeeId") DO NOTHING
        `,
        [id, employeeId],
      );
      if (wo.status === "open") {
        await client.query(`UPDATE "workOrder" SET "status" = 'assigned' WHERE "id" = $1::uuid`, [id]);
      }
      const { rows } = await client.query<WorkOrderAssignmentRow>(
        `
        SELECT
          a."id",
          a."workOrderId",
          a."employeeId",
          e."key" AS "employeeKey",
          e."name" AS "employeeName",
          a."createdAt",
          COALESCE(cu."loginName", a."createdBy"::text) AS "createdBy"
        FROM "workOrderEmployeeAssignment" a
        JOIN "employee" e ON e."id" = a."employeeId"
        LEFT JOIN "users" cu ON cu."id" = a."createdBy"
        WHERE a."workOrderId" = $1::uuid
          AND a."employeeId" = $2::uuid
        LIMIT 1
        `,
        [id, employeeId],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(201).json(row);
    const updatedOrder = await getWorkOrderRowForRealtime(id);
    if (updatedOrder) {
      void broadcastWorkOrderUpdated(updatedOrder.siteId, updatedOrder).catch((err) => {
        console.error("[work-order-realtime] broadcast updated failed", err);
      });
    }
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "assignment_locked_by_status") {
      res.status(409).json({ error: "assignment_locked_by_status" });
      return;
    }
    if (message === "invalid_responsible_employee") {
      res.status(400).json({ error: "invalid_employee" });
      return;
    }
    if (message === "responsible_employee_site_mismatch") {
      res.status(400).json({ error: "employee_site_mismatch" });
      return;
    }
    if (message === "employee_not_in_workgroup") {
      res.status(400).json({ error: "employee_not_in_workgroup" });
      return;
    }
    sendPgError(res, err);
  }
});

router.delete("/:id/assignments/:employeeId", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { id, employeeId } = req.params;
  if (!isUuid(id) || !isUuid(employeeId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const deleted = await withAuditContext(meta, async (client) => {
      const workOrder = await client.query<QueryResultRow & { id: string; siteId: string; status: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId", "status"
        FROM "workOrder"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      const wo = workOrder.rows[0];
      if (!wo) return 0;
      if (!isWorkOrderStatus(wo.status)) throw new Error("invalid_status");
      if (workOrderAssignmentsLocked(wo.status)) throw new Error("assignment_locked_by_status");
      const result = await client.query(
        `
        DELETE FROM "workOrderEmployeeAssignment"
        WHERE "workOrderId" = $1::uuid
          AND "employeeId" = $2::uuid
        `,
        [id, employeeId],
      );
      return result.rowCount ?? 0;
    });
    if (deleted === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).send();
    const updatedOrder = await getWorkOrderRowForRealtime(id);
    if (updatedOrder) {
      void broadcastWorkOrderUpdated(updatedOrder.siteId, updatedOrder).catch((err) => {
        console.error("[work-order-realtime] broadcast updated failed", err);
      });
    }
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "assignment_locked_by_status") {
      res.status(409).json({ error: "assignment_locked_by_status" });
      return;
    }
    sendPgError(res, err);
  }
});

router.post("/:id/start", async (req: Request, res: Response) => {
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
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const wo = await client.query<QueryResultRow & { id: string; siteId: string; status: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId", "status"
        FROM "workOrder"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      const current = wo.rows[0];
      if (!current) return null;
      if (!isWorkOrderStatus(current.status)) throw new Error("invalid_status");
      if (!["open", "assigned", "paused"].includes(current.status)) throw new Error("cannot_start_from_status");
      const nextStatus: WorkOrderStatus = current.status === "paused" ? "continued" : "started";
      await client.query(`UPDATE "workOrder" SET "status" = $2::text WHERE "id" = $1::uuid`, [id, nextStatus]);
      const { rows } = await client.query<WorkOrderRow>(
        `
        ${selectWorkOrdersSql}
        WHERE w."id" = $1::uuid
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
    void broadcastWorkOrderUpdated(row.siteId, row).catch((err) => {
      console.error("[work-order-realtime] broadcast updated failed", err);
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "cannot_start_from_status") {
      res.status(409).json({ error: "cannot_start_from_status" });
      return;
    }
    sendPgError(res, err);
  }
});

router.post("/:id/pause", async (req: Request, res: Response) => {
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
  const pauseRemarkParsed = parsePauseRemark(
    req.body !== null && typeof req.body === "object"
      ? (req.body as Record<string, unknown>).pauseRemark
      : undefined,
  );
  if (pauseRemarkParsed === "invalid" || pauseRemarkParsed === null) {
    res.status(400).json({ error: "pause_remark_required" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const wo = await client.query<QueryResultRow & { id: string; siteId: string; status: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId", "status"
        FROM "workOrder"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      const current = wo.rows[0];
      if (!current) return null;
      if (!isWorkOrderStatus(current.status)) throw new Error("invalid_status");
      if (!["started", "continued"].includes(current.status)) throw new Error("cannot_pause_from_status");
      await client.query(
        `UPDATE "workOrder" SET "status" = 'paused', "pauseRemark" = $2 WHERE "id" = $1::uuid`,
        [id, pauseRemarkParsed],
      );
      const { rows } = await client.query<WorkOrderRow>(
        `
        ${selectWorkOrdersSql}
        WHERE w."id" = $1::uuid
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
    void broadcastWorkOrderUpdated(row.siteId, row).catch((err) => {
      console.error("[work-order-realtime] broadcast updated failed", err);
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "cannot_pause_from_status") {
      res.status(409).json({ error: "cannot_pause_from_status" });
      return;
    }
    sendPgError(res, err);
  }
});

router.post("/:id/cancel", async (req: Request, res: Response) => {
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
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const wo = await client.query<QueryResultRow & { id: string; siteId: string; status: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId", "status"
        FROM "workOrder"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      const current = wo.rows[0];
      if (!current) return null;
      if (!isWorkOrderStatus(current.status)) throw new Error("invalid_status");
      if (current.status === "ended" || current.status === "done" || current.status === "cancelled") {
        throw new Error("cannot_cancel_from_status");
      }
      await client.query(`UPDATE "workOrder" SET "status" = 'cancelled' WHERE "id" = $1::uuid`, [id]);
      const { rows } = await client.query<WorkOrderRow>(
        `
        ${selectWorkOrdersSql}
        WHERE w."id" = $1::uuid
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
    void broadcastWorkOrderUpdated(row.siteId, row).catch((err) => {
      console.error("[work-order-realtime] broadcast updated failed", err);
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "cannot_cancel_from_status") {
      res.status(409).json({ error: "cannot_cancel_from_status" });
      return;
    }
    sendPgError(res, err);
  }
});

router.post("/:id/feedback", async (req: Request, res: Response) => {
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
  const parsed = parseFeedbackBody(req.body);
  if (parsed === "pause_remark_required") {
    res.status(400).json({ error: "pause_remark_required" });
    return;
  }
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const wo = await client.query<QueryResultRow & { id: string; siteId: string; status: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId", "status"
        FROM "workOrder"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      const current = wo.rows[0];
      if (!current) return null;
      if (!isWorkOrderStatus(current.status)) throw new Error("invalid_status");
      if (!["started", "continued", "ended"].includes(current.status)) {
        throw new Error("cannot_feedback_from_status");
      }

      const userEmp = await client.query<{ employeeId: string | null }>(
        `SELECT "employeeId" FROM "users" WHERE "id" = $1::uuid LIMIT 1`,
        [meta.userId],
      );
      const sessionEmployeeId = userEmp.rows[0]?.employeeId ?? null;

      if (sessionEmployeeId) {
        for (const extra of parsed.additionalHours) {
          if (extra.employeeId === sessionEmployeeId) {
            throw new Error("duplicate_feedback_employee");
          }
        }
      }

      for (const extra of parsed.additionalHours) {
        const emp = await client.query<{ id: string }>(
          `
          SELECT e."id"
          FROM "employee" e
          WHERE e."id" = $1::uuid
            AND e."siteId" = $2::uuid
            AND e."isActive" = true
          LIMIT 1
          `,
          [extra.employeeId, current.siteId],
        );
        if (!emp.rows[0]) throw new Error("invalid_additional_hours");
      }

      const qtyRounded = Math.round(parsed.hours * 10_000) / 10_000;
      await client.query(
        `
        INSERT INTO "transaction" ("siteId", "type", "quantity", "workOrderId", "remark", "employeeId")
        VALUES ($1::uuid, 'IN', $2::numeric, $3::uuid, $4, $5::uuid)
        `,
        [current.siteId, qtyRounded, id, parsed.remark, sessionEmployeeId],
      );

      for (const extra of parsed.additionalHours) {
        const extraQty = Math.round(extra.hours * 10_000) / 10_000;
        await client.query(
          `
          INSERT INTO "transaction" ("siteId", "type", "quantity", "workOrderId", "remark", "employeeId")
          VALUES ($1::uuid, 'IN', $2::numeric, $3::uuid, NULL, $4::uuid)
          `,
          [current.siteId, extraQty, id, extra.employeeId],
        );
      }

      if (parsed.statusAction === "pause") {
        await client.query(
          `
          UPDATE "workOrder"
          SET "status" = 'paused', "pauseRemark" = $2
          WHERE "id" = $1::uuid
          `,
          [id, parsed.pauseRemark],
        );
      } else if (parsed.statusAction === "end" && current.status !== "ended") {
        await client.query(
          `
          UPDATE "workOrder"
          SET
            "status" = 'ended',
            "doneBy" = COALESCE($2::uuid, "doneBy")
          WHERE "id" = $1::uuid
          `,
          [id, sessionEmployeeId],
        );
      }
      const { rows } = await client.query<WorkOrderRow>(
        `
        ${selectWorkOrdersSql}
        WHERE w."id" = $1::uuid
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
    void broadcastWorkOrderUpdated(row.siteId, row).catch((err) => {
      console.error("[work-order-realtime] broadcast updated failed", err);
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "cannot_feedback_from_status") {
      res.status(409).json({ error: "cannot_feedback_from_status" });
      return;
    }
    if (message === "duplicate_feedback_employee") {
      res.status(400).json({ error: "duplicate_feedback_employee" });
      return;
    }
    if (message === "invalid_additional_hours") {
      res.status(400).json({ error: "invalid_additional_hours" });
      return;
    }
    sendPgError(res, err);
  }
});

router.get("/:id/documents", async (req: Request, res: Response) => {
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
    const rows = await listWorkOrderDocumentsWithAsset(userId, id);
    if (rows === null) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/:id/documents", upload.single("file"), async (req: Request, res: Response) => {
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
  if (!req.file) {
    res.status(400).json({ error: "missing_file" });
    return;
  }

  const fileName = req.file.originalname?.trim() || "document";
  const displayNameRaw = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
  const displayName = displayNameRaw || fileName;
  const categoryRaw = typeof req.body?.category === "string" ? req.body.category : "general";
  if (!isDocumentCategory(categoryRaw)) {
    res.status(400).json({ error: "invalid_document_category" });
    return;
  }
  const mimeType = req.file.mimetype?.trim() || "application/octet-stream";
  const content = req.file.buffer;
  const fileSize = req.file.size;

  try {
    const meta = auditMeta(req);
    const row = await createDocument(meta, {
      fileName,
      displayName,
      category: categoryRaw,
      mimeType,
      fileSize,
      content,
      referenceApp: "workOrders",
      entityType: "workOrder",
      entityId: id,
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

router.get("/:id/documents/:documentId/content", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { id, documentId } = req.params;
  if (!isUuid(id) || !isUuid(documentId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }

  try {
    const doc = await getDocumentContentForWorkOrder(userId, id, documentId);
    if (!doc) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const encodedName = encodeURIComponent(doc.displayName || doc.fileName);
    res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", String(doc.fileSize));
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodedName}`);
    res.send(doc.content);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.patch("/:id/documents/:documentId", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { id, documentId } = req.params;
  if (!isUuid(id) || !isUuid(documentId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const body = req.body;
  const displayNameRaw =
    typeof body?.displayName === "string" ? (body.displayName as string).trim() : undefined;
  const categoryRaw = typeof body?.category === "string" ? (body.category as string).trim() : undefined;
  if (displayNameRaw === undefined && categoryRaw === undefined) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  if (displayNameRaw !== undefined && !displayNameRaw) {
    res.status(400).json({ error: "invalid_display_name" });
    return;
  }
  if (categoryRaw !== undefined && !isDocumentCategory(categoryRaw)) {
    res.status(400).json({ error: "invalid_document_category" });
    return;
  }

  const patch: { displayName?: string; category?: DocumentCategory } = {};
  if (displayNameRaw !== undefined) patch.displayName = displayNameRaw;
  if (categoryRaw !== undefined) patch.category = categoryRaw;

  try {
    const meta = auditMeta(req);
    const row = await patchDocumentForEntity(meta, "workOrder", id, documentId, patch);
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

router.delete("/:id/documents/:documentId", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { id, documentId } = req.params;
  if (!isUuid(id) || !isUuid(documentId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }

  try {
    const meta = auditMeta(req);
    const deleted = await deleteDocumentForEntity(meta, "workOrder", id, documentId);
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

router.post("/", async (req: Request, res: Response) => {
  const parsed = parseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const siteIdFromRelations = await assertAssetAndCostCenterContext(
        client,
        meta.userId,
        parsed.assetId,
        parsed.costCenterId,
      );
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange
        ? siteIdFromRelations
        : await getWorkingSiteId(client, meta.userId);
      if (effectiveSiteId !== siteIdFromRelations) {
        throw new Error("site_access_denied");
      }
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertWorkgroupForOrderSite(client, meta.userId, parsed.workgroupId, effectiveSiteId);
      await assertResponsibleEmployeeContext(
        client,
        meta.userId,
        parsed.responsibleEmployeeId,
        effectiveSiteId,
        parsed.workgroupId,
      );
      await assertClassificationForSiteAndScope(
        client,
        meta.userId,
        effectiveSiteId,
        parsed.classificationId,
        "work_order",
      );

      if (parsed.originalWo) {
        const template = await getAccessibleWorkOrder(meta.userId, parsed.originalWo);
        if (!template) throw new Error("invalid_original_wo");
      }

      const { rows } = await client.query<WorkOrderRow>(
        `
        WITH inserted AS (
          INSERT INTO "workOrder"
            ("name", "description", "siteId", "assetId", "costCenterId", "plannedStart", "plannedEnd", "plannedDurationMinutes", "orderType", "status", "responsibleEmployeeId", "workgroupId", "classificationId", "originalWo")
          VALUES
            ($1, $2, $3::uuid, $4::uuid, $5::uuid, $6::timestamptz, $7::timestamptz, $8::integer, $9, 'open', $10::uuid, $11::uuid, $12::uuid, $13::uuid)
          RETURNING *
        )
        SELECT
          i."id",
          i."orderNumber",
          i."name",
          i."description",
          i."siteId",
          s."key" AS "siteKey",
          s."name" AS "siteName",
          s."colorHex" AS "siteColorHex",
          i."assetId",
          a."key" AS "assetKey",
          a."name" AS "assetName",
          i."costCenterId",
          c."key" AS "costCenterKey",
          c."name" AS "costCenterName",
          i."classificationId",
          cl."key" AS "classificationKey",
          cl."name" AS "classificationName",
          i."plannedStart",
          i."plannedEnd",
          i."plannedDurationMinutes",
          i."orderType",
          i."status",
          i."responsibleEmployeeId",
          re."key" AS "responsibleEmployeeKey",
          re."name" AS "responsibleEmployeeName",
          i."doneBy",
          dbe."key" AS "doneByEmployeeKey",
          dbe."name" AS "doneByEmployeeName",
          i."workgroupId",
          wg."key" AS "workgroupKey",
          wg."name" AS "workgroupName",
          i."originalWo",
          orig."orderNumber" AS "originalWoOrderNumber",
          orig."name" AS "originalWoName",
          i."createdAt",
          i."updatedAt",
          COALESCE(created_by."loginName", i."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", i."updatedBy"::text) AS "updatedBy",
          0::int AS "documentCount",
          COALESCE(asset_doc_counts."assetDocumentCount", 0)::int AS "assetDocumentCount",
          0::int AS "assignedEmployeeCount",
          0::int AS "transactionCount"
        FROM inserted i
        JOIN "site" s ON s."id" = i."siteId"
        JOIN "asset" a ON a."id" = i."assetId"
        JOIN "costCenter" c ON c."id" = i."costCenterId"
        LEFT JOIN "classification" cl ON cl."id" = i."classificationId"
        LEFT JOIN "employee" re ON re."id" = i."responsibleEmployeeId"
        LEFT JOIN "employee" dbe ON dbe."id" = i."doneBy"
        LEFT JOIN "workgroup" wg ON wg."id" = i."workgroupId"
        LEFT JOIN "workOrder" orig ON orig."id" = i."originalWo"
        LEFT JOIN "users" created_by ON created_by."id" = i."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = i."updatedBy"
        ${workOrderAssetDocumentCountSubqueryOnInsert}
        `,
        [
          parsed.name,
          parsed.description,
          effectiveSiteId,
          parsed.assetId,
          parsed.costCenterId,
          parsed.plannedStart,
          parsed.plannedEnd,
          parsed.plannedDurationMinutes,
          parsed.orderType,
          parsed.responsibleEmployeeId,
          parsed.workgroupId,
          parsed.classificationId,
          parsed.originalWo,
        ],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
    scheduleReindex(`workOrder ${row.id}`, () => reindexWorkOrder(row.id));
    void broadcastWorkOrderCreated(row.siteId, row).catch((err) => {
      console.error("[work-order-realtime] broadcast failed", err);
    });
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
    if (message === "invalid_cost_center") {
      res.status(400).json({ error: "invalid_cost_center" });
      return;
    }
    if (message === "invalid_classification") {
      res.status(400).json({ error: "invalid_classification" });
      return;
    }
    if (message === "asset_cost_center_mismatch") {
      res.status(400).json({ error: "asset_cost_center_mismatch" });
      return;
    }
    if (message === "invalid_responsible_employee") {
      res.status(400).json({ error: "invalid_responsible_employee" });
      return;
    }
    if (message === "responsible_employee_site_mismatch") {
      res.status(400).json({ error: "responsible_employee_site_mismatch" });
      return;
    }
    if (message === "invalid_workgroup") {
      res.status(400).json({ error: "invalid_workgroup" });
      return;
    }
    if (message === "responsible_employee_not_in_workgroup") {
      res.status(400).json({ error: "responsible_employee_not_in_workgroup" });
      return;
    }
    if (message === "invalid_original_wo") {
      res.status(400).json({ error: "invalid_original_wo" });
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
    const userId = req.session.userId;
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const allowAssetOverlap = readAllowAssetOverlap(req.body);
    if (!allowAssetOverlap) {
      const check = await checkWorkOrderAssetPlanningConflicts(
        userId,
        id,
        parsed.plannedStart,
        parsed.plannedEnd,
        [],
        { assetId: parsed.assetId },
      );
      if ("error" in check) {
        res.status(check.error === "not_found" ? 404 : 400).json({ error: check.error });
        return;
      }
      if (check.conflicts.length > 0) {
        res.status(409).json({
          error: "asset_conflict",
          assetKey: check.assetKey,
          assetName: check.assetName,
          conflicts: check.conflicts,
          sameDayConflict: check.sameDayConflict,
        });
        return;
      }
    }

    const meta = auditMeta(req);
    const previousAsset = await pool.query<{ assetId: string }>(
      `
      SELECT "assetId"::text AS "assetId"
      FROM "workOrder"
      WHERE "id" = $1::uuid
      LIMIT 1
      `,
      [id],
    );
    const previousAssetId = previousAsset.rows[0]?.assetId;

    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<QueryResultRow & { id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "workOrder"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      const existingRow = existing.rows[0];
      if (!existingRow) return null;

      const siteIdFromRelations = await assertAssetAndCostCenterContext(
        client,
        meta.userId,
        parsed.assetId,
        parsed.costCenterId,
      );
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteIdFromRelations : existingRow.siteId;
      if (effectiveSiteId !== siteIdFromRelations) {
        throw new Error("site_access_denied");
      }

      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertWorkgroupForOrderSite(client, meta.userId, parsed.workgroupId, effectiveSiteId);
      await assertAssignmentsCompatibleWithWorkgroup(client, id, parsed.workgroupId);
      await assertResponsibleEmployeeContext(
        client,
        meta.userId,
        parsed.responsibleEmployeeId,
        effectiveSiteId,
        parsed.workgroupId,
      );
      await assertClassificationForSiteAndScope(
        client,
        meta.userId,
        effectiveSiteId,
        parsed.classificationId,
        "work_order",
      );

      const { rows } = await client.query<WorkOrderRow>(
        `
        WITH updated AS (
          UPDATE "workOrder"
          SET
            "name" = $1,
            "description" = $2,
            "siteId" = $3::uuid,
            "assetId" = $4::uuid,
            "costCenterId" = $5::uuid,
            "plannedStart" = $6::timestamptz,
            "plannedEnd" = $7::timestamptz,
            "plannedDurationMinutes" = $8::integer,
            "orderType" = $9,
            "responsibleEmployeeId" = $10::uuid,
            "workgroupId" = $11::uuid,
            "classificationId" = $12::uuid
          WHERE "id" = $13::uuid
          RETURNING *
        )
        SELECT
          u."id",
          u."orderNumber",
          u."name",
          u."description",
          u."siteId",
          s."key" AS "siteKey",
          s."name" AS "siteName",
          s."colorHex" AS "siteColorHex",
          u."assetId",
          a."key" AS "assetKey",
          a."name" AS "assetName",
          u."costCenterId",
          c."key" AS "costCenterKey",
          c."name" AS "costCenterName",
          u."classificationId",
          clf."key" AS "classificationKey",
          clf."name" AS "classificationName",
          u."plannedStart",
          u."plannedEnd",
          u."plannedDurationMinutes",
          u."orderType",
          u."status",
          u."responsibleEmployeeId",
          re."key" AS "responsibleEmployeeKey",
          re."name" AS "responsibleEmployeeName",
          u."doneBy",
          dbe."key" AS "doneByEmployeeKey",
          dbe."name" AS "doneByEmployeeName",
          u."workgroupId",
          wg."key" AS "workgroupKey",
          wg."name" AS "workgroupName",
          u."originalWo",
          orig."orderNumber" AS "originalWoOrderNumber",
          orig."name" AS "originalWoName",
          u."createdAt",
          u."updatedAt",
          COALESCE(created_by."loginName", u."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", u."updatedBy"::text) AS "updatedBy",
          COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
          COALESCE(asset_doc_counts."assetDocumentCount", 0)::int AS "assetDocumentCount",
          COALESCE(assign_counts."assignedEmployeeCount", 0)::int AS "assignedEmployeeCount",
          COALESCE(tx_counts."transactionCount", 0)::int AS "transactionCount"
        FROM updated u
        JOIN "site" s ON s."id" = u."siteId"
        JOIN "asset" a ON a."id" = u."assetId"
        JOIN "costCenter" c ON c."id" = u."costCenterId"
        LEFT JOIN "classification" clf ON clf."id" = u."classificationId"
        LEFT JOIN "employee" re ON re."id" = u."responsibleEmployeeId"
        LEFT JOIN "employee" dbe ON dbe."id" = u."doneBy"
        LEFT JOIN "workgroup" wg ON wg."id" = u."workgroupId"
        LEFT JOIN "workOrder" orig ON orig."id" = u."originalWo"
        LEFT JOIN "users" created_by ON created_by."id" = u."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = u."updatedBy"
        ${workOrderDocumentCountSubqueryOnUpdate}
        ${workOrderAssetDocumentCountSubqueryOnUpdate}
        LEFT JOIN (
          SELECT "workOrderId", COUNT(*)::int AS "assignedEmployeeCount"
          FROM "workOrderEmployeeAssignment"
          GROUP BY "workOrderId"
        ) assign_counts ON assign_counts."workOrderId" = u."id"
        LEFT JOIN (
          SELECT "workOrderId", COUNT(*)::int AS "transactionCount"
          FROM "transaction"
          GROUP BY "workOrderId"
        ) tx_counts ON tx_counts."workOrderId" = u."id"
        `,
        [
          parsed.name,
          parsed.description,
          effectiveSiteId,
          parsed.assetId,
          parsed.costCenterId,
          parsed.plannedStart,
          parsed.plannedEnd,
          parsed.plannedDurationMinutes,
          parsed.orderType,
          parsed.responsibleEmployeeId,
          parsed.workgroupId,
          parsed.classificationId,
          id,
        ],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
    scheduleReindex(`workOrder ${row.id}`, () => reindexWorkOrder(row.id));
    if (previousAssetId && previousAssetId !== row.assetId) {
      scheduleReindex(`workOrder asset docs ${previousAssetId}`, () =>
        reindexWorkOrderDocumentsForAsset(previousAssetId),
      );
      scheduleReindex(`workOrder asset docs ${row.assetId}`, () =>
        reindexWorkOrderDocumentsForAsset(row.assetId),
      );
    }
    void broadcastWorkOrderUpdated(row.siteId, row).catch((err) => {
      console.error("[work-order-realtime] broadcast updated failed", err);
    });
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
    if (message === "invalid_cost_center") {
      res.status(400).json({ error: "invalid_cost_center" });
      return;
    }
    if (message === "invalid_classification") {
      res.status(400).json({ error: "invalid_classification" });
      return;
    }
    if (message === "asset_cost_center_mismatch") {
      res.status(400).json({ error: "asset_cost_center_mismatch" });
      return;
    }
    if (message === "invalid_responsible_employee") {
      res.status(400).json({ error: "invalid_responsible_employee" });
      return;
    }
    if (message === "responsible_employee_site_mismatch") {
      res.status(400).json({ error: "responsible_employee_site_mismatch" });
      return;
    }
    if (message === "invalid_workgroup") {
      res.status(400).json({ error: "invalid_workgroup" });
      return;
    }
    if (message === "responsible_employee_not_in_workgroup") {
      res.status(400).json({ error: "responsible_employee_not_in_workgroup" });
      return;
    }
    if (message === "assignments_incompatible_with_workgroup") {
      res.status(400).json({ error: "assignments_incompatible_with_workgroup" });
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
        DELETE FROM "workOrder"
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
    scheduleReindex(`delete workOrder ${id}`, () => deleteWorkOrderEmbeddings(id));
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

export type WorkOrderPlanningConflictCheck = {
  assetId: string;
  assetKey: string;
  assetName: string;
  conflicts: PlanningConflict[];
  /** True when at least one conflicting order shares a calendar day with the proposed range. */
  sameDayConflict: boolean;
};

function hasConflictOnSameCalendarDay(
  plannedStart: Date,
  plannedEnd: Date,
  conflicts: PlanningConflict[],
  timeZone = DEFAULT_PLANNING_TIME_ZONE,
): boolean {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const days = new Set<string>();
  for (let t = plannedStart.getTime(); t <= plannedEnd.getTime(); t += MS_PER_DAY) {
    days.add(calendarDayKey(new Date(t), timeZone));
  }
  return conflicts.some((c) => {
    const conflictStart = new Date(c.plannedStart);
    const conflictEnd = effectivePlannedEnd(c.plannedStart, c.plannedEnd);
    for (let t = conflictStart.getTime(); t <= conflictEnd.getTime(); t += MS_PER_DAY) {
      if (days.has(calendarDayKey(new Date(t), timeZone))) return true;
    }
    return false;
  });
}

export async function checkWorkOrderAssetPlanningConflicts(
  userId: string,
  workOrderId: string,
  plannedStartIso: string,
  plannedEndIso: string | null,
  excludeWorkOrderIds: string[] = [],
  options?: { assetId?: string },
): Promise<WorkOrderPlanningConflictCheck | { error: "not_found" | "invalid_body" }> {
  if (!isUuid(workOrderId)) {
    return { error: "invalid_body" };
  }

  const existing = await pool.query<{
    assetId: string;
    assetKey: string;
    assetName: string;
    plannedStart: string;
    plannedEnd: string | null;
  }>(
    `
    SELECT
      w."assetId"::text AS "assetId",
      a."key" AS "assetKey",
      a."name" AS "assetName",
      w."plannedStart",
      w."plannedEnd"
    FROM "workOrder" w
    JOIN "asset" a ON a."id" = w."assetId"
    WHERE w."id" = $1::uuid
      AND ${siteAccessSql('w."siteId"', "$2")}
    LIMIT 1
    `,
    [workOrderId, userId],
  );
  const row = existing.rows[0];
  if (!row) {
    return { error: "not_found" };
  }

  const assetId =
    options?.assetId && isUuid(options.assetId) ? options.assetId : row.assetId;
  let assetKey = row.assetKey;
  let assetName = row.assetName;
  if (assetId !== row.assetId) {
    const asset = await pool.query<{ key: string; name: string }>(
      `
      SELECT a."key", a."name"
      FROM "asset" a
      WHERE a."id" = $1::uuid
        AND ${siteAccessSql('a."siteId"', "$2")}
      LIMIT 1
      `,
      [assetId, userId],
    );
    const assetRow = asset.rows[0];
    if (!assetRow) {
      return { error: "invalid_body" };
    }
    assetKey = assetRow.key;
    assetName = assetRow.name;
  }

  const proposedStart = new Date(plannedStartIso);
  const proposedEnd = effectivePlannedEnd(plannedStartIso, plannedEndIso);
  if (Number.isNaN(proposedStart.getTime()) || Number.isNaN(proposedEnd.getTime())) {
    return { error: "invalid_body" };
  }

  const currentEnd = effectivePlannedEnd(row.plannedStart, row.plannedEnd);
  const windowStart = new Date(
    Math.min(proposedStart.getTime(), new Date(row.plannedStart).getTime()) - 14 * 24 * 60 * 60 * 1000,
  );
  const windowEnd = new Date(
    Math.max(proposedEnd.getTime(), currentEnd.getTime()) + 14 * 24 * 60 * 60 * 1000,
  );
  const { rows: overlapping } = await pool.query<PlanningOrderRow>(
    `
    SELECT
      w."id",
      w."orderNumber",
      w."name",
      w."assetId",
      a."key" AS "assetKey",
      w."plannedStart",
      w."plannedEnd"
    FROM "workOrder" w
    JOIN "asset" a ON a."id" = w."assetId"
    WHERE ${siteAccessSql('w."siteId"', "$1")}
      AND w."assetId" = $2::uuid
      AND w."plannedStart" <= $4::timestamptz
      AND (w."plannedEnd" IS NULL OR w."plannedEnd" >= $3::timestamptz)
    `,
    [userId, assetId, windowStart.toISOString(), windowEnd.toISOString()],
  );
  const excludeIds = new Set([workOrderId, ...excludeWorkOrderIds]);
  const conflicts = getAssetPlanningConflicts(
    overlapping,
    assetId,
    proposedStart,
    proposedEnd,
    excludeIds,
  );

  return {
    assetId,
    assetKey,
    assetName,
    conflicts,
    sameDayConflict: hasConflictOnSameCalendarDay(proposedStart, proposedEnd, conflicts),
  };
}

function readAllowAssetOverlap(body: unknown): boolean {
  if (body === null || typeof body !== "object") return false;
  return (body as Record<string, unknown>).allowAssetOverlap === true;
}

export type UpdateWorkOrderPlanningResult =
  | { ok: true; row: WorkOrderRow }
  | { ok: false; error: string; conflicts?: PlanningConflict[] };

export async function updateWorkOrderPlanning(
  userId: string,
  workOrderId: string,
  plannedStartIso: string,
  plannedEndIso: string | null,
  options?: {
    source?: string;
    skipConflictCheck?: boolean;
    /** Other work orders being moved in the same batch — ignore their current slots for conflict checks. */
    excludeWorkOrderIds?: string[];
    /** User confirmed overlap on the same asset — skip conflict rejection. */
    allowAssetOverlap?: boolean;
  },
): Promise<UpdateWorkOrderPlanningResult> {
  if (!isUuid(workOrderId)) {
    return { ok: false, error: "invalid_id" };
  }

  const existing = await pool.query<WorkOrderRow>(
    `
    ${selectWorkOrdersSql}
    WHERE w."id" = $1::uuid
      AND ${siteAccessSql('w."siteId"', "$2")}
    LIMIT 1
    `,
    [workOrderId, userId],
  );
  const row = existing.rows[0];
  if (!row) {
    return { ok: false, error: "not_found" };
  }
  if (!row.workgroupId) {
    return { ok: false, error: "invalid_body" };
  }

  if (isBeforeLocalToday(plannedStartIso)) {
    return { ok: false, error: "before_today" };
  }

  const proposedStart = new Date(plannedStartIso);
  const proposedEnd = effectivePlannedEnd(plannedStartIso, plannedEndIso);
  if (Number.isNaN(proposedStart.getTime()) || Number.isNaN(proposedEnd.getTime())) {
    return { ok: false, error: "invalid_body" };
  }

  if (!options?.skipConflictCheck && !options?.allowAssetOverlap) {
    const check = await checkWorkOrderAssetPlanningConflicts(
      userId,
      workOrderId,
      plannedStartIso,
      plannedEndIso,
      options?.excludeWorkOrderIds ?? [],
    );
    if ("error" in check) {
      return { ok: false, error: check.error };
    }
    if (check.conflicts.length > 0) {
      return { ok: false, error: "asset_conflict", conflicts: check.conflicts };
    }
  }

  const plannedDurationMinutes = computePlannedDurationMinutes(proposedStart, proposedEnd);
  const parsed = parseBody({
    name: row.name,
    description: row.description,
    assetId: row.assetId,
    costCenterId: row.costCenterId,
    plannedStart: plannedStartIso,
    plannedEnd: plannedEndIso,
    plannedDurationMinutes,
    orderType: row.orderType,
    responsibleEmployeeId: row.responsibleEmployeeId,
    workgroupId: row.workgroupId,
    classificationId: row.classificationId,
  });
  if (!parsed) {
    return { ok: false, error: "invalid_body" };
  }

  const meta: AuditSessionMeta = {
    userId,
    requestId: randomUUID(),
    source: options?.source ?? "assistant",
  };

  try {
    const previousAssetId = row.assetId;
    const updated = await withAuditContext(meta, async (client) => {
      const existingAccess = await client.query<QueryResultRow & { id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "workOrder"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [workOrderId, meta.userId],
      );
      const existingRow = existingAccess.rows[0];
      if (!existingRow) return null;

      const siteIdFromRelations = await assertAssetAndCostCenterContext(
        client,
        meta.userId,
        parsed.assetId,
        parsed.costCenterId,
      );
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteIdFromRelations : existingRow.siteId;
      if (effectiveSiteId !== siteIdFromRelations) {
        throw new Error("site_access_denied");
      }

      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      await assertWorkgroupForOrderSite(client, meta.userId, parsed.workgroupId, effectiveSiteId);
      await assertAssignmentsCompatibleWithWorkgroup(client, workOrderId, parsed.workgroupId);
      await assertResponsibleEmployeeContext(
        client,
        meta.userId,
        parsed.responsibleEmployeeId,
        effectiveSiteId,
        parsed.workgroupId,
      );
      await assertClassificationForSiteAndScope(
        client,
        meta.userId,
        effectiveSiteId,
        parsed.classificationId,
        "work_order",
      );

      const { rows } = await client.query<WorkOrderRow>(
        `
        WITH updated AS (
          UPDATE "workOrder"
          SET
            "name" = $1,
            "description" = $2,
            "siteId" = $3::uuid,
            "assetId" = $4::uuid,
            "costCenterId" = $5::uuid,
            "plannedStart" = $6::timestamptz,
            "plannedEnd" = $7::timestamptz,
            "plannedDurationMinutes" = $8::integer,
            "orderType" = $9,
            "responsibleEmployeeId" = $10::uuid,
            "workgroupId" = $11::uuid,
            "classificationId" = $12::uuid
          WHERE "id" = $13::uuid
          RETURNING *
        )
        SELECT
          u."id",
          u."orderNumber",
          u."name",
          u."description",
          u."siteId",
          s."key" AS "siteKey",
          s."name" AS "siteName",
          s."colorHex" AS "siteColorHex",
          u."assetId",
          a."key" AS "assetKey",
          a."name" AS "assetName",
          u."costCenterId",
          c."key" AS "costCenterKey",
          c."name" AS "costCenterName",
          u."classificationId",
          clf."key" AS "classificationKey",
          clf."name" AS "classificationName",
          u."plannedStart",
          u."plannedEnd",
          u."plannedDurationMinutes",
          u."orderType",
          u."status",
          u."responsibleEmployeeId",
          re."key" AS "responsibleEmployeeKey",
          re."name" AS "responsibleEmployeeName",
          u."doneBy",
          dbe."key" AS "doneByEmployeeKey",
          dbe."name" AS "doneByEmployeeName",
          u."workgroupId",
          wg."key" AS "workgroupKey",
          wg."name" AS "workgroupName",
          u."originalWo",
          orig."orderNumber" AS "originalWoOrderNumber",
          orig."name" AS "originalWoName",
          u."createdAt",
          u."updatedAt",
          COALESCE(created_by."loginName", u."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", u."updatedBy"::text) AS "updatedBy",
          COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
          COALESCE(asset_doc_counts."assetDocumentCount", 0)::int AS "assetDocumentCount",
          COALESCE(assign_counts."assignedEmployeeCount", 0)::int AS "assignedEmployeeCount",
          COALESCE(tx_counts."transactionCount", 0)::int AS "transactionCount"
        FROM updated u
        JOIN "site" s ON s."id" = u."siteId"
        JOIN "asset" a ON a."id" = u."assetId"
        JOIN "costCenter" c ON c."id" = u."costCenterId"
        LEFT JOIN "classification" clf ON clf."id" = u."classificationId"
        LEFT JOIN "employee" re ON re."id" = u."responsibleEmployeeId"
        LEFT JOIN "employee" dbe ON dbe."id" = u."doneBy"
        LEFT JOIN "workgroup" wg ON wg."id" = u."workgroupId"
        LEFT JOIN "workOrder" orig ON orig."id" = u."originalWo"
        LEFT JOIN "users" created_by ON created_by."id" = u."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = u."updatedBy"
        ${workOrderDocumentCountSubqueryOnUpdate}
        ${workOrderAssetDocumentCountSubqueryOnUpdate}
        LEFT JOIN (
          SELECT "workOrderId", COUNT(*)::int AS "assignedEmployeeCount"
          FROM "workOrderEmployeeAssignment"
          GROUP BY "workOrderId"
        ) assign_counts ON assign_counts."workOrderId" = u."id"
        LEFT JOIN (
          SELECT "workOrderId", COUNT(*)::int AS "transactionCount"
          FROM "transaction"
          GROUP BY "workOrderId"
        ) tx_counts ON tx_counts."workOrderId" = u."id"
        `,
        [
          parsed.name,
          parsed.description,
          effectiveSiteId,
          parsed.assetId,
          parsed.costCenterId,
          parsed.plannedStart,
          parsed.plannedEnd,
          parsed.plannedDurationMinutes,
          parsed.orderType,
          parsed.responsibleEmployeeId,
          parsed.workgroupId,
          parsed.classificationId,
          workOrderId,
        ],
      );
      return rows[0] ?? null;
    });

    if (!updated) {
      return { ok: false, error: "not_found" };
    }

    scheduleReindex(`workOrder ${updated.id}`, () => reindexWorkOrder(updated.id));
    if (previousAssetId && previousAssetId !== updated.assetId) {
      scheduleReindex(`workOrder asset docs ${previousAssetId}`, () =>
        reindexWorkOrderDocumentsForAsset(previousAssetId),
      );
      scheduleReindex(`workOrder asset docs ${updated.assetId}`, () =>
        reindexWorkOrderDocumentsForAsset(updated.assetId),
      );
    }
    void broadcastWorkOrderUpdated(updated.siteId, updated).catch((err) => {
      console.error("[work-order-realtime] broadcast updated failed", err);
    });

    return { ok: true, row: updated };
  } catch (err) {
    const message = (err as Error).message;
    if (message === "site_access_denied") return { ok: false, error: "site_access_denied" };
    if (message === "responsible_employee_not_in_workgroup") {
      return { ok: false, error: "responsible_employee_not_in_workgroup" };
    }
    console.error(err);
    return { ok: false, error: "internal_error" };
  }
}

export type BatchPlanningAssignment = {
  workOrderId: string;
  plannedStart: string;
  plannedEnd: string | null;
};

export type UpdateWorkOrderPlanningBatchResult =
  | { ok: true; rows: WorkOrderRow[] }
  | {
      ok: false;
      error: string;
      conflicts?: PlanningConflict[];
      failedOrderNumber?: number;
    };

export async function updateWorkOrderPlanningBatch(
  userId: string,
  assignments: BatchPlanningAssignment[],
  options?: { source?: string; allowAssetOverlap?: boolean },
): Promise<UpdateWorkOrderPlanningBatchResult> {
  if (assignments.length === 0) {
    return { ok: false, error: "invalid_body" };
  }

  const ids = assignments.map((a) => a.workOrderId);
  if (ids.some((id) => !isUuid(id))) {
    return { ok: false, error: "invalid_id" };
  }

  const excludeSet = new Set(ids);
  const rows: WorkOrderRow[] = [];

  for (const item of assignments) {
    const plannedStart = parseIsoDatetime(item.plannedStart);
    const plannedEnd =
      item.plannedEnd === null || item.plannedEnd === undefined
        ? null
        : parseIsoDatetime(item.plannedEnd);
    if (!plannedStart || (item.plannedEnd !== null && item.plannedEnd !== undefined && !plannedEnd)) {
      return { ok: false, error: "invalid_body" };
    }

    const result = await updateWorkOrderPlanning(
      userId,
      item.workOrderId,
      plannedStart,
      plannedEnd,
      {
        source: options?.source ?? "assistant",
        excludeWorkOrderIds: [...excludeSet],
        allowAssetOverlap: options?.allowAssetOverlap,
      },
    );
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        conflicts: result.conflicts,
        failedOrderNumber: result.error === "not_found" ? undefined : undefined,
      };
    }
    rows.push(result.row);
  }

  return { ok: true, rows };
}

export const workOrdersRouter = router;

