import { describe, expect, it } from "vitest";

import {
  SYSTEM_TOOLS,
  getSystemTool,
  isSystemToolId,
} from "./systemToolCatalog.js";

describe("systemToolCatalog", () => {
  it("marks banf-create disabled and generate-due enabled", () => {
    expect(getSystemTool("maintenance-plan-generate-due")?.enabled).toBe(true);
    expect(getSystemTool("banf-create")?.enabled).toBe(false);
    expect(SYSTEM_TOOLS).toHaveLength(2);
  });

  it("validates tool ids", () => {
    expect(isSystemToolId("maintenance-plan-generate-due")).toBe(true);
    expect(isSystemToolId("banf-create")).toBe(true);
    expect(isSystemToolId("nope")).toBe(false);
  });
});
