/** Sentinel for the calendar quick filter “ohne Fachgruppe / no work group”. */
export const WORKGROUP_FILTER_NONE = "__NO_WORKGROUP__";

export function hasNoWorkgroup(workgroupId: string | null | undefined): boolean {
  return workgroupId == null || workgroupId.trim() === "";
}

export function matchesWorkgroupFilter(
  workgroupId: string | null | undefined,
  workgroupFilterId: string | null,
): boolean {
  if (!workgroupFilterId) return true;
  if (workgroupFilterId === WORKGROUP_FILTER_NONE) return hasNoWorkgroup(workgroupId);
  return workgroupId === workgroupFilterId;
}
