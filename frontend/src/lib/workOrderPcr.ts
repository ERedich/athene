import { apiFetch } from "./api";
import { SITE_APP_PARAM_KEY_WO_PCR } from "./appParameterKeys";

export type PcrSelectOption = { label: string; value: string };

type SiteAppParameterRow = {
  key: string;
  jsonValue: unknown | null;
};

type NamedRow = { id: string; key: string; name: string; isActive?: boolean };

export async function fetchSitePcrOrderTypeKeys(siteId: string): Promise<string[]> {
  const res = await apiFetch(`/api/site-app-parameters?siteId=${encodeURIComponent(siteId)}`);
  if (!res.ok) return ["breakdown"];
  const rows = (await res.json()) as SiteAppParameterRow[];
  const woPcr = rows.find((r) => r.key === SITE_APP_PARAM_KEY_WO_PCR);
  if (!Array.isArray(woPcr?.jsonValue)) return ["breakdown"];
  return (woPcr.jsonValue as unknown[]).filter((k): k is string => typeof k === "string" && k.length > 0);
}

export function isPcrEnabledForOrderType(orderTypeKeys: string[], orderType: string): boolean {
  return orderTypeKeys.includes(orderType);
}

function toOptions(rows: NamedRow[]): PcrSelectOption[] {
  return rows
    .filter((r) => r.isActive !== false)
    .map((r) => ({ label: `${r.key} — ${r.name}`, value: r.id }));
}

export async function fetchPcrProblems(opts: {
  siteId: string;
  classificationId?: string | null;
}): Promise<PcrSelectOption[]> {
  const params = new URLSearchParams({
    siteId: opts.siteId,
    activeOnly: "true",
  });
  if (opts.classificationId) params.set("classificationId", opts.classificationId);
  const res = await apiFetch(`/api/problems?${params.toString()}`);
  if (!res.ok) throw new Error("load");
  return toOptions((await res.json()) as NamedRow[]);
}

export async function fetchPcrCauses(problemId: string): Promise<PcrSelectOption[]> {
  const params = new URLSearchParams({ problemId, activeOnly: "true" });
  const res = await apiFetch(`/api/causes?${params.toString()}`);
  if (!res.ok) throw new Error("load");
  return toOptions((await res.json()) as NamedRow[]);
}

export async function fetchPcrRemedies(causeId: string): Promise<PcrSelectOption[]> {
  const params = new URLSearchParams({ causeId, activeOnly: "true" });
  const res = await apiFetch(`/api/remedies?${params.toString()}`);
  if (!res.ok) throw new Error("load");
  return toOptions((await res.json()) as NamedRow[]);
}
