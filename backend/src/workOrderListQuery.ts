import type { Request } from "express";
import type { Pool } from "pg";

/** Query value for workgroup MultiSelect: resolves to current user's workgroups (workgroupUser). */
export const WORKGROUP_PSEUDO_MY = "__MY_WORKGROUPS__";
/** Query value for employee MultiSelect: resolves to session user's employee row; filters assignment OR responsible. */
export const EMPLOYEE_PSEUDO_ME = "__ME__";

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

function isUuid(value: string): boolean {
  return uuidRe.test(value);
}

function isWorkOrderType(value: string): value is WorkOrderType {
  return (allowedOrderTypes as string[]).includes(value);
}

function isWorkOrderStatus(value: string): value is WorkOrderStatus {
  return (allowedWorkOrderStatuses as string[]).includes(value);
}

function parseOptionalTrimmedString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length ? t : null;
}

function parseOptionalInt(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function collectQueryStrings(q: Request["query"], key: string): string[] {
  const v = q[key];
  if (v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** Escape `\`, `%`, `_` for use in `LIKE ... ESCAPE '\'` pattern body (without surrounding %). */
function escapeLikeLiteral(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export type WorkOrderListFilterResult =
  | { ok: true; conditions: string[]; params: unknown[] }
  | { ok: false; status: number; error: string };

/**
 * Builds extra WHERE conditions (AND …) for GET /api/work-orders.
 * $1 is reserved for site-access user id; returned params start at $2.
 */
export async function buildWorkOrderListFilters(
  q: Request["query"],
  userId: string,
  pool: Pool,
): Promise<WorkOrderListFilterResult> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 2;

  const { rows: userRows } = await pool.query<{ employeeId: string | null }>(
    `SELECT "employeeId" FROM "users" WHERE "id" = $1::uuid LIMIT 1`,
    [userId],
  );
  const sessionEmployeeId = userRows[0]?.employeeId ?? null;

  let myWorkgroupIds: string[] = [];
  if (sessionEmployeeId) {
    const wg = await pool.query<{ workgroupId: string }>(
      `SELECT "workgroupId" FROM "workgroupUser" WHERE "employeeId" = $1::uuid`,
      [sessionEmployeeId],
    );
    myWorkgroupIds = [...new Set(wg.rows.map((r) => r.workgroupId))];
  }

  const pushCond = (sql: string) => {
    conditions.push(sql);
  };

  // Quick search (substring, case-insensitive)
  const search = parseOptionalTrimmedString(q.search);
  if (search) {
    params.push(search.toLowerCase());
    const p = `$${pi++}::text`;
    pushCond(`(
      position(${p} in lower(w."name")) > 0
      OR position(${p} in lower(COALESCE(w."description", ''))) > 0
      OR position(${p} in lower(CAST(w."orderNumber" AS text))) > 0
    )`);
  }

  // --- Numeric ranges ---
  const orderNumberFrom = parseOptionalInt(q.orderNumberFrom);
  const orderNumberTo = parseOptionalInt(q.orderNumberTo);
  if (orderNumberFrom !== null) {
    params.push(orderNumberFrom);
    pushCond(`w."orderNumber" >= $${pi++}`);
  }
  if (orderNumberTo !== null) {
    params.push(orderNumberTo);
    pushCond(`w."orderNumber" <= $${pi++}`);
  }

  const plannedDurationFrom = parseOptionalInt(q.plannedDurationFrom);
  const plannedDurationTo = parseOptionalInt(q.plannedDurationTo);
  if (plannedDurationFrom !== null) {
    params.push(plannedDurationFrom);
    pushCond(`w."plannedDurationMinutes" IS NOT NULL AND w."plannedDurationMinutes" >= $${pi++}`);
  }
  if (plannedDurationTo !== null) {
    params.push(plannedDurationTo);
    pushCond(`w."plannedDurationMinutes" IS NOT NULL AND w."plannedDurationMinutes" <= $${pi++}`);
  }

  const documentCountFrom = parseOptionalInt(q.documentCountFrom);
  const documentCountTo = parseOptionalInt(q.documentCountTo);
  if (documentCountFrom !== null) {
    params.push(documentCountFrom);
    pushCond(`COALESCE(doc_counts."documentCount", 0) >= $${pi++}`);
  }
  if (documentCountTo !== null) {
    params.push(documentCountTo);
    pushCond(`COALESCE(doc_counts."documentCount", 0) <= $${pi++}`);
  }

  const assetDocumentCountFrom = parseOptionalInt(q.assetDocumentCountFrom);
  const assetDocumentCountTo = parseOptionalInt(q.assetDocumentCountTo);
  if (assetDocumentCountFrom !== null) {
    params.push(assetDocumentCountFrom);
    pushCond(`COALESCE(asset_doc_counts."assetDocumentCount", 0) >= $${pi++}`);
  }
  if (assetDocumentCountTo !== null) {
    params.push(assetDocumentCountTo);
    pushCond(`COALESCE(asset_doc_counts."assetDocumentCount", 0) <= $${pi++}`);
  }

  const assignedEmployeeCountFrom = parseOptionalInt(q.assignedEmployeeCountFrom);
  const assignedEmployeeCountTo = parseOptionalInt(q.assignedEmployeeCountTo);
  if (assignedEmployeeCountFrom !== null) {
    params.push(assignedEmployeeCountFrom);
    pushCond(`COALESCE(assign_counts."assignedEmployeeCount", 0) >= $${pi++}`);
  }
  if (assignedEmployeeCountTo !== null) {
    params.push(assignedEmployeeCountTo);
    pushCond(`COALESCE(assign_counts."assignedEmployeeCount", 0) <= $${pi++}`);
  }

  // --- Free-text: single field, LIKE substring (escaped) ---
  const likeContains = (columnSql: string, queryKey: string) => {
    const raw = parseOptionalTrimmedString(q[queryKey]);
    if (!raw) return;
    params.push(escapeLikeLiteral(raw));
    pushCond(`${columnSql} LIKE '%' || $${pi++}::text || '%' ESCAPE '\\'`);
  };

  likeContains(`w."name"`, "name");
  likeContains(`COALESCE(w."description", '')`, "description");

  // --- Datetime ranges (planning) ---
  const tsRange = (column: string, fromKey: string, toKey: string) => {
    const from = parseOptionalTrimmedString(q[fromKey]);
    const to = parseOptionalTrimmedString(q[toKey]);
    if (from) {
      params.push(from);
      pushCond(`${column} >= $${pi++}::timestamptz`);
    }
    if (to) {
      params.push(to);
      pushCond(`${column} <= $${pi++}::timestamptz`);
    }
  };
  tsRange(`w."plannedStart"`, "plannedStartFrom", "plannedStartTo");
  tsRange(`w."plannedEnd"`, "plannedEndFrom", "plannedEndTo");
  tsRange(`w."createdAt"`, "createdAtFrom", "createdAtTo");
  tsRange(`w."updatedAt"`, "updatedAtFrom", "updatedAtTo");

  // --- Discrete: orderType ---
  const orderTypesRaw = collectQueryStrings(q, "orderType");
  const orderTypes = orderTypesRaw.filter(isWorkOrderType);
  if (orderTypesRaw.length && orderTypes.length !== orderTypesRaw.length) {
    return { ok: false, status: 400, error: "invalid_order_type" };
  }
  if (orderTypes.length) {
    params.push(orderTypes);
    pushCond(`w."orderType" = ANY($${pi++}::text[])`);
  }

  // --- Discrete: status ---
  const statusesRaw = collectQueryStrings(q, "status");
  const statuses = statusesRaw.filter(isWorkOrderStatus);
  if (statusesRaw.length && statuses.length !== statusesRaw.length) {
    return { ok: false, status: 400, error: "invalid_status" };
  }
  if (statuses.length) {
    params.push(statuses);
    pushCond(`w."status" = ANY($${pi++}::text[])`);
  }

  // --- Discrete: UUIDs ---
  const uuidIn = (raw: string[], fieldSql: string, err: string) => {
    const ids = [...new Set(raw)];
    for (const id of ids) {
      if (!isUuid(id)) return err;
    }
    if (!ids.length) return null;
    params.push(ids);
    pushCond(`${fieldSql} = ANY($${pi++}::uuid[])`);
    return null;
  }

  const siteErr = uuidIn(collectQueryStrings(q, "siteId"), `w."siteId"`, "invalid_site_id");
  if (siteErr) return { ok: false, status: 400, error: siteErr };

  const assetErr = uuidIn(collectQueryStrings(q, "assetId"), `w."assetId"`, "invalid_asset_id");
  if (assetErr) return { ok: false, status: 400, error: assetErr };

  const ccErr = uuidIn(collectQueryStrings(q, "costCenterId"), `w."costCenterId"`, "invalid_cost_center_id");
  if (ccErr) return { ok: false, status: 400, error: ccErr };

  const createdByErr = uuidIn(collectQueryStrings(q, "createdBy"), `w."createdBy"`, "invalid_created_by");
  if (createdByErr) return { ok: false, status: 400, error: createdByErr };

  const updatedByErr = uuidIn(collectQueryStrings(q, "updatedBy"), `w."updatedBy"`, "invalid_updated_by");
  if (updatedByErr) return { ok: false, status: 400, error: updatedByErr };

  const classIds = [...new Set(collectQueryStrings(q, "classificationId"))];
  for (const id of classIds) {
    if (!isUuid(id)) return { ok: false, status: 400, error: "invalid_classification_id" };
  }
  if (classIds.length) {
    params.push(classIds);
    pushCond(`w."classificationId" = ANY($${pi++}::uuid[])`);
  }

  const classUnassigned = parseOptionalTrimmedString(q.classificationUnassigned);
  if (classUnassigned === "1" || classUnassigned === "true") {
    pushCond(`w."classificationId" IS NULL`);
  }

  // Workgroup IDs + pseudo
  const workgroupTokens = collectQueryStrings(q, "workgroupId");
  if (workgroupTokens.length) {
    let wantMy = false;
    const uuidList: string[] = [];
    for (const t of workgroupTokens) {
      if (t === WORKGROUP_PSEUDO_MY) {
        wantMy = true;
        continue;
      }
      if (!isUuid(t)) return { ok: false, status: 400, error: "invalid_workgroup_id" };
      uuidList.push(t);
    }
    const resolved = new Set<string>(uuidList);
    if (wantMy) {
      for (const id of myWorkgroupIds) resolved.add(id);
    }
    const arr = [...resolved];
    if (arr.length === 0) {
      pushCond(`FALSE`);
    } else {
      params.push(arr);
      pushCond(`w."workgroupId" = ANY($${pi++}::uuid[])`);
    }
  }

  // Employee filter: responsible OR assignment; multi-value = OR across employees
  const employeeTokens = collectQueryStrings(q, "employeeId");
  if (employeeTokens.length) {
    const resolvedIds: string[] = [];
    let wantsMe = false;
    for (const t of employeeTokens) {
      if (t === EMPLOYEE_PSEUDO_ME) {
        wantsMe = true;
        continue;
      }
      if (!isUuid(t)) return { ok: false, status: 400, error: "invalid_employee_id" };
      resolvedIds.push(t);
    }
    if (wantsMe) {
      if (sessionEmployeeId) resolvedIds.push(sessionEmployeeId);
    }
    const uniq = [...new Set(resolvedIds)];
    if (uniq.length === 0) {
      pushCond(`FALSE`);
    } else {
      params.push(uniq);
      pushCond(`(
        w."responsibleEmployeeId" = ANY($${pi}::uuid[])
        OR EXISTS (
          SELECT 1 FROM "workOrderEmployeeAssignment" a
          WHERE a."workOrderId" = w."id"
            AND a."employeeId" = ANY($${pi}::uuid[])
        )
      )`);
      pi++;
    }
  }

  // Optional: only responsible (without assignment)
  const responsibleOnly = collectQueryStrings(q, "responsibleEmployeeId");
  if (responsibleOnly.length) {
    const err = uuidIn(responsibleOnly, `w."responsibleEmployeeId"`, "invalid_responsible_employee_id");
    if (err) return { ok: false, status: 400, error: err };
  }

  return { ok: true, conditions, params };
}
