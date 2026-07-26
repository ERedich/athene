import { Router, type Request, type Response } from "express";
import type { Pool } from "pg";

import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WORKGROUP_PSEUDO_MY = "__MY_WORKGROUPS__";
const EMPLOYEE_PSEUDO_ME = "__ME__";

const ALLOWED_STATUSES = new Set([
  "open",
  "assigned",
  "started",
  "paused",
  "continued",
  "ended",
  "done",
  "cancelled",
]);

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function sendPgError(res: Response, err: unknown) {
  const e = err as { code?: string; detail?: string; message?: string };
  if (e.code === "23505") {
    res.status(409).json({ error: "duplicate_key", message: e.detail ?? e.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

function parseStringField(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t.length > maxLen) return null;
  return t;
}

function parseStringArray(raw: unknown, maxItems: number, allowPseudo?: Set<string>): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > maxItems) return null;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") return null;
    const t = x.trim();
    if (!t) return null;
    if (allowPseudo?.has(t)) {
      out.push(t);
      continue;
    }
    if (!isUuid(t)) return null;
    out.push(t);
  }
  return out;
}

function parseEnumStringArray(raw: unknown, allowed: Set<string>, maxItems: number): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > maxItems) return null;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") return null;
    const t = x.trim();
    if (!t || !allowed.has(t)) return null;
    out.push(t);
  }
  return out;
}

function parseFreeStringArray(raw: unknown, maxItems: number, maxLen = 100): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > maxItems) return null;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") return null;
    const t = x.trim();
    if (!t || t.length > maxLen) return null;
    out.push(t === "repair" ? "plannedRepair" : t);
  }
  return out;
}

function parseBoolean(raw: unknown): boolean | null {
  if (raw === undefined || raw === null) return false;
  if (typeof raw !== "boolean") return null;
  return raw;
}

function parsePlanningMode(raw: unknown): "absolute" | "relative" | null {
  if (raw === undefined || raw === null) return "relative";
  if (raw === "absolute" || raw === "relative") return raw;
  return null;
}

function parseNonNegDayField(raw: unknown): string | null {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return "";
  if (t.length > 40) return null;
  if (!/^\d+$/.test(t)) return null;
  return t;
}

/** Same visibility as GET /api/users for the given actor. */
async function countUsersVisibleToActor(
  client: Pick<Pool, "query">,
  actorUserId: string,
  targetUserIds: string[],
): Promise<number> {
  if (targetUserIds.length === 0) return 0;
  const uniq = [...new Set(targetUserIds)];
  const { rows } = await client.query<{ c: number }>(
    `
    SELECT COUNT(*)::int AS c
    FROM (
      SELECT DISTINCT u."id"
      FROM "users" u
      WHERE u."id" = ANY($2::uuid[])
        AND (
          ${siteAccessSql('u."workingSiteId"', "$1")}
          OR EXISTS (
            SELECT 1
            FROM "userSite" target_us
            WHERE target_us."userId" = u."id"
              AND ${siteAccessSql('target_us."siteId"', "$1")}
          )
        )
    ) t
    `,
    [actorUserId, uniq],
  );
  return rows[0]?.c ?? 0;
}

export type WorkOrderSearchPresetAdvancedV1 = {
  orderNumberFrom: string;
  orderNumberTo: string;
  plannedDurationFrom: string;
  plannedDurationTo: string;
  documentCountFrom: string;
  documentCountTo: string;
  assetDocumentCountFrom: string;
  assetDocumentCountTo: string;
  assignedEmployeeCountFrom: string;
  assignedEmployeeCountTo: string;
  name: string;
  description: string;
  createdBy: string[];
  updatedBy: string[];
  plannedStartMode: "absolute" | "relative";
  plannedStartFrom: string;
  plannedStartTo: string;
  plannedStartPastDays: string;
  plannedStartFutureDays: string;
  plannedEndMode: "absolute" | "relative";
  plannedEndFrom: string;
  plannedEndTo: string;
  plannedEndPastDays: string;
  plannedEndFutureDays: string;
  createdAtFrom: string;
  createdAtTo: string;
  updatedAtFrom: string;
  updatedAtTo: string;
  orderType: string[];
  status: string[];
  siteId: string[];
  assetId: string[];
  costCenterId: string[];
  classificationId: string[];
  classificationUnassigned: boolean;
  overdue: boolean;
  workgroupId: string[];
  responsibleEmployeeId: string[];
  employeeId: string[];
  maintenancePlanId: string[];
};

export type WorkOrderSearchPresetPayloadV1 = {
  version: 1;
  quickSearch: string;
  advanced: WorkOrderSearchPresetAdvancedV1;
};

export function emptyWorkOrderSearchPresetPayload(): WorkOrderSearchPresetPayloadV1 {
  return {
    version: 1,
    quickSearch: "",
    advanced: {
      orderNumberFrom: "",
      orderNumberTo: "",
      plannedDurationFrom: "",
      plannedDurationTo: "",
      documentCountFrom: "",
      documentCountTo: "",
      assetDocumentCountFrom: "",
      assetDocumentCountTo: "",
      assignedEmployeeCountFrom: "",
      assignedEmployeeCountTo: "",
      name: "",
      description: "",
      createdBy: [],
      updatedBy: [],
      plannedStartMode: "relative",
      plannedStartFrom: "",
      plannedStartTo: "",
      plannedStartPastDays: "",
      plannedStartFutureDays: "",
      plannedEndMode: "relative",
      plannedEndFrom: "",
      plannedEndTo: "",
      plannedEndPastDays: "",
      plannedEndFutureDays: "",
      createdAtFrom: "",
      createdAtTo: "",
      updatedAtFrom: "",
      updatedAtTo: "",
      orderType: [],
      status: [],
      siteId: [],
      assetId: [],
      costCenterId: [],
      classificationId: [],
      classificationUnassigned: false,
      overdue: false,
      workgroupId: [],
      responsibleEmployeeId: [],
      employeeId: [],
      maintenancePlanId: [],
    },
  };
}

/** Built-in preset name provisioned for every user account. */
export const MY_OPEN_WORK_ORDERS_PRESET_NAME = "Meine offenen Aufträge";

const MY_OPEN_WORK_ORDERS_STATUSES = [
  "open",
  "assigned",
  "started",
  "paused",
  "continued",
] as const;

export function myOpenWorkOrdersPresetPayload(): WorkOrderSearchPresetPayloadV1 {
  const payload = emptyWorkOrderSearchPresetPayload();
  payload.advanced.status = [...MY_OPEN_WORK_ORDERS_STATUSES];
  payload.advanced.employeeId = [EMPLOYEE_PSEUDO_ME];
  return payload;
}

/**
 * Idempotently create the standard “Meine offenen Aufträge” preset for a user.
 * Accepts pool or transaction client so it can run inside user-create.
 */
export async function ensureMyOpenWorkOrdersPreset(
  client: Pick<Pool, "query">,
  userId: string,
): Promise<{ id: string; created: boolean } | null> {
  const payload = myOpenWorkOrdersPresetPayload();
  const { rows } = await client.query<{ id: string }>(
    `
    INSERT INTO "workOrderSearchPreset" ("name", "createdBy", "payload")
    SELECT $1, $2::uuid, $3::jsonb
    WHERE NOT EXISTS (
      SELECT 1
      FROM "workOrderSearchPreset" p
      WHERE p."createdBy" = $2::uuid
        AND p."name" = $1
    )
    RETURNING "id"
    `,
    [MY_OPEN_WORK_ORDERS_PRESET_NAME, userId, JSON.stringify(payload)],
  );
  if (rows[0]?.id) {
    return { id: rows[0].id, created: true };
  }
  const existing = await client.query<{ id: string }>(
    `
    SELECT p."id"
    FROM "workOrderSearchPreset" p
    WHERE p."createdBy" = $1::uuid
      AND p."name" = $2
    LIMIT 1
    `,
    [userId, MY_OPEN_WORK_ORDERS_PRESET_NAME],
  );
  const id = existing.rows[0]?.id;
  return id ? { id, created: false } : null;
}

/** Merge sparse advanced filters onto empty defaults, then validate. */
export function buildPresetPayloadFromPartial(input: {
  quickSearch?: unknown;
  advanced?: unknown;
}): WorkOrderSearchPresetPayloadV1 | null {
  const base = emptyWorkOrderSearchPresetPayload();
  const quickSearch =
    typeof input.quickSearch === "string" ? input.quickSearch : base.quickSearch;
  let advanced: Record<string, unknown> = { ...base.advanced };
  if (input.advanced !== undefined && input.advanced !== null) {
    if (typeof input.advanced !== "object" || Array.isArray(input.advanced)) return null;
    const partial = input.advanced as Record<string, unknown>;
    for (const k of Object.keys(partial)) {
      if (!ADVANCED_KEYS.has(k)) return null;
      advanced[k] = partial[k];
    }
  }
  return parsePresetPayload({ version: 1, quickSearch, advanced });
}

export type CreatePresetResult =
  | { ok: true; id: string; name: string; payload: WorkOrderSearchPresetPayloadV1 }
  | { ok: false; error: "invalid_name" | "invalid_payload" | "duplicate_name" | "internal_error"; message?: string };

export async function createPresetForUser(
  userId: string,
  nameRaw: string,
  payload: WorkOrderSearchPresetPayloadV1,
): Promise<CreatePresetResult> {
  const name = nameRaw.trim();
  if (!name || name.length > 200) {
    return { ok: false, error: "invalid_name" };
  }
  try {
    const { rows } = await pool.query<{ id: string; name: string }>(
      `
      INSERT INTO "workOrderSearchPreset" ("name", "createdBy", "payload")
      VALUES ($1, $2::uuid, $3::jsonb)
      RETURNING "id", "name"
      `,
      [name, userId, JSON.stringify(payload)],
    );
    const row = rows[0];
    if (!row) {
      return { ok: false, error: "internal_error" };
    }
    return { ok: true, id: row.id, name: row.name, payload };
  } catch (err) {
    const e = err as { code?: string; detail?: string; message?: string };
    if (e.code === "23505") {
      return { ok: false, error: "duplicate_name", message: e.detail ?? e.message };
    }
    console.error(err);
    return { ok: false, error: "internal_error", message: e.message };
  }
}

export async function listPresetsForUser(
  userId: string,
): Promise<{ id: string; name: string; isOwner: boolean }[]> {
  const { rows } = await pool.query<{ id: string; name: string; isOwner: boolean }>(
    `
    SELECT p."id", p."name", (p."createdBy" = $1::uuid) AS "isOwner"
    FROM "workOrderSearchPreset" p
    LEFT JOIN "workOrderSearchPresetShare" s ON s."presetId" = p."id" AND s."userId" = $1::uuid
    WHERE p."createdBy" = $1::uuid OR s."userId" IS NOT NULL
    ORDER BY p."name" ASC
    `,
    [userId],
  );
  return rows;
}

const ADVANCED_KEYS = new Set([
  "orderNumberFrom",
  "orderNumberTo",
  "plannedDurationFrom",
  "plannedDurationTo",
  "documentCountFrom",
  "documentCountTo",
  "assetDocumentCountFrom",
  "assetDocumentCountTo",
  "assignedEmployeeCountFrom",
  "assignedEmployeeCountTo",
  "name",
  "description",
  "createdBy",
  "updatedBy",
  "plannedStartMode",
  "plannedStartFrom",
  "plannedStartTo",
  "plannedStartPastDays",
  "plannedStartFutureDays",
  "plannedEndMode",
  "plannedEndFrom",
  "plannedEndTo",
  "plannedEndPastDays",
  "plannedEndFutureDays",
  "createdAtFrom",
  "createdAtTo",
  "updatedAtFrom",
  "updatedAtTo",
  "orderType",
  "status",
  "siteId",
  "assetId",
  "costCenterId",
  "classificationId",
  "classificationUnassigned",
  "overdue",
  "workgroupId",
  "responsibleEmployeeId",
  "employeeId",
  "maintenancePlanId",
]);

export function parsePresetPayload(body: unknown): WorkOrderSearchPresetPayloadV1 | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (o.version !== 1) return null;
  const quickSearch = typeof o.quickSearch === "string" ? o.quickSearch : "";
  if (quickSearch.length > 500) return null;
  const advRaw = o.advanced;
  if (advRaw === null || typeof advRaw !== "object") return null;
  const adv = advRaw as Record<string, unknown>;
  for (const k of Object.keys(adv)) {
    if (!ADVANCED_KEYS.has(k)) return null;
  }
  const str = (k: string, max: number) => parseStringField(adv[k], max);
  const uuidArr = (k: string) => parseStringArray(adv[k], 200, undefined);
  const wgArr = () => parseStringArray(adv.workgroupId, 200, new Set([WORKGROUP_PSEUDO_MY]));
  const empArr = () => parseStringArray(adv.employeeId, 200, new Set([EMPLOYEE_PSEUDO_ME]));

  const orderNumberFrom = str("orderNumberFrom", 80) ?? "";
  const orderNumberTo = str("orderNumberTo", 80) ?? "";
  const plannedDurationFrom = str("plannedDurationFrom", 40) ?? "";
  const plannedDurationTo = str("plannedDurationTo", 40) ?? "";
  const documentCountFrom = str("documentCountFrom", 40) ?? "";
  const documentCountTo = str("documentCountTo", 40) ?? "";
  const assetDocumentCountFrom = str("assetDocumentCountFrom", 40) ?? "";
  const assetDocumentCountTo = str("assetDocumentCountTo", 40) ?? "";
  const assignedEmployeeCountFrom = str("assignedEmployeeCountFrom", 40) ?? "";
  const assignedEmployeeCountTo = str("assignedEmployeeCountTo", 40) ?? "";
  const name = str("name", 500) ?? "";
  const description = str("description", 2000) ?? "";
  const createdBy = uuidArr("createdBy");
  const updatedBy = uuidArr("updatedBy");
  const plannedStartMode = parsePlanningMode(adv.plannedStartMode);
  const plannedStartFrom = str("plannedStartFrom", 80) ?? "";
  const plannedStartTo = str("plannedStartTo", 80) ?? "";
  const plannedStartPastDays = parseNonNegDayField(adv.plannedStartPastDays);
  const plannedStartFutureDays = parseNonNegDayField(adv.plannedStartFutureDays);
  const plannedEndMode = parsePlanningMode(adv.plannedEndMode);
  const plannedEndFrom = str("plannedEndFrom", 80) ?? "";
  const plannedEndTo = str("plannedEndTo", 80) ?? "";
  const plannedEndPastDays = parseNonNegDayField(adv.plannedEndPastDays);
  const plannedEndFutureDays = parseNonNegDayField(adv.plannedEndFutureDays);
  const createdAtFrom = str("createdAtFrom", 80) ?? "";
  const createdAtTo = str("createdAtTo", 80) ?? "";
  const updatedAtFrom = str("updatedAtFrom", 80) ?? "";
  const updatedAtTo = str("updatedAtTo", 80) ?? "";
  const orderType = parseFreeStringArray(adv.orderType, 20);
  const status = parseEnumStringArray(adv.status, ALLOWED_STATUSES, 30);
  if (orderType === null || status === null) return null;
  const siteId = uuidArr("siteId");
  const assetId = uuidArr("assetId");
  const costCenterId = uuidArr("costCenterId");
  const classificationId = uuidArr("classificationId");
  if (siteId === null || assetId === null || costCenterId === null || classificationId === null) return null;
  const classificationUnassigned = parseBoolean(adv.classificationUnassigned);
  if (classificationUnassigned === null) return null;
  const overdue = parseBoolean(adv.overdue);
  if (overdue === null) return null;
  const workgroupId = wgArr();
  const responsibleEmployeeId = uuidArr("responsibleEmployeeId");
  const employeeId = empArr();
  const maintenancePlanId = uuidArr("maintenancePlanId");
  if (createdBy === null || updatedBy === null) return null;
  if (workgroupId === null || responsibleEmployeeId === null || employeeId === null) return null;
  if (maintenancePlanId === null) return null;
  if (
    plannedStartMode === null ||
    plannedEndMode === null ||
    plannedStartPastDays === null ||
    plannedStartFutureDays === null ||
    plannedEndPastDays === null ||
    plannedEndFutureDays === null
  ) {
    return null;
  }

  return {
    version: 1,
    quickSearch,
    advanced: {
      orderNumberFrom,
      orderNumberTo,
      plannedDurationFrom,
      plannedDurationTo,
      documentCountFrom,
      documentCountTo,
      assetDocumentCountFrom,
      assetDocumentCountTo,
      assignedEmployeeCountFrom,
      assignedEmployeeCountTo,
      name,
      description,
      createdBy,
      updatedBy,
      plannedStartMode,
      plannedStartFrom,
      plannedStartTo,
      plannedStartPastDays,
      plannedStartFutureDays,
      plannedEndMode,
      plannedEndFrom,
      plannedEndTo,
      plannedEndPastDays,
      plannedEndFutureDays,
      createdAtFrom,
      createdAtTo,
      updatedAtFrom,
      updatedAtTo,
      orderType,
      status,
      siteId,
      assetId,
      costCenterId,
      classificationId,
      classificationUnassigned,
      overdue,
      workgroupId,
      responsibleEmployeeId,
      employeeId,
      maintenancePlanId,
    },
  };
}

type PresetDetailRow = { id: string; name: string; isOwner: boolean; payload: WorkOrderSearchPresetPayloadV1 };

const PRESET_CONTEXT_WORK_ORDERS = "work_orders";
const PRESET_CONTEXT_MONITORING = "monitoring";
const PRESET_CONTEXT_MOBILE = "mobile";

async function cleanupStalePresetDefaults(client: Pick<Pool, "query">, userId: string) {
  await client.query(
    `
    DELETE FROM "userWorkOrderSearchPresetDefault" d
    WHERE d."userId" = $1::uuid
      AND NOT EXISTS (
        SELECT 1
        FROM "workOrderSearchPreset" p
        LEFT JOIN "workOrderSearchPresetShare" s ON s."presetId" = p."id" AND s."userId" = $1::uuid
        WHERE p."id" = d."presetId"
          AND (p."createdBy" = $1::uuid OR s."userId" IS NOT NULL)
      )
    `,
    [userId],
  );
}

async function presetAccessibleToUser(client: Pick<Pool, "query">, userId: string, presetId: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `
    SELECT TRUE AS ok
    FROM "workOrderSearchPreset" p
    LEFT JOIN "workOrderSearchPresetShare" s ON s."presetId" = p."id" AND s."userId" = $2::uuid
    WHERE p."id" = $1::uuid
      AND (p."createdBy" = $2::uuid OR s."userId" IS NOT NULL)
    LIMIT 1
    `,
    [presetId, userId],
  );
  return Boolean(rows[0]?.ok);
}

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const rows = await listPresetsForUser(userId);
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/defaults", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    await cleanupStalePresetDefaults(pool, userId);
    const { rows } = await pool.query<{ context: string; presetId: string }>(
      `
      SELECT d."context", d."presetId"::text AS "presetId"
      FROM "userWorkOrderSearchPresetDefault" d
      WHERE d."userId" = $1::uuid
      `,
      [userId],
    );
    let workOrdersPresetId: string | null = null;
    let monitoringPresetId: string | null = null;
    let mobilePresetId: string | null = null;
    for (const r of rows) {
      if (r.context === PRESET_CONTEXT_WORK_ORDERS) workOrdersPresetId = r.presetId;
      if (r.context === PRESET_CONTEXT_MONITORING) monitoringPresetId = r.presetId;
      if (r.context === PRESET_CONTEXT_MOBILE) mobilePresetId = r.presetId;
    }
    res.json({ workOrdersPresetId, monitoringPresetId, mobilePresetId });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.put("/defaults", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body === null || typeof body !== "object") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  type Entry = { key: "workOrdersPresetId" | "monitoringPresetId" | "mobilePresetId"; context: string };
  const entries: Entry[] = [];
  if ("workOrdersPresetId" in body) {
    entries.push({ key: "workOrdersPresetId", context: PRESET_CONTEXT_WORK_ORDERS });
  }
  if ("monitoringPresetId" in body) {
    entries.push({ key: "monitoringPresetId", context: PRESET_CONTEXT_MONITORING });
  }
  if ("mobilePresetId" in body) {
    entries.push({ key: "mobilePresetId", context: PRESET_CONTEXT_MOBILE });
  }
  if (entries.length === 0) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const rawWo = body.workOrdersPresetId;
  const rawMon = body.monitoringPresetId;
  const rawMobile = body.mobilePresetId;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const { key, context } of entries) {
      const raw =
        key === "workOrdersPresetId" ? rawWo : key === "monitoringPresetId" ? rawMon : rawMobile;
      if (raw === null || raw === undefined) {
        await client.query(
          `
          DELETE FROM "userWorkOrderSearchPresetDefault"
          WHERE "userId" = $1::uuid AND "context" = $2
          `,
          [userId, context],
        );
        continue;
      }
      if (typeof raw !== "string" || !isUuid(raw)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "invalid_preset_id" });
        return;
      }
      const ok = await presetAccessibleToUser(client, userId, raw);
      if (!ok) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "preset_not_accessible" });
        return;
      }
      await client.query(
        `
        INSERT INTO "userWorkOrderSearchPresetDefault" ("userId", "context", "presetId")
        VALUES ($1::uuid, $2, $3::uuid)
        ON CONFLICT ("userId", "context") DO UPDATE SET "presetId" = EXCLUDED."presetId"
        `,
        [userId, context, raw],
      );
    }

    await cleanupStalePresetDefaults(client, userId);
    const { rows } = await client.query<{ context: string; presetId: string }>(
      `
      SELECT d."context", d."presetId"::text AS "presetId"
      FROM "userWorkOrderSearchPresetDefault" d
      WHERE d."userId" = $1::uuid
      `,
      [userId],
    );
    await client.query("COMMIT");

    let workOrdersPresetId: string | null = null;
    let monitoringPresetId: string | null = null;
    let mobilePresetId: string | null = null;
    for (const r of rows) {
      if (r.context === PRESET_CONTEXT_WORK_ORDERS) workOrdersPresetId = r.presetId;
      if (r.context === PRESET_CONTEXT_MONITORING) monitoringPresetId = r.presetId;
      if (r.context === PRESET_CONTEXT_MOBILE) mobilePresetId = r.presetId;
    }
    res.json({ workOrdersPresetId, monitoringPresetId, mobilePresetId });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendPgError(res, err);
  } finally {
    client.release();
  }
});

router.get("/:id/shares", async (req: Request, res: Response) => {
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
    const { rows: own } = await pool.query<{ c: string }>(
      `SELECT 1 AS c FROM "workOrderSearchPreset" WHERE "id" = $1::uuid AND "createdBy" = $2::uuid`,
      [id, userId],
    );
    if (!own.length) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const { rows } = await pool.query<{ userId: string; loginName: string; name: string }>(
      `
      SELECT s."userId", u."loginName", u."name"
      FROM "workOrderSearchPresetShare" s
      JOIN "users" u ON u."id" = s."userId"
      WHERE s."presetId" = $1::uuid
      ORDER BY u."loginName" ASC
      `,
      [id],
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
    const { rows } = await pool.query<PresetDetailRow>(
      `
      SELECT p."id", p."name", (p."createdBy" = $2::uuid) AS "isOwner", p."payload"
      FROM "workOrderSearchPreset" p
      LEFT JOIN "workOrderSearchPresetShare" s ON s."presetId" = p."id" AND s."userId" = $2::uuid
      WHERE p."id" = $1::uuid
        AND (p."createdBy" = $2::uuid OR s."userId" IS NOT NULL)
      LIMIT 1
      `,
      [id, userId],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const payload = row.payload as unknown;
    const parsed = parsePresetPayload(payload);
    if (!parsed) {
      res.status(500).json({ error: "invalid_stored_payload" });
      return;
    }
    res.json({ id: row.id, name: row.name, isOwner: row.isOwner, payload: parsed });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as Record<string, unknown> | null | undefined;
  const nameRaw = typeof body?.name === "string" ? body.name.trim() : "";
  const payload = parsePresetPayload(body?.payload);
  if (!payload) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  const result = await createPresetForUser(userId, nameRaw, payload);
  if (!result.ok) {
    if (result.error === "invalid_name") {
      res.status(400).json({ error: "invalid_name" });
      return;
    }
    if (result.error === "duplicate_name") {
      res.status(409).json({ error: "duplicate_key", message: result.message });
      return;
    }
    res.status(500).json({ error: "internal_error" });
    return;
  }
  res.status(201).json({ id: result.id, name: result.name, isOwner: true, payload: result.payload });
});

router.patch("/:id", async (req: Request, res: Response) => {
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
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body === null || typeof body !== "object") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const nameRaw = body.name !== undefined ? (typeof body.name === "string" ? body.name.trim() : "") : undefined;
  if (nameRaw !== undefined && (!nameRaw || nameRaw.length > 200)) {
    res.status(400).json({ error: "invalid_name" });
    return;
  }
  let payload: WorkOrderSearchPresetPayloadV1 | undefined;
  if (body.payload !== undefined) {
    const p = parsePresetPayload(body.payload);
    if (!p) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    payload = p;
  }
  if (nameRaw === undefined && payload === undefined) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (nameRaw !== undefined) {
      sets.push(`"name" = $${i++}`);
      params.push(nameRaw);
    }
    if (payload !== undefined) {
      sets.push(`"payload" = $${i++}::jsonb`);
      params.push(JSON.stringify(payload));
    }
    params.push(id, userId);
    const pId = i++;
    const pUser = i++;
    const { rows } = await pool.query<{ id: string; name: string; payload: WorkOrderSearchPresetPayloadV1 }>(
      `
      UPDATE "workOrderSearchPreset"
      SET ${sets.join(", ")}
      WHERE "id" = $${pId}::uuid AND "createdBy" = $${pUser}::uuid
      RETURNING "id", "name", "payload"
      `,
      params,
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const parsed = parsePresetPayload(row.payload);
    if (!parsed) {
      res.status(500).json({ error: "invalid_stored_payload" });
      return;
    }
    res.json({ id: row.id, name: row.name, isOwner: true, payload: parsed });
  } catch (err) {
    sendPgError(res, err);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
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
    const { rowCount } = await pool.query(
      `DELETE FROM "workOrderSearchPreset" WHERE "id" = $1::uuid AND "createdBy" = $2::uuid`,
      [id, userId],
    );
    if (!rowCount) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    sendPgError(res, err);
  }
});

router.put("/:id/shares", async (req: Request, res: Response) => {
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
  const body = req.body as Record<string, unknown> | null | undefined;
  const rawIds = body?.userIds;
  if (!Array.isArray(rawIds)) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const userIds: string[] = [];
  for (const x of rawIds) {
    if (typeof x !== "string" || !isUuid(x.trim())) {
      res.status(400).json({ error: "invalid_user_ids" });
      return;
    }
    userIds.push(x.trim());
  }
  const targets = [...new Set(userIds)].filter((uid) => uid !== userId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ownerCheck = await client.query<{ createdBy: string }>(
      `SELECT "createdBy" FROM "workOrderSearchPreset" WHERE "id" = $1::uuid FOR UPDATE`,
      [id],
    );
    const owner = ownerCheck.rows[0]?.createdBy;
    if (!owner || owner !== userId) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "not_found" });
      return;
    }

    const visible = await countUsersVisibleToActor(client, userId, targets);
    if (visible !== targets.length) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "assignee_not_visible" });
      return;
    }

    await client.query(`DELETE FROM "workOrderSearchPresetShare" WHERE "presetId" = $1::uuid`, [id]);
    for (const uid of targets) {
      await client.query(
        `
        INSERT INTO "workOrderSearchPresetShare" ("presetId", "userId", "createdBy")
        VALUES ($1::uuid, $2::uuid, $3::uuid)
        `,
        [id, uid, userId],
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, userIds: targets });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendPgError(res, err);
  } finally {
    client.release();
  }
});

export const workOrderSearchPresetsRouter = router;
