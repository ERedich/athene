import { apiFetch } from "./api";
import type { MaintenancePlan } from "./maintenancePlanTypes";

export async function fetchMaintenancePlanById(id: string): Promise<MaintenancePlan | null> {
  const res = await apiFetch(`/api/maintenance-plans/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`maintenance_plan_fetch_failed_${res.status}`);
  return (await res.json()) as MaintenancePlan;
}

export async function fetchMaintenancePlans(): Promise<MaintenancePlan[]> {
  const res = await apiFetch("/api/maintenance-plans");
  if (!res.ok) throw new Error(`maintenance_plans_fetch_failed_${res.status}`);
  const data = (await res.json()) as MaintenancePlan[];
  return Array.isArray(data) ? data : [];
}
