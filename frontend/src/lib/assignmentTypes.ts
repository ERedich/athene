export type AssignmentTypeId = "menu" | "search-preset" | "dashboard" | "layout";

export type AssignmentCardinality = "exclusive" | "share";

export type AssignmentCatalogItem = {
  id: AssignmentTypeId;
  cardinality: AssignmentCardinality;
  enabled: boolean;
  sourcePath: string | null;
  recordCount: number;
  assignedUserCount: number;
  userCount: number;
};

export type AssignmentRecord = {
  id: string;
  key: string;
  name: string;
  assignedUserCount: number;
  sourcePath: string;
  ownerLoginName?: string;
};

export type AssignmentConflict = {
  userId: string;
  currentRecordId: string;
  currentName: string;
};

export type AssignmentRecordUsers = {
  assignedUserIds: string[];
  conflicts: AssignmentConflict[];
};

export type AssignmentDirectoryUser = {
  id: string;
  loginName: string;
  name: string;
  workingSiteId: string;
  workingSiteKey: string;
  workingSiteName: string;
  workingSiteColorHex: string;
  employeeId: string | null;
  menuConfigId: string | null;
  menuConfigKey: string | null;
  menuConfigName: string | null;
  searchPresetShareCount: number;
};

export type AssignmentUserDetail = {
  id: string;
  loginName: string;
  name: string;
  menu: { id: string; key: string | null; name: string | null } | null;
  searchPresets: Array<{ id: string; name: string; ownerLoginName: string }>;
};

export type AssignMode = "set" | "add" | "remove";

export type AssignPayload =
  | { mode: AssignMode; userIds: string[] }
  | { mode: AssignMode; siteId: string }
  | { mode: AssignMode; workgroupId: string }
  | { mode: AssignMode; all: true };

export type AssignResult = {
  ok: true;
  userIds: string[];
  skippedWithoutEmployee: number;
  selfAffected: boolean;
};

export const ASSIGNMENT_TYPE_LABEL_KEYS: Record<AssignmentTypeId, string> = {
  menu: "assignments.typeMenu",
  "search-preset": "assignments.typeSearchPreset",
  dashboard: "assignments.typeDashboard",
  layout: "assignments.typeLayout",
};

export function isAssignmentTypeId(value: string | undefined): value is AssignmentTypeId {
  return (
    value === "menu" ||
    value === "search-preset" ||
    value === "dashboard" ||
    value === "layout"
  );
}

export function isEnabledAssignmentType(
  value: string | undefined,
): value is "menu" | "search-preset" {
  return value === "menu" || value === "search-preset";
}
