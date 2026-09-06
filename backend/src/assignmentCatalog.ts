/** Assignment type catalog for the Zuweisungen app. */

export type AssignmentCardinality = "exclusive" | "share";

export type AssignmentTypeId =
  | "menu"
  | "search-preset"
  | "permission-template"
  | "dashboard"
  | "layout";

export type AssignmentTypeDef = {
  id: AssignmentTypeId;
  cardinality: AssignmentCardinality;
  enabled: boolean;
  sourcePath: string | null;
};

export const ASSIGNMENT_TYPES: AssignmentTypeDef[] = [
  {
    id: "menu",
    cardinality: "exclusive",
    enabled: true,
    sourcePath: "/customize-menu",
  },
  {
    id: "search-preset",
    cardinality: "share",
    enabled: true,
    sourcePath: "/suchkonfig",
  },
  {
    id: "permission-template",
    cardinality: "exclusive",
    enabled: true,
    sourcePath: "/berechtigungswesen",
  },
  {
    id: "dashboard",
    cardinality: "exclusive",
    enabled: false,
    sourcePath: null,
  },
  {
    id: "layout",
    cardinality: "exclusive",
    enabled: false,
    sourcePath: null,
  },
];

export function getAssignmentType(id: string): AssignmentTypeDef | null {
  return ASSIGNMENT_TYPES.find((t) => t.id === id) ?? null;
}

export function isAssignmentTypeId(value: unknown): value is AssignmentTypeId {
  return typeof value === "string" && ASSIGNMENT_TYPES.some((t) => t.id === value);
}
