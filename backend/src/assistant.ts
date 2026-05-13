import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import { OpenAI } from "openai";
import type { QueryResult, QueryResultRow } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { assertClassificationForSiteAndScope } from "./classificationAssert.js";
import { withAuditContext } from "./auditContext.js";
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
  type: "workOrder" | "asset" | "monitoring" | "app" | "unknown";
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
  LEFT JOIN (
    SELECT "assetId", COUNT(*)::int AS "documentCount"
    FROM "assetDocument"
    GROUP BY "assetId"
  ) doc_counts ON doc_counts."assetId" = a."id"
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

function systemPrompt(locale: string, profile: UserProfile): string {
  const dateFormat = locale.toLowerCase().startsWith("en") ? "MM/DD/YYYY HH:mm" : "DD.MM.YYYY HH:mm";
  return [
    "You are Athene, the Athene CMMS assistant.",
    `Answer only in the selected frontend language: ${locale}.`,
    `Format dates and times for the user with this locale format: ${dateFormat}.`,
    "When presenting structured lists, comparisons, counts, status summaries, or tabular data, use GitHub-flavored Markdown tables. Keep tables compact and include only columns that help answer the question.",
    "You can never delete records. If a user asks you to delete, remove, or erase records, answer with the fixed refusal and do not call tools.",
    "You must never access, reveal, or change passwords, password hashes, session secrets, API keys, or similar sensitive data.",
    "You must not add, change, or delete records for master-data apps: sites, users, employees, workgroups, cost centers, classifications, app parameters, translations, table viewer, or search configuration.",
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

async function retrieveRelevantChunks(userId: string, message: string): Promise<string[]> {
  if (!openai) return [];
  try {
    const embedding = await openai.embeddings.create({
      model: embeddingModel,
      input: message,
    });
    const vector = embedding.data[0]?.embedding;
    if (!vector?.length) return [];
    const { rows } = await pool.query<{ content: string; sourceKind: string; sourceId: string }>(
      `
      SELECT "content", "sourceKind", "sourceId"
      FROM "assistantEmbeddingChunk"
      WHERE "siteId" IS NULL OR ${siteAccessSql('"siteId"', "$2")}
      ORDER BY "embedding" <=> $1::vector
      LIMIT 6
      `,
      [`[${vector.join(",")}]`, userId],
    );
    return rows.map((row) => `[${row.sourceKind}:${row.sourceId}] ${row.content}`);
  } catch (err) {
    console.warn("[athene-assistant] embedding retrieval skipped:", err);
    return [];
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

async function loadUiContextFacts(userId: string, context: UiContext | null): Promise<unknown | null> {
  if (!context?.id || !isUuid(context.id)) return null;
  if (context.type === "workOrder" || context.type === "monitoring") {
    const workOrder = await getWorkOrderDetails(userId, context.id);
    if ((workOrder as { error?: string }).error === "not_found") return { error: "context_not_accessible" };
    const documents = await listDocuments(userId, "workOrder", context.id);
    const statusEvents = await getWorkOrderStatusEvents(userId, context.id);
    const transactions = await getWorkOrderTransactions(userId, context.id, false);
    const currentUserTransactions = await getWorkOrderTransactions(userId, context.id, true);
    return {
      contextType: "workOrder",
      workOrder,
      documents,
      statusEvents,
      transactions,
      currentUserTransactions,
      semanticNotes: [
        "The workOrder object is the current selected row's authoritative structured data.",
        "Use statusEvents to answer who changed the order to a status such as started, paused, continued, ended, done, or cancelled. Prefer employeeName/employeeKey when present; otherwise use changedByName or changedByLogin.",
        "Use doneByEmployeeName/doneByEmployeeKey plus endedAt or doneAt as completion attribution fields when they exist.",
        "Use documentCount and assetDocumentCount to explain document reference colors.",
        "Use transactions for all transactions on this work order. Use currentUserTransactions when the user asks how many hours they personally captured/booked/erfasst. Transaction type IN stores feedback hours for work orders in this app.",
      ],
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
  return null;
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

async function listDocuments(userId: string, sourceKind: unknown, sourceId: unknown): Promise<unknown> {
  if (!isUuid(sourceId)) throw new Error("invalid_id");
  if (sourceKind === "workOrder") {
    await getWorkOrderDetails(userId, sourceId);
    const { rows } = await pool.query(
      `
      SELECT "id", 'workOrder' AS "source", "fileName", "displayName", "category", "mimeType", "fileSize", "createdAt"
      FROM "workOrderDocument"
      WHERE "workOrderId" = $1::uuid
      UNION ALL
      SELECT d."id", 'asset' AS "source", d."fileName", d."displayName", d."category", d."mimeType", d."fileSize", d."createdAt"
      FROM "assetDocument" d
      JOIN "workOrder" w ON w."id" = $1::uuid AND w."assetId" = d."assetId"
      ORDER BY "createdAt" DESC
      `,
      [sourceId],
    );
    return rows;
  }
  if (sourceKind === "asset") {
    await getAssetDetails(userId, sourceId);
    const { rows } = await pool.query(
      `
      SELECT "id", 'asset' AS "source", "fileName", "displayName", "category", "mimeType", "fileSize", "createdAt"
      FROM "assetDocument"
      WHERE "assetId" = $1::uuid
      ORDER BY "createdAt" DESC
      `,
      [sourceId],
    );
    return rows;
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
  const accessible = source === "workOrder" ? await getWorkOrderDetails(userId, sourceId) : await getAssetDetails(userId, sourceId);
  if ((accessible as { error?: string }).error === "not_found") return accessible;
  const table = source === "workOrder" ? `"workOrderDocument"` : `"assetDocument"`;
  const fk = source === "workOrder" ? `"workOrderId"` : `"assetId"`;
  const { rows } = await pool.query<QueryResultRow & { displayName: string; mimeType: string; content: Buffer }>(
    `
    SELECT "displayName", "mimeType", "content"
    FROM ${table}
    WHERE "id" = $1::uuid
      AND ${fk} = $2::uuid
    LIMIT 1
    `,
    [documentId, sourceId],
  );
  const doc = rows[0];
  if (!doc) return { error: "not_found" };
  const isText = /^text\//i.test(doc.mimeType) || /json|xml|csv|markdown/i.test(doc.mimeType);
  if (!isText) {
    return {
      displayName: doc.displayName,
      mimeType: doc.mimeType,
      textAvailable: false,
      note: "The document is binary. Text extraction is not available yet.",
    };
  }
  return {
    displayName: doc.displayName,
    mimeType: doc.mimeType,
    textAvailable: true,
    content: doc.content.toString("utf8").slice(0, 24_000),
  };
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
      description: "Get one accessible work order with all visible fields and references.",
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
      name: "searchWorkOrders",
      description: "Search accessible work orders by order number, name, or description.",
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
      description: "Get audit-log status changes for one accessible work order, including who changed the status and when.",
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
      name: "getWorkOrderTransactions",
      description: "Read accessible transactions for one work order, including feedback hour quantities, creator user/employee, and per-type summaries. Use onlyCurrentUser when the user asks for their own captured hours.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          onlyCurrentUser: { type: "boolean" },
        },
        required: ["id"],
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
      name: "listDocuments",
      description: "List work-order or asset documents visible to the user.",
      parameters: {
        type: "object",
        properties: {
          sourceKind: { type: "string", enum: ["workOrder", "asset"] },
          sourceId: { type: "string" },
        },
        required: ["sourceKind", "sourceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readDocumentText",
      description: "Read text content from a text-like work-order or asset document. Binary files return metadata only.",
      parameters: {
        type: "object",
        properties: {
          sourceKind: { type: "string", enum: ["workOrder", "asset"] },
          sourceId: { type: "string" },
          documentId: { type: "string" },
        },
        required: ["sourceKind", "sourceId", "documentId"],
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

async function runTool(userId: string, name: string, rawArgs: string): Promise<unknown> {
  const args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  if (name === "getWorkOrderDetails") return getWorkOrderDetails(userId, String(args.id ?? ""));
  if (name === "searchWorkOrders") return searchWorkOrders(userId, String(args.query ?? ""));
  if (name === "countWorkOrdersByStatus") return countWorkOrdersByStatus(userId, args.status);
  if (name === "getWorkOrderStatusEvents") return getWorkOrderStatusEvents(userId, String(args.id ?? ""));
  if (name === "getWorkOrderTransactions") {
    return getWorkOrderTransactions(userId, String(args.id ?? ""), args.onlyCurrentUser === true);
  }
  if (name === "getAssetDetails") return getAssetDetails(userId, String(args.id ?? ""));
  if (name === "listDocuments") return listDocuments(userId, args.sourceKind, args.sourceId);
  if (name === "readDocumentText") return readDocumentText(userId, args.sourceKind, args.sourceId, args.documentId);
  if (name === "createWorkOrder") return createWorkOrder(userId, args);
  return { error: "unknown_tool" };
}

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
    const chunks = await retrieveRelevantChunks(userId, message);
    const contextBlock = [
      clientContext ? `Current UI context: ${JSON.stringify(clientContext)}` : "",
      contextFacts ? `Authoritative structured context facts: ${JSON.stringify(contextFacts)}` : "",
      chunks.length ? `Relevant vector snippets:\n${chunks.join("\n\n")}` : "",
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

    const content =
      completion.choices[0]?.message?.content?.trim() ||
      (locale.toLowerCase().startsWith("en")
        ? "I could not produce an answer."
        : "Ich konnte keine Antwort erzeugen.");
    const assistantMessage = await insertMessage(conversationId, "assistant", content, locale, clientContext);
    res.json({ conversationId, userMessage, assistantMessage });
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
