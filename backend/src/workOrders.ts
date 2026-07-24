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
  assertAssetAndCostCenterContext,
  assertResponsibleEmployeesContext,
  assertWorkgroupForOrderSite,
  createWorkOrderRecord,
  setWorkOrderResponsibles,
  type WorkOrderCreateInput,
} from "./workOrderCreate.js";
import {
  assertInspectionRoundForSite,
  syncWorkOrderInspectionPointsSnapshot,
} from "./inspectionRoundSnapshot.js";
import { assertWorkOrderTypeForSite } from "./workOrderTypes.js";
import { assertWorkOrderPcr, parseOptionalPcrUuid } from "./pcrAssert.js";
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
import {
  broadcastAuditFeedItem,
  broadcastWorkOrderCreated,
  broadcastWorkOrderUpdated,
} from "./workOrderRealtime.js";
import type { DashboardAuditFeedItem } from "./dashboard.js";
import { workOrderMessagesRouter } from "./workOrderMessages.js";
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

type WorkOrderType = string;
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
  assetClassificationId: string | null;
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
  responsibleEmployeeIds: string[];
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
  problemId: string | null;
  problemKey: string | null;
  problemName: string | null;
  causeId: string | null;
  causeKey: string | null;
  causeName: string | null;
  remedyId: string | null;
  remedyKey: string | null;
  remedyName: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
  assetDocumentCount: number;
  assignedEmployeeCount: number;
  transactionCount: number;
  inspectionPointCount: number;
  checkedInspectionPointCount: number;
  originalWo: string | null;
  originalWoOrderNumber: number | null;
  originalWoName: string | null;
  maintenancePlanId: string | null;
  maintenancePlanKey: string | null;
  maintenancePlanName: string | null;
  inspectionRoundId: string | null;
  inspectionRoundKey: string | null;
  inspectionRoundName: string | null;
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

type ParsedBody = WorkOrderCreateInput;

type WorkOrderAccessRow = QueryResultRow & { id: string; siteId: string };

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES },
});

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function normalizeEmployeeIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.map((entry) => (typeof entry === "string" ? entry.trim() : ""));
  if (normalized.some((id) => !isUuid(id))) return null;
  return [...new Set(normalized)];
}

function isWorkOrderType(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 100;
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
  problemId: string | null;
  causeId: string | null;
  remedyId: string | null;
  pcrProvided: boolean;
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

  const pcrProvided =
    o.problemId !== undefined || o.causeId !== undefined || o.remedyId !== undefined;
  const problemId = parseOptionalPcrUuid(o.problemId);
  const causeId = parseOptionalPcrUuid(o.causeId);
  const remedyId = parseOptionalPcrUuid(o.remedyId);
  if (problemId === "invalid" || causeId === "invalid" || remedyId === "invalid") return null;

  return {
    hours,
    remark,
    statusAction,
    pauseRemark: pauseRemarkParsed,
    additionalHours,
    problemId,
    causeId,
    remedyId,
    pcrProvided,
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

  const orderTypeRaw = o.orderType;
  if (!isWorkOrderType(orderTypeRaw)) return null;
  const orderType = orderTypeRaw.trim();

  const responsibleEmployeeIds = normalizeEmployeeIds(o.responsibleEmployeeIds);
  if (!responsibleEmployeeIds || responsibleEmployeeIds.length === 0) return null;

  if (typeof o.workgroupId !== "string") return null;
  const workgroupIdTrimmed = o.workgroupId.trim();
  if (!isUuid(workgroupIdTrimmed)) return null;

  const classificationIdRaw = readTrimmedOptionalString(o.classificationId);
  if (classificationIdRaw !== null && !isUuid(classificationIdRaw)) return null;

  const originalWoRaw = readTrimmedOptionalString(o.originalWo);
  if (originalWoRaw !== null && !isUuid(originalWoRaw)) return null;

  const maintenancePlanIdRaw = readTrimmedOptionalString(o.maintenancePlanId);
  if (maintenancePlanIdRaw !== null && !isUuid(maintenancePlanIdRaw)) return null;

  const inspectionRoundIdRaw = readTrimmedOptionalString(o.inspectionRoundId);
  if (inspectionRoundIdRaw !== null && !isUuid(inspectionRoundIdRaw)) return null;

  return {
    name,
    description: descriptionRaw,
    assetId,
    costCenterId,
    plannedStart,
    plannedEnd,
    plannedDurationMinutes,
    orderType,
    responsibleEmployeeIds,
    workgroupId: workgroupIdTrimmed,
    classificationId: classificationIdRaw,
    originalWo: originalWoRaw,
    maintenancePlanId: maintenancePlanIdRaw,
    inspectionRoundId: inspectionRoundIdRaw,
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

async function resolveActorLogin(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ loginName: string }>(
    `SELECT "loginName" FROM "users" WHERE "id" = $1::uuid LIMIT 1`,
    [userId],
  );
  return rows[0]?.loginName ?? null;
}

function emitAuditFeedItem(siteId: string, item: DashboardAuditFeedItem): void {
  void broadcastAuditFeedItem(siteId, item).catch((err) => {
    console.error("[work-order-realtime] audit feed broadcast failed", err);
  });
}

function emitWorkOrderStatusAudit(params: {
  siteId: string;
  workOrderId: string;
  orderNumber: number;
  status: string;
  actorLogin: string | null;
}): void {
  emitAuditFeedItem(params.siteId, {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorLogin: params.actorLogin,
    kind: "work_order_status",
    workOrderId: params.workOrderId,
    orderNumber: params.orderNumber,
    status: params.status,
    transactionType: null,
    quantity: null,
  });
}

function emitTransactionCreatedAudit(params: {
  siteId: string;
  workOrderId: string;
  orderNumber: number;
  transactionType: string;
  quantity: number | string;
  actorLogin: string | null;
}): void {
  const quantity =
    typeof params.quantity === "number"
      ? String(Math.round(params.quantity * 10_000) / 10_000)
      : params.quantity;
  emitAuditFeedItem(params.siteId, {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorLogin: params.actorLogin,
    kind: "transaction_created",
    workOrderId: params.workOrderId,
    orderNumber: params.orderNumber,
    status: null,
    transactionType: params.transactionType,
    quantity,
  });
}

const responsibleEmployeeColumnsSql = (workOrderIdRef: string) => `
  (
    SELECT COALESCE(array_agg(wor."employeeId"::text ORDER BY e."key"), ARRAY[]::text[])
    FROM "workOrderResponsibleEmployee" wor
    JOIN "employee" e ON e."id" = wor."employeeId"
    WHERE wor."workOrderId" = ${workOrderIdRef}
  ) AS "responsibleEmployeeIds",
  (
    SELECT NULLIF(COALESCE(string_agg(e."key", ', ' ORDER BY e."key"), ''), '')
    FROM "workOrderResponsibleEmployee" wor
    JOIN "employee" e ON e."id" = wor."employeeId"
    WHERE wor."workOrderId" = ${workOrderIdRef}
  ) AS "responsibleEmployeeKey",
  (
    SELECT NULLIF(COALESCE(string_agg(e."name", ', ' ORDER BY e."key"), ''), '')
    FROM "workOrderResponsibleEmployee" wor
    JOIN "employee" e ON e."id" = wor."employeeId"
    WHERE wor."workOrderId" = ${workOrderIdRef}
  ) AS "responsibleEmployeeName"`;

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
    a."classificationId"::text AS "assetClassificationId",
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
    ${responsibleEmployeeColumnsSql('w."id"')},
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
    w."problemId"::text AS "problemId",
    prob."key" AS "problemKey",
    prob."name" AS "problemName",
    w."causeId"::text AS "causeId",
    cau."key" AS "causeKey",
    cau."name" AS "causeName",
    w."remedyId"::text AS "remedyId",
    rem."key" AS "remedyKey",
    rem."name" AS "remedyName",
    w."originalWo",
    orig."orderNumber" AS "originalWoOrderNumber",
    orig."name" AS "originalWoName",
    w."maintenancePlanId",
    mp."key" AS "maintenancePlanKey",
    mp."name" AS "maintenancePlanName",
    w."inspectionRoundId",
    ir."key" AS "inspectionRoundKey",
    ir."name" AS "inspectionRoundName",
    w."createdAt",
    w."updatedAt",
    COALESCE(created_by."loginName", w."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", w."updatedBy"::text) AS "updatedBy",
    COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
    COALESCE(asset_doc_counts."assetDocumentCount", 0)::int AS "assetDocumentCount",
    COALESCE(assign_counts."assignedEmployeeCount", 0)::int AS "assignedEmployeeCount",
    COALESCE(tx_counts."transactionCount", 0)::int AS "transactionCount",
    COALESCE(ip_counts."inspectionPointCount", 0)::int AS "inspectionPointCount",
    COALESCE(ip_counts."checkedInspectionPointCount", 0)::int AS "checkedInspectionPointCount"
  FROM "workOrder" w
  JOIN "site" s ON s."id" = w."siteId"
  JOIN "asset" a ON a."id" = w."assetId"
  JOIN "costCenter" c ON c."id" = w."costCenterId"
  LEFT JOIN "classification" cl ON cl."id" = w."classificationId"
  LEFT JOIN "employee" dbe ON dbe."id" = w."doneBy"
  LEFT JOIN "workgroup" wg ON wg."id" = w."workgroupId"
  LEFT JOIN "problem" prob ON prob."id" = w."problemId"
  LEFT JOIN "cause" cau ON cau."id" = w."causeId"
  LEFT JOIN "remedy" rem ON rem."id" = w."remedyId"
  LEFT JOIN "workOrder" orig ON orig."id" = w."originalWo"
  LEFT JOIN "maintenancePlan" mp ON mp."id" = w."maintenancePlanId"
  LEFT JOIN "inspectionRound" ir ON ir."id" = w."inspectionRoundId"
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
  LEFT JOIN (
    SELECT
      "workOrderId",
      COUNT(*)::int AS "inspectionPointCount",
      COUNT(*) FILTER (WHERE "checked")::int AS "checkedInspectionPointCount"
    FROM "workOrderInspectionPoint"
    GROUP BY "workOrderId"
  ) ip_counts ON ip_counts."workOrderId" = w."id"
`;

async function fetchWorkOrderRow(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  workOrderId: string,
): Promise<WorkOrderRow | null> {
  const { rows } = await client.query<WorkOrderRow>(
    `
    ${selectWorkOrdersSql}
    WHERE w."id" = $1::uuid
    LIMIT 1
    `,
    [workOrderId],
  );
  return rows[0] ?? null;
}

async function assertResponsiblesCompatibleWithWorkgroup(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  workOrderId: string,
  workgroupId: string | null,
): Promise<void> {
  if (!workgroupId) return;
  const { rowCount } = await client.query(
    `
    SELECT 1
    FROM "workOrderResponsibleEmployee" r
    WHERE r."workOrderId" = $1::uuid
      AND NOT EXISTS (
        SELECT 1
        FROM "workgroupUser" wu
        WHERE wu."workgroupId" = $2::uuid
          AND wu."employeeId" = r."employeeId"
          AND wu."isLeader" = true
      )
    LIMIT 1
    `,
    [workOrderId, workgroupId],
  );
  if ((rowCount ?? 0) > 0) throw new Error("responsibles_incompatible_with_workgroup");
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

export async function getWorkOrderRowForRealtime(workOrderId: string): Promise<WorkOrderRow | null> {
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

router.get("/by-order-number", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const raw =
    typeof req.query.orderNumber === "string"
      ? req.query.orderNumber.trim()
      : typeof req.query.orderNumber === "number"
        ? String(req.query.orderNumber)
        : "";
  const orderNumber = Number.parseInt(raw, 10);
  if (!Number.isFinite(orderNumber) || orderNumber < 1) {
    res.status(400).json({ error: "invalid_order_number" });
    return;
  }
  const siteIdRaw = typeof req.query.siteId === "string" ? req.query.siteId.trim() : "";
  if (siteIdRaw && !isUuid(siteIdRaw)) {
    res.status(400).json({ error: "invalid_site_id" });
    return;
  }
  try {
    const params: unknown[] = [userId, orderNumber];
    let siteFilter = "";
    if (siteIdRaw) {
      params.push(siteIdRaw);
      siteFilter = `AND w."siteId" = $3::uuid`;
    }
    const { rows } = await pool.query<{
      id: string;
      orderNumber: number;
      name: string;
      siteId: string;
      assetId: string;
      assetKey: string;
      assetName: string;
      costCenterId: string;
      costCenterKey: string;
      costCenterName: string;
    }>(
      `
      SELECT
        w."id",
        w."orderNumber",
        w."name",
        w."siteId",
        w."assetId",
        a."key" AS "assetKey",
        a."name" AS "assetName",
        w."costCenterId",
        c."key" AS "costCenterKey",
        c."name" AS "costCenterName"
      FROM "workOrder" w
      JOIN "asset" a ON a."id" = w."assetId"
      JOIN "costCenter" c ON c."id" = w."costCenterId"
      WHERE w."orderNumber" = $2::bigint
        AND ${siteAccessSql('w."siteId"', "$1")}
        ${siteFilter}
      LIMIT 1
      `,
      params,
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
    let statusChangedToAssigned = false;
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
        statusChangedToAssigned = true;
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
      if (statusChangedToAssigned) {
        const actorLogin = await resolveActorLogin(meta.userId);
        emitWorkOrderStatusAudit({
          siteId: updatedOrder.siteId,
          workOrderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          status: "assigned",
          actorLogin,
        });
      }
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
    const actorLogin = await resolveActorLogin(meta.userId);
    emitWorkOrderStatusAudit({
      siteId: row.siteId,
      workOrderId: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      actorLogin,
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
    const actorLogin = await resolveActorLogin(meta.userId);
    emitWorkOrderStatusAudit({
      siteId: row.siteId,
      workOrderId: row.id,
      orderNumber: row.orderNumber,
      status: "paused",
      actorLogin,
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
    const actorLogin = await resolveActorLogin(meta.userId);
    emitWorkOrderStatusAudit({
      siteId: row.siteId,
      workOrderId: row.id,
      orderNumber: row.orderNumber,
      status: "cancelled",
      actorLogin,
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

router.post("/:id/done", async (req: Request, res: Response) => {
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
      if (current.status !== "ended") {
        throw new Error("cannot_done_from_status");
      }

      const userEmp = await client.query<{ employeeId: string | null }>(
        `SELECT "employeeId" FROM "users" WHERE "id" = $1::uuid LIMIT 1`,
        [meta.userId],
      );
      const sessionEmployeeId = userEmp.rows[0]?.employeeId ?? null;

      await client.query(
        `
        UPDATE "workOrder"
        SET
          "status" = 'done',
          "doneBy" = COALESCE($2::uuid, "doneBy")
        WHERE "id" = $1::uuid
        `,
        [id, sessionEmployeeId],
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
    const actorLogin = await resolveActorLogin(meta.userId);
    emitWorkOrderStatusAudit({
      siteId: row.siteId,
      workOrderId: row.id,
      orderNumber: row.orderNumber,
      status: "done",
      actorLogin,
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "cannot_done_from_status") {
      res.status(409).json({ error: "cannot_done_from_status" });
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
    let nextStatus: string | null = null;
    const bookedQuantities: number[] = [];
    const row = await withAuditContext(meta, async (client) => {
      const wo = await client.query<
        QueryResultRow & {
          id: string;
          siteId: string;
          status: string;
          orderType: string;
          assetId: string;
          problemId: string | null;
          causeId: string | null;
          remedyId: string | null;
        }
      >(
        `
        SELECT
          "id",
          "siteId"::text AS "siteId",
          "status",
          "orderType",
          "assetId"::text AS "assetId",
          "problemId"::text AS "problemId",
          "causeId"::text AS "causeId",
          "remedyId"::text AS "remedyId"
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

      const pcr: {
        problemId: string | null;
        causeId: string | null;
        remedyId: string | null;
      } = parsed.pcrProvided
        ? {
            problemId: parsed.problemId,
            causeId: parsed.causeId,
            remedyId: parsed.remedyId,
          }
        : {
            problemId: current.problemId,
            causeId: current.causeId,
            remedyId: current.remedyId,
          };

      await assertWorkOrderPcr(client, {
        siteId: current.siteId,
        orderType: current.orderType,
        assetId: current.assetId,
        pcr,
        required: parsed.statusAction === "end",
      });

      if (parsed.pcrProvided) {
        await client.query(
          `
          UPDATE "workOrder"
          SET
            "problemId" = $2::uuid,
            "causeId" = $3::uuid,
            "remedyId" = $4::uuid
          WHERE "id" = $1::uuid
          `,
          [id, pcr.problemId, pcr.causeId, pcr.remedyId],
        );
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
      bookedQuantities.push(qtyRounded);

      for (const extra of parsed.additionalHours) {
        const extraQty = Math.round(extra.hours * 10_000) / 10_000;
        await client.query(
          `
          INSERT INTO "transaction" ("siteId", "type", "quantity", "workOrderId", "remark", "employeeId")
          VALUES ($1::uuid, 'IN', $2::numeric, $3::uuid, NULL, $4::uuid)
          `,
          [current.siteId, extraQty, id, extra.employeeId],
        );
        bookedQuantities.push(extraQty);
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
        nextStatus = "paused";
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
        nextStatus = "ended";
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
    const actorLogin = await resolveActorLogin(meta.userId);
    for (const quantity of bookedQuantities) {
      emitTransactionCreatedAudit({
        siteId: row.siteId,
        workOrderId: row.id,
        orderNumber: row.orderNumber,
        transactionType: "IN",
        quantity,
        actorLogin,
      });
    }
    if (nextStatus) {
      emitWorkOrderStatusAudit({
        siteId: row.siteId,
        workOrderId: row.id,
        orderNumber: row.orderNumber,
        status: nextStatus,
        actorLogin,
      });
    }
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
    if (
      message === "pcr_required" ||
      message === "pcr_incomplete" ||
      message === "invalid_pcr_problem" ||
      message === "invalid_pcr_problem_classification" ||
      message === "invalid_pcr_cause" ||
      message === "invalid_pcr_remedy"
    ) {
      res.status(400).json({ error: message });
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
      const created = await createWorkOrderRecord(client, meta.userId, parsed);
      return await fetchWorkOrderRow(client, created.id);
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
    if (message === "responsible_required") {
      res.status(400).json({ error: "responsible_required" });
      return;
    }
    if (message === "responsible_employee_not_leader") {
      res.status(400).json({ error: "responsible_employee_not_leader" });
      return;
    }
    if (message === "invalid_original_wo") {
      res.status(400).json({ error: "invalid_original_wo" });
      return;
    }
    if (message === "invalid_maintenance_plan") {
      res.status(400).json({ error: "invalid_maintenance_plan" });
      return;
    }
    if (message === "invalid_inspection_round") {
      res.status(400).json({ error: "invalid_inspection_round" });
      return;
    }
    if (message === "invalid_order_type") {
      res.status(400).json({ error: "invalid_order_type" });
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
      const existing = await client.query<
        QueryResultRow & { id: string; siteId: string; inspectionRoundId: string | null }
      >(
        `
        SELECT "id", "siteId"::text AS "siteId", "inspectionRoundId"::text AS "inspectionRoundId"
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
      await assertResponsibleEmployeesContext(
        client,
        meta.userId,
        parsed.responsibleEmployeeIds,
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
      await assertInspectionRoundForSite(
        client,
        meta.userId,
        parsed.inspectionRoundId,
        effectiveSiteId,
        siteAccessSql,
      );
      await assertWorkOrderTypeForSite(client, effectiveSiteId, parsed.orderType);

      await client.query(
        `
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
          "workgroupId" = $10::uuid,
          "classificationId" = $11::uuid,
          "inspectionRoundId" = $12::uuid
        WHERE "id" = $13::uuid
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
          parsed.workgroupId,
          parsed.classificationId,
          parsed.inspectionRoundId,
          id,
        ],
      );
      await setWorkOrderResponsibles(client, id, parsed.responsibleEmployeeIds);
      if (existingRow.inspectionRoundId !== parsed.inspectionRoundId) {
        await syncWorkOrderInspectionPointsSnapshot(client, id, parsed.inspectionRoundId);
      }
      return await fetchWorkOrderRow(client, id);
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
    if (message === "responsible_required") {
      res.status(400).json({ error: "responsible_required" });
      return;
    }
    if (message === "responsible_employee_not_leader") {
      res.status(400).json({ error: "responsible_employee_not_leader" });
      return;
    }
    if (message === "responsibles_incompatible_with_workgroup") {
      res.status(400).json({ error: "responsibles_incompatible_with_workgroup" });
      return;
    }
    if (message === "assignments_incompatible_with_workgroup") {
      res.status(400).json({ error: "assignments_incompatible_with_workgroup" });
      return;
    }
    if (message === "invalid_order_type") {
      res.status(400).json({ error: "invalid_order_type" });
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
    responsibleEmployeeIds: row.responsibleEmployeeIds,
    workgroupId: row.workgroupId,
    classificationId: row.classificationId,
    inspectionRoundId: row.inspectionRoundId,
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
      await assertResponsibleEmployeesContext(
        client,
        meta.userId,
        parsed.responsibleEmployeeIds,
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
      await assertWorkOrderTypeForSite(client, effectiveSiteId, parsed.orderType);

      await client.query(
        `
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
          "workgroupId" = $10::uuid,
          "classificationId" = $11::uuid
        WHERE "id" = $12::uuid
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
          parsed.workgroupId,
          parsed.classificationId,
          workOrderId,
        ],
      );
      await setWorkOrderResponsibles(client, workOrderId, parsed.responsibleEmployeeIds);
      return await fetchWorkOrderRow(client, workOrderId);
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

router.use(workOrderMessagesRouter);

export type WorkOrderInspectionPointRow = {
  id: string;
  workOrderId: string;
  pos: number;
  name: string;
  assetId: string | null;
  assetKey: string | null;
  assetName: string | null;
  inspectionPointId: string | null;
  inspectionPointKey: string | null;
  inspectionPointName: string | null;
  checked: boolean;
  checkedAt: string | null;
  checkedBy: string | null;
  checkedByLoginName: string | null;
};

const selectWoInspectionPointSql = `
  SELECT
    p."id",
    p."workOrderId",
    p."pos",
    p."name",
    p."assetId",
    p."assetKey",
    p."assetName",
    p."inspectionPointId",
    p."inspectionPointKey",
    p."inspectionPointName",
    p."checked",
    p."checkedAt",
    p."checkedBy",
    u."loginName" AS "checkedByLoginName"
  FROM "workOrderInspectionPoint" p
  LEFT JOIN "users" u ON u."id" = p."checkedBy"
`;

router.get("/:id/inspection-points", async (req: Request, res: Response) => {
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
    const rows = await withAuditContext(meta, async (client) => {
      const access = await client.query<{ id: string; inspectionRoundId: string | null }>(
        `
        SELECT "id", "inspectionRoundId"::text AS "inspectionRoundId"
        FROM "workOrder"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      const wo = access.rows[0];
      if (!wo) throw new Error("not_found");

      let { rows: points } = await client.query<WorkOrderInspectionPointRow>(
        `
        ${selectWoInspectionPointSql}
        WHERE p."workOrderId" = $1::uuid
        ORDER BY p."pos" ASC
        `,
        [id],
      );
      // Heal missing snapshot when a round is linked but no points were copied yet.
      if (points.length === 0 && wo.inspectionRoundId) {
        await syncWorkOrderInspectionPointsSnapshot(client, id, wo.inspectionRoundId);
        const refreshed = await client.query<WorkOrderInspectionPointRow>(
          `
          ${selectWoInspectionPointSql}
          WHERE p."workOrderId" = $1::uuid
          ORDER BY p."pos" ASC
          `,
          [id],
        );
        points = refreshed.rows;
      }
      return points;
    });
    res.json(rows);
  } catch (err) {
    if ((err as Error).message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

router.patch("/:id/inspection-points/:pointId", async (req: Request, res: Response) => {
  const { id, pointId } = req.params;
  if (!isUuid(id) || !isUuid(pointId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const checked = req.body?.checked;
  if (typeof checked !== "boolean") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const result = await withAuditContext(meta, async (client) => {
      const access = await client.query<{ id: string }>(
        `
        SELECT "id"
        FROM "workOrder"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (!access.rows[0]) throw new Error("not_found");
      const { rows } = await client.query<WorkOrderInspectionPointRow>(
        `
        WITH updated AS (
          UPDATE "workOrderInspectionPoint"
          SET
            "checked" = $1,
            "checkedAt" = CASE WHEN $1 THEN now() ELSE NULL END,
            "checkedBy" = CASE WHEN $1 THEN $2::uuid ELSE NULL END
          WHERE "id" = $3::uuid AND "workOrderId" = $4::uuid
          RETURNING *
        )
        SELECT
          u."id",
          u."workOrderId",
          u."pos",
          u."name",
          u."assetId",
          u."assetKey",
          u."assetName",
          u."inspectionPointId",
          u."inspectionPointKey",
          u."inspectionPointName",
          u."checked",
          u."checkedAt",
          u."checkedBy",
          usr."loginName" AS "checkedByLoginName"
        FROM updated u
        LEFT JOIN "users" usr ON usr."id" = u."checkedBy"
        `,
        [checked, meta.userId, pointId, id],
      );
      const point = rows[0] ?? null;
      if (!point) return null;
      const order = await fetchWorkOrderRow(client, id);
      return { point, order };
    });
    if (!result) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (result.order) {
      void broadcastWorkOrderUpdated(result.order.siteId, result.order).catch((err) => {
        console.error("[work-order-realtime] broadcast updated failed", err);
      });
    }
    res.json(result.point);
  } catch (err) {
    if ((err as Error).message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

export const workOrdersRouter = router;

