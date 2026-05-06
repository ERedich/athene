import type { Request } from "express";
import type { Pool } from "pg";

import { EMPLOYEE_PSEUDO_ME, WORKGROUP_PSEUDO_MY } from "./workOrderListQuery.js";

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

function escapeLikeLiteral(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export type TransactionListExtraResult =
  | { ok: true; conditions: string[]; params: unknown[] }
  | { ok: false; status: number; error: string };

/**
 * Extra WHERE fragments for transaction list (AND …). Params append after existing route params; caller sets $ indices.
 * All conditions reference t, and optionally w (workOrder join).
 */
export async function buildTransactionListExtraFilters(
  q: Request["query"],
  userId: string,
  pool: Pool,
  startParamIndex: number,
): Promise<TransactionListExtraResult> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = startParamIndex;

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

  const search = parseOptionalTrimmedString(q.search);
  if (search) {
    params.push(search.toLowerCase());
    const p = `$${pi++}::text`;
    pushCond(`(
      position(${p} in lower(COALESCE(t."remark", ''))) > 0
      OR position(${p} in lower(CAST(t."transactionNumber" AS text))) > 0
      OR position(${p} in lower(COALESCE(w."name", ''))) > 0
      OR position(${p} in lower(CAST(w."orderNumber" AS text))) > 0
    )`);
  }

  const txFrom = parseOptionalInt(q.transactionNumberFrom);
  const txTo = parseOptionalInt(q.transactionNumberTo);
  if (txFrom !== null) {
    params.push(txFrom);
    pushCond(`t."transactionNumber" >= $${pi++}`);
  }
  if (txTo !== null) {
    params.push(txTo);
    pushCond(`t."transactionNumber" <= $${pi++}`);
  }

  const remark = parseOptionalTrimmedString(q.remark);
  if (remark) {
    params.push(escapeLikeLiteral(remark));
    pushCond(`COALESCE(t."remark", '') LIKE '%' || $${pi++}::text || '%' ESCAPE '\\'`);
  }

  const woNumFrom = parseOptionalInt(q.workOrderNumberFrom);
  const woNumTo = parseOptionalInt(q.workOrderNumberTo);
  if (woNumFrom !== null || woNumTo !== null) {
    pushCond(`t."workOrderId" IS NOT NULL AND w."id" IS NOT NULL`);
    if (woNumFrom !== null) {
      params.push(woNumFrom);
      pushCond(`w."orderNumber" >= $${pi++}`);
    }
    if (woNumTo !== null) {
      params.push(woNumTo);
      pushCond(`w."orderNumber" <= $${pi++}`);
    }
  }

  const woTypesRaw = collectQueryStrings(q, "workOrderOrderType");
  const woTypes = woTypesRaw.filter(isWorkOrderType);
  if (woTypesRaw.length && woTypes.length !== woTypesRaw.length) {
    return { ok: false, status: 400, error: "invalid_work_order_order_type" };
  }
  if (woTypes.length) {
    pushCond(`t."workOrderId" IS NOT NULL AND w."id" IS NOT NULL`);
    params.push(woTypes);
    pushCond(`w."orderType" = ANY($${pi++}::text[])`);
  }

  const woStatusesRaw = collectQueryStrings(q, "workOrderStatus");
  const woStatuses = woStatusesRaw.filter(isWorkOrderStatus);
  if (woStatusesRaw.length && woStatuses.length !== woStatusesRaw.length) {
    return { ok: false, status: 400, error: "invalid_work_order_status" };
  }
  if (woStatuses.length) {
    pushCond(`t."workOrderId" IS NOT NULL AND w."id" IS NOT NULL`);
    params.push(woStatuses);
    pushCond(`w."status" = ANY($${pi++}::text[])`);
  }

  const workgroupTokens = collectQueryStrings(q, "workOrderWorkgroupId");
  if (workgroupTokens.length) {
    pushCond(`t."workOrderId" IS NOT NULL AND w."id" IS NOT NULL`);
    let wantMy = false;
    const uuidList: string[] = [];
    for (const t of workgroupTokens) {
      if (t === WORKGROUP_PSEUDO_MY) {
        wantMy = true;
        continue;
      }
      if (!isUuid(t)) return { ok: false, status: 400, error: "invalid_work_order_workgroup_id" };
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

  const employeeTokens = collectQueryStrings(q, "workOrderEmployeeId");
  if (employeeTokens.length) {
    pushCond(`t."workOrderId" IS NOT NULL AND w."id" IS NOT NULL`);
    const resolvedIds: string[] = [];
    let wantsMe = false;
    for (const t of employeeTokens) {
      if (t === EMPLOYEE_PSEUDO_ME) {
        wantsMe = true;
        continue;
      }
      if (!isUuid(t)) return { ok: false, status: 400, error: "invalid_work_order_employee_id" };
      resolvedIds.push(t);
    }
    if (wantsMe && sessionEmployeeId) resolvedIds.push(sessionEmployeeId);
    const uniq = [...new Set(resolvedIds)];
    if (uniq.length === 0) {
      pushCond(`FALSE`);
    } else {
      params.push(uniq);
      const idx = pi++;
      pushCond(`(
        w."responsibleEmployeeId" = ANY($${idx}::uuid[])
        OR EXISTS (
          SELECT 1 FROM "workOrderEmployeeAssignment" a
          WHERE a."workOrderId" = w."id"
            AND a."employeeId" = ANY($${idx}::uuid[])
        )
      )`);
    }
  }

  return { ok: true, conditions, params };
}
