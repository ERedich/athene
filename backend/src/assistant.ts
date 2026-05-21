import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
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
  type: "workOrder" | "asset" | "monitoring" | "sparePart" | "warehouse" | "app" | "unknown";
  id?: string;
  label?: string;
  data?: unknown;
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
  responsibleEmployeeId: string | null;
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
  responsibleEmployeeId: string | null;
  workgroupId: string;
  classificationId: string | null;
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
    done_history."doneAt",
    ended_history."endedAt",
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
  const responsibleEmployeeId = readOptionalString(args.responsibleEmployeeId, 80);
  const workgroupId = readString(args.workgroupId, 80);
  const classificationId = readOptionalString(args.classificationId, 80);

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
    (responsibleEmployeeId !== null && !isUuid(responsibleEmployeeId)) ||
    (classificationId !== null && !isUuid(classificationId))
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
    responsibleEmployeeId,
    workgroupId,
    classificationId,
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
  /\n?\[ATHENE_APPLY:(remark|pauseRemark):([\s\S]*?)\]\s*$/;

type AssistantApplyMeta = {
  correctedText: string;
  targetField: "remark" | "pauseRemark";
};

function parseAssistantApplyMeta(content: string): {
  displayContent: string;
  meta: AssistantApplyMeta | null;
} {
  const match = content.match(ATHENE_APPLY_META_RE);
  if (!match) return { displayContent: content, meta: null };
  const correctedText = match[2].trim();
  if (!correctedText) return { displayContent: content.replace(ATHENE_APPLY_META_RE, "").trimEnd(), meta: null };
  return {
    displayContent: content.replace(ATHENE_APPLY_META_RE, "").trimEnd(),
    meta: { correctedText, targetField: match[1] as "remark" | "pauseRemark" },
  };
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
    "You may create work orders only through the createWorkOrder tool and only after collecting the required fields from the user.",
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

async function localizeSpokenText(text: string, targetLocale: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (!openai) throw new Error("openai_not_configured");
  const targetLang = targetLocale.toLowerCase().startsWith("en") ? "English" : "German";
  const completion = await openai.chat.completions.create({
    model: chatModel,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "You normalize dictated maintenance feedback text for a CMMS.",
          `Output ONLY the final text in ${targetLang} — no quotes, no explanation.`,
          "Detect the spoken language, translate if needed, fix punctuation and capitalization lightly.",
          "Preserve technical terms, asset names, and numbers. Max 2000 characters.",
        ].join(" "),
      },
      { role: "user", content: trimmed.slice(0, 4000) },
    ],
  });
  return (completion.choices[0]?.message?.content ?? trimmed).trim().slice(0, 2000);
}

async function loadUiContextFacts(userId: string, context: UiContext | null): Promise<unknown | null> {
  if (!context?.id || !isUuid(context.id)) return null;
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
      await assertResponsibleEmployeeContext(
        client,
        userId,
        parsed.responsibleEmployeeId,
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

      const { rows } = await client.query<WorkOrderRow>(
        `
        WITH inserted AS (
          INSERT INTO "workOrder"
            ("name", "description", "siteId", "assetId", "costCenterId", "plannedStart", "plannedEnd", "plannedDurationMinutes", "orderType", "status", "responsibleEmployeeId", "workgroupId", "classificationId")
          VALUES
            ($1, $2, $3::uuid, $4::uuid, $5::uuid, $6::timestamptz, $7::timestamptz, $8::integer, $9, 'open', $10::uuid, $11::uuid, $12::uuid)
          RETURNING *
        )
        ${selectWorkOrdersSql.replace('FROM "workOrder" w', 'FROM inserted w')}
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
      name: "createWorkOrder",
      description: "Create a work order after the user provided all required fields. Never use for master data.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: ["string", "null"] },
          assetId: { type: "string" },
          costCenterId: { type: "string" },
          plannedStart: { type: "string" },
          plannedEnd: { type: ["string", "null"] },
          plannedDurationMinutes: { type: ["integer", "null"] },
          orderType: { type: "string", enum: ["maintenance", "repair", "breakdown"] },
          responsibleEmployeeId: { type: ["string", "null"] },
          workgroupId: { type: "string" },
          classificationId: { type: ["string", "null"] },
        },
        required: ["name", "assetId", "costCenterId", "plannedStart", "orderType", "workgroupId"],
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
  if (name === "createWorkOrder") return createWorkOrder(userId, args);
  return { error: "unknown_tool" };
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
    const localized = await localizeSpokenText(text, targetLocale);
    res.json({ text: localized });
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
    const contextBlock = [
      clientContext ? `Current UI context: ${JSON.stringify(clientContext)}` : "",
      contextFacts ? `Authoritative structured context facts: ${JSON.stringify(contextFacts)}` : "",
      vectorSnippets ? `Relevant vector snippets (discovery hints — confirm with tools when needed):\n${vectorSnippets}` : "",
      feedbackData ? feedbackSystemPromptAppendix(locale, feedbackData) : "",
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

    for (let i = 0; i < 4; i += 1) {
      const choice = completion.choices[0]?.message;
      const toolCalls = choice?.tool_calls ?? [];
      if (!toolCalls.length) break;
      openAiMessages.push(choice as unknown as Record<string, unknown>);
      for (const call of toolCalls) {
        if (call.type !== "function") continue;
        try {
          const result = await runTool(userId, call.function.name, call.function.arguments);
          openAiMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          openAiMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: (err as Error).message || "tool_error" }),
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
    const { displayContent, meta } = parseAssistantApplyMeta(rawContent);
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
