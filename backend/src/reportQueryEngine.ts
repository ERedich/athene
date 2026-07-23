import type { QueryResultRow } from "pg";

import { siteAccessSql, type SiteAccessClient } from "./siteAccess.js";
import {
  getReportEntityDef,
  getReportFieldDef,
  type ReportFilter,
  type ReportQueryDefinition,
} from "./reportSemanticRegistry.js";

export type ReportQueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
};

type BoundQuery = { text: string; values: unknown[] };

function pushParam(values: unknown[], value: unknown): string {
  values.push(value);
  return `$${values.length}`;
}

function appendFilter(
  filter: ReportFilter,
  entityId: ReportQueryDefinition["entity"],
  whereParts: string[],
  values: unknown[],
): boolean {
  const fieldDef = getReportFieldDef(entityId, filter.field);
  if (!fieldDef?.filterable) return false;
  const col = fieldDef.sql;

  if (filter.op === "isNull") {
    whereParts.push(`${col} IS NULL`);
    return true;
  }
  if (filter.op === "eq") {
    whereParts.push(`${col} = ${pushParam(values, filter.value)}`);
    return true;
  }
  if (filter.op === "neq") {
    whereParts.push(`${col} IS DISTINCT FROM ${pushParam(values, filter.value)}`);
    return true;
  }
  if (filter.op === "contains") {
    whereParts.push(`${col}::text ILIKE ${pushParam(values, `%${String(filter.value ?? "")}%`)}`);
    return true;
  }
  if (filter.op === "gt" || filter.op === "gte" || filter.op === "lt" || filter.op === "lte") {
    const opMap = { gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
    whereParts.push(`${col} ${opMap[filter.op]} ${pushParam(values, filter.value)}`);
    return true;
  }
  if (filter.op === "in" || filter.op === "notIn") {
    if (!Array.isArray(filter.value) || filter.value.length === 0) return false;
    const placeholders = filter.value.map((v) => pushParam(values, v)).join(", ");
    whereParts.push(
      filter.op === "in" ? `${col} IN (${placeholders})` : `${col} NOT IN (${placeholders})`,
    );
    return true;
  }
  return false;
}

function buildWhere(
  definition: ReportQueryDefinition,
  userId: string,
  siteId: string | null,
  values: unknown[],
): string[] | null {
  const entityDef = getReportEntityDef(definition.entity);
  const whereParts: string[] = [];

  const userParam = pushParam(values, userId);
  whereParts.push(siteAccessSql(`e."${entityDef.siteColumn}"`, userParam));

  if (siteId) {
    whereParts.push(`e."${entityDef.siteColumn}" = ${pushParam(values, siteId)}::uuid`);
  }

  for (const filter of definition.filters) {
    if (!appendFilter(filter, definition.entity, whereParts, values)) return null;
  }

  return whereParts;
}

function buildSelectQuery(
  definition: ReportQueryDefinition,
  userId: string,
  siteId: string | null,
): BoundQuery | null {
  const entityDef = getReportEntityDef(definition.entity);
  const values: unknown[] = [];
  const whereParts = buildWhere(definition, userId, siteId, values);
  if (!whereParts) return null;

  const selectCols = definition.fields
    .map((fieldId) => {
      const fieldDef = getReportFieldDef(definition.entity, fieldId);
      if (!fieldDef?.selectable) return null;
      return `${fieldDef.sql} AS "${fieldId}"`;
    })
    .filter((x): x is string => Boolean(x));

  if (selectCols.length === 0) return null;

  const orderParts: string[] = [];
  for (const sort of definition.sort) {
    const fieldDef = getReportFieldDef(definition.entity, sort.field);
    if (!fieldDef?.sortable) continue;
    orderParts.push(`${fieldDef.sql} ${sort.dir === "asc" ? "ASC" : "DESC"} NULLS LAST`);
  }
  if (orderParts.length === 0) {
    orderParts.push('e."createdAt" DESC NULLS LAST');
  }

  const limit = Math.min(500, Math.max(1, Math.round(definition.rowLimit)));
  const text = `
    SELECT e."id"::text AS "id", ${selectCols.join(", ")}
    ${entityDef.fromSql}
    WHERE ${whereParts.join(" AND ")}
    ORDER BY ${orderParts.join(", ")}
    LIMIT ${limit}
  `;
  return { text, values };
}

function buildCountQuery(
  definition: ReportQueryDefinition,
  userId: string,
  siteId: string | null,
): BoundQuery | null {
  const entityDef = getReportEntityDef(definition.entity);
  const values: unknown[] = [];
  const whereParts = buildWhere(definition, userId, siteId, values);
  if (!whereParts) return null;
  const text = `
    SELECT COUNT(*)::int AS "total"
    ${entityDef.fromSql}
    WHERE ${whereParts.join(" AND ")}
  `;
  return { text, values };
}

function normalizeCell(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  return value;
}

export async function executeReportQuery(
  client: SiteAccessClient,
  userId: string,
  definition: ReportQueryDefinition,
  options?: { siteId?: string | null },
): Promise<ReportQueryResult | null> {
  const siteId = options?.siteId ?? null;
  const selectQ = buildSelectQuery(definition, userId, siteId);
  const countQ = buildCountQuery(definition, userId, siteId);
  if (!selectQ || !countQ) return null;

  const [{ rows }, countRes] = await Promise.all([
    client.query<QueryResultRow>(selectQ.text, selectQ.values),
    client.query<{ total: number }>(countQ.text, countQ.values),
  ]);

  return {
    columns: ["id", ...definition.fields],
    rows: rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        out[key] = normalizeCell(value);
      }
      return out;
    }),
    total: Number(countRes.rows[0]?.total ?? 0),
  };
}
