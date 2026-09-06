import { apiFetch } from "./api";
import type {
  GenerateDueResult,
  MaintenancePlanSweepStatus,
  SystemToolCatalogItem,
} from "./systemToolTypes";

export async function fetchSystemToolCatalog(): Promise<SystemToolCatalogItem[]> {
  const res = await apiFetch("/api/system-tools/catalog");
  if (!res.ok) throw new Error("catalog");
  return (await res.json()) as SystemToolCatalogItem[];
}

export async function fetchMaintenancePlanSweepStatus(): Promise<MaintenancePlanSweepStatus> {
  const res = await apiFetch("/api/maintenance-plans/sweep-status");
  if (!res.ok) throw new Error("sweep_status");
  return (await res.json()) as MaintenancePlanSweepStatus;
}

export async function postGenerateDueMaintenancePlans(): Promise<{
  results: GenerateDueResult[];
}> {
  const res = await apiFetch("/api/maintenance-plans/generate-due", { method: "POST" });
  if (!res.ok) throw new Error("generate_due");
  return (await res.json()) as { results: GenerateDueResult[] };
}
