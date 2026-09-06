/** Procedure catalog for the Systemwerkzeuge app. */

export type SystemToolId = "maintenance-plan-generate-due" | "banf-create";

export type SystemToolDef = {
  id: SystemToolId;
  enabled: boolean;
};

export const SYSTEM_TOOLS: SystemToolDef[] = [
  {
    id: "maintenance-plan-generate-due",
    enabled: true,
  },
  {
    id: "banf-create",
    enabled: false,
  },
];

export function getSystemTool(id: string): SystemToolDef | null {
  return SYSTEM_TOOLS.find((t) => t.id === id) ?? null;
}

export function isSystemToolId(value: unknown): value is SystemToolId {
  return typeof value === "string" && SYSTEM_TOOLS.some((t) => t.id === value);
}
