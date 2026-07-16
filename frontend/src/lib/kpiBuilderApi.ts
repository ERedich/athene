import { apiFetch } from "./api";

export type KpiEntity = "workOrder" | "transaction" | "asset" | "sparePart";
export type KpiMeasureOp = "count" | "sum" | "avg";
export type KpiFilterOp = "eq" | "neq" | "in" | "notIn" | "isNull" | "gt" | "gte" | "lt" | "lte";
export type KpiTimePreset = "last24h" | "last7d" | "last30d" | "thisMonth" | "lastMonth" | "all";
export type KpiDisplay = "value" | "sparkline" | "bar" | "pie" | "table";
export type KpiAccent = "green" | "blue" | "amber" | "teal";
export type KpiCategory = "workOrders" | "transactions" | "warehouse" | "feedback";

export type KpiMeasure = { op: KpiMeasureOp; field?: string };
export type KpiFilter = { field: string; op: KpiFilterOp; value?: unknown };
export type KpiTimeRange = { field: string; preset: KpiTimePreset };

export type KpiDefinition = {
  entity: KpiEntity;
  measure: KpiMeasure;
  filters: KpiFilter[];
  groupBy?: string | null;
  timeRange?: KpiTimeRange | null;
  category?: KpiCategory;
};

export type KpiDeeplink = {
  app: "monitoring" | "transactions" | "assets" | "spare-parts";
  params?: Record<string, string | string[]>;
};

export type KpiStyle = {
  display: KpiDisplay;
  accent?: KpiAccent;
  showLegend?: boolean;
  showAxes?: boolean;
  showTooltip?: boolean;
  valueSuffix?: string;
  rowLimit?: number;
  deeplink?: KpiDeeplink | null;
};

export type CustomKpi = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  definition: KpiDefinition;
  style: KpiStyle;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type KpiMetaField = {
  id: string;
  type: string;
  filterable: boolean;
  groupable: boolean;
  measurable: boolean;
  timeable: boolean;
  enumValues?: string[];
};

export type KpiMetaEntity = {
  id: KpiEntity;
  defaultCategory: KpiCategory;
  fields: KpiMetaField[];
};

export type KpiMeta = {
  entities: KpiMetaEntity[];
  measureOps: KpiMeasureOp[];
  filterOps: KpiFilterOp[];
  timePresets: KpiTimePreset[];
  displays: KpiDisplay[];
  accents: KpiAccent[];
  categories: KpiCategory[];
};

export type KpiEvaluateResult = {
  total: number;
  series?: { key: string; label: string; value: number }[];
  rows?: Record<string, unknown>[];
};

export type KpiEvaluateEntry = {
  id: string;
  name: string;
  style: KpiStyle | null;
  definition: KpiDefinition | null;
  result: KpiEvaluateResult | null;
  error?: string;
};

export type CustomKpiWritePayload = {
  key: string;
  name: string;
  siteId: string;
  definition: KpiDefinition;
  style: KpiStyle;
  isActive: boolean;
};

export function customKpiSlotId(id: string): string {
  return `custom:${id}`;
}

export function parseCustomKpiSlotId(slotId: string): string | null {
  if (!slotId.startsWith("custom:")) return null;
  const uuid = slotId.slice("custom:".length);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    return null;
  }
  return uuid;
}

export async function fetchKpiMeta(): Promise<KpiMeta> {
  const r = await apiFetch("/api/custom-kpis/meta");
  if (!r.ok) throw new Error(`kpi_meta_${r.status}`);
  return (await r.json()) as KpiMeta;
}

export async function fetchCustomKpis(opts?: {
  siteId?: string;
  activeOnly?: boolean;
}): Promise<CustomKpi[]> {
  const params = new URLSearchParams();
  if (opts?.siteId) params.set("siteId", opts.siteId);
  if (opts?.activeOnly) params.set("activeOnly", "1");
  const q = params.toString();
  const r = await apiFetch(`/api/custom-kpis${q ? `?${q}` : ""}`);
  if (!r.ok) throw new Error(`custom_kpis_list_${r.status}`);
  return (await r.json()) as CustomKpi[];
}

export async function fetchCustomKpi(id: string): Promise<CustomKpi> {
  const r = await apiFetch(`/api/custom-kpis/${id}`);
  if (!r.ok) throw new Error(`custom_kpi_detail_${r.status}`);
  return (await r.json()) as CustomKpi;
}

export async function createCustomKpi(payload: CustomKpiWritePayload): Promise<CustomKpi> {
  const r = await apiFetch("/api/custom-kpis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`custom_kpi_create_${r.status}`);
  return (await r.json()) as CustomKpi;
}

export async function updateCustomKpi(
  id: string,
  payload: CustomKpiWritePayload,
): Promise<CustomKpi> {
  const r = await apiFetch(`/api/custom-kpis/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`custom_kpi_patch_${r.status}`);
  return (await r.json()) as CustomKpi;
}

export async function deleteCustomKpi(id: string): Promise<void> {
  const r = await apiFetch(`/api/custom-kpis/${id}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`custom_kpi_delete_${r.status}`);
}

export async function previewCustomKpi(payload: {
  siteId?: string;
  definition: KpiDefinition;
  style: KpiStyle;
}): Promise<KpiEvaluateResult> {
  const r = await apiFetch("/api/custom-kpis/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`custom_kpi_preview_${r.status}`);
  return (await r.json()) as KpiEvaluateResult;
}

export async function evaluateCustomKpis(
  ids: string[],
): Promise<Record<string, KpiEvaluateEntry>> {
  if (ids.length === 0) return {};
  const r = await apiFetch("/api/custom-kpis/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!r.ok) throw new Error(`custom_kpi_evaluate_${r.status}`);
  const data = (await r.json()) as { results: Record<string, KpiEvaluateEntry> };
  return data.results ?? {};
}

export function defaultKpiDefinition(entity: KpiEntity = "workOrder"): KpiDefinition {
  return {
    entity,
    measure: { op: "count" },
    filters: [],
    groupBy: null,
    timeRange: { field: "createdAt", preset: "last7d" },
    category: entity === "transaction" ? "transactions" : entity === "sparePart" ? "warehouse" : "workOrders",
  };
}

export function defaultKpiStyle(): KpiStyle {
  return {
    display: "value",
    accent: "green",
    showLegend: true,
    showAxes: false,
    showTooltip: false,
    valueSuffix: "",
    rowLimit: 10,
    deeplink: null,
  };
}
