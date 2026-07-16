import type { QueryResultRow } from "pg";

import { siteAccessSql, type SiteAccessClient } from "./siteAccess.js";
import {
  getEntityDef,
  getFieldDef,
  type KpiDefinition,
  type KpiDisplay,
  type KpiFilter,
  type KpiStyle,
  type KpiTimePreset,
} from "./kpiSemanticRegistry.js";

export type KpiEvaluateResult = {
  total: number;
  series?: { key: string; label: string; value: number }[];
  rows?: Record<string, unknown>[];
};

type BoundQuery = { text: string; values: unknown[] };

function resolveTimeBounds(preset: KpiTimePreset): { start: Date | null; end: Date | null } {
  const now = new Date();
  if (preset === "all") return { start: null, end: null };

  if (preset === "last24h") {
    return { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now };
  }
  if (preset === "last7d") {
    return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now };
  }
  if (preset === "last30d") {
    return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: now };
  }
  if (preset === "thisMonth") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { start, end: now };
  }
  // lastMonth
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function pushParam(values: unknown[], value: unknown): string {
  values.push(value);
  return `$${values.length}`;
}

function appendFilter(
  filter: KpiFilter,
  entityId: KpiDefinition["entity"],
  whereParts: string[],
  values: unknown[],
): boolean {
  const fieldDef = getFieldDef(entityId, filter.field);
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

function measureSql(definition: KpiDefinition): string | null {
  if (definition.measure.op === "count") return "COUNT(*)::float";
  const fieldId = definition.measure.field;
  if (!fieldId) return null;
  const fieldDef = getFieldDef(definition.entity, fieldId);
  if (!fieldDef?.measurable) return null;
  if (definition.measure.op === "sum") return `COALESCE(SUM(${fieldDef.sql}), 0)::float`;
  if (definition.measure.op === "avg") return `COALESCE(AVG(${fieldDef.sql}), 0)::float`;
  return null;
}

function buildWhere(
  definition: KpiDefinition,
  userId: string,
  siteId: string | null,
  values: unknown[],
): string[] | null {
  const entityDef = getEntityDef(definition.entity);
  const whereParts: string[] = [];

  const userParam = pushParam(values, userId);
  whereParts.push(siteAccessSql(`e."${entityDef.siteColumn}"`, userParam));

  if (siteId) {
    whereParts.push(`e."${entityDef.siteColumn}" = ${pushParam(values, siteId)}::uuid`);
  }

  for (const filter of definition.filters) {
    if (!appendFilter(filter, definition.entity, whereParts, values)) return null;
  }

  if (definition.timeRange && definition.timeRange.preset !== "all") {
    const fieldDef = getFieldDef(definition.entity, definition.timeRange.field);
    if (!fieldDef?.timeable) return null;
    const { start, end } = resolveTimeBounds(definition.timeRange.preset);
    if (start) whereParts.push(`${fieldDef.sql} >= ${pushParam(values, start.toISOString())}::timestamptz`);
    if (end) whereParts.push(`${fieldDef.sql} < ${pushParam(values, end.toISOString())}::timestamptz`);
  }

  return whereParts;
}

function buildAggregateQuery(
  definition: KpiDefinition,
  userId: string,
  siteId: string | null,
): BoundQuery | null {
  const entityDef = getEntityDef(definition.entity);
  const measure = measureSql(definition);
  if (!measure) return null;

  const values: unknown[] = [];
  const whereParts = buildWhere(definition, userId, siteId, values);
  if (!whereParts) return null;

  const groupById = definition.groupBy ?? null;
  if (groupById) {
    const groupField = getFieldDef(definition.entity, groupById);
    if (!groupField?.groupable) return null;
    const text = `
      SELECT ${groupField.sql}::text AS "key",
             COALESCE(${groupField.sql}::text, '') AS "label",
             ${measure} AS "value"
      FROM "${entityDef.table}" e
      WHERE ${whereParts.join(" AND ")}
      GROUP BY ${groupField.sql}
      ORDER BY "value" DESC
      LIMIT 50
    `;
    return { text, values };
  }

  const text = `
    SELECT ${measure} AS "total"
    FROM "${entityDef.table}" e
    WHERE ${whereParts.join(" AND ")}
  `;
  return { text, values };
}

function buildTableQuery(
  definition: KpiDefinition,
  userId: string,
  siteId: string | null,
  rowLimit: number,
): BoundQuery | null {
  const entityDef = getEntityDef(definition.entity);
  const values: unknown[] = [];
  const whereParts = buildWhere(definition, userId, siteId, values);
  if (!whereParts) return null;

  const selectCols = entityDef.fields
    .slice(0, 8)
    .map((f) => `${f.sql} AS "${f.id}"`)
    .join(", ");

  const limit = Math.min(50, Math.max(5, Math.round(rowLimit)));
  const text = `
    SELECT e."id"::text AS "id", ${selectCols}
    FROM "${entityDef.table}" e
    WHERE ${whereParts.join(" AND ")}
    ORDER BY e."createdAt" DESC NULLS LAST
    LIMIT ${limit}
  `;
  return { text, values };
}

function buildSparklineQuery(
  definition: KpiDefinition,
  userId: string,
  siteId: string | null,
): BoundQuery | null {
  const entityDef = getEntityDef(definition.entity);
  const measure = measureSql(definition);
  if (!measure) return null;

  const timeFieldId = definition.timeRange?.field ?? entityDef.fields.find((f) => f.timeable)?.id;
  if (!timeFieldId) return null;
  const timeField = getFieldDef(definition.entity, timeFieldId);
  if (!timeField?.timeable) return null;

  const values: unknown[] = [];
  const whereParts = buildWhere(definition, userId, siteId, values);
  if (!whereParts) return null;

  // Last 7 UTC calendar days bucketed
  whereParts.push(`${timeField.sql} >= (date_trunc('day', now() AT TIME ZONE 'UTC') - interval '6 days')`);
  whereParts.push(`${timeField.sql} < (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day')`);

  const text = `
    SELECT to_char(date_trunc('day', ${timeField.sql} AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "key",
           to_char(date_trunc('day', ${timeField.sql} AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "label",
           ${measure} AS "value"
    FROM "${entityDef.table}" e
    WHERE ${whereParts.join(" AND ")}
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `;
  return { text, values };
}

export async function evaluateKpiDefinition(
  client: SiteAccessClient,
  userId: string,
  definition: KpiDefinition,
  style: KpiStyle,
  options?: { siteId?: string | null },
): Promise<KpiEvaluateResult | null> {
  const siteId = options?.siteId ?? null;
  const display: KpiDisplay = style.display;

  if (display === "table") {
    const q = buildTableQuery(definition, userId, siteId, style.rowLimit ?? 10);
    if (!q) return null;
    const { rows } = await client.query<QueryResultRow>(q.text, q.values);
    const agg = buildAggregateQuery(
      { ...definition, groupBy: null },
      userId,
      siteId,
    );
    let total = rows.length;
    if (agg) {
      const { rows: totRows } = await client.query<{ total: number }>(agg.text, agg.values);
      total = Number(totRows[0]?.total ?? 0);
    }
    return {
      total,
      rows: rows.map((r) => ({ ...r })),
    };
  }

  if (display === "sparkline" && !definition.groupBy) {
    const q = buildSparklineQuery(definition, userId, siteId);
    if (!q) return null;
    const { rows } = await client.query<{ key: string; label: string; value: number }>(
      q.text,
      q.values,
    );
    const byDay = new Map(rows.map((r) => [r.key, Number(r.value)]));
    const series: { key: string; label: string; value: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const key = d.toISOString().slice(0, 10);
      series.push({ key, label: key, value: byDay.get(key) ?? 0 });
    }
    const total = series.reduce((s, x) => s + x.value, 0);
    return { total, series };
  }

  const q = buildAggregateQuery(definition, userId, siteId);
  if (!q) return null;

  if (definition.groupBy) {
    const { rows } = await client.query<{ key: string; label: string; value: number }>(
      q.text,
      q.values,
    );
    const series = rows.map((r) => ({
      key: r.key ?? "",
      label: r.label || r.key || "(empty)",
      value: Number(r.value) || 0,
    }));
    const total = series.reduce((s, x) => s + x.value, 0);
    return { total, series };
  }

  const { rows } = await client.query<{ total: number }>(q.text, q.values);
  return { total: Number(rows[0]?.total ?? 0) };
}
