import { describe, expect, it } from "vitest";

import { attachAssignmentsToBlocks, buildBlocksWithAssignments } from "./shiftPlannerMerge";
import type { ShiftAssignment, ShiftCalendarBlock } from "./shiftCalendarTypes";

function block(
  overrides: Partial<Omit<ShiftCalendarBlock, "assignments">> & { assignments?: ShiftAssignment[] } = {},
): Omit<ShiftCalendarBlock, "assignments"> {
  const { assignments: _assignments, ...rest } = overrides;
  return {
    id: "shift-1:2026-07-21",
    date: "2026-07-21",
    shiftId: "shift-1",
    shiftKey: "NS",
    shiftName: "Nacht",
    shortCode: "NS",
    colorHex: "#111",
    startTime: "00:00",
    endTime: "06:00",
    segmentKind: "morning",
    ...rest,
  };
}

function assignment(overrides: Partial<ShiftAssignment> = {}): ShiftAssignment {
  return {
    id: "a1",
    employeeId: "e1",
    employeeKey: "E1",
    employeeName: "Müller",
    shiftId: "shift-1",
    assignmentDate: "2026-07-20",
    ...overrides,
  };
}

describe("attachAssignmentsToBlocks", () => {
  it("maps morning segments to the previous calendar day's assignment", () => {
    const morning = block({ segmentKind: "morning", date: "2026-07-21" });
    const result = attachAssignmentsToBlocks([morning], [assignment()]);
    expect(result[0]!.assignments).toHaveLength(1);
    expect(result[0]!.assignments[0]!.employeeName).toBe("Müller");
  });

  it("maps full and evening segments to the block date", () => {
    const evening = block({
      id: "shift-1:2026-07-20",
      date: "2026-07-20",
      startTime: "22:00",
      endTime: "24:00",
      segmentKind: "evening",
    });
    const result = attachAssignmentsToBlocks(
      [evening],
      [assignment({ assignmentDate: "2026-07-20" })],
    );
    expect(result[0]!.assignments).toHaveLength(1);
  });

  it("sorts assigned employees by name", () => {
    const day = block({
      date: "2026-07-20",
      segmentKind: "full",
      startTime: "06:00",
      endTime: "14:00",
    });
    const result = attachAssignmentsToBlocks(
      [day],
      [
        assignment({ id: "a2", employeeName: "Zimmermann", assignmentDate: "2026-07-20" }),
        assignment({ id: "a1", employeeName: "Anders", assignmentDate: "2026-07-20" }),
      ],
    );
    expect(result[0]!.assignments.map((a) => a.employeeName)).toEqual([
      "Anders",
      "Zimmermann",
    ]);
  });

  it("leaves blocks without matching assignments empty", () => {
    const day = block({ date: "2026-07-22", segmentKind: "full" });
    const result = buildBlocksWithAssignments([day], [assignment()]);
    expect(result[0]!.assignments).toEqual([]);
  });
});
