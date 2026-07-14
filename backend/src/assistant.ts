import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { Router, type Request, type Response } from "express";
import multer from "multer";
import { OpenAI } from "openai";
import type { QueryResult, QueryResultRow } from "pg";

import { getAllowSiteChange, getAllowChangeStockdata, getWorkingSiteId } from "./appParameters.js";
import { assertClassificationForSiteAndScope } from "./classificationAssert.js";
import { withAuditContext } from "./auditContext.js";
import {
  assetDocumentCountSubquery,
  listDocumentsForAssistant,
  readDocumentTextForAssistant,
  workOrderAssetDocumentCountSubquery,
  workOrderDocumentCountSubquery,
} from "./documents/index.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";
import { broadcastWorkOrderCreated } from "./workOrderRealtime.js";
import { updateWorkOrderPlanning, updateWorkOrderPlanningBatch } from "./workOrders.js";
import {
  effectivePlannedEnd,
  findFreePlanningSlots,
  getAssetPlanningConflicts,
  isBeforeLocalToday,
  computePlanningWindowShiftDeltaMs,
  getIsoWeekRange,
  planSequentialWorkOrderSlots,
  shiftPlannedRangeByDeltaMs,
  type OrderToPlanSequentially,
  type PlanningOrderRow,
  attachAssetConflictsToShiftAssignments,
  type ShiftedPlanningAssignment,
} from "./workOrderScheduling.js";

type AssistantRole = "user" | "assistant" | "system" | "tool";
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
type UiContext = {
  type: "workOrder" | "asset" | "monitoring" | "sparePart" | "warehouse" | "calendar" | "app" | "unknown";
  id?: string;
  label?: string;
  data?: unknown;
};

type CalendarContextData = {
  viewMode?: "month" | "week" | "day";
  rangeStart?: string;
  rangeEnd?: string;
  anchorDate?: string;
};

type AssistantMessageRow = {
  id: string;
  role: AssistantRole;
  content: string;
  locale: string | null;
  clientContext: UiContext | null;
  createdAt: string;
};

type UserProfile = {
  id: string;
  loginName: string;
  name: string;
  workingSiteId: string;
  employeeId: string | null;
  employeeKey: string | null;
  employeeName: string | null;
  siteIds: string[];
  sites: Array<{ id: string; key: string; name: string }>;
  /** Buchungskreise (cost centers) on sites the user may access — same scope as the cost-centers API. */
  costCenters: Array<{
    id: string;
    key: string;
    name: string;
    siteId: string;
    siteKey: string;
    siteName: string;
    isActive: boolean;
  }>;
  workgroups: Array<{ id: string; key: string; name: string; siteId: string }>;
};

type WorkOrderRow = QueryResultRow & {
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
  responsibleEmployeeIds: string[];
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  doneBy: string | null;
  doneByEmployeeKey: string | null;
  doneByEmployeeName: string | null;
  doneAt: string | null;
  endedAt: string | null;
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
  originalWo: string | null;
  originalWoOrderNumber: number | null;
  originalWoName: string | null;
};

type AssetRow = QueryResultRow & {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  type: string;
  parentAssetId: string | null;
  parentAssetKey: string | null;
  parentAssetName: string | null;
  serialNumber: string | null;
  buildDate: string | null;
  manufacturer: string | null;
  remark: string | null;
  costCenterId: string | null;
  costCenterKey: string | null;
  costCenterName: string | null;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  documentCount: number;
};

type StockControlLineRow = {
  id: string;
  warehouseId: string;
  warehouseKey: string;
  warehouseName: string;
  storageLocation: string;
  quantity: string;
};

type SparePartRow = QueryResultRow & {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  serialNumber: string | null;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  manufacturer: string | null;
  articleNumber: string | null;
  alternativeDesignation: string | null;
};

type WarehouseRow = QueryResultRow & {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
};

type WarehouseStockLineRow = {
  sparePartId: string;
  sparePartKey: string;
  sparePartName: string;
  articleNumber: string | null;
  storageLocation: string;
  quantity: string;
};

type SparePartSearchRow = SparePartRow & {
  stockLineCount: number;
  totalQuantity: string;
};

type EntityResolveResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: "invalid_reference" | "not_found" | "ambiguous";
      matches?: Array<{ id: string; key: string; name: string }>;
    };

type ParsedCreateWorkOrder = {
  name: string;
  description: string | null;
  assetId: string;
  costCenterId: string;
  plannedStart: string;
  plannedEnd: string | null;
  plannedDurationMinutes: number | null;
  orderType: WorkOrderType;
  responsibleEmployeeIds: string[];
  workgroupId: string;
  classificationId: string | null;
  originalWo: string | null;
};

type WorkOrderStatusCountResult = {
  requestedStatus: string | null;
  status: WorkOrderStatus | null;
  labels: Record<WorkOrderStatus, { de: string; en: string }>;
  total: number;
  counts: Array<{ status: WorkOrderStatus; count: number }>;
};

type WorkOrderStatusEventRow = {
  changedAt: string;
  oldStatus: WorkOrderStatus | null;
  newStatus: WorkOrderStatus;
  changedBy: string | null;
  changedByLogin: string | null;
  changedByName: string | null;
  employeeId: string | null;
  employeeKey: string | null;
  employeeName: string | null;
  source: string | null;
  reason: string | null;
};

type TransactionReadRow = {
  id: string;
  transactionNumber: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  type: string;
  bookedAt: string;
  quantity: string;
  workOrderId: string | null;
  workOrderOrderNumber: string | null;
  workOrderName: string | null;
  remark: string | null;
  createdAt: string;
  createdBy: string | null;
  createdByLogin: string | null;
  createdByName: string | null;
  createdByEmployeeId: string | null;
  createdByEmployeeKey: string | null;
  createdByEmployeeName: string | null;
};

type TransactionSummaryRow = {
  type: string;
  count: number;
  quantity: string;
};

const router = Router();
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
const workOrderStatusMetadata: Record<
  WorkOrderStatus,
  { de: string; en: string; aliases: string[] }
> = {
  open: {
    de: "Offen",
    en: "Open",
    aliases: ["offen", "offene", "offenen", "offener", "offenes", "open"],
  },
  assigned: {
    de: "Zugewiesen",
    en: "Assigned",
    aliases: ["zugewiesen", "zugewiesene", "zugewiesenen", "zugewiesener", "zugewiesenes", "assigned"],
  },
  started: {
    de: "Gestartet",
    en: "Started",
    aliases: ["gestartet", "gestartete", "gestarteten", "gestarteter", "gestartetes", "started"],
  },
  paused: {
    de: "Pausiert",
    en: "Paused",
    aliases: ["pausiert", "pausierte", "pausierten", "pausierter", "pausiertes", "paused"],
  },
  continued: {
    de: "Aufgenommen",
    en: "Continued",
    aliases: ["aufgenommen", "aufgenommene", "aufgenommenen", "aufgenommener", "aufgenommenes", "continued"],
  },
  ended: {
    de: "Beendet",
    en: "Ended",
    aliases: ["beendet", "beendete", "beendeten", "beendeter", "beendetes", "ended"],
  },
  done: {
    de: "Erledigt",
    en: "Done",
    aliases: ["erledigt", "erledigte", "erledigten", "erledigter", "erledigtes", "done"],
  },
  cancelled: {
    de: "Storniert",
    en: "Cancelled",
    aliases: [
      "storniert",
      "stornierte",
      "stornierten",
      "stornierter",
      "storniertes",
      "abgebrochen",
      "abgebrochene",
      "abgebrochenen",
      "cancelled",
      "canceled",
    ],
  },
};
const workOrderStatusAliases: Record<string, WorkOrderStatus> = Object.fromEntries(
  allowedWorkOrderStatuses.flatMap((status) =>
    [status, workOrderStatusMetadata[status].de, workOrderStatusMetadata[status].en, ...workOrderStatusMetadata[status].aliases].map(
      (alias) => [normalizeStatusText(alias), status],
    ),
  ),
);
const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
const chatModel = process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";
const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
const whisperModel = process.env.OPENAI_WHISPER_MODEL?.trim() || "whisper-1";
const SPOKEN_AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const spokenAudioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SPOKEN_AUDIO_MAX_BYTES },
});

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
    (
      SELECT COALESCE(array_agg(wor."employeeId"::text ORDER BY e."key"), ARRAY[]::text[])
      FROM "workOrderResponsibleEmployee" wor
      JOIN "employee" e ON e."id" = wor."employeeId"
      WHERE wor."workOrderId" = w."id"
    ) AS "responsibleEmployeeIds",
    (
      SELECT NULLIF(COALESCE(string_agg(e."key", ', ' ORDER BY e."key"), ''), '')
      FROM "workOrderResponsibleEmployee" wor
      JOIN "employee" e ON e."id" = wor."employeeId"
      WHERE wor."workOrderId" = w."id"
    ) AS "responsibleEmployeeKey",
    (
      SELECT NULLIF(COALESCE(string_agg(e."name", ', ' ORDER BY e."key"), ''), '')
      FROM "workOrderResponsibleEmployee" wor
      JOIN "employee" e ON e."id" = wor."employeeId"
      WHERE wor."workOrderId" = w."id"
    ) AS "responsibleEmployeeName",
    w."doneBy",
    dbe."key" AS "doneByEmployeeKey",
    dbe."name" AS "doneByEmployeeName",
    done_history."doneAt",
    ended_history."endedAt",
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
    COALESCE(assign_counts."assignedEmployeeCount", 0)::int AS "assignedEmployeeCount"
  FROM "workOrder" w
  JOIN "site" s ON s."id" = w."siteId"
  JOIN "asset" a ON a."id" = w."assetId"
  JOIN "costCenter" c ON c."id" = w."costCenterId"
  LEFT JOIN "classification" cl ON cl."id" = w."classificationId"
  LEFT JOIN "employee" dbe ON dbe."id" = w."doneBy"
  LEFT JOIN (
    SELECT "workOrderId", max("occurredAt") AS "doneAt"
    FROM "workOrderStatusHistory"
    WHERE "status" = 'done'
    GROUP BY "workOrderId"
  ) done_history ON done_history."workOrderId" = w."id"
  LEFT JOIN (
    SELECT "workOrderId", max("occurredAt") AS "endedAt"
    FROM "workOrderStatusHistory"
    WHERE "status" = 'ended'
    GROUP BY "workOrderId"
  ) ended_history ON ended_history."workOrderId" = w."id"
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
`;

const selectAssetsSql = `
  SELECT
    a."id",
    a."key",
    a."name",
    a."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    a."type",
    a."parentAssetId",
    parent."key" AS "parentAssetKey",
    parent."name" AS "parentAssetName",
    a."serialNumber",
    a."buildDate"::text AS "buildDate",
    a."manufacturer",
    a."remark",
    a."costCenterId",
    cc."key" AS "costCenterKey",
    cc."name" AS "costCenterName",
    a."classificationId",
    clf."key" AS "classificationKey",
    clf."name" AS "classificationName",
    COALESCE(doc_counts."documentCount", 0)::int AS "documentCount"
  FROM "asset" a
  JOIN "site" s ON s."id" = a."siteId"
  LEFT JOIN "asset" parent ON parent."id" = a."parentAssetId"
  LEFT JOIN "costCenter" cc ON cc."id" = a."costCenterId"
  LEFT JOIN "classification" clf ON clf."id" = a."classificationId"
  ${assetDocumentCountSubquery}
`;

const selectSparePartsSql = `
  SELECT
    sp."id",
    sp."key",
    sp."name",
    sp."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    sp."isActive",
    sp."serialNumber",
    sp."classificationId",
    clf."key" AS "classificationKey",
    clf."name" AS "classificationName",
    sp."manufacturer",
    sp."articleNumber",
    sp."alternativeDesignation"
  FROM "sparePart" sp
  JOIN "site" s ON s."id" = sp."siteId"
  LEFT JOIN "classification" clf ON clf."id" = sp."classificationId"
`;

const selectWarehousesSql = `
  SELECT
    w."id",
    w."key",
    w."name",
    w."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    w."isActive"
  FROM "warehouse" w
  JOIN "site" s ON s."id" = w."siteId"
`;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function normalizeEmployeeIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.map((entry) => (typeof entry === "string" ? entry.trim() : ""));
  if (normalized.some((id) => !isUuid(id))) return null;
  return [...new Set(normalized)];
}

function readString(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function readOptionalString(value: unknown, max = 2000): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("invalid_body");
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new Error("invalid_body");
  return trimmed;
}

function parseIsoDatetime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function workOrderDatetimeToIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return parseIsoDatetime(value);
}

function isOrderType(value: unknown): value is WorkOrderType {
  return typeof value === "string" && (allowedOrderTypes as string[]).includes(value);
}

function normalizeStatusText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeWorkOrderStatus(value: unknown): WorkOrderStatus | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeStatusText(value);
  if (!normalized) return null;
  return workOrderStatusAliases[normalized] ?? null;
}

function parseCreateWorkOrderArgs(args: Record<string, unknown>): ParsedCreateWorkOrder {
  const name = readString(args.name, 200);
  const description = readOptionalString(args.description, 2000);
  const assetId = readString(args.assetId, 80);
  const costCenterId = readString(args.costCenterId, 80);
  const plannedStart = parseIsoDatetime(args.plannedStart);
  const plannedEnd = args.plannedEnd === null || args.plannedEnd === undefined ? null : parseIsoDatetime(args.plannedEnd);
  const rawDuration = args.plannedDurationMinutes;
  const plannedDurationMinutes =
    rawDuration === null || rawDuration === undefined
      ? null
      : typeof rawDuration === "number" && Number.isInteger(rawDuration) && rawDuration >= 0
        ? rawDuration
        : null;
  const responsibleEmployeeIds = normalizeEmployeeIds(args.responsibleEmployeeIds);
  const workgroupId = readString(args.workgroupId, 80);
  const classificationId = readOptionalString(args.classificationId, 80);
  const originalWo = readOptionalString(args.originalWo, 80);

  if (
    !name ||
    !assetId ||
    !costCenterId ||
    !plannedStart ||
    (args.plannedEnd !== null && args.plannedEnd !== undefined && !plannedEnd) ||
    (rawDuration !== null && rawDuration !== undefined && plannedDurationMinutes === null) ||
    !isOrderType(args.orderType) ||
    !workgroupId ||
    !isUuid(assetId) ||
    !isUuid(costCenterId) ||
    !isUuid(workgroupId) ||
    !responsibleEmployeeIds ||
    responsibleEmployeeIds.length === 0 ||
    (classificationId !== null && !isUuid(classificationId)) ||
    (originalWo !== null && !isUuid(originalWo))
  ) {
    throw new Error("invalid_body");
  }

  return {
    name,
    description,
    assetId,
    costCenterId,
    plannedStart,
    plannedEnd,
    plannedDurationMinutes,
    orderType: args.orderType,
    responsibleEmployeeIds,
    workgroupId,
    classificationId,
    originalWo,
  };
}

function deletionAnswer(locale: string): string {
  return locale.toLowerCase().startsWith("en")
    ? "I am not able to delete records."
    : "Ich bin nicht in der Lage Datensätze zu Löschen";
}

function containsDeleteIntent(message: string): boolean {
  return /\b(delete|remove|erase|destroy|drop)\b/i.test(message) || /\b(lösch|loesch|entfern)\w*/i.test(message);
}

type FeedbackContextData = {
  intent?: string;
  draftRemark?: string;
  draftPauseRemark?: string;
  activeField?: "remark" | "pauseRemark";
  assetId?: string;
  assetKey?: string;
  assetName?: string;
  orderNumber?: number;
};

function getFeedbackContextData(context: UiContext | null): FeedbackContextData | null {
  if (!context?.data || typeof context.data !== "object") return null;
  const data = context.data as FeedbackContextData;
  return data.intent === "feedback" ? data : null;
}

const ATHENE_APPLY_META_RE =
  /\n?\[ATHENE_APPLY:(remark|pauseRemark|reschedule|rescheduleBatch|rescheduleShift):([\s\S]*?)\]\s*$/;

export type AssistantApplyRescheduleShiftMeta = {
  sourceRangeStart?: string;
  sourceRangeEnd?: string;
  sourceIsoWeek?: number;
  sourceIsoWeekYear?: number;
  targetRangeStart?: string;
  targetIsoWeek?: number;
  targetIsoWeekYear?: number;
  allowAssetOverlap?: boolean;
  ordersWithAssetConflicts?: number;
};

export type AssistantApplyRescheduleMeta = {
  orderNumber?: number;
  id?: string;
  plannedStart: string;
  plannedEnd: string;
  allowAssetOverlap?: boolean;
};

type AssistantApplyMeta =
  | { correctedText: string; targetField: "remark" | "pauseRemark" }
  | { reschedule: AssistantApplyRescheduleMeta }
  | { rescheduleBatch: AssistantApplyRescheduleMeta[] }
  | { rescheduleShift: AssistantApplyRescheduleShiftMeta };

function parseRescheduleApplyPayload(raw: unknown): AssistantApplyRescheduleMeta | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const plannedStart = parseIsoDatetime(o.plannedStart);
  const plannedEnd = parseIsoDatetime(o.plannedEnd);
  if (!plannedStart || !plannedEnd) return null;
  const id = typeof o.id === "string" && isUuid(o.id.trim()) ? o.id.trim() : undefined;
  const orderNumber =
    typeof o.orderNumber === "number" && Number.isFinite(o.orderNumber)
      ? o.orderNumber
      : typeof o.orderNumber === "string" && /^\d+$/.test(o.orderNumber.trim())
        ? Number(o.orderNumber.trim())
        : undefined;
  if (!id && orderNumber === undefined) return null;
  const allowAssetOverlap = o.allowAssetOverlap === true;
  return { id, orderNumber, plannedStart, plannedEnd, allowAssetOverlap };
}

function parseRescheduleApplyPayloadJson(raw: string): AssistantApplyRescheduleMeta | null {
  try {
    return parseRescheduleApplyPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

function parseRescheduleShiftApplyPayload(raw: unknown): AssistantApplyRescheduleShiftMeta | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sourceIsoWeek =
    typeof o.sourceIsoWeek === "number"
      ? o.sourceIsoWeek
      : typeof o.sourceIsoWeek === "string" && /^\d+$/.test(o.sourceIsoWeek.trim())
        ? Number(o.sourceIsoWeek.trim())
        : undefined;
  const sourceIsoWeekYear =
    typeof o.sourceIsoWeekYear === "number"
      ? o.sourceIsoWeekYear
      : typeof o.sourceIsoWeekYear === "string" && /^\d+$/.test(o.sourceIsoWeekYear.trim())
        ? Number(o.sourceIsoWeekYear.trim())
        : undefined;
  const targetIsoWeek =
    typeof o.targetIsoWeek === "number"
      ? o.targetIsoWeek
      : typeof o.targetIsoWeek === "string" && /^\d+$/.test(o.targetIsoWeek.trim())
        ? Number(o.targetIsoWeek.trim())
        : undefined;
  const targetIsoWeekYear =
    typeof o.targetIsoWeekYear === "number"
      ? o.targetIsoWeekYear
      : typeof o.targetIsoWeekYear === "string" && /^\d+$/.test(o.targetIsoWeekYear.trim())
        ? Number(o.targetIsoWeekYear.trim())
        : undefined;
  const sourceRangeStart = parseIsoDatetime(o.sourceRangeStart);
  const sourceRangeEnd = parseIsoDatetime(o.sourceRangeEnd);
  const targetRangeStart = parseIsoDatetime(o.targetRangeStart);
  const hasKw =
    sourceIsoWeek !== undefined &&
    sourceIsoWeekYear !== undefined &&
    targetIsoWeek !== undefined &&
    targetIsoWeekYear !== undefined;
  const hasRange = Boolean(sourceRangeStart && sourceRangeEnd && targetRangeStart);
  if (!hasKw && !hasRange) return null;
  return {
    ...(sourceRangeStart ? { sourceRangeStart } : {}),
    ...(sourceRangeEnd ? { sourceRangeEnd } : {}),
    ...(targetRangeStart ? { targetRangeStart } : {}),
    ...(sourceIsoWeek !== undefined ? { sourceIsoWeek } : {}),
    ...(sourceIsoWeekYear !== undefined ? { sourceIsoWeekYear } : {}),
    ...(targetIsoWeek !== undefined ? { targetIsoWeek } : {}),
    ...(targetIsoWeekYear !== undefined ? { targetIsoWeekYear } : {}),
    allowAssetOverlap: o.allowAssetOverlap === true,
    ordersWithAssetConflicts:
      typeof o.ordersWithAssetConflicts === "number" && Number.isFinite(o.ordersWithAssetConflicts)
        ? o.ordersWithAssetConflicts
        : undefined,
  };
}

function parseRescheduleBatchApplyPayload(raw: string): AssistantApplyRescheduleMeta[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const items: AssistantApplyRescheduleMeta[] = [];
    for (const entry of parsed) {
      const item = parseRescheduleApplyPayload(entry);
      if (!item) return null;
      items.push(item);
    }
    return items;
  } catch {
    return null;
  }
}

function buildRescheduleShiftMetaFromToolArgs(
  args: Record<string, unknown>,
  ordersWithAssetConflicts = 0,
): AssistantApplyRescheduleShiftMeta | null {
  const parsed = parseRescheduleShiftApplyPayload(args);
  if (!parsed) return null;
  if (ordersWithAssetConflicts > 0) {
    parsed.ordersWithAssetConflicts = ordersWithAssetConflicts;
  }
  return parsed;
}

function mergeAssistantApplyMeta(
  fromContent: AssistantApplyMeta | null,
  fromTools: AssistantApplyMeta | null,
): AssistantApplyMeta | null {
  if (!fromContent && !fromTools) return null;
  if (!fromContent) return fromTools;
  if (!fromTools) return fromContent;
  return { ...fromContent, ...fromTools };
}

function parseAssistantApplyMeta(content: string): {
  displayContent: string;
  meta: AssistantApplyMeta | null;
} {
  const match = content.match(ATHENE_APPLY_META_RE);
  if (!match) return { displayContent: content, meta: null };
  const payload = match[2].trim();
  const field = match[1];
  if (!payload) {
    return { displayContent: content.replace(ATHENE_APPLY_META_RE, "").trimEnd(), meta: null };
  }
  if (field === "reschedule") {
    const reschedule = parseRescheduleApplyPayloadJson(payload);
    if (!reschedule) {
      return { displayContent: content.replace(ATHENE_APPLY_META_RE, "").trimEnd(), meta: null };
    }
    return {
      displayContent: content.replace(ATHENE_APPLY_META_RE, "").trimEnd(),
      meta: { reschedule },
    };
  }
  if (field === "rescheduleBatch") {
    const rescheduleBatch = parseRescheduleBatchApplyPayload(payload);
    if (!rescheduleBatch) {
      return { displayContent: content.replace(ATHENE_APPLY_META_RE, "").trimEnd(), meta: null };
    }
    return {
      displayContent: content.replace(ATHENE_APPLY_META_RE, "").trimEnd(),
      meta: { rescheduleBatch },
    };
  }
  if (field === "rescheduleShift") {
    try {
      const rescheduleShift = parseRescheduleShiftApplyPayload(JSON.parse(payload));
      if (!rescheduleShift) {
        return { displayContent: content.replace(ATHENE_APPLY_META_RE, "").trimEnd(), meta: null };
      }
      return {
        displayContent: content.replace(ATHENE_APPLY_META_RE, "").trimEnd(),
        meta: { rescheduleShift },
      };
    } catch {
      return { displayContent: content.replace(ATHENE_APPLY_META_RE, "").trimEnd(), meta: null };
    }
  }
  return {
    displayContent: content.replace(ATHENE_APPLY_META_RE, "").trimEnd(),
    meta: { correctedText: payload, targetField: field as "remark" | "pauseRemark" },
  };
}

function getCalendarContextData(context: UiContext | null): CalendarContextData | null {
  if (!context?.data || typeof context.data !== "object") return null;
  return context.data as CalendarContextData;
}

function calendarSystemPromptAppendix(locale: string, calendarData: CalendarContextData | null): string {
  const en = locale.toLowerCase().startsWith("en");
  const lines = [
    en
      ? "The user is in the Kalendar (planning calendar) UI. Help reschedule work orders. Same-asset overlaps are warnings — ask for confirmation, then allowAssetOverlap."
      : "Der Benutzer ist in der Kalendar-Planungsansicht. Überlappungen am gleichen Asset sind Warnungen — Benutzer fragen, dann allowAssetOverlap.",
    en
      ? "Planning collision rule: only the same asset counts. Overlaps never block planning — show proposed dates for ALL orders, explain conflicts, ask 'move anyway?'. Only after yes use allowAssetOverlap: true. Never say orders could not be planned due to overlaps or missing slots when shiftWorkOrdersInPlanningWindow returned a full assignment list."
      : "Kollisionsregel: nur gleiches Asset. Überlappungen blockieren nie — ALLE vorgeschlagenen Termine zeigen, Konflikte erklären, fragen 'trotzdem verschieben?'. Erst nach Ja allowAssetOverlap: true. Nie behaupten, Aufträge fehlten wegen Überlappung oder fehlender Slots, wenn shiftWorkOrdersInPlanningWindow alle Zuweisungen geliefert hat.",
    en
      ? "Never move plannedStart before today (local calendar day, Europe/Berlin). Preserve duration when shifting unless the user specifies new end times."
      : "plannedStart nie vor heute (Kalendertag Europe/Berlin). Bei Verschieben die Dauer beibehalten, außer der Benutzer nennt explizit neue Endzeiten.",
    en
      ? "NEVER propose or confirm planned dates without calling a planning tool first (findPlanningSlots, planSequentialWorkOrderSlots, or analyzeWorkOrderPlanning). Never assign the same start time to multiple orders on the same asset."
      : "NIEMALS Termine vorschlagen oder bestätigen ohne vorher ein Planungs-Tool (findPlanningSlots, planSequentialWorkOrderSlots, analyzeWorkOrderPlanning). Nie mehreren Aufträgen am gleichen Asset dieselbe Startzeit geben.",
    en
      ? "To move ALL orders in a calendar week or date range (e.g. KW 20 → KW 30), use shiftWorkOrdersInPlanningWindow — NOT planSequentialWorkOrderSlots (that tool is only for listed orders on ONE asset). After confirmation call rescheduleWorkOrdersBatch with shiftPlan (same parameters) so every order is moved."
      : "Alle Aufträge einer Kalenderwoche / eines Zeitraums verschieben (z. B. KW 20 → KW 30): shiftWorkOrdersInPlanningWindow — NICHT planSequentialWorkOrderSlots (nur ein Asset + explizite Liste). Nach Bestätigung rescheduleWorkOrdersBatch mit shiftPlan (gleiche Parameter), damit wirklich alle Aufträge verschoben werden.",
    en
      ? "For TWO OR MORE orders on the SAME asset only: planSequentialWorkOrderSlots. Never claim all orders were moved unless updatedCount equals orderCount from the tool."
      : "Nur bei mehreren Aufträgen am GLEICHEN Asset: planSequentialWorkOrderSlots. Behaupte nie, alle seien verschoben, wenn updatedCount < orderCount.",
    en
      ? "For ONE order: use findPlanningSlots or analyzeWorkOrderPlanning before suggesting; append [ATHENE_APPLY:reschedule:{...}] for a single validated slot."
      : "Für EINEN Auftrag: vor Vorschlag findPlanningSlots oder analyzeWorkOrderPlanning; bei einem Slot [ATHENE_APPLY:reschedule:{...}].",
  ];
  if (calendarData?.viewMode) {
    lines.push(`Calendar view: ${calendarData.viewMode}`);
  }
  if (calendarData?.rangeStart && calendarData?.rangeEnd) {
    lines.push(`Visible planning window: ${calendarData.rangeStart} – ${calendarData.rangeEnd}`);
  }
  return lines.join("\n");
}

function feedbackSystemPromptAppendix(locale: string, feedbackData: FeedbackContextData): string {
  const en = locale.toLowerCase().startsWith("en");
  return [
    en
      ? "The user is composing work-order feedback (Rückmeldung) in the UI. Help with similar past problems on the same asset and with proofreading their draft remark text."
      : "Der Benutzer erfasst gerade eine Auftragsrückmeldung in der UI. Hilf bei ähnlichen früheren Problemen am gleichen Asset und bei der Korrektur des Rückmeldetext-Entwurfs.",
    `Draft remark (Rückmeldetext): ${JSON.stringify(feedbackData.draftRemark ?? "")}`,
    `Draft pause remark: ${JSON.stringify(feedbackData.draftPauseRemark ?? "")}`,
    `Active field focus: ${feedbackData.activeField ?? "remark"}`,
    en
      ? "For similar-problem questions: use listWorkOrdersByAsset and vector snippets; compare transaction remarks (type IN) and work-order descriptions. Do not invent history."
      : "Bei Fragen zu ähnlichen Problemen: nutze listWorkOrdersByAsset und Vector-Snippets; vergleiche Rückmeldetexte (Transaktion type IN) und Auftragsbeschreibungen. Keine erfundene Historie.",
    en
      ? "When the user asks to correct or proofread feedback text, reply in the frontend language with a short explanation, then on its own final line append exactly: [ATHENE_APPLY:remark:...] or [ATHENE_APPLY:pauseRemark:...] containing ONLY the corrected text (max 2000 chars). Never save feedback automatically."
      : "Wenn der Benutzer den Rückmeldetext korrigieren lassen will: kurz erklären, dann in einer eigenen letzten Zeile exakt anhängen: [ATHENE_APPLY:remark:...] oder [ATHENE_APPLY:pauseRemark:...] mit NUR dem korrigierten Text (max. 2000 Zeichen). Niemals automatisch speichern.",
  ].join("\n");
}

function systemPrompt(locale: string, profile: UserProfile): string {
  const dateFormat = locale.toLowerCase().startsWith("en") ? "MM/DD/YYYY HH:mm" : "DD.MM.YYYY HH:mm";
  return [
    "You are Athene, the Athene CMMS assistant.",
    `Answer only in the selected frontend language: ${locale}.`,
    `Format dates and times for the user with this locale format: ${dateFormat}.`,
    "When presenting structured lists, comparisons, counts, status summaries, or tabular data, use GitHub-flavored Markdown tables. Keep tables compact and include only columns that help answer the question.",
    "You can never delete records. If a user asks you to delete, remove, or erase records, answer with the fixed refusal and do not call tools.",
    "You must never access, reveal, or change passwords, password hashes, session secrets, API keys, or similar sensitive data.",
    "You must not add, change, or delete records for master-data apps: sites, users, employees, workgroups, cost centers, warehouses, spare parts, classifications, app parameters, translations, table viewer, or search configuration.",
    "You may create work orders only through createWorkOrder or createWorkOrderFromOrder. When the user wants a copy of an existing order (same asset, cost center, workgroup, dates, etc.), prefer createWorkOrderFromOrder with templateOrderNumber and the new name — do not re-type reference UUIDs.",
    "createWorkOrder requires UUID values for assetId, costCenterId, workgroupId, and responsibleEmployeeIds (at least one leader UUID). Never pass business keys (assetKey, costCenterKey, employeeKey) or order numbers as IDs. getWorkOrderDetails returns both keys and UUIDs: use the *Id fields for createWorkOrder.",
    "After the user confirms they want the same data as a template order (possibly with a new name or dates), call the create tool immediately. Do not loop on re-confirming fields already taken from getWorkOrderDetails or createWorkOrderFromOrder.",
    "For questions about counts, totals, or how many work orders exist in a status, use countWorkOrdersByStatus.",
    `Work-order status labels and aliases: ${allowedWorkOrderStatuses
      .map((status) => `${workOrderStatusMetadata[status].de}/${workOrderStatusMetadata[status].en}=${status}`)
      .join(", ")}.`,
    "Program logic: In work-order and monitoring tables, document button colors are source indicators, not permission indicators. Green (app-ref-button--documents-asset) means ONLY asset document references exist: documentCount = 0 and assetDocumentCount > 0. Blue/cyan (app-ref-button--documents) means work-order document references exist: documentCount > 0; assetDocumentCount may also be > 0. Transparent/soft-blue (app-ref-button--documents-inactive) means documentCount = 0 and assetDocumentCount = 0.",
    "Program logic: Never explain green or blue document icons as access, visibility, or permission state. Current permission checks are API-level rules and are separate from these colors.",
    "Program logic: In asset tables, the cyan/blue document button means the asset itself has documents; the transparent/soft-blue inactive button means the asset has no documents.",
    "Program logic: Use row context fields documentCount, assetDocumentCount, and documentReferenceSource when explaining document button colors. documentCount counts documents directly attached to the work order. assetDocumentCount counts documents from the referenced asset.",
    "Program logic: statusEvents from auditLog identify who changed a work order to each status and when. Use them for questions like who started, paused, continued, ended, completed, cancelled, or assigned an order. Prefer employeeName/employeeKey from the linked user employee; otherwise use changedByName or changedByLogin.",
    "Program logic: workOrder.doneBy/doneByEmployeeKey/doneByEmployeeName identify the employee stored as completion attribution. For status Beendet/ended, combine doneByEmployeeName with endedAt when present. For status Erledigt/done, combine doneByEmployeeName with doneAt when present. If statusEvents and doneBy conflict, mention both instead of inventing certainty.",
    "Program logic: Athene has read access to transactions through tools and context facts. For work-order feedback hours, transaction type IN with workOrderId stores captured hours in quantity. If the user says 'ich', 'meine', or asks what they personally captured, use currentUserTransactions; otherwise use all work-order transactions. Present transaction lists and summaries as Markdown tables when useful.",
    "Program logic: User profile `sites` are **Standorte (sites)** — each has `key` (short code, e.g. EY) and `name` (location/site name, e.g. Eystrup). This is not the same as Buchungskreise.",
    "Program logic: User profile `costCenters` are **Buchungskreise (cost centers)** the user may use on allowed sites. Each entry has `key` and `name` of the cost center, plus `siteKey` and `siteName` of the site that cost center belongs to. Never swap site key/name with cost center key/name. Never label a site as a Buchungskreis unless it is literally an entry in `costCenters`.",
    "Program logic: User profile `workgroups` are **Fachgruppen (workgroups)** — assignment groups, not Buchungskreise. Do not list workgroup names as cost centers.",
    "When the user asks which Buchungskreise/cost centers they have access to, list **only** objects from `costCenters` (with siteKey/siteName for context). If `costCenters` is empty, say there are none in the system for their accessible sites — do not invent rows.",
    "Program logic: Relevant vector snippets come from pgvector search over embedded assets (`sourceKind` asset), work orders (`workOrder`), work-order-visible documents (`workOrderDocument`), spare parts / materials (`sparePart`), and warehouses (`warehouse`). They are discovery hints only — not guaranteed complete or up-to-the-second.",
    "Program logic: For authoritative answers (exact document lists, full work-order fields, counts, IDs), always use tools even when vector snippets exist. Never treat snippet text alone as a full document list.",
    "Program logic: For how many documents are on work orders (per order or in total), use listWorkOrderDocumentCounts. It returns workOrderDocuments (on the order), assetDocumentsVisibleOnOrder (from the asset), and totalDocumentsVisibleOnOrder.",
    "Program logic: To list document files for one order, use listDocuments with sourceKind workOrder and orderNumber (e.g. 100007 or 007) OR id (UUID). Never pass an order number as id.",
    "Program logic: getWorkOrderDetails, getWorkOrderStatusEvents, getWorkOrderTransactions, listDocuments, and readDocumentText accept orderNumber instead of id when the user cites an Auftragsnummer.",
    "Program logic: Vector snippet lines use the format [sourceKind:sourceId]. Do not invent or alter sourceKind or sourceId values.",
    "Program logic: Spare parts (Ersatzteil / Material) are master-data records with optional stock lines in `stockControl` (Lagerdaten): each line has warehouseKey/warehouseName, storageLocation, and quantity. Use getSparePartDetails, searchSpareParts, listWarehouseStock, and searchStock for authoritative stock answers.",
    "Program logic: Warehouses (Lager) belong to a site. listWarehouseStock lists all materials and quantities stored in one warehouse. searchStock finds stock rows across warehouses and materials.",
    "Program logic: App parameter MT-ACSD (allowChangeStockdata) controls whether existing stock rows are editable in the spare-parts UI. When false (N), existing warehouse/storageLocation/quantity rows are read-only; new stock rows may still be added. Balance changes to existing rows happen only via transactions (RM/RT not fully implemented yet).",
    "Program logic: You have read-only access to spare parts and warehouses. Never create, update, or delete materials, warehouses, or stock lines.",
    "Program logic: Calendar / planning — NEVER invent dates. Whole calendar week / range moves (e.g. KW 20 → KW 30): shiftWorkOrdersInPlanningWindow, show ALL assignment rows (never a partial subset), then rescheduleWorkOrdersBatch with shiftPlan. planSequentialWorkOrderSlots is only for packing a short explicit list on ONE asset into free slots — NOT for KW moves.",
    "Program logic: Same-asset overlap is never a hard failure. If shiftWorkOrdersInPlanningWindow reports ordersWithAssetConflicts > 0, explain overlaps and ask the user; on yes call rescheduleWorkOrdersBatch with the same shiftPlan AND allowAssetOverlap: true. Never claim orders were skipped because of overlaps or lack of slots.",
    "Program logic: Never claim all orders were moved unless rescheduleWorkOrdersBatch returned ok:true with updatedCount equal to orderCount. shiftWorkOrdersInPlanningWindow is preview only — it does not save. The UI shows an apply button for whole-week shifts when the batch tool was not called.",
    "All answers and tool requests must respect the user's site restrictions.",
    "Use UI context when a row is selected. If context is missing or ambiguous, ask a short clarifying question.",
    `Known user context: ${JSON.stringify(profile)}`,
  ].join("\n");
}

async function getOrCreateConversation(userId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `
    INSERT INTO "assistantConversation" ("userId")
    VALUES ($1::uuid)
    ON CONFLICT ("userId") DO UPDATE SET "updatedAt" = now()
    RETURNING "id"
    `,
    [userId],
  );
  return rows[0].id;
}

async function loadMessages(conversationId: string, limit = 80): Promise<AssistantMessageRow[]> {
  const { rows } = await pool.query<AssistantMessageRow>(
    `
    SELECT "id", "role", "content", "locale", "clientContext", "createdAt"
    FROM "assistantMessage"
    WHERE "conversationId" = $1::uuid
    ORDER BY "createdAt" DESC
    LIMIT $2
    `,
    [conversationId, limit],
  );
  return rows;
}

async function insertMessage(
  conversationId: string,
  role: AssistantRole,
  content: string,
  locale: string | null,
  clientContext?: UiContext | null,
): Promise<AssistantMessageRow> {
  const { rows } = await pool.query<AssistantMessageRow>(
    `
    INSERT INTO "assistantMessage" ("conversationId", "role", "content", "locale", "clientContext")
    VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
    RETURNING "id", "role", "content", "locale", "clientContext", "createdAt"
    `,
    [conversationId, role, content, locale, clientContext ? JSON.stringify(clientContext) : null],
  );
  await pool.query(`UPDATE "assistantConversation" SET "updatedAt" = now() WHERE "id" = $1::uuid`, [conversationId]);
  return rows[0];
}

async function loadUserProfile(userId: string): Promise<UserProfile | null> {
  const { rows } = await pool.query<
    QueryResultRow & {
      id: string;
      loginName: string;
      name: string;
      workingSiteId: string;
      employeeId: string | null;
      employeeKey: string | null;
      employeeName: string | null;
      siteIds: string[];
      sites: UserProfile["sites"];
      costCenters: UserProfile["costCenters"];
      workgroups: UserProfile["workgroups"];
    }
  >(
    `
    SELECT
      u."id",
      u."loginName",
      u."name",
      u."workingSiteId",
      u."employeeId",
      emp."key" AS "employeeKey",
      emp."name" AS "employeeName",
      COALESCE(site_access."siteIds", ARRAY[]::uuid[])::text[] AS "siteIds",
      COALESCE(site_access."sites", '[]'::json) AS "sites",
      COALESCE(cost_centers."costCenters", '[]'::json) AS "costCenters",
      COALESCE(workgroups."workgroups", '[]'::json) AS "workgroups"
    FROM "users" u
    LEFT JOIN "employee" emp ON emp."id" = u."employeeId"
    LEFT JOIN LATERAL (
      SELECT
        array_agg(DISTINCT site_all."id") AS "siteIds",
        json_agg(DISTINCT jsonb_build_object('id', site_all."id", 'key', site_all."key", 'name', site_all."name")) AS "sites"
      FROM (
        SELECT s.*
        FROM "site" s
        WHERE s."id" = u."workingSiteId"
        UNION
        SELECT s.*
        FROM "userSite" us
        JOIN "site" s ON s."id" = us."siteId"
        WHERE us."userId" = u."id"
      ) site_all
    ) site_access ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        json_agg(
          jsonb_build_object(
            'id', c."id",
            'key', c."key",
            'name', c."name",
            'siteId', c."siteId",
            'siteKey', s."key",
            'siteName', s."name",
            'isActive', c."isActive"
          )
          ORDER BY s."key" ASC, c."key" ASC
        ),
        '[]'::json
      ) AS "costCenters"
      FROM "costCenter" c
      JOIN "site" s ON s."id" = c."siteId"
      WHERE ${siteAccessSql('c."siteId"', 'u."id"')}
    ) cost_centers ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(jsonb_build_object('id', wg."id", 'key', wg."key", 'name', wg."name", 'siteId', wg."siteId")) AS "workgroups"
      FROM "workgroupUser" wgu
      JOIN "workgroup" wg ON wg."id" = wgu."workgroupId"
      WHERE wgu."employeeId" = u."employeeId"
    ) workgroups ON true
    WHERE u."id" = $1::uuid
    LIMIT 1
    `,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    loginName: row.loginName,
    name: row.name,
    workingSiteId: row.workingSiteId,
    employeeId: row.employeeId,
    employeeKey: row.employeeKey,
    employeeName: row.employeeName,
    siteIds: row.siteIds,
    sites: row.sites ?? [],
    costCenters: (row.costCenters ?? []) as UserProfile["costCenters"],
    workgroups: row.workgroups ?? [],
  };
}

function formatVectorSnippets(
  rows: Array<{ content: string; sourceKind: string; sourceId: string }>,
): string {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const list = grouped.get(row.sourceKind) ?? [];
    list.push(`[${row.sourceId}] ${row.content}`);
    grouped.set(row.sourceKind, list);
  }
  return [...grouped.entries()]
    .map(([kind, items]) => `${kind}:\n${items.join("\n\n")}`)
    .join("\n\n");
}

async function retrieveRelevantChunks(userId: string, message: string): Promise<string> {
  if (!openai) return "";
  try {
    const embedding = await openai.embeddings.create({
      model: embeddingModel,
      input: message,
    });
    const vector = embedding.data[0]?.embedding;
    if (!vector?.length) return "";
    const { rows } = await pool.query<{ content: string; sourceKind: string; sourceId: string }>(
      `
      SELECT "content", "sourceKind", "sourceId"
      FROM "assistantEmbeddingChunk"
      WHERE "siteId" IS NULL OR ${siteAccessSql('"siteId"', "$2")}
      ORDER BY "embedding" <=> $1::vector
      LIMIT 10
      `,
      [`[${vector.join(",")}]`, userId],
    );
    if (rows.length === 0) return "";
    return formatVectorSnippets(rows);
  } catch (err) {
    console.warn("[athene-assistant] embedding retrieval skipped:", err);
    return "";
  }
}

async function getWorkOrderDetails(userId: string, id: string): Promise<unknown> {
  if (!isUuid(id)) throw new Error("invalid_id");
  const { rows } = await pool.query<WorkOrderRow>(
    `
    ${selectWorkOrdersSql}
    WHERE w."id" = $1::uuid
      AND ${siteAccessSql('w."siteId"', "$2")}
    LIMIT 1
    `,
    [id, userId],
  );
  return rows[0] ?? { error: "not_found" };
}

async function getWorkOrderStatusEvents(userId: string, id: string): Promise<unknown> {
  const workOrder = await getWorkOrderDetails(userId, id);
  if ((workOrder as { error?: string }).error === "not_found") return workOrder;
  const { rows } = await pool.query<WorkOrderStatusEventRow>(
    `
    SELECT
      a."changedAt",
      (a."oldData"->>'status')::text AS "oldStatus",
      (a."newData"->>'status')::text AS "newStatus",
      a."changedBy",
      u."loginName" AS "changedByLogin",
      u."name" AS "changedByName",
      u."employeeId",
      emp."key" AS "employeeKey",
      emp."name" AS "employeeName",
      a."source",
      a."reason"
    FROM "auditLog" a
    LEFT JOIN "users" u ON u."id" = a."changedBy"
    LEFT JOIN "employee" emp ON emp."id" = u."employeeId"
    WHERE a."tableName" = 'workOrder'
      AND a."recordId" = $1
      AND a."operation" = 'UPDATE'
      AND a."changedFields" IS NOT NULL
      AND 'status' = ANY(a."changedFields")
      AND a."newData"->>'status' = ANY($2::text[])
    ORDER BY a."changedAt" ASC
    `,
    [id, allowedWorkOrderStatuses],
  );
  return rows;
}

async function getWorkOrderTransactions(
  userId: string,
  id: string,
  onlyCurrentUser = false,
): Promise<unknown> {
  const workOrder = await getWorkOrderDetails(userId, id);
  if ((workOrder as { error?: string }).error === "not_found") return workOrder;
  const filterCurrentUserSql = onlyCurrentUser ? `AND t."createdBy" = $3::uuid` : "";
  const params = onlyCurrentUser ? [id, userId, userId] : [id, userId];
  const { rows } = await pool.query<TransactionReadRow>(
    `
    SELECT
      t."id",
      t."transactionNumber"::text AS "transactionNumber",
      t."siteId",
      s."key" AS "siteKey",
      s."name" AS "siteName",
      t."type",
      t."bookedAt",
      t."quantity"::text AS "quantity",
      t."workOrderId",
      w."orderNumber"::text AS "workOrderOrderNumber",
      w."name" AS "workOrderName",
      t."remark",
      t."createdAt",
      t."createdBy",
      created_by."loginName" AS "createdByLogin",
      created_by."name" AS "createdByName",
      created_by."employeeId" AS "createdByEmployeeId",
      emp."key" AS "createdByEmployeeKey",
      emp."name" AS "createdByEmployeeName"
    FROM "transaction" t
    JOIN "site" s ON s."id" = t."siteId"
    LEFT JOIN "workOrder" w ON w."id" = t."workOrderId"
    LEFT JOIN "users" created_by ON created_by."id" = t."createdBy"
    LEFT JOIN "employee" emp ON emp."id" = created_by."employeeId"
    WHERE t."workOrderId" = $1::uuid
      AND ${siteAccessSql('t."siteId"', "$2")}
      ${filterCurrentUserSql}
    ORDER BY t."bookedAt" DESC, t."transactionNumber" DESC
    LIMIT 200
    `,
    params,
  );
  const { rows: summary } = await pool.query<TransactionSummaryRow>(
    `
    SELECT
      t."type",
      COUNT(*)::int AS "count",
      COALESCE(SUM(t."quantity"), 0)::text AS "quantity"
    FROM "transaction" t
    WHERE t."workOrderId" = $1::uuid
      AND ${siteAccessSql('t."siteId"', "$2")}
      ${filterCurrentUserSql}
    GROUP BY t."type"
    ORDER BY t."type" ASC
    `,
    params,
  );
  return {
    workOrderId: id,
    onlyCurrentUser,
    summary,
    totalQuantity: summary.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    transactions: rows,
  };
}

type AssetWorkOrderHistoryRow = QueryResultRow & {
  id: string;
  orderNumber: number;
  name: string;
  status: WorkOrderStatus;
  description: string | null;
  recentFeedbackRemarks: Array<{ quantity: string; remark: string; bookedAt: string }>;
};

async function listWorkOrdersByAsset(
  userId: string,
  assetId: string,
  excludeWorkOrderId?: string | null,
  limit = 10,
): Promise<unknown> {
  if (!isUuid(assetId)) throw new Error("invalid_asset_id");
  const cappedLimit = Math.min(Math.max(Math.trunc(limit) || 10, 1), 20);
  const excludeId =
    excludeWorkOrderId && isUuid(excludeWorkOrderId) ? excludeWorkOrderId : null;
  const { rows } = await pool.query<AssetWorkOrderHistoryRow>(
    `
    SELECT
      w."id",
      w."orderNumber",
      w."name",
      w."status",
      w."description",
      COALESCE((
        SELECT json_agg(sub ORDER BY sub."bookedAt" DESC)
        FROM (
          SELECT
            t."quantity"::text AS "quantity",
            t."remark",
            t."bookedAt"::text AS "bookedAt"
          FROM "transaction" t
          WHERE t."workOrderId" = w."id"
            AND t."type" = 'IN'
            AND t."remark" IS NOT NULL
            AND trim(t."remark") <> ''
          ORDER BY t."bookedAt" DESC
          LIMIT 5
        ) sub
      ), '[]'::json) AS "recentFeedbackRemarks"
    FROM "workOrder" w
    WHERE w."assetId" = $1::uuid
      AND ${siteAccessSql('w."siteId"', "$2")}
      AND ($3::uuid IS NULL OR w."id" <> $3::uuid)
    ORDER BY w."orderNumber" DESC
    LIMIT $4
    `,
    [assetId, userId, excludeId, cappedLimit],
  );
  return rows;
}

type PlanningListRow = PlanningOrderRow & {
  status: WorkOrderStatus;
  siteKey: string;
  siteName: string;
};

async function fetchPlanningOrdersInWindow(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
  assetId?: string | null,
): Promise<PlanningListRow[]> {
  const params: unknown[] = [userId, rangeStart.toISOString(), rangeEnd.toISOString()];
  let assetFilter = "";
  if (assetId) {
    params.push(assetId);
    assetFilter = ` AND w."assetId" = $${params.length}::uuid`;
  }
  const { rows } = await pool.query<PlanningListRow>(
    `
    SELECT
      w."id",
      w."orderNumber",
      w."name",
      w."assetId",
      a."key" AS "assetKey",
      w."plannedStart",
      w."plannedEnd",
      w."status",
      s."key" AS "siteKey",
      s."name" AS "siteName"
    FROM "workOrder" w
    JOIN "asset" a ON a."id" = w."assetId"
    JOIN "site" s ON s."id" = w."siteId"
    WHERE ${siteAccessSql('w."siteId"', "$1")}
      AND w."plannedStart" <= $3::timestamptz
      AND (w."plannedEnd" IS NULL OR w."plannedEnd" >= $2::timestamptz)
      ${assetFilter}
    ORDER BY w."plannedStart" ASC, w."orderNumber" ASC
    `,
    params,
  );
  return rows;
}

function compactPlanningRow(row: PlanningListRow) {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    name: row.name,
    assetId: row.assetId,
    assetKey: row.assetKey,
    siteKey: row.siteKey,
    siteName: row.siteName,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    status: row.status,
  };
}

async function listWorkOrdersInPlanningWindow(
  userId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const rangeStart = parseIsoDatetime(args.rangeStart);
  const rangeEnd = parseIsoDatetime(args.rangeEnd);
  if (!rangeStart || !rangeEnd) throw new Error("invalid_body");

  let assetId: string | null = null;
  if (args.assetId !== undefined && args.assetId !== null) {
    const raw = String(args.assetId).trim();
    if (!isUuid(raw)) throw new Error("invalid_asset_id");
    assetId = raw;
  } else if (args.orderNumber !== undefined && args.orderNumber !== null) {
    const resolved = await resolveWorkOrderAccess(userId, { orderNumber: args.orderNumber });
    if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };
    const wo = (await getWorkOrderDetails(userId, resolved.id)) as WorkOrderRow & { error?: string };
    if (wo.error === "not_found") return { error: "not_found" };
    assetId = wo.assetId;
  }

  const rows = await fetchPlanningOrdersInWindow(
    userId,
    new Date(rangeStart),
    new Date(rangeEnd),
    assetId,
  );
  return {
    rangeStart,
    rangeEnd,
    assetId,
    count: rows.length,
    workOrders: rows.map(compactPlanningRow),
  };
}

async function analyzeWorkOrderPlanning(
  userId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const resolved = await resolveWorkOrderAccess(userId, {
    id: args.id,
    orderNumber: args.orderNumber,
  });
  if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };

  const wo = (await getWorkOrderDetails(userId, resolved.id)) as WorkOrderRow & { error?: string };
  if (wo.error === "not_found") return { error: "not_found" };

  const proposedStartIso =
    args.proposedPlannedStart !== undefined && args.proposedPlannedStart !== null
      ? parseIsoDatetime(args.proposedPlannedStart)
      : workOrderDatetimeToIso(wo.plannedStart);
  if (!proposedStartIso) throw new Error("invalid_body");

  const proposedEndIso =
    args.proposedPlannedEnd !== undefined
      ? args.proposedPlannedEnd === null
        ? null
        : parseIsoDatetime(args.proposedPlannedEnd)
      : workOrderDatetimeToIso(wo.plannedEnd);
  if (args.proposedPlannedEnd !== undefined && args.proposedPlannedEnd !== null && !proposedEndIso) {
    throw new Error("invalid_body");
  }

  const proposedStart = new Date(proposedStartIso);
  const proposedEnd = effectivePlannedEnd(proposedStartIso, proposedEndIso);

  const windowStart = new Date(
    Math.min(proposedStart.getTime(), new Date(wo.plannedStart).getTime()) - 14 * 24 * 60 * 60 * 1000,
  );
  const windowEnd = new Date(
    Math.max(
      proposedEnd.getTime(),
      effectivePlannedEnd(wo.plannedStart, workOrderDatetimeToIso(wo.plannedEnd)).getTime(),
    ) + 14 * 24 * 60 * 60 * 1000,
  );

  const overlapping = await fetchPlanningOrdersInWindow(userId, windowStart, windowEnd, wo.assetId);
  const conflicts = getAssetPlanningConflicts(
    overlapping,
    wo.assetId,
    proposedStart,
    proposedEnd,
    wo.id,
  );

  return {
    workOrder: {
      id: wo.id,
      orderNumber: wo.orderNumber,
      name: wo.name,
      assetId: wo.assetId,
      assetKey: wo.assetKey,
      plannedStart: wo.plannedStart,
      plannedEnd: wo.plannedEnd,
    },
    proposed: {
      plannedStart: proposedStartIso,
      plannedEnd: proposedEndIso ?? proposedEnd.toISOString(),
    },
    beforeToday: isBeforeLocalToday(proposedStartIso),
    assetConflictCount: conflicts.length,
    conflicts,
    requiresUserConfirmation: conflicts.length > 0,
    userConfirmationHint:
      conflicts.length > 0
        ? "Ask the user if they want to move anyway (same asset overlap). On confirmation, reschedule with allowAssetOverlap: true."
        : undefined,
  };
}

async function findPlanningSlotsTool(
  userId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const rangeStart = parseIsoDatetime(args.rangeStart);
  const rangeEnd = parseIsoDatetime(args.rangeEnd);
  if (!rangeStart || !rangeEnd) throw new Error("invalid_body");

  let assetId: string;
  let excludeWorkOrderId: string | undefined;
  let anchorStart: Date;
  let anchorEnd: Date | null;
  let durationMs: number;

  if (args.orderNumber !== undefined || args.id !== undefined) {
    const resolved = await resolveWorkOrderAccess(userId, {
      id: args.id,
      orderNumber: args.orderNumber,
    });
    if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };
    const wo = (await getWorkOrderDetails(userId, resolved.id)) as WorkOrderRow & { error?: string };
    if (wo.error === "not_found") return { error: "not_found" };
    assetId = wo.assetId;
    excludeWorkOrderId = wo.id;
    anchorStart = new Date(wo.plannedStart);
    const endIso = workOrderDatetimeToIso(wo.plannedEnd);
    anchorEnd = endIso ? new Date(endIso) : new Date(anchorStart);
    durationMs = Math.max(0, anchorEnd.getTime() - anchorStart.getTime());
  } else if (args.assetId !== undefined && isUuid(String(args.assetId).trim())) {
    assetId = String(args.assetId).trim();
    anchorStart = new Date(rangeStart);
    const rawMinutes = args.durationMinutes;
    if (typeof rawMinutes !== "number" || !Number.isFinite(rawMinutes) || rawMinutes <= 0) {
      throw new Error("invalid_body");
    }
    durationMs = Math.round(rawMinutes) * 60_000;
    anchorEnd = new Date(anchorStart.getTime() + durationMs);
  } else {
    throw new Error("invalid_body");
  }

  if (args.durationMinutes !== undefined && typeof args.durationMinutes === "number") {
    durationMs = Math.max(0, Math.round(args.durationMinutes) * 60_000);
  }

  const maxSlots =
    typeof args.maxSlots === "number" && Number.isFinite(args.maxSlots)
      ? Math.min(Math.max(Math.trunc(args.maxSlots), 1), 10)
      : 5;

  const occupied = await fetchPlanningOrdersInWindow(
    userId,
    new Date(rangeStart),
    new Date(rangeEnd),
    assetId,
  );

  const slots = findFreePlanningSlots({
    assetId,
    durationMs,
    rangeStart: new Date(rangeStart),
    rangeEnd: new Date(rangeEnd),
    occupiedOrders: occupied,
    excludeWorkOrderId,
    anchorPlannedStart: anchorStart,
    anchorPlannedEnd: anchorEnd,
    maxSlots,
  });

  return {
    assetId,
    rangeStart,
    rangeEnd,
    durationMinutes: Math.round(durationMs / 60_000),
    slots,
  };
}

type PlanningRangeArgs = {
  sourceRangeStart: string;
  sourceRangeEnd: string;
  targetRangeStart: string;
};

function resolvePlanningShiftRanges(args: Record<string, unknown>): PlanningRangeArgs | { error: string } {
  let sourceRangeStart: string | null = null;
  let sourceRangeEnd: string | null = null;
  let targetRangeStart: string | null = null;

  const sourceWeek =
    typeof args.sourceIsoWeek === "number"
      ? args.sourceIsoWeek
      : typeof args.sourceIsoWeek === "string" && /^\d+$/.test(args.sourceIsoWeek.trim())
        ? Number(args.sourceIsoWeek.trim())
        : null;
  const sourceYear =
    typeof args.sourceIsoWeekYear === "number"
      ? args.sourceIsoWeekYear
      : typeof args.sourceIsoWeekYear === "string" && /^\d+$/.test(args.sourceIsoWeekYear.trim())
        ? Number(args.sourceIsoWeekYear.trim())
        : null;
  if (sourceWeek !== null && sourceYear !== null) {
    const range = getIsoWeekRange(sourceYear, sourceWeek);
    sourceRangeStart = range.rangeStart.toISOString();
    sourceRangeEnd = range.rangeEnd.toISOString();
  } else {
    sourceRangeStart = parseIsoDatetime(args.sourceRangeStart);
    sourceRangeEnd = parseIsoDatetime(args.sourceRangeEnd);
  }

  const targetWeek =
    typeof args.targetIsoWeek === "number"
      ? args.targetIsoWeek
      : typeof args.targetIsoWeek === "string" && /^\d+$/.test(args.targetIsoWeek.trim())
        ? Number(args.targetIsoWeek.trim())
        : null;
  const targetYear =
    typeof args.targetIsoWeekYear === "number"
      ? args.targetIsoWeekYear
      : typeof args.targetIsoWeekYear === "string" && /^\d+$/.test(args.targetIsoWeekYear.trim())
        ? Number(args.targetIsoWeekYear.trim())
        : null;
  if (targetWeek !== null && targetYear !== null) {
    const range = getIsoWeekRange(targetYear, targetWeek);
    targetRangeStart = range.rangeStart.toISOString();
  } else {
    targetRangeStart = parseIsoDatetime(args.targetRangeStart);
  }

  if (!sourceRangeStart || !sourceRangeEnd || !targetRangeStart) {
    return { error: "invalid_body" };
  }
  return { sourceRangeStart, sourceRangeEnd, targetRangeStart };
}

async function buildPlanningWindowShiftAssignments(
  userId: string,
  ranges: PlanningRangeArgs,
): Promise<{
  deltaDays: number;
  orderCount: number;
  assignments: ShiftedPlanningAssignment[];
  assetGroups: number;
  ordersWithAssetConflicts: number;
}> {
  const srcStart = new Date(ranges.sourceRangeStart);
  const srcEnd = new Date(ranges.sourceRangeEnd);
  const tgtStart = new Date(ranges.targetRangeStart);
  const deltaMs = computePlanningWindowShiftDeltaMs(srcStart, tgtStart);
  const deltaDays = Math.round(deltaMs / (24 * 60 * 60 * 1000));

  const orders = await fetchPlanningOrdersInWindow(userId, srcStart, srcEnd, null);
  const assignments: ShiftedPlanningAssignment[] = [];
  const assetIds = new Set<string>();

  for (const order of orders) {
    const shifted = shiftPlannedRangeByDeltaMs(order.plannedStart, order.plannedEnd, deltaMs);
    if (!shifted) continue;
    assetIds.add(order.assetId);
    const plannedStart = shifted.plannedStart.toISOString();
    const plannedEnd = shifted.plannedEnd.toISOString();
    assignments.push({
      id: order.id,
      orderNumber: order.orderNumber,
      name: order.name,
      assetId: order.assetId,
      assetKey: order.assetKey,
      oldPlannedStart: order.plannedStart,
      oldPlannedEnd: order.plannedEnd,
      plannedStart,
      plannedEnd,
      beforeToday: isBeforeLocalToday(plannedStart),
      assetConflictCount: 0,
      assetConflicts: [],
    });
  }

  assignments.sort((a, b) => a.orderNumber - b.orderNumber);

  if (assignments.length > 0) {
    let windowMin = Infinity;
    let windowMax = -Infinity;
    for (const row of assignments) {
      const startMs = new Date(row.plannedStart).getTime();
      const endMs = new Date(row.plannedEnd).getTime();
      if (!Number.isNaN(startMs) && startMs < windowMin) windowMin = startMs;
      if (!Number.isNaN(endMs) && endMs > windowMax) windowMax = endMs;
    }
    const padMs = 7 * 24 * 60 * 60 * 1000;
    const targetOccupied = await fetchPlanningOrdersInWindow(
      userId,
      new Date(windowMin - padMs),
      new Date(windowMax + padMs),
      null,
    );
    const withConflicts = attachAssetConflictsToShiftAssignments(assignments, targetOccupied);
    assignments.length = 0;
    assignments.push(...withConflicts);
  }

  const ordersWithAssetConflicts = assignments.filter((a) => a.assetConflictCount > 0).length;

  return {
    deltaDays,
    orderCount: assignments.length,
    assignments,
    assetGroups: assetIds.size,
    ordersWithAssetConflicts,
  };
}

function parseOrderNumberList(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const nums: number[] = [];
  for (const item of value) {
    if (typeof item === "number" && Number.isFinite(item)) {
      nums.push(Math.trunc(item));
    } else if (typeof item === "string" && /^\d+$/.test(item.trim())) {
      nums.push(Number(item.trim()));
    } else {
      return null;
    }
  }
  return nums;
}

async function shiftWorkOrdersInPlanningWindowTool(
  userId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const ranges = resolvePlanningShiftRanges(args);
  if ("error" in ranges) throw new Error(ranges.error);

  const built = await buildPlanningWindowShiftAssignments(userId, ranges);
  const beforeToday = built.assignments.filter((a) => a.beforeToday);
  const hasConflicts = built.ordersWithAssetConflicts > 0;

  return {
    ok: true,
    ...ranges,
    deltaDays: built.deltaDays,
    orderCount: built.orderCount,
    assetGroups: built.assetGroups,
    beforeTodayCount: beforeToday.length,
    ordersWithAssetConflicts: built.ordersWithAssetConflicts,
    requiresUserConfirmation: hasConflicts,
    assignments: built.assignments,
    hint:
      built.orderCount === 0
        ? "No work orders overlap the source range. Widen sourceRange or check KW/year."
        : hasConflicts
          ? `Show ALL ${built.orderCount} proposed rows (including orders with assetConflicts). Asset overlap is a warning only — ask whether to move anyway (same asset). On yes: rescheduleWorkOrdersBatch with shiftPlan (same KW/range params) AND allowAssetOverlap: true. Never claim orders were skipped due to missing slots.`
          : `Preview only — not saved yet. Show all ${built.orderCount} rows. After user confirms you MUST call rescheduleWorkOrdersBatch with shiftPlan (same KW/range params) before saying anything was moved. Do not use planSequentialWorkOrderSlots for whole-week moves.`,
    userConfirmationHint: hasConflicts
      ? "Ask: some moved orders overlap existing orders on the same asset — move anyway? On yes use allowAssetOverlap: true with shiftPlan."
      : undefined,
  };
}

async function planSequentialWorkOrderSlotsTool(
  userId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const rangeStart = parseIsoDatetime(args.rangeStart);
  const rangeEnd = parseIsoDatetime(args.rangeEnd);
  if (!rangeStart || !rangeEnd) throw new Error("invalid_body");

  const orderNumbers = parseOrderNumberList(args.orderNumbers);
  if (!orderNumbers) throw new Error("invalid_body");

  const resolvedOrders: OrderToPlanSequentially[] = [];
  let assetId: string | null = null;
  let assetKey: string | undefined;

  for (const orderNumber of orderNumbers) {
    const resolved = await resolveWorkOrderAccess(userId, { orderNumber });
    if (!resolved.ok) {
      return { error: resolved.error, matches: resolved.matches, orderNumber };
    }
    const wo = (await getWorkOrderDetails(userId, resolved.id)) as WorkOrderRow & { error?: string };
    if (wo.error === "not_found") return { error: "not_found", orderNumber };
    if (assetId === null) {
      assetId = wo.assetId;
      assetKey = wo.assetKey;
    } else if (assetId !== wo.assetId) {
      return {
        error: "mixed_assets",
        hint: "planSequentialWorkOrderSlots requires all orders on the same asset. Plan each asset group separately.",
      };
    }
    const start = new Date(wo.plannedStart);
    const endIso = workOrderDatetimeToIso(wo.plannedEnd);
    const end = endIso ? new Date(endIso) : new Date(start);
    const durationMs = Math.max(0, end.getTime() - start.getTime());
    resolvedOrders.push({
      id: wo.id,
      orderNumber: wo.orderNumber,
      name: wo.name,
      durationMs: durationMs > 0 ? durationMs : 24 * 60 * 60 * 1000,
      plannedStart: wo.plannedStart,
      plannedEnd: wo.plannedEnd,
    });
  }

  resolvedOrders.sort((a, b) => a.orderNumber - b.orderNumber);

  const occupied = await fetchPlanningOrdersInWindow(
    userId,
    new Date(rangeStart),
    new Date(rangeEnd),
    assetId!,
  );

  const plan = planSequentialWorkOrderSlots({
    assetId: assetId!,
    orders: resolvedOrders,
    rangeStart: new Date(rangeStart),
    rangeEnd: new Date(rangeEnd),
    occupiedOrders: occupied,
    preserveTimeOfDayFromFirst: true,
  });

  if (!plan.ok) {
    return {
      ok: false,
      error: plan.error,
      assetId,
      assetKey,
      partialAssignments: plan.planned,
      unplannedOrderNumbers: plan.unplannedOrderNumbers,
      hint:
        "For moving a whole calendar week (KW → KW) use shiftWorkOrdersInPlanningWindow — it shifts every order and reports asset overlaps as warnings (ask user, then allowAssetOverlap). planSequentialWorkOrderSlots only searches free slots in rangeEnd; widen rangeEnd or use shiftWorkOrdersInPlanningWindow to preserve each order's time-of-day.",
    };
  }

  return {
    ok: true,
    assetId,
    assetKey,
    rangeStart,
    rangeEnd,
    assignments: plan.assignments,
    hint: "Present this table to the user. For UI apply, append [ATHENE_APPLY:rescheduleBatch:[...]] with id, orderNumber, plannedStart, plannedEnd from assignments.",
  };
}

async function rescheduleWorkOrdersBatchTool(
  userId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const allowAssetOverlap = args.allowAssetOverlap === true;
  let batch: Array<{ workOrderId: string; plannedStart: string; plannedEnd: string | null }> =
    [];

  const shiftPlanRaw = args.shiftPlan;
  if (shiftPlanRaw !== undefined && shiftPlanRaw !== null) {
    if (typeof shiftPlanRaw !== "object") throw new Error("invalid_body");
    const ranges = resolvePlanningShiftRanges(shiftPlanRaw as Record<string, unknown>);
    if ("error" in ranges) throw new Error(ranges.error);
    const built = await buildPlanningWindowShiftAssignments(userId, ranges);
    if (built.orderCount === 0) {
      return { error: "no_orders_in_source_range" };
    }
    batch = built.assignments.map((a) => ({
      workOrderId: a.id,
      plannedStart: a.plannedStart,
      plannedEnd: a.plannedEnd,
    }));
  }

  if (batch.length === 0) {
    const raw = args.assignments;
    if (!Array.isArray(raw) || raw.length === 0) throw new Error("invalid_body");
    for (const entry of raw) {
      if (entry === null || typeof entry !== "object") throw new Error("invalid_body");
      const row = entry as Record<string, unknown>;
      let workOrderId =
        typeof row.id === "string" && isUuid(row.id.trim()) ? row.id.trim() : undefined;
      if (!workOrderId && row.orderNumber !== undefined) {
        const resolved = await resolveWorkOrderAccess(userId, { orderNumber: row.orderNumber });
        if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };
        workOrderId = resolved.id;
      }
      if (!workOrderId) throw new Error("invalid_body");
      const plannedStart = parseIsoDatetime(row.plannedStart);
      const plannedEnd =
        row.plannedEnd === null || row.plannedEnd === undefined
          ? null
          : parseIsoDatetime(row.plannedEnd);
      if (!plannedStart || (row.plannedEnd !== null && row.plannedEnd !== undefined && !plannedEnd)) {
        throw new Error("invalid_body");
      }
      batch.push({ workOrderId, plannedStart, plannedEnd });
    }
  }

  if (batch.length === 0) throw new Error("invalid_body");

  const result = await updateWorkOrderPlanningBatch(userId, batch, {
    source: "assistant",
    allowAssetOverlap,
  });
  if (!result.ok) {
    return {
      error: result.error,
      conflicts: result.conflicts,
      failedOrderNumber: result.failedOrderNumber,
      hint:
        result.error === "asset_conflict"
          ? "Same-asset overlap is allowed after user confirmation. Ask the user, then retry with allowAssetOverlap: true (shiftPlan or assignments unchanged)."
          : undefined,
    };
  }
  return {
    ok: true,
    updatedCount: result.rows.length,
    orderCount: batch.length,
    workOrders: result.rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      name: row.name,
      plannedStart: row.plannedStart,
      plannedEnd: row.plannedEnd,
    })),
  };
}

async function rescheduleWorkOrderTool(
  userId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const resolved = await resolveWorkOrderAccess(userId, {
    id: args.id,
    orderNumber: args.orderNumber,
  });
  if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };

  const plannedStart = parseIsoDatetime(args.plannedStart);
  const plannedEnd =
    args.plannedEnd === null || args.plannedEnd === undefined
      ? null
      : parseIsoDatetime(args.plannedEnd);
  if (!plannedStart || (args.plannedEnd !== null && args.plannedEnd !== undefined && !plannedEnd)) {
    throw new Error("invalid_body");
  }

  const allowAssetOverlap = args.allowAssetOverlap === true;
  const result = await updateWorkOrderPlanning(userId, resolved.id, plannedStart, plannedEnd, {
    source: "assistant",
    allowAssetOverlap,
  });
  if (!result.ok) {
    return {
      error: result.error,
      conflicts: result.conflicts,
      hint:
        result.error === "asset_conflict"
          ? "Ask the user if they want to move anyway (same asset). On yes, call again with allowAssetOverlap: true."
          : result.error === "before_today"
            ? "plannedStart must not be before today (Europe/Berlin calendar day)."
            : undefined,
    };
  }
  return {
    ok: true,
    workOrder: {
      id: result.row.id,
      orderNumber: result.row.orderNumber,
      name: result.row.name,
      plannedStart: result.row.plannedStart,
      plannedEnd: result.row.plannedEnd,
      plannedDurationMinutes: result.row.plannedDurationMinutes,
    },
  };
}

type SpokenLocaleCode = "de" | "en";

function targetLocaleToCode(targetLocale: string): SpokenLocaleCode {
  return targetLocale.toLowerCase().startsWith("en") ? "en" : "de";
}

function normalizeDetectedLanguage(language: string | undefined | null): SpokenLocaleCode | null {
  if (!language?.trim()) return null;
  const l = language.trim().toLowerCase();
  if (l === "de" || l.startsWith("german") || l === "ger") return "de";
  if (l === "en" || l.startsWith("english") || l === "eng") return "en";
  if (l.startsWith("de")) return "de";
  if (l.startsWith("en")) return "en";
  return null;
}

function extensionForMimeType(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  return "webm";
}

async function localizeSpokenText(
  text: string,
  targetLocale: string,
  options?: { sourceLanguage?: string | null; mode?: "normalize" | "translate" },
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (!openai) throw new Error("openai_not_configured");
  const targetCode = targetLocaleToCode(targetLocale);
  const targetLang = targetCode === "en" ? "English" : "German";
  const mode = options?.mode ?? "translate";
  const sourceHint = options?.sourceLanguage?.trim()
    ? `Source language (from speech recognition): ${options.sourceLanguage}.`
    : "";

  const systemLines =
    mode === "normalize"
      ? [
          "You normalize dictated maintenance/CMMS feedback text.",
          `Output ONLY the final text in ${targetLang} — no quotes, no explanation.`,
          sourceHint,
          "The text is already in the target language. Fix punctuation and capitalization only.",
          "Do NOT change meaning, rephrase, or replace technical terms. Max 2000 characters.",
        ]
      : [
          "You translate dictated maintenance/CMMS feedback text faithfully.",
          `Output ONLY the final text in ${targetLang} — no quotes, no explanation.`,
          sourceHint,
          "Translate meaning faithfully for a technician audience. Do NOT paraphrase creatively.",
          "Preserve technical terms (e.g. leakage → Leckage/Undichtigkeit, main pump → Hauptpumpe, seal → Dichtung).",
          "Keep asset names, numbers, and order references unchanged. Max 2000 characters.",
        ];

  const completion = await openai.chat.completions.create({
    model: chatModel,
    temperature: 0,
    messages: [
      { role: "system", content: systemLines.join(" ") },
      { role: "user", content: trimmed.slice(0, 4000) },
    ],
  });
  return (completion.choices[0]?.message?.content ?? trimmed).trim().slice(0, 2000);
}

type WhisperVerboseJson = {
  text?: string;
  language?: string;
};

async function transcribeSpokenAudio(
  buffer: Buffer,
  mimeType: string,
): Promise<{ transcript: string; detectedLanguage: string | null }> {
  if (!openai) throw new Error("openai_not_configured");
  if (!buffer.length) throw new Error("empty_audio");

  const ext = extensionForMimeType(mimeType);
  const stream = Readable.from(buffer) as Readable & { path: string };
  stream.path = `spoken.${ext}`;

  const result = (await openai.audio.transcriptions.create({
    file: stream as Parameters<typeof openai.audio.transcriptions.create>[0]["file"],
    model: whisperModel,
    response_format: "verbose_json",
  })) as WhisperVerboseJson;

  const transcript = (result.text ?? "").trim();
  if (!transcript) throw new Error("empty_transcript");
  return { transcript, detectedLanguage: result.language ?? null };
}

async function processSpokenAudio(
  buffer: Buffer,
  mimeType: string,
  targetLocale: string,
): Promise<{ text: string; transcript: string; detectedLanguage: string | null }> {
  const { transcript, detectedLanguage } = await transcribeSpokenAudio(buffer, mimeType);
  const targetCode = targetLocaleToCode(targetLocale);
  const detectedCode = normalizeDetectedLanguage(detectedLanguage);
  const sameLanguage = detectedCode !== null && detectedCode === targetCode;

  const text = await localizeSpokenText(transcript, targetLocale, {
    sourceLanguage: detectedLanguage,
    mode: sameLanguage ? "normalize" : "translate",
  });

  return { text, transcript, detectedLanguage };
}

async function loadUiContextFacts(userId: string, context: UiContext | null): Promise<unknown | null> {
  if (!context) return null;

  if (context.type === "calendar") {
    const calendarView = getCalendarContextData(context);
    const calendarNotes = [
      "Calendar UI context: use planning tools for the visible window and selected work order when present.",
      "Apply-meta [ATHENE_APPLY:reschedule:{...}] for one order; whole-week shifts get a UI button via rescheduleShift meta (shiftPlan) after shiftWorkOrdersInPlanningWindow preview.",
    ];
    if (context.id && isUuid(context.id)) {
      const workOrder = await getWorkOrderDetails(userId, context.id);
      if ((workOrder as { error?: string }).error === "not_found") {
        return { error: "context_not_accessible" };
      }
      return {
        contextType: "calendar",
        calendarView,
        workOrder,
        semanticNotes: calendarNotes,
      };
    }
    if (calendarView) {
      return { contextType: "calendar", calendarView, semanticNotes: calendarNotes };
    }
    return null;
  }

  if (!context.id || !isUuid(context.id)) return null;
  if (context.type === "workOrder" || context.type === "monitoring") {
    const workOrder = await getWorkOrderDetails(userId, context.id);
    if ((workOrder as { error?: string }).error === "not_found") return { error: "context_not_accessible" };
    const documents = await listDocuments(userId, "workOrder", context.id);
    const statusEvents = await getWorkOrderStatusEvents(userId, context.id);
    const transactions = await getWorkOrderTransactions(userId, context.id, false);
    const currentUserTransactions = await getWorkOrderTransactions(userId, context.id, true);
    const feedbackData = getFeedbackContextData(context);
    const wo = workOrder as WorkOrderRow;
    const assetId =
      (feedbackData?.assetId && isUuid(feedbackData.assetId) ? feedbackData.assetId : null) ??
      wo.assetId;
    const assetWorkOrderHistory =
      feedbackData && assetId
        ? await listWorkOrdersByAsset(userId, assetId, context.id, 8)
        : null;
    const semanticNotes = [
      "The workOrder object is the current selected row's authoritative structured data.",
      "Use statusEvents to answer who changed the order to a status such as started, paused, continued, ended, done, or cancelled. Prefer employeeName/employeeKey when present; otherwise use changedByName or changedByLogin.",
      "Use doneByEmployeeName/doneByEmployeeKey plus endedAt or doneAt as completion attribution fields when they exist.",
      "Use documentCount and assetDocumentCount to explain document reference colors.",
      "Use transactions for all transactions on this work order. Use currentUserTransactions when the user asks how many hours they personally captured/booked/erfasst. Transaction type IN stores feedback hours for work orders in this app.",
    ];
    if (feedbackData) {
      semanticNotes.push(
        "Feedback UI mode: draftRemark and draftPauseRemark are unsaved user input. Use listWorkOrdersByAsset and assetWorkOrderHistory for similar past issues on the same asset.",
        "When proofreading, the UI can apply a corrected draft via [ATHENE_APPLY:remark:...] or [ATHENE_APPLY:pauseRemark:...] on the final line of your reply.",
      );
    }
    return {
      contextType: "workOrder",
      workOrder,
      documents,
      statusEvents,
      transactions,
      currentUserTransactions,
      ...(feedbackData
        ? {
            feedbackMode: true,
            feedbackDrafts: {
              draftRemark: feedbackData.draftRemark ?? "",
              draftPauseRemark: feedbackData.draftPauseRemark ?? "",
              activeField: feedbackData.activeField ?? "remark",
            },
            assetWorkOrderHistory,
          }
        : {}),
      semanticNotes,
    };
  }
  if (context.type === "asset") {
    const asset = await getAssetDetails(userId, context.id);
    if ((asset as { error?: string }).error === "not_found") return { error: "context_not_accessible" };
    const documents = await listDocuments(userId, "asset", context.id);
    return {
      contextType: "asset",
      asset,
      documents,
      semanticNotes: [
        "The asset object is the current selected row's authoritative structured data.",
        "Use documentCount to explain asset document reference colors.",
      ],
    };
  }
  if (context.type === "sparePart") {
    const sparePart = await getSparePartDetails(userId, context.id);
    if ((sparePart as { error?: string }).error === "not_found") return { error: "context_not_accessible" };
    const allowChangeStockdata = await getAllowChangeStockdata(pool);
    return {
      contextType: "sparePart",
      sparePart,
      allowChangeStockdata,
      semanticNotes: [
        "The sparePart object is the current selected row's authoritative structured data including stockControlLines (Lagerdaten).",
        "totalQuantity is the sum of quantity across all stockControlLines.",
        "allowChangeStockdata reflects app parameter MT-ACSD: when false, existing stock rows are read-only in the UI.",
        "Use stockControlLines to answer where this material is stored and how much is on hand per warehouse and storage location.",
      ],
    };
  }
  if (context.type === "warehouse") {
    const warehouse = await getWarehouseDetails(userId, context.id);
    if ((warehouse as { error?: string }).error === "not_found") return { error: "context_not_accessible" };
    const stockResult = await listWarehouseStock(userId, context.id);
    if ((stockResult as { error?: string }).error) return { error: "context_not_accessible" };
    const stockLines = (stockResult as { stockLines: WarehouseStockLineRow[] }).stockLines;
    const totalQuantity = stockLines.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const distinctSparePartCount = new Set(stockLines.map((row) => row.sparePartId)).size;
    return {
      contextType: "warehouse",
      warehouse,
      stockLines,
      totalQuantity,
      distinctSparePartCount,
      semanticNotes: [
        "The warehouse object is the current selected row's authoritative structured data.",
        "stockLines lists all materials stored in this warehouse with storageLocation and quantity.",
        "Use distinctSparePartCount and totalQuantity for summary questions about this warehouse.",
      ],
    };
  }
  return null;
}

type WorkOrderResolveResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: "invalid_reference" | "not_found" | "ambiguous";
      matches?: Array<{ id: string; orderNumber: number; name: string }>;
    };

async function resolveWorkOrderAccess(
  userId: string,
  ref: { id?: unknown; orderNumber?: unknown },
): Promise<WorkOrderResolveResult> {
  const idRaw = typeof ref.id === "string" ? ref.id.trim() : "";
  if (idRaw) {
    if (!isUuid(idRaw)) {
      return { ok: false, error: "invalid_reference" };
    }
    const wo = await getWorkOrderDetails(userId, idRaw);
    if ((wo as { error?: string }).error === "not_found") {
      return { ok: false, error: "not_found" };
    }
    return { ok: true, id: idRaw };
  }

  const orderRaw =
    typeof ref.orderNumber === "number"
      ? String(ref.orderNumber)
      : typeof ref.orderNumber === "string"
        ? ref.orderNumber.trim()
        : "";
  if (!orderRaw) {
    return { ok: false, error: "invalid_reference" };
  }

  const digitsOnly = orderRaw.replace(/\D/g, "");
  const { rows } = await pool.query<{ id: string; orderNumber: number; name: string }>(
    `
    SELECT w."id", w."orderNumber", w."name"
    FROM "workOrder" w
    WHERE ${siteAccessSql('w."siteId"', "$1")}
      AND (
        w."orderNumber"::text = $2
        OR ($3 <> '' AND w."orderNumber"::text = $3)
        OR w."orderNumber"::text LIKE '%' || $2 || '%'
        OR ($3 <> '' AND w."orderNumber"::text LIKE '%' || $3 || '%')
      )
    ORDER BY
      CASE
        WHEN w."orderNumber"::text = $2 THEN 0
        WHEN $3 <> '' AND w."orderNumber"::text = $3 THEN 1
        ELSE 2
      END,
      w."orderNumber" DESC
    LIMIT 11
    `,
    [userId, orderRaw, digitsOnly],
  );

  if (rows.length === 0) {
    return { ok: false, error: "not_found" };
  }
  const exact = rows.find(
    (row) => String(row.orderNumber) === orderRaw || (digitsOnly && String(row.orderNumber) === digitsOnly),
  );
  if (exact) {
    return { ok: true, id: exact.id };
  }
  if (rows.length === 1) {
    return { ok: true, id: rows[0].id };
  }
  return {
    ok: false,
    error: "ambiguous",
    matches: rows.slice(0, 10).map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      name: row.name,
    })),
  };
}

async function listWorkOrderDocumentCounts(
  userId: string,
  query?: unknown,
  limit?: unknown,
): Promise<unknown> {
  const term =
    query !== undefined && query !== null && String(query).trim()
      ? readString(String(query), 200)
      : null;
  if (query !== undefined && query !== null && String(query).trim() && !term) {
    throw new Error("invalid_query");
  }
  const maxRows =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? Math.min(Math.floor(limit), 100)
      : 50;

  const params: unknown[] = [userId];
  let filterSql = "";
  if (term) {
    filterSql = `
      AND (
        lower(w."name") LIKE '%' || lower($2::text) || '%'
        OR lower(COALESCE(w."description", '')) LIKE '%' || lower($2::text) || '%'
        OR w."orderNumber"::text LIKE '%' || $2::text || '%'
      )`;
    params.push(term);
  }
  params.push(maxRows);
  const limitParam = `$${params.length}`;

  const { rows } = await pool.query<WorkOrderRow>(
    `
    ${selectWorkOrdersSql}
    WHERE ${siteAccessSql('w."siteId"', "$1")}
    ${filterSql}
    ORDER BY w."orderNumber" DESC
    LIMIT ${limitParam}
    `,
    params,
  );

  return {
    count: rows.length,
    truncated: rows.length >= maxRows,
    orders: rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      name: row.name,
      status: row.status,
      workOrderDocuments: row.documentCount,
      assetDocumentsVisibleOnOrder: row.assetDocumentCount,
      totalDocumentsVisibleOnOrder: row.documentCount + row.assetDocumentCount,
    })),
  };
}

async function searchWorkOrders(userId: string, query: string): Promise<unknown> {
  const term = readString(query, 200);
  if (!term) throw new Error("invalid_query");
  const { rows } = await pool.query<WorkOrderRow>(
    `
    ${selectWorkOrdersSql}
    WHERE ${siteAccessSql('w."siteId"', "$1")}
      AND (
        lower(w."name") LIKE '%' || lower($2::text) || '%'
        OR lower(COALESCE(w."description", '')) LIKE '%' || lower($2::text) || '%'
        OR CAST(w."orderNumber" AS text) LIKE '%' || $2::text || '%'
      )
    ORDER BY w."orderNumber" DESC
    LIMIT 10
    `,
    [userId, term],
  );
  return rows;
}

async function countWorkOrdersByStatus(
  userId: string,
  status?: unknown,
): Promise<WorkOrderStatusCountResult> {
  const rawStatus = typeof status === "string" && status.trim() ? status.trim() : null;
  const wantedStatus = rawStatus ? normalizeWorkOrderStatus(rawStatus) : null;
  if (rawStatus && !wantedStatus) {
    throw new Error("invalid_status");
  }

  const { rows } = await pool.query<{ status: WorkOrderStatus; count: number }>(
    `
    SELECT w."status", COUNT(*)::int AS "count"
    FROM "workOrder" w
    WHERE ${siteAccessSql('w."siteId"', "$1")}
      AND ($2::text IS NULL OR w."status" = $2::text)
    GROUP BY w."status"
    ORDER BY w."status" ASC
    `,
    [userId, wantedStatus],
  );
  return {
    requestedStatus: rawStatus,
    status: wantedStatus,
    labels: Object.fromEntries(
      allowedWorkOrderStatuses.map((s) => [
        s,
        { de: workOrderStatusMetadata[s].de, en: workOrderStatusMetadata[s].en },
      ]),
    ) as WorkOrderStatusCountResult["labels"],
    total: rows.reduce((sum, row) => sum + row.count, 0),
    counts: rows,
  };
}

async function getAssetDetails(userId: string, id: string): Promise<unknown> {
  if (!isUuid(id)) throw new Error("invalid_id");
  const { rows } = await pool.query<AssetRow>(
    `
    ${selectAssetsSql}
    WHERE a."id" = $1::uuid
      AND ${siteAccessSql('a."siteId"', "$2")}
    LIMIT 1
    `,
    [id, userId],
  );
  return rows[0] ?? { error: "not_found" };
}

async function fetchStockControlLinesForSparePart(
  userId: string,
  sparePartId: string,
): Promise<StockControlLineRow[]> {
  const { rows } = await pool.query<StockControlLineRow>(
    `
    SELECT
      sc."id",
      sc."warehouseId",
      wh."key" AS "warehouseKey",
      wh."name" AS "warehouseName",
      sc."storageLocation",
      sc."quantity"::text AS "quantity"
    FROM "stockControl" sc
    JOIN "warehouse" wh ON wh."id" = sc."warehouseId"
    JOIN "sparePart" sp ON sp."id" = sc."sparePartId"
    WHERE sc."sparePartId" = $1::uuid
      AND ${siteAccessSql('sp."siteId"', "$2")}
    ORDER BY wh."key" ASC, sc."storageLocation" ASC
    `,
    [sparePartId, userId],
  );
  return rows;
}

async function getSparePartDetails(userId: string, id: string): Promise<unknown> {
  if (!isUuid(id)) throw new Error("invalid_id");
  const { rows } = await pool.query<SparePartRow>(
    `
    ${selectSparePartsSql}
    WHERE sp."id" = $1::uuid
      AND ${siteAccessSql('sp."siteId"', "$2")}
    LIMIT 1
    `,
    [id, userId],
  );
  const sparePart = rows[0];
  if (!sparePart) return { error: "not_found" };
  const stockControlLines = await fetchStockControlLinesForSparePart(userId, id);
  const totalQuantity = stockControlLines.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  return { ...sparePart, stockControlLines, totalQuantity };
}

async function getWarehouseDetails(userId: string, id: string): Promise<unknown> {
  if (!isUuid(id)) throw new Error("invalid_id");
  const { rows } = await pool.query<WarehouseRow>(
    `
    ${selectWarehousesSql}
    WHERE w."id" = $1::uuid
      AND ${siteAccessSql('w."siteId"', "$2")}
    LIMIT 1
    `,
    [id, userId],
  );
  return rows[0] ?? { error: "not_found" };
}

async function listWarehouseStock(
  userId: string,
  warehouseId: string,
  query?: unknown,
): Promise<unknown> {
  if (!isUuid(warehouseId)) throw new Error("invalid_id");
  const warehouse = await getWarehouseDetails(userId, warehouseId);
  if ((warehouse as { error?: string }).error === "not_found") return warehouse;
  const term = query === undefined || query === null ? null : readString(query, 200);
  const params: unknown[] = [warehouseId, userId];
  let filterSql = "";
  if (term) {
    params.push(term);
    filterSql = `
      AND (
        lower(sp."key") LIKE '%' || lower($3::text) || '%'
        OR lower(sp."name") LIKE '%' || lower($3::text) || '%'
        OR lower(COALESCE(sp."articleNumber", '')) LIKE '%' || lower($3::text) || '%'
        OR lower(sc."storageLocation") LIKE '%' || lower($3::text) || '%'
      )
    `;
  }
  const { rows } = await pool.query<WarehouseStockLineRow>(
    `
    SELECT
      sp."id" AS "sparePartId",
      sp."key" AS "sparePartKey",
      sp."name" AS "sparePartName",
      sp."articleNumber",
      sc."storageLocation",
      sc."quantity"::text AS "quantity"
    FROM "stockControl" sc
    JOIN "sparePart" sp ON sp."id" = sc."sparePartId"
    WHERE sc."warehouseId" = $1::uuid
      AND ${siteAccessSql('sp."siteId"', "$2")}
      ${filterSql}
    ORDER BY sp."key" ASC, sc."storageLocation" ASC
    LIMIT 100
    `,
    params,
  );
  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  return {
    warehouseId,
    warehouse,
    stockLines: rows,
    totalQuantity,
    distinctSparePartCount: new Set(rows.map((row) => row.sparePartId)).size,
  };
}

async function searchSpareParts(userId: string, query: string): Promise<unknown> {
  const term = readString(query, 200);
  if (!term) throw new Error("invalid_query");
  const { rows } = await pool.query<SparePartSearchRow>(
    `
    SELECT
      sp."id",
      sp."key",
      sp."name",
      sp."siteId",
      s."key" AS "siteKey",
      s."name" AS "siteName",
      s."colorHex" AS "siteColorHex",
      sp."isActive",
      sp."serialNumber",
      sp."classificationId",
      clf."key" AS "classificationKey",
      clf."name" AS "classificationName",
      sp."manufacturer",
      sp."articleNumber",
      sp."alternativeDesignation",
      COALESCE(stock_stats."stockLineCount", 0)::int AS "stockLineCount",
      COALESCE(stock_stats."totalQuantity", 0)::text AS "totalQuantity"
    FROM "sparePart" sp
    JOIN "site" s ON s."id" = sp."siteId"
    LEFT JOIN "classification" clf ON clf."id" = sp."classificationId"
    LEFT JOIN (
      SELECT
        sc."sparePartId",
        COUNT(*)::int AS "stockLineCount",
        SUM(sc."quantity") AS "totalQuantity"
      FROM "stockControl" sc
      GROUP BY sc."sparePartId"
    ) stock_stats ON stock_stats."sparePartId" = sp."id"
    WHERE ${siteAccessSql('sp."siteId"', "$1")}
      AND (
        lower(sp."key") LIKE '%' || lower($2::text) || '%'
        OR lower(sp."name") LIKE '%' || lower($2::text) || '%'
        OR lower(COALESCE(sp."articleNumber", '')) LIKE '%' || lower($2::text) || '%'
        OR lower(COALESCE(sp."manufacturer", '')) LIKE '%' || lower($2::text) || '%'
        OR lower(COALESCE(sp."alternativeDesignation", '')) LIKE '%' || lower($2::text) || '%'
      )
    ORDER BY sp."key" ASC
    LIMIT 20
    `,
    [userId, term],
  );
  return rows;
}

async function searchStock(userId: string, query: string): Promise<unknown> {
  const term = readString(query, 200);
  if (!term) throw new Error("invalid_query");
  const { rows } = await pool.query<
    WarehouseStockLineRow & {
      warehouseId: string;
      warehouseKey: string;
      warehouseName: string;
      siteKey: string;
      siteName: string;
    }
  >(
    `
    SELECT
      sp."id" AS "sparePartId",
      sp."key" AS "sparePartKey",
      sp."name" AS "sparePartName",
      sp."articleNumber",
      wh."id" AS "warehouseId",
      wh."key" AS "warehouseKey",
      wh."name" AS "warehouseName",
      s."key" AS "siteKey",
      s."name" AS "siteName",
      sc."storageLocation",
      sc."quantity"::text AS "quantity"
    FROM "stockControl" sc
    JOIN "sparePart" sp ON sp."id" = sc."sparePartId"
    JOIN "warehouse" wh ON wh."id" = sc."warehouseId"
    JOIN "site" s ON s."id" = sp."siteId"
    WHERE ${siteAccessSql('sp."siteId"', "$1")}
      AND (
        lower(sp."key") LIKE '%' || lower($2::text) || '%'
        OR lower(sp."name") LIKE '%' || lower($2::text) || '%'
        OR lower(COALESCE(sp."articleNumber", '')) LIKE '%' || lower($2::text) || '%'
        OR lower(wh."key") LIKE '%' || lower($2::text) || '%'
        OR lower(wh."name") LIKE '%' || lower($2::text) || '%'
        OR lower(sc."storageLocation") LIKE '%' || lower($2::text) || '%'
      )
    ORDER BY wh."key" ASC, sp."key" ASC, sc."storageLocation" ASC
    LIMIT 50
    `,
    [userId, term],
  );
  return rows;
}

async function resolveSparePartAccess(
  userId: string,
  ref: { id?: unknown; key?: unknown },
): Promise<EntityResolveResult> {
  const idRaw = typeof ref.id === "string" ? ref.id.trim() : "";
  if (idRaw) {
    if (!isUuid(idRaw)) return { ok: false, error: "invalid_reference" };
    const sparePart = await getSparePartDetails(userId, idRaw);
    if ((sparePart as { error?: string }).error === "not_found") {
      return { ok: false, error: "not_found" };
    }
    return { ok: true, id: idRaw };
  }
  const keyRaw = typeof ref.key === "string" ? ref.key.trim() : "";
  if (!keyRaw) return { ok: false, error: "invalid_reference" };
  const { rows } = await pool.query<{ id: string; key: string; name: string }>(
    `
    SELECT sp."id", sp."key", sp."name"
    FROM "sparePart" sp
    WHERE ${siteAccessSql('sp."siteId"', "$1")}
      AND lower(sp."key") = lower($2::text)
    ORDER BY sp."key" ASC
    LIMIT 11
    `,
    [userId, keyRaw],
  );
  if (rows.length === 0) return { ok: false, error: "not_found" };
  if (rows.length > 1) return { ok: false, error: "ambiguous", matches: rows };
  return { ok: true, id: rows[0]!.id };
}

async function resolveWarehouseAccess(
  userId: string,
  ref: { id?: unknown; key?: unknown },
): Promise<EntityResolveResult> {
  const idRaw = typeof ref.id === "string" ? ref.id.trim() : "";
  if (idRaw) {
    if (!isUuid(idRaw)) return { ok: false, error: "invalid_reference" };
    const warehouse = await getWarehouseDetails(userId, idRaw);
    if ((warehouse as { error?: string }).error === "not_found") {
      return { ok: false, error: "not_found" };
    }
    return { ok: true, id: idRaw };
  }
  const keyRaw = typeof ref.key === "string" ? ref.key.trim() : "";
  if (!keyRaw) return { ok: false, error: "invalid_reference" };
  const { rows } = await pool.query<{ id: string; key: string; name: string }>(
    `
    SELECT w."id", w."key", w."name"
    FROM "warehouse" w
    WHERE ${siteAccessSql('w."siteId"', "$1")}
      AND lower(w."key") = lower($2::text)
    ORDER BY w."key" ASC
    LIMIT 11
    `,
    [userId, keyRaw],
  );
  if (rows.length === 0) return { ok: false, error: "not_found" };
  if (rows.length > 1) return { ok: false, error: "ambiguous", matches: rows };
  return { ok: true, id: rows[0]!.id };
}

async function resolveSparePartIdFromToolArgs(
  userId: string,
  args: Record<string, unknown>,
): Promise<EntityResolveResult> {
  return resolveSparePartAccess(userId, { id: args.id, key: args.key });
}

async function resolveWarehouseIdFromToolArgs(
  userId: string,
  args: Record<string, unknown>,
): Promise<EntityResolveResult> {
  return resolveWarehouseAccess(userId, { id: args.id, key: args.key });
}

async function listDocuments(
  userId: string,
  sourceKind: unknown,
  sourceId: unknown,
  orderNumber?: unknown,
): Promise<unknown> {
  if (sourceKind === "workOrder") {
    const sourceIdStr = typeof sourceId === "string" ? sourceId.trim() : "";
    const resolved = await resolveWorkOrderAccess(userId, {
      id: sourceIdStr && isUuid(sourceIdStr) ? sourceIdStr : undefined,
      orderNumber:
        orderNumber ?? (sourceIdStr && !isUuid(sourceIdStr) ? sourceIdStr : undefined),
    });
    if (!resolved.ok) {
      return { error: resolved.error, matches: resolved.matches };
    }
    return listDocumentsForAssistant(userId, "workOrder", resolved.id);
  }
  if (sourceKind === "asset") {
    if (!isUuid(sourceId)) throw new Error("invalid_id");
    const asset = await getAssetDetails(userId, sourceId);
    if ((asset as { error?: string }).error === "not_found") return asset;
    return listDocumentsForAssistant(userId, "asset", sourceId);
  }
  throw new Error("invalid_source");
}

async function readDocumentText(
  userId: string,
  sourceKind: unknown,
  sourceId: unknown,
  documentId: unknown,
): Promise<unknown> {
  if (!isUuid(sourceId) || !isUuid(documentId)) throw new Error("invalid_id");
  const source = sourceKind === "workOrder" ? "workOrder" : sourceKind === "asset" ? "asset" : null;
  if (!source) throw new Error("invalid_source");
  return readDocumentTextForAssistant(userId, source, sourceId, documentId);
}

async function assertAssetAndCostCenterContext(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  userId: string,
  assetId: string,
  costCenterId: string,
): Promise<string> {
  const asset = await client.query<QueryResultRow & { id: string; siteId: string }>(
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

  const costCenter = await client.query<QueryResultRow & { id: string; siteId: string }>(
    `
    SELECT "id", "siteId"
    FROM "costCenter"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    `,
    [costCenterId, userId],
  );
  const costCenterRow = costCenter.rows[0];
  if (!costCenterRow) throw new Error("invalid_cost_center");
  if (costCenterRow.siteId !== assetRow.siteId) throw new Error("asset_cost_center_mismatch");
  return assetRow.siteId;
}

async function assertWorkgroupForOrderSite(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  userId: string,
  workgroupId: string,
  orderSiteId: string,
): Promise<void> {
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

async function assertResponsibleEmployeesContext(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  userId: string,
  responsibleEmployeeIds: string[],
  siteId: string,
  workgroupId: string,
): Promise<void> {
  if (responsibleEmployeeIds.length === 0) throw new Error("responsible_required");
  for (const responsibleEmployeeId of responsibleEmployeeIds) {
    const employee = await client.query<QueryResultRow & { id: string; siteId: string }>(
      `
      SELECT "id", "siteId"::text AS "siteId"
      FROM "employee"
      WHERE "id" = $1::uuid
        AND ${siteAccessSql('"siteId"', "$2")}
      `,
      [responsibleEmployeeId, userId],
    );
    const row = employee.rows[0];
    if (!row) throw new Error("invalid_responsible_employee");
    if (row.siteId !== siteId) throw new Error("responsible_employee_site_mismatch");
    const member = await client.query<{ ok: string }>(
      `
      SELECT '1' AS ok
      FROM "workgroupUser"
      WHERE "workgroupId" = $1::uuid
        AND "employeeId" = $2::uuid
        AND "isLeader" = true
      LIMIT 1
      `,
      [workgroupId, responsibleEmployeeId],
    );
    if (!member.rows[0]) throw new Error("responsible_employee_not_leader");
  }
}

async function setWorkOrderResponsibles(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  workOrderId: string,
  employeeIds: string[],
): Promise<void> {
  await client.query(`DELETE FROM "workOrderResponsibleEmployee" WHERE "workOrderId" = $1::uuid`, [
    workOrderId,
  ]);
  if (employeeIds.length === 0) return;
  const placeholders = employeeIds.map((_, idx) => `($1::uuid, $${idx + 2}::uuid)`).join(", ");
  await client.query(
    `
    INSERT INTO "workOrderResponsibleEmployee" ("workOrderId", "employeeId")
    VALUES ${placeholders}
    ON CONFLICT ("workOrderId", "employeeId") DO NOTHING
    `,
    [workOrderId, ...employeeIds],
  );
}

async function assertResponsibleEmployeeContext(
  client: { query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>> },
  userId: string,
  responsibleEmployeeId: string | null,
  siteId: string,
  workgroupId: string,
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
  const row = employee.rows[0];
  if (!row) throw new Error("invalid_responsible_employee");
  if (row.siteId !== siteId) throw new Error("responsible_employee_site_mismatch");
  const member = await client.query<{ ok: string }>(
    `
    SELECT '1' AS ok
    FROM "workgroupUser"
    WHERE "workgroupId" = $1::uuid
      AND "employeeId" = $2::uuid
    LIMIT 1
    `,
    [workgroupId, responsibleEmployeeId],
  );
  if (!member.rows[0]) throw new Error("responsible_employee_not_in_workgroup");
}

async function createWorkOrderFromOrder(userId: string, args: Record<string, unknown>): Promise<unknown> {
  const name = readString(args.name, 200);
  if (!name) throw new Error("invalid_body");

  const resolved = await resolveWorkOrderAccess(userId, { orderNumber: args.templateOrderNumber });
  if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };

  const templateRaw = await getWorkOrderDetails(userId, resolved.id);
  if ((templateRaw as { error?: string }).error === "not_found") {
    return { error: "not_found" };
  }
  const template = templateRaw as WorkOrderRow;
  if (!template.workgroupId) {
    return {
      error: "template_missing_workgroup",
      hint: "The template work order has no workgroup; createWorkOrder cannot copy it.",
    };
  }

  const plannedStart =
    args.plannedStart !== undefined && args.plannedStart !== null
      ? parseIsoDatetime(args.plannedStart)
      : workOrderDatetimeToIso(template.plannedStart);
  if (!plannedStart) throw new Error("invalid_body");

  const plannedEnd =
    args.plannedEnd !== undefined
      ? args.plannedEnd === null
        ? null
        : parseIsoDatetime(args.plannedEnd)
      : workOrderDatetimeToIso(template.plannedEnd);

  if (args.plannedEnd !== undefined && args.plannedEnd !== null && !plannedEnd) {
    throw new Error("invalid_body");
  }

  const rawDuration = args.plannedDurationMinutes;
  const plannedDurationMinutes =
    rawDuration !== undefined
      ? rawDuration === null
        ? null
        : typeof rawDuration === "number" && Number.isInteger(rawDuration) && rawDuration >= 0
          ? rawDuration
          : null
      : template.plannedDurationMinutes;
  if (rawDuration !== undefined && rawDuration !== null && plannedDurationMinutes === null) {
    throw new Error("invalid_body");
  }

  const description =
    args.description !== undefined ? readOptionalString(args.description, 2000) : template.description;

  const responsibleEmployeeIds =
    args.responsibleEmployeeIds !== undefined
      ? normalizeEmployeeIds(args.responsibleEmployeeIds)
      : template.responsibleEmployeeIds;
  if (!responsibleEmployeeIds || responsibleEmployeeIds.length === 0) {
    throw new Error("invalid_body");
  }

  const orderType = isOrderType(args.orderType) ? args.orderType : template.orderType;

  return createWorkOrder(userId, {
    name,
    description,
    assetId: template.assetId,
    costCenterId: template.costCenterId,
    plannedStart,
    plannedEnd,
    plannedDurationMinutes,
    orderType,
    responsibleEmployeeIds,
    workgroupId: template.workgroupId,
    classificationId: template.classificationId,
    originalWo: template.id,
  });
}

async function createWorkOrder(userId: string, args: Record<string, unknown>): Promise<unknown> {
  const parsed = parseCreateWorkOrderArgs(args);
  const row = await withAuditContext(
    {
      userId,
      requestId: randomUUID(),
      source: "assistant",
      reason: "athene assistant create work order",
    },
    async (client) => {
      const relationSiteId = await assertAssetAndCostCenterContext(
        client,
        userId,
        parsed.assetId,
        parsed.costCenterId,
      );
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? relationSiteId : await getWorkingSiteId(client, userId);
      if (effectiveSiteId !== relationSiteId) throw new Error("site_access_denied");
      await assertSiteAccess(client, userId, effectiveSiteId);
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

      if (parsed.originalWo) {
        const templateAccess = await client.query<{ id: string }>(
          `
          SELECT "id"
          FROM "workOrder"
          WHERE "id" = $1::uuid
            AND ${siteAccessSql('"siteId"', "$2")}
          LIMIT 1
          `,
          [parsed.originalWo, userId],
        );
        if (!templateAccess.rows[0]) throw new Error("invalid_original_wo");
      }

      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "workOrder"
          ("name", "description", "siteId", "assetId", "costCenterId", "plannedStart", "plannedEnd", "plannedDurationMinutes", "orderType", "status", "workgroupId", "classificationId", "originalWo")
        VALUES
          ($1, $2, $3::uuid, $4::uuid, $5::uuid, $6::timestamptz, $7::timestamptz, $8::integer, $9, 'open', $10::uuid, $11::uuid, $12::uuid)
        RETURNING "id"
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
          parsed.originalWo,
        ],
      );
      const workOrderId = inserted.rows[0]?.id;
      if (!workOrderId) return null;
      await setWorkOrderResponsibles(client, workOrderId, parsed.responsibleEmployeeIds);
      const { rows } = await client.query<WorkOrderRow>(
        `
        ${selectWorkOrdersSql}
        WHERE w."id" = $1::uuid
        LIMIT 1
        `,
        [workOrderId],
      );
      return rows[0] ?? null;
    },
  );
  if (row) {
    void broadcastWorkOrderCreated((row as WorkOrderRow).siteId, row as WorkOrderRow).catch((err) => {
      console.error("[athene-assistant] work-order broadcast failed", err);
    });
  }
  return row ?? { error: "no_row" };
}

const tools = [
  {
    type: "function",
    function: {
      name: "getWorkOrderDetails",
      description:
        "Get one accessible work order with all visible fields and references. Provide id (UUID) OR orderNumber (e.g. 100007 or 007), not both.",
      parameters: {
        type: "object",
        properties: {
          id: { type: ["string", "null"], description: "Work order UUID." },
          orderNumber: {
            type: ["string", "null"],
            description: "Numeric order number or suffix, e.g. 100007 or 007.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listWorkOrderDocumentCounts",
      description:
        "List accessible work orders with document counts: workOrderDocuments, assetDocumentsVisibleOnOrder, and totalDocumentsVisibleOnOrder. Use for questions like how many documents are on each order. Optional query filters by order number, name, or description.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: ["string", "null"],
            description: "Optional filter, e.g. partial order number or name.",
          },
          limit: {
            type: ["integer", "null"],
            description: "Max rows (default 50, max 100).",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchWorkOrders",
      description:
        "Search accessible work orders by order number, name, or description. Each row includes documentCount and assetDocumentCount.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listWorkOrdersByAsset",
      description:
        "List accessible work orders on the same asset (newest first), with recent feedback remarks from IN transactions. Use for similar-problem history while composing feedback.",
      parameters: {
        type: "object",
        properties: {
          assetId: { type: "string", description: "Asset UUID." },
          excludeWorkOrderId: {
            type: ["string", "null"],
            description: "Optional work order UUID to exclude (usually the current order).",
          },
          limit: { type: ["integer", "null"], description: "Max rows (default 10, max 20)." },
        },
        required: ["assetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "countWorkOrdersByStatus",
      description: "Count accessible work orders, optionally filtered by one status. German UI labels are accepted: Beendet=ended, Erledigt=done, Offen=open, Zugewiesen=assigned, Gestartet=started, Pausiert=paused, Aufgenommen=continued, Storniert=cancelled.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: ["string", "null"],
            description: "Technical status or German/English label, e.g. ended, Beendet, done, Erledigt.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getWorkOrderStatusEvents",
      description:
        "Get audit-log status changes for one accessible work order. Provide id (UUID) OR orderNumber.",
      parameters: {
        type: "object",
        properties: {
          id: { type: ["string", "null"] },
          orderNumber: { type: ["string", "null"] },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getWorkOrderTransactions",
      description:
        "Read accessible transactions for one work order. Provide id (UUID) OR orderNumber. Use onlyCurrentUser when the user asks for their own captured hours.",
      parameters: {
        type: "object",
        properties: {
          id: { type: ["string", "null"] },
          orderNumber: { type: ["string", "null"] },
          onlyCurrentUser: { type: "boolean" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAssetDetails",
      description: "Get one accessible asset with all visible fields and references.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSparePartDetails",
      description:
        "Get one accessible spare part / material with all visible fields and stockControlLines (Lagerdaten). Provide id (UUID) OR key (Schlüssel), not both.",
      parameters: {
        type: "object",
        properties: {
          id: { type: ["string", "null"], description: "Spare part UUID." },
          key: { type: ["string", "null"], description: "Spare part key / Schlüssel." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchSpareParts",
      description:
        "Search accessible spare parts / materials by key, name, article number, manufacturer, or alternative designation. Returns stockLineCount and totalQuantity summaries.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getWarehouseDetails",
      description:
        "Get one accessible warehouse (Lager) with all visible fields. Provide id (UUID) OR key (Schlüssel), not both.",
      parameters: {
        type: "object",
        properties: {
          id: { type: ["string", "null"], description: "Warehouse UUID." },
          key: { type: ["string", "null"], description: "Warehouse key / Schlüssel." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listWarehouseStock",
      description:
        "List stock lines (materials, storage locations, quantities) in one warehouse. Provide warehouse id OR key. Optional query filters by material or storage location.",
      parameters: {
        type: "object",
        properties: {
          id: { type: ["string", "null"], description: "Warehouse UUID." },
          key: { type: ["string", "null"], description: "Warehouse key." },
          query: {
            type: ["string", "null"],
            description: "Optional filter on spare part key/name/article or storage location.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchStock",
      description:
        "Cross-search stock rows across warehouses and materials by spare part key/name/article, warehouse key/name, or storage location.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listDocuments",
      description:
        "List work-order or asset documents visible to the user. For work orders provide id (UUID) OR orderNumber (e.g. 100007). Each row includes source (entityType), referenceApp, and metadata.",
      parameters: {
        type: "object",
        properties: {
          sourceKind: { type: "string", enum: ["workOrder", "asset"] },
          sourceId: { type: ["string", "null"], description: "UUID; required for asset." },
          orderNumber: {
            type: ["string", "null"],
            description: "Work order number when sourceKind is workOrder (alternative to sourceId).",
          },
        },
        required: ["sourceKind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readDocumentText",
      description:
        "Read text content from a text-like work-order or asset document. For work orders provide id OR orderNumber. Binary files return metadata only.",
      parameters: {
        type: "object",
        properties: {
          sourceKind: { type: "string", enum: ["workOrder", "asset"] },
          sourceId: { type: ["string", "null"] },
          orderNumber: { type: ["string", "null"] },
          documentId: { type: "string" },
        },
        required: ["sourceKind", "documentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listWorkOrdersInPlanningWindow",
      description:
        "List accessible work orders whose planned interval overlaps a date range (calendar window). Optional filter by assetId or orderNumber (resolves that order's asset).",
      parameters: {
        type: "object",
        properties: {
          rangeStart: { type: "string", description: "ISO 8601 range start (inclusive overlap)." },
          rangeEnd: { type: "string", description: "ISO 8601 range end (inclusive overlap)." },
          assetId: { type: ["string", "null"], description: "Optional asset UUID filter." },
          orderNumber: {
            type: ["string", "null"],
            description: "Optional order number; filters to that order's asset.",
          },
        },
        required: ["rangeStart", "rangeEnd"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyzeWorkOrderPlanning",
      description:
        "Analyze planning for one work order: current or proposed plannedStart/plannedEnd, asset-only conflicts, and whether the start is before today.",
      parameters: {
        type: "object",
        properties: {
          id: { type: ["string", "null"] },
          orderNumber: { type: ["string", "null"] },
          proposedPlannedStart: { type: ["string", "null"], description: "ISO datetime to test." },
          proposedPlannedEnd: { type: ["string", "null"], description: "ISO datetime to test." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "findPlanningSlots",
      description:
        "Find free planning slots on one asset in a date range without asset conflicts. Provide orderNumber or id (uses that order's duration and time-of-day anchor) OR assetId with durationMinutes.",
      parameters: {
        type: "object",
        properties: {
          rangeStart: { type: "string" },
          rangeEnd: { type: "string" },
          id: { type: ["string", "null"] },
          orderNumber: { type: ["string", "null"] },
          assetId: { type: ["string", "null"] },
          durationMinutes: {
            type: ["integer", "null"],
            description: "Required with assetId when no order reference.",
          },
          maxSlots: { type: ["integer", "null"], description: "Default 5, max 10." },
        },
        required: ["rangeStart", "rangeEnd"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shiftWorkOrdersInPlanningWindow",
      description:
        "Move ALL accessible work orders whose planned interval overlaps the source range by a constant day offset (e.g. KW 20 → KW 30). Preserves duration and time-of-day. Returns every order with proposed dates; assetConflicts are warnings (ask user, then batch with allowAssetOverlap). NOT for packing into free slots (planSequentialWorkOrderSlots).",
      parameters: {
        type: "object",
        properties: {
          sourceRangeStart: { type: ["string", "null"], description: "ISO start of source window." },
          sourceRangeEnd: { type: ["string", "null"], description: "ISO end of source window." },
          sourceIsoWeek: { type: ["integer", "null"], description: "ISO week number 1–53 (e.g. 20)." },
          sourceIsoWeekYear: { type: ["integer", "null"], description: "Year for sourceIsoWeek (e.g. 2026)." },
          targetRangeStart: {
            type: ["string", "null"],
            description: "ISO Monday (or first day) of target week.",
          },
          targetIsoWeek: { type: ["integer", "null"], description: "Target ISO week (e.g. 30)." },
          targetIsoWeekYear: { type: ["integer", "null"], description: "Year for targetIsoWeek." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "planSequentialWorkOrderSlots",
      description:
        "Pack a SHORT explicit list of order numbers on the SAME asset back-to-back. NOT for moving a whole calendar week (use shiftWorkOrdersInPlanningWindow). Provide orderNumbers array, rangeStart, rangeEnd (ISO).",
      parameters: {
        type: "object",
        properties: {
          orderNumbers: {
            type: "array",
            items: { type: ["string", "integer"] },
            description: "Order numbers to schedule sequentially, e.g. [100009, 100024, 100025].",
          },
          rangeStart: { type: "string" },
          rangeEnd: { type: "string" },
        },
        required: ["orderNumbers", "rangeStart", "rangeEnd"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rescheduleWorkOrdersBatch",
      description:
        "Apply many work-order date changes at once. For whole-week moves after user confirmation, pass shiftPlan (same params as shiftWorkOrdersInPlanningWindow) — do not list dozens of assignments manually. Alternatively pass assignments array from a prior tool.",
      parameters: {
        type: "object",
        properties: {
          shiftPlan: {
            type: ["object", "null"],
            description:
              "Whole-window shift: sourceRange or sourceIsoWeek+Year, targetRangeStart or targetIsoWeek+Year. Moves every order in the source window.",
            properties: {
              sourceRangeStart: { type: ["string", "null"] },
              sourceRangeEnd: { type: ["string", "null"] },
              sourceIsoWeek: { type: ["integer", "null"] },
              sourceIsoWeekYear: { type: ["integer", "null"] },
              targetRangeStart: { type: ["string", "null"] },
              targetIsoWeek: { type: ["integer", "null"] },
              targetIsoWeekYear: { type: ["integer", "null"] },
            },
          },
          assignments: {
            type: ["array", "null"],
            items: {
              type: "object",
              properties: {
                id: { type: ["string", "null"] },
                orderNumber: { type: ["string", "integer", "null"] },
                plannedStart: { type: "string" },
                plannedEnd: { type: ["string", "null"] },
              },
              required: ["plannedStart", "plannedEnd"],
            },
          },
          allowAssetOverlap: {
            type: "boolean",
            description: "Set true only after the user confirmed moving despite same-asset overlaps.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rescheduleWorkOrder",
      description:
        "Move ONE work order only. For 2+ orders on the same asset use planSequentialWorkOrderSlots + rescheduleWorkOrdersBatch instead. Call only after explicit user confirmation with tool-validated dates.",
      parameters: {
        type: "object",
        properties: {
          id: { type: ["string", "null"] },
          orderNumber: { type: ["string", "null"] },
          plannedStart: { type: "string", description: "ISO 8601 datetime." },
          plannedEnd: { type: ["string", "null"], description: "ISO 8601 datetime." },
          allowAssetOverlap: {
            type: "boolean",
            description: "Set true only after the user confirmed moving despite same-asset overlap.",
          },
        },
        required: ["plannedStart"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createWorkOrderFromOrder",
      description:
        "Create a new work order by copying reference fields (asset, cost center, workgroup, classification, dates, responsible employees, order type) from an existing accessible template order. Use when the user asks for the same components as another Auftrag. Provide templateOrderNumber (e.g. 100015) and the new name; optional overrides for description, plannedStart, plannedEnd, plannedDurationMinutes, orderType, responsibleEmployeeIds.",
      parameters: {
        type: "object",
        properties: {
          templateOrderNumber: {
            type: ["string", "integer"],
            description: "Source work order number to copy from, e.g. 100015.",
          },
          name: { type: "string", description: "Name/title for the new work order." },
          description: { type: ["string", "null"] },
          plannedStart: {
            type: ["string", "null"],
            description: "ISO datetime override; omit to copy from template.",
          },
          plannedEnd: { type: ["string", "null"] },
          plannedDurationMinutes: { type: ["integer", "null"] },
          orderType: { type: "string", enum: ["maintenance", "repair", "breakdown"] },
          responsibleEmployeeIds: {
            type: "array",
            items: { type: "string" },
            description: "Employee UUID overrides; omit to copy from template.",
          },
        },
        required: ["templateOrderNumber", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createWorkOrder",
      description:
        "Create a work order with explicit UUID references. assetId, costCenterId, and workgroupId must be UUIDs from getWorkOrderDetails (*Id fields), never business keys (assetKey, costCenterKey). Prefer createWorkOrderFromOrder when copying an existing order.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: ["string", "null"] },
          assetId: { type: "string", description: "Asset UUID, not assetKey." },
          costCenterId: { type: "string", description: "Cost center UUID, not costCenterKey." },
          plannedStart: { type: "string", description: "ISO 8601 datetime." },
          plannedEnd: { type: ["string", "null"] },
          plannedDurationMinutes: { type: ["integer", "null"] },
          orderType: { type: "string", enum: ["maintenance", "repair", "breakdown"] },
          responsibleEmployeeIds: {
            type: "array",
            items: { type: "string" },
            description: "Leader employee UUIDs from the workgroup, not employeeKey.",
          },
          workgroupId: { type: "string", description: "Workgroup UUID, not workgroupKey." },
          classificationId: { type: ["string", "null"] },
        },
        required: ["name", "assetId", "costCenterId", "plannedStart", "orderType", "workgroupId", "responsibleEmployeeIds"],
      },
    },
  },
] as const;

async function resolveWorkOrderIdFromToolArgs(
  userId: string,
  args: Record<string, unknown>,
): Promise<WorkOrderResolveResult> {
  return resolveWorkOrderAccess(userId, { id: args.id, orderNumber: args.orderNumber });
}

async function runTool(userId: string, name: string, rawArgs: string): Promise<unknown> {
  const args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  if (name === "getWorkOrderDetails") {
    const resolved = await resolveWorkOrderIdFromToolArgs(userId, args);
    if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };
    return getWorkOrderDetails(userId, resolved.id);
  }
  if (name === "listWorkOrderDocumentCounts") {
    return listWorkOrderDocumentCounts(userId, args.query, args.limit);
  }
  if (name === "searchWorkOrders") return searchWorkOrders(userId, String(args.query ?? ""));
  if (name === "listWorkOrdersByAsset") {
    return listWorkOrdersByAsset(
      userId,
      String(args.assetId ?? ""),
      args.excludeWorkOrderId as string | null | undefined,
      typeof args.limit === "number" ? args.limit : 10,
    );
  }
  if (name === "countWorkOrdersByStatus") return countWorkOrdersByStatus(userId, args.status);
  if (name === "getWorkOrderStatusEvents") {
    const resolved = await resolveWorkOrderIdFromToolArgs(userId, args);
    if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };
    return getWorkOrderStatusEvents(userId, resolved.id);
  }
  if (name === "getWorkOrderTransactions") {
    const resolved = await resolveWorkOrderIdFromToolArgs(userId, args);
    if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };
    return getWorkOrderTransactions(userId, resolved.id, args.onlyCurrentUser === true);
  }
  if (name === "getAssetDetails") return getAssetDetails(userId, String(args.id ?? ""));
  if (name === "getSparePartDetails") {
    const resolved = await resolveSparePartIdFromToolArgs(userId, args);
    if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };
    return getSparePartDetails(userId, resolved.id);
  }
  if (name === "searchSpareParts") return searchSpareParts(userId, String(args.query ?? ""));
  if (name === "getWarehouseDetails") {
    const resolved = await resolveWarehouseIdFromToolArgs(userId, args);
    if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };
    return getWarehouseDetails(userId, resolved.id);
  }
  if (name === "listWarehouseStock") {
    const resolved = await resolveWarehouseIdFromToolArgs(userId, args);
    if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };
    return listWarehouseStock(userId, resolved.id, args.query);
  }
  if (name === "searchStock") return searchStock(userId, String(args.query ?? ""));
  if (name === "listDocuments") {
    if (args.sourceKind === "workOrder") {
      const hasId = typeof args.sourceId === "string" && args.sourceId.trim();
      const hasOrder =
        args.orderNumber !== undefined &&
        args.orderNumber !== null &&
        String(args.orderNumber).trim();
      if (!hasId && !hasOrder) {
        return { error: "invalid_reference" };
      }
      return listDocuments(userId, args.sourceKind, args.sourceId ?? "", args.orderNumber);
    }
    if (!isUuid(args.sourceId)) throw new Error("invalid_id");
    return listDocuments(userId, args.sourceKind, args.sourceId);
  }
  if (name === "readDocumentText") {
    if (args.sourceKind === "workOrder") {
      const resolved = await resolveWorkOrderIdFromToolArgs(userId, args);
      if (!resolved.ok) return { error: resolved.error, matches: resolved.matches };
      return readDocumentText(userId, args.sourceKind, resolved.id, args.documentId);
    }
    if (!isUuid(args.sourceId)) throw new Error("invalid_id");
    return readDocumentText(userId, args.sourceKind, args.sourceId, args.documentId);
  }
  if (name === "listWorkOrdersInPlanningWindow") {
    return listWorkOrdersInPlanningWindow(userId, args);
  }
  if (name === "analyzeWorkOrderPlanning") {
    return analyzeWorkOrderPlanning(userId, args);
  }
  if (name === "findPlanningSlots") {
    return findPlanningSlotsTool(userId, args);
  }
  if (name === "shiftWorkOrdersInPlanningWindow") {
    return shiftWorkOrdersInPlanningWindowTool(userId, args);
  }
  if (name === "planSequentialWorkOrderSlots") {
    return planSequentialWorkOrderSlotsTool(userId, args);
  }
  if (name === "rescheduleWorkOrdersBatch") {
    return rescheduleWorkOrdersBatchTool(userId, args);
  }
  if (name === "rescheduleWorkOrder") {
    return rescheduleWorkOrderTool(userId, args);
  }
  if (name === "createWorkOrderFromOrder") return createWorkOrderFromOrder(userId, args);
  if (name === "createWorkOrder") return createWorkOrder(userId, args);
  return { error: "unknown_tool" };
}

function createWorkOrderToolErrorPayload(toolName: string, message: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { error: message };
  if (
    toolName === "rescheduleWorkOrder" ||
    toolName === "rescheduleWorkOrdersBatch" ||
    toolName === "shiftWorkOrdersInPlanningWindow" ||
    toolName === "planSequentialWorkOrderSlots" ||
    toolName === "analyzeWorkOrderPlanning" ||
    toolName === "findPlanningSlots"
  ) {
    if (message === "before_today") {
      payload.hint = "plannedStart must not be before today (Europe/Berlin calendar day).";
    } else if (message === "asset_conflict") {
      payload.hint =
        "Ask the user if they want to move anyway (same asset). On yes, retry with allowAssetOverlap: true.";
    } else if (message === "invalid_body") {
      payload.hint = "Provide ISO plannedStart/plannedEnd and orderNumber or id.";
    } else if (message === "mixed_assets") {
      payload.hint = "Split the request per asset and run planSequentialWorkOrderSlots for each asset.";
    } else if (message === "cannot_fit_all") {
      payload.hint =
        "For calendar-week moves use shiftWorkOrdersInPlanningWindow (all orders, overlaps as warnings). This tool only finds free sequential slots — widen rangeEnd or use shift tool.";
    } else if (message === "no_orders_in_source_range") {
      payload.hint = "No orders in source range; verify KW/year or sourceRangeStart/End.";
    }
    return payload;
  }
  if (toolName !== "createWorkOrder" && toolName !== "createWorkOrderFromOrder") return payload;
  if (message === "invalid_body") {
    payload.hint =
      "Use UUID fields assetId, costCenterId, workgroupId from getWorkOrderDetails (not assetKey/costCenterKey/employeeKey). When copying an existing order, use createWorkOrderFromOrder with templateOrderNumber and name.";
  } else if (message === "site_access_denied") {
    payload.hint =
      "The template order belongs to a site that is not your current working site and site change is not allowed.";
  } else if (message === "responsible_employee_not_in_workgroup") {
    payload.hint = "The responsible employee must be a member of the selected workgroup.";
  } else if (message === "asset_cost_center_mismatch") {
    payload.hint = "Asset and cost center must belong to the same site.";
  }
  return payload;
}

router.post("/localize-spoken-text", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as Record<string, unknown> | null | undefined;
  const text = readString(body?.text, 4000);
  const targetLocale =
    typeof body?.targetLocale === "string" && body.targetLocale.trim()
      ? body.targetLocale.trim()
      : "de";
  if (!text) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    if (!openai) {
      res.status(503).json({ error: "openai_not_configured" });
      return;
    }
    const localized = await localizeSpokenText(text, targetLocale, { mode: "translate" });
    res.json({ text: localized });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post(
  "/transcribe-spoken",
  spokenAudioUpload.single("audio"),
  async (req: Request, res: Response) => {
    const userId = req.session.userId;
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const file = req.file;
    if (!file?.buffer?.length) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const targetLocale =
      typeof req.body?.targetLocale === "string" && req.body.targetLocale.trim()
        ? req.body.targetLocale.trim()
        : "de";
    try {
      if (!openai) {
        res.status(503).json({ error: "openai_not_configured" });
        return;
      }
      const result = await processSpokenAudio(file.buffer, file.mimetype || "application/octet-stream", targetLocale);
      res.json(result);
    } catch (err) {
      const message = (err as Error).message;
      if (message === "openai_not_configured") {
        res.status(503).json({ error: "openai_not_configured" });
        return;
      }
      if (message === "empty_audio" || message === "empty_transcript") {
        res.status(400).json({ error: "invalid_body" });
        return;
      }
      console.error(err);
      res.status(500).json({ error: "internal_error" });
    }
  },
);

router.post("/apply-planning-shift", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as Record<string, unknown> | null | undefined;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const result = await rescheduleWorkOrdersBatchTool(userId, {
      shiftPlan: body,
      allowAssetOverlap: body.allowAssetOverlap === true,
    });
    const batch = result as {
      ok?: boolean;
      updatedCount?: number;
      orderCount?: number;
      error?: string;
      conflicts?: unknown;
    };
    if (batch.ok && (batch.updatedCount ?? 0) > 0) {
      res.json({
        ok: true,
        updatedCount: batch.updatedCount,
        orderCount: batch.orderCount,
      });
      return;
    }
    const status =
      batch.error === "asset_conflict" || batch.error === "before_today" ? 409 : 400;
    res.status(status).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const conversationId = await getOrCreateConversation(userId);
    const messages = await loadMessages(conversationId);
    res.json({ conversationId, messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as Record<string, unknown> | null | undefined;
  const message = readString(body?.message, 8000);
  const locale = typeof body?.locale === "string" && body.locale.trim() ? body.locale.trim() : "de";
  const clientContext =
    body?.uiContext && typeof body.uiContext === "object" ? (body.uiContext as UiContext) : null;
  if (!message) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  try {
    const profile = await loadUserProfile(userId);
    if (!profile) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const conversationId = await getOrCreateConversation(userId);
    const userMessage = await insertMessage(conversationId, "user", message, locale, clientContext);

    if (containsDeleteIntent(message)) {
      const fixed = deletionAnswer(locale);
      const assistantMessage = await insertMessage(conversationId, "assistant", fixed, locale, clientContext);
      res.json({ conversationId, userMessage, assistantMessage });
      return;
    }

    if (!openai) {
      const unavailable = locale.toLowerCase().startsWith("en")
        ? "Athene is not configured yet. OPENAI_API_KEY is missing on the backend."
        : "Athene ist noch nicht konfiguriert. OPENAI_API_KEY fehlt im Backend.";
      const assistantMessage = await insertMessage(conversationId, "assistant", unavailable, locale, clientContext);
      res.json({ conversationId, userMessage, assistantMessage });
      return;
    }

    const history = (await loadMessages(conversationId, 20)).reverse();
    const contextFacts = await loadUiContextFacts(userId, clientContext);
    const vectorSnippets = await retrieveRelevantChunks(userId, message);
    const feedbackData = getFeedbackContextData(clientContext);
    const calendarData =
      clientContext?.type === "calendar" ? getCalendarContextData(clientContext) : null;
    const contextBlock = [
      clientContext ? `Current UI context: ${JSON.stringify(clientContext)}` : "",
      contextFacts ? `Authoritative structured context facts: ${JSON.stringify(contextFacts)}` : "",
      vectorSnippets ? `Relevant vector snippets (discovery hints — confirm with tools when needed):\n${vectorSnippets}` : "",
      feedbackData ? feedbackSystemPromptAppendix(locale, feedbackData) : "",
      calendarData ? calendarSystemPromptAppendix(locale, calendarData) : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const openAiMessages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt(locale, profile) },
      ...(contextBlock ? [{ role: "system", content: contextBlock }] : []),
      ...history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    ];

    let completion = await openai.chat.completions.create({
      model: chatModel,
      messages: openAiMessages as never,
      tools: tools as never,
      tool_choice: "auto",
    });

    let planningShiftApplyMeta: AssistantApplyMeta | null = null;
    let planningBatchPersisted = false;

    for (let i = 0; i < 8; i += 1) {
      const choice = completion.choices[0]?.message;
      const toolCalls = choice?.tool_calls ?? [];
      if (!toolCalls.length) break;
      openAiMessages.push(choice as unknown as Record<string, unknown>);
      for (const call of toolCalls) {
        if (call.type !== "function") continue;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          toolArgs = {};
        }
        try {
          const result = await runTool(userId, call.function.name, call.function.arguments);
          if (call.function.name === "shiftWorkOrdersInPlanningWindow") {
            const shift = result as {
              ok?: boolean;
              orderCount?: number;
              ordersWithAssetConflicts?: number;
            };
            if (shift.ok && (shift.orderCount ?? 0) > 0) {
              const shiftMeta = buildRescheduleShiftMetaFromToolArgs(
                toolArgs,
                shift.ordersWithAssetConflicts ?? 0,
              );
              if (shiftMeta) {
                planningShiftApplyMeta = { rescheduleShift: shiftMeta };
              }
            }
          }
          if (call.function.name === "rescheduleWorkOrdersBatch") {
            const batch = result as { ok?: boolean; updatedCount?: number };
            if (batch.ok && (batch.updatedCount ?? 0) > 0) {
              planningBatchPersisted = true;
              planningShiftApplyMeta = null;
            }
          }
          openAiMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          const message = (err as Error).message || "tool_error";
          openAiMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(createWorkOrderToolErrorPayload(call.function.name, message)),
          });
        }
      }
      completion = await openai.chat.completions.create({
        model: chatModel,
        messages: openAiMessages as never,
        tools: tools as never,
        tool_choice: "auto",
      });
    }

    const rawContent =
      completion.choices[0]?.message?.content?.trim() ||
      (locale.toLowerCase().startsWith("en")
        ? "I could not produce an answer."
        : "Ich konnte keine Antwort erzeugen.");
    const { displayContent, meta: contentMeta } = parseAssistantApplyMeta(rawContent);
    const toolMeta =
      !planningBatchPersisted && planningShiftApplyMeta ? planningShiftApplyMeta : null;
    const meta = mergeAssistantApplyMeta(contentMeta, toolMeta);
    const assistantMessage = await insertMessage(
      conversationId,
      "assistant",
      displayContent,
      locale,
      clientContext,
    );
    res.json({
      conversationId,
      userMessage,
      assistantMessage: meta ? { ...assistantMessage, meta } : assistantMessage,
    });
  } catch (err) {
    console.error(err);
    const messageText = (err as Error).message;
    if (messageText === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (messageText === "invalid_body") {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    res.status(500).json({ error: "internal_error" });
  }
});

export const assistantRouter = router;
