/**
 * Pure helpers for expanding assignment bulk targets.
 * Site bulk uses workingSiteId only (not userSite membership).
 */

export type AssignmentUserRow = {
  id: string;
  workingSiteId: string;
  employeeId: string | null;
};

export type ExpandResult = {
  userIds: string[];
  skippedWithoutEmployee: number;
};

export function expandByWorkingSite(
  users: AssignmentUserRow[],
  siteId: string,
): ExpandResult {
  const userIds = users.filter((u) => u.workingSiteId === siteId).map((u) => u.id);
  return { userIds, skippedWithoutEmployee: 0 };
}

export function expandByWorkgroup(
  users: AssignmentUserRow[],
  workgroupEmployeeIds: Set<string>,
): ExpandResult {
  let skippedWithoutEmployee = 0;
  const userIds: string[] = [];
  for (const u of users) {
    if (!u.employeeId) {
      skippedWithoutEmployee += 1;
      continue;
    }
    if (workgroupEmployeeIds.has(u.employeeId)) {
      userIds.push(u.id);
    }
  }
  return { userIds, skippedWithoutEmployee };
}

export function expandAll(users: AssignmentUserRow[]): ExpandResult {
  return { userIds: users.map((u) => u.id), skippedWithoutEmployee: 0 };
}

export type AssignMode = "set" | "add" | "remove";

export function isAssignMode(value: unknown): value is AssignMode {
  return value === "set" || value === "add" || value === "remove";
}

/** Exclusive menu: add is treated as set for this record. */
export function normalizeExclusiveMode(mode: AssignMode): "set" | "remove" {
  return mode === "remove" ? "remove" : "set";
}

/**
 * Share set replaces the share list (excluding actor from targets).
 * Returns next share user ids after applying mode to current shares.
 */
export function applyShareMode(
  currentShareUserIds: string[],
  targets: string[],
  mode: AssignMode,
  actorUserId: string,
): string[] {
  const filteredTargets = targets.filter((id) => id !== actorUserId);
  if (mode === "set") {
    return [...new Set(filteredTargets)];
  }
  const set = new Set(currentShareUserIds.filter((id) => id !== actorUserId));
  if (mode === "add") {
    for (const id of filteredTargets) set.add(id);
  } else {
    for (const id of filteredTargets) set.delete(id);
  }
  return [...set];
}
