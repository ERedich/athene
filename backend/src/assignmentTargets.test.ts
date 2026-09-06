import { describe, expect, it } from "vitest";

import { ASSIGNMENT_TYPES, getAssignmentType, isAssignmentTypeId } from "./assignmentCatalog.js";
import {
  applyShareMode,
  expandAll,
  expandByWorkgroup,
  expandByWorkingSite,
  normalizeExclusiveMode,
  type AssignmentUserRow,
} from "./assignmentTargets.js";

const users: AssignmentUserRow[] = [
  { id: "u1", workingSiteId: "site-a", employeeId: "e1" },
  { id: "u2", workingSiteId: "site-a", employeeId: null },
  { id: "u3", workingSiteId: "site-b", employeeId: "e2" },
  { id: "u4", workingSiteId: "site-b", employeeId: "e3" },
];

describe("assignmentCatalog", () => {
  it("marks dashboard and layout disabled", () => {
    expect(getAssignmentType("dashboard")?.enabled).toBe(false);
    expect(getAssignmentType("layout")?.enabled).toBe(false);
    expect(getAssignmentType("menu")?.enabled).toBe(true);
    expect(getAssignmentType("search-preset")?.enabled).toBe(true);
    expect(getAssignmentType("permission-template")?.enabled).toBe(true);
    expect(getAssignmentType("permission-template")?.cardinality).toBe("exclusive");
    expect(ASSIGNMENT_TYPES).toHaveLength(5);
  });

  it("validates type ids", () => {
    expect(isAssignmentTypeId("menu")).toBe(true);
    expect(isAssignmentTypeId("permission-template")).toBe(true);
    expect(isAssignmentTypeId("nope")).toBe(false);
  });
});

describe("expandByWorkingSite", () => {
  it("uses workingSiteId only", () => {
    const r = expandByWorkingSite(users, "site-a");
    expect(r.userIds.sort()).toEqual(["u1", "u2"]);
    expect(r.skippedWithoutEmployee).toBe(0);
  });
});

describe("expandByWorkgroup", () => {
  it("skips users without employee", () => {
    const r = expandByWorkgroup(users, new Set(["e1", "e2"]));
    expect(r.userIds.sort()).toEqual(["u1", "u3"]);
    expect(r.skippedWithoutEmployee).toBe(1);
  });
});

describe("expandAll", () => {
  it("returns all visible users", () => {
    expect(expandAll(users).userIds).toEqual(["u1", "u2", "u3", "u4"]);
  });
});

describe("normalizeExclusiveMode", () => {
  it("treats add as set", () => {
    expect(normalizeExclusiveMode("add")).toBe("set");
    expect(normalizeExclusiveMode("set")).toBe("set");
    expect(normalizeExclusiveMode("remove")).toBe("remove");
  });
});

describe("applyShareMode", () => {
  it("set replaces and excludes actor", () => {
    expect(applyShareMode(["a", "b"], ["b", "c", "actor"], "set", "actor").sort()).toEqual([
      "b",
      "c",
    ]);
  });

  it("add and remove mutate", () => {
    expect(applyShareMode(["a"], ["b"], "add", "actor").sort()).toEqual(["a", "b"]);
    expect(applyShareMode(["a", "b"], ["a"], "remove", "actor")).toEqual(["b"]);
  });
});
