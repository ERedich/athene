import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { QueryResult, QueryResultRow } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { assertClassificationForSiteAndScope } from "./classificationAssert.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";
import { broadcastWorkOrderCreated, broadcastWorkOrderUpdated } from "./workOrderRealtime.js";
import { buildWorkOrderListFilters } from "./workOrderListQuery.js";

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
type WorkOrderDocumentCategory =
  | "general"
  | "protocols"
  | "drawings"
  | "instructions"
  | "nameplates"
  | "certificates";

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

type WorkOrderDocumentSource = "workOrder" | "asset";

type WorkOrderDocumentRow = {
  id: string;
  source: WorkOrderDocumentSource;
  workOrderId: string | null;
  assetId: string | null;
  fileName: string;
  displayName: string;
  category: WorkOrderDocumentCategory;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
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
};

type AssetSiteRow = QueryResultRow & { id: string; siteId: string };
type CostCenterSiteRow = QueryResultRow & { id: string; siteId: string };
type WorkOrderAccessRow = QueryResultRow & { id: string; siteId: string };

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.WORK_ORDER_DOCUMENT_MAX_BYTES) || 25 * 1024 * 1024,
  },
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
const allowedDocumentCategories: WorkOrderDocumentCategory[] = [
  "general",
  "protocols",
  "drawings",
  "instructions",
  "nameplates",
  "certificates",
];

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function isWorkOrderType(value: unknown): value is WorkOrderType {
  return typeof value === "string" && (allowedOrderTypes as string[]).includes(value);
}

function isWorkOrderDocumentCategory(value: unknown): value is WorkOrderDocumentCategory {
  return typeof value === "string" && (allowedDocumentCategories as string[]).includes(value);
}

function isWorkOrderStatus(value: unknown): value is WorkOrderStatus {
  return typeof value === "string" && (allowedWorkOrderStatuses as string[]).includes(value);
}

function workOrderAssignmentsLocked(status: WorkOrderStatus): boolean {
  return status === "ended" || status === "done" || status === "cancelled";
}

type ParsedFeedbackBody = {
  hours: number;
  remark: string | null;
  completeOrder: boolean;
};

function parseFeedbackBody(body: unknown): ParsedFeedbackBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const hoursRaw = o.hours;
  if (typeof hoursRaw !== "number" || !Number.isFinite(hoursRaw) || hoursRaw <= 0) return null;
  if (hoursRaw > 99999.9999) return null;

  let remark: string | null = null;
  if (o.remark !== undefined && o.remark !== null) {
    if (typeof o.remark !== "string") return null;
    const t = o.remark.trim();
    if (t.length > 2000) return null;
    remark = t.length ? t : null;
  }

  const completeOrder = o.completeOrder === true;
  return { hours: hoursRaw, remark, completeOrder };
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

const workOrderDocumentSelectJoin = `
      SELECT
        d."id",
        'workOrder'::text AS "source",
        d."workOrderId",
        NULL::uuid AS "assetId",
        d."fileName",
        d."displayName",
        d."category",
        d."mimeType",
        d."fileSize",
        d."createdAt",
        COALESCE(created_by."loginName", d."createdBy"::text) AS "createdBy",
        d."updatedAt",
        COALESCE(updated_by."loginName", d."updatedBy"::text) AS "updatedBy"
      FROM "workOrderDocument" d
      LEFT JOIN "users" created_by ON created_by."id" = d."createdBy"
      LEFT JOIN "users" updated_by ON updated_by."id" = d."updatedBy"
`;

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
    w."workgroupId",
    wg."key" AS "workgroupKey",
    wg."name" AS "workgroupName",
    w."createdAt",
    w."updatedAt",
    COALESCE(created_by."loginName", w."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", w."updatedBy"::text) AS "updatedBy",
    COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
    COALESCE(asset_doc_counts."assetDocumentCount", 0)::int AS "assetDocumentCount",
    COALESCE(assign_counts."assignedEmployeeCount", 0)::int AS "assignedEmployeeCount"
  FROM "workOrder" w
  JOIN "site" s ON s."id" = w."siteId"
  JOIN "asset" a ON a."id" = w."assetId"
  JOIN "costCenter" c ON c."id" = w."costCenterId"
  LEFT JOIN "classification" cl ON cl."id" = w."classificationId"
  LEFT JOIN "employee" re ON re."id" = w."responsibleEmployeeId"
  LEFT JOIN "workgroup" wg ON wg."id" = w."workgroupId"
  LEFT JOIN "users" created_by ON created_by."id" = w."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = w."updatedBy"
  LEFT JOIN (
    SELECT "workOrderId", COUNT(*)::int AS "documentCount"
    FROM "workOrderDocument"
    GROUP BY "workOrderId"
  ) doc_counts ON doc_counts."workOrderId" = w."id"
  LEFT JOIN (
    SELECT "assetId", COUNT(*)::int AS "assetDocumentCount"
    FROM "assetDocument"
    GROUP BY "assetId"
  ) asset_doc_counts ON asset_doc_counts."assetId" = w."assetId"
  LEFT JOIN (
    SELECT "workOrderId", COUNT(*)::int AS "assignedEmployeeCount"
    FROM "workOrderEmployeeAssignment"
    GROUP BY "workOrderId"
  ) assign_counts ON assign_counts."workOrderId" = w."id"
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
      await client.query(`UPDATE "workOrder" SET "status" = 'paused' WHERE "id" = $1::uuid`, [id]);
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
      const qtyRounded = Math.round(parsed.hours * 10_000) / 10_000;
      await client.query(
        `
        INSERT INTO "transaction" ("siteId", "type", "quantity", "workOrderId", "remark")
        VALUES ($1::uuid, 'IN', $2::numeric, $3::uuid, $4)
        `,
        [current.siteId, qtyRounded, id, parsed.remark],
      );
      if (parsed.completeOrder && current.status !== "ended") {
        await client.query(`UPDATE "workOrder" SET "status" = 'ended' WHERE "id" = $1::uuid`, [id]);
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
    const workOrder = await getAccessibleWorkOrder(userId, id);
    if (!workOrder) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const { rows } = await pool.query<WorkOrderDocumentRow>(
      `
      SELECT
        d."id",
        'workOrder'::text AS "source",
        d."workOrderId",
        NULL::uuid AS "assetId",
        d."fileName",
        d."displayName",
        d."category",
        d."mimeType",
        d."fileSize",
        d."createdAt",
        COALESCE(cu."loginName", d."createdBy"::text) AS "createdBy",
        d."updatedAt",
        COALESCE(uu."loginName", d."updatedBy"::text) AS "updatedBy"
      FROM "workOrderDocument" d
      LEFT JOIN "users" cu ON cu."id" = d."createdBy"
      LEFT JOIN "users" uu ON uu."id" = d."updatedBy"
      WHERE d."workOrderId" = $1::uuid
      UNION ALL
      SELECT
        d."id",
        'asset'::text AS "source",
        NULL::uuid AS "workOrderId",
        d."assetId",
        d."fileName",
        d."displayName",
        d."category",
        d."mimeType",
        d."fileSize",
        d."createdAt",
        COALESCE(cu."loginName", d."createdBy"::text) AS "createdBy",
        d."updatedAt",
        COALESCE(uu."loginName", d."updatedBy"::text) AS "updatedBy"
      FROM "assetDocument" d
      JOIN "workOrder" w ON w."id" = $1::uuid AND w."assetId" = d."assetId"
      LEFT JOIN "users" cu ON cu."id" = d."createdBy"
      LEFT JOIN "users" uu ON uu."id" = d."updatedBy"
      ORDER BY "createdAt" DESC
      `,
      [workOrder.id],
    );
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
  if (!isWorkOrderDocumentCategory(categoryRaw)) {
    res.status(400).json({ error: "invalid_document_category" });
    return;
  }
  const mimeType = req.file.mimetype?.trim() || "application/octet-stream";
  const content = req.file.buffer;
  const fileSize = req.file.size;

  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const workOrder = await client.query<WorkOrderAccessRow>(
        `
        SELECT "id", "siteId"
        FROM "workOrder"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (workOrder.rowCount === 0) return null;

      const ins = await client.query<{ id: string }>(
        `
        INSERT INTO "workOrderDocument" ("workOrderId", "fileName", "displayName", "category", "mimeType", "fileSize", "content")
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::bytea)
        RETURNING "id"
        `,
        [id, fileName, displayName, categoryRaw, mimeType, fileSize, content],
      );
      const newId = ins.rows[0]?.id;
      if (!newId) return null;
      const { rows } = await client.query<WorkOrderDocumentRow>(
        `${workOrderDocumentSelectJoin}
        WHERE d."id" = $1::uuid`,
        [newId],
      );
      return rows[0] ?? null;
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
    const workOrder = await getAccessibleWorkOrder(userId, id);
    if (!workOrder) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const result = await pool.query<
      QueryResultRow & { fileName: string; displayName: string; mimeType: string; fileSize: number; content: Buffer }
    >(
      `
      SELECT "fileName", "displayName", "mimeType", "fileSize", "content"
      FROM "workOrderDocument"
      WHERE "id" = $1::uuid
        AND "workOrderId" = $2::uuid
      `,
      [documentId, workOrder.id],
    );
    const doc = result.rows[0];
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
  if (categoryRaw !== undefined && !isWorkOrderDocumentCategory(categoryRaw)) {
    res.status(400).json({ error: "invalid_document_category" });
    return;
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (displayNameRaw !== undefined) {
    sets.push(`"displayName" = $${i++}`);
    params.push(displayNameRaw);
  }
  if (categoryRaw !== undefined) {
    sets.push(`"category" = $${i++}`);
    params.push(categoryRaw);
  }
  const pDoc = i++;
  const pWorkOrder = i++;
  const pUser = i++;
  params.push(documentId, id, userId);

  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const upd = await client.query<{ id: string }>(
        `
        UPDATE "workOrderDocument" d
        SET ${sets.join(", ")}
        FROM "workOrder" w
        WHERE d."id" = $${pDoc}::uuid
          AND d."workOrderId" = $${pWorkOrder}::uuid
          AND w."id" = d."workOrderId"
          AND ${siteAccessSql('w."siteId"', `$${pUser}`)}
        RETURNING d."id"
        `,
        params,
      );
      if (upd.rowCount === 0) return null;
      const { rows } = await client.query<WorkOrderDocumentRow>(
        `${workOrderDocumentSelectJoin}
        WHERE d."id" = $1::uuid`,
        [documentId],
      );
      return rows[0] ?? null;
    });
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
    const deleted = await withAuditContext(meta, async (client) => {
      const workOrder = await client.query<WorkOrderAccessRow>(
        `
        SELECT "id", "siteId"
        FROM "workOrder"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (workOrder.rowCount === 0) return 0;
      const result: QueryResult = await client.query(
        `
        DELETE FROM "workOrderDocument"
        WHERE "id" = $1::uuid
          AND "workOrderId" = $2::uuid
        `,
        [documentId, id],
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

      const { rows } = await client.query<WorkOrderRow>(
        `
        WITH inserted AS (
          INSERT INTO "workOrder"
            ("name", "description", "siteId", "assetId", "costCenterId", "plannedStart", "plannedEnd", "plannedDurationMinutes", "orderType", "status", "responsibleEmployeeId", "workgroupId", "classificationId")
          VALUES
            ($1, $2, $3::uuid, $4::uuid, $5::uuid, $6::timestamptz, $7::timestamptz, $8::integer, $9, 'open', $10::uuid, $11::uuid, $12::uuid)
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
          i."workgroupId",
          wg."key" AS "workgroupKey",
          wg."name" AS "workgroupName",
          i."createdAt",
          i."updatedAt",
          COALESCE(created_by."loginName", i."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", i."updatedBy"::text) AS "updatedBy",
          0::int AS "documentCount",
          COALESCE(asset_doc_counts."assetDocumentCount", 0)::int AS "assetDocumentCount",
          0::int AS "assignedEmployeeCount"
        FROM inserted i
        JOIN "site" s ON s."id" = i."siteId"
        JOIN "asset" a ON a."id" = i."assetId"
        JOIN "costCenter" c ON c."id" = i."costCenterId"
        LEFT JOIN "classification" cl ON cl."id" = i."classificationId"
        LEFT JOIN "employee" re ON re."id" = i."responsibleEmployeeId"
        LEFT JOIN "workgroup" wg ON wg."id" = i."workgroupId"
        LEFT JOIN "users" created_by ON created_by."id" = i."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = i."updatedBy"
        LEFT JOIN (
          SELECT "assetId", COUNT(*)::int AS "assetDocumentCount"
          FROM "assetDocument"
          GROUP BY "assetId"
        ) asset_doc_counts ON asset_doc_counts."assetId" = i."assetId"
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
        ],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
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
          u."workgroupId",
          wg."key" AS "workgroupKey",
          wg."name" AS "workgroupName",
          u."createdAt",
          u."updatedAt",
          COALESCE(created_by."loginName", u."createdBy"::text) AS "createdBy",
          COALESCE(updated_by."loginName", u."updatedBy"::text) AS "updatedBy",
          COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
          COALESCE(asset_doc_counts."assetDocumentCount", 0)::int AS "assetDocumentCount",
          COALESCE(assign_counts."assignedEmployeeCount", 0)::int AS "assignedEmployeeCount"
        FROM updated u
        JOIN "site" s ON s."id" = u."siteId"
        JOIN "asset" a ON a."id" = u."assetId"
        JOIN "costCenter" c ON c."id" = u."costCenterId"
        LEFT JOIN "classification" clf ON clf."id" = u."classificationId"
        LEFT JOIN "employee" re ON re."id" = u."responsibleEmployeeId"
        LEFT JOIN "workgroup" wg ON wg."id" = u."workgroupId"
        LEFT JOIN "users" created_by ON created_by."id" = u."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = u."updatedBy"
        LEFT JOIN (
          SELECT "workOrderId", COUNT(*)::int AS "documentCount"
          FROM "workOrderDocument"
          GROUP BY "workOrderId"
        ) doc_counts ON doc_counts."workOrderId" = u."id"
        LEFT JOIN (
          SELECT "assetId", COUNT(*)::int AS "assetDocumentCount"
          FROM "assetDocument"
          GROUP BY "assetId"
        ) asset_doc_counts ON asset_doc_counts."assetId" = u."assetId"
        LEFT JOIN (
          SELECT "workOrderId", COUNT(*)::int AS "assignedEmployeeCount"
          FROM "workOrderEmployeeAssignment"
          GROUP BY "workOrderId"
        ) assign_counts ON assign_counts."workOrderId" = u."id"
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
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

export const workOrdersRouter = router;

