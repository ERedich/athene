import { describe, expect, it } from "vitest";

import type { ShiftAssignment } from "./shiftCalendarTypes";
import { assignmentsForShiftAroundDate } from "./shiftOverview";

function assignment(overrides: Partial<ShiftAssignment> = {}): ShiftAssignment {
  return {
    id: "a1",
    employeeId: "e1",
    employeeKey: "E1",
    employeeName: "Müller",
    shiftId: "shift-1",
    assignmentDate: "2026-07-22",
    ...overrides,
  };
}

describe("assignmentsForShiftAroundDate", () => {
  it("groups employees for prev, current, and next day of the same shift", () => {
    const list = [
      assignment({ id: "p1", employeeName: "Prev", assignmentDate: "2026-07-21" }),
      assignment({ id: "c1", employeeName: "Current", assignmentDate: "2026-07-22" }),
      assignment({ id: "n1", employeeName: "Next", assignmentDate: "2026-07-23" }),
      assignment({
        id: "other",
        shiftId: "shift-2",
        employeeName: "OtherShift",
        assignmentDate: "2026-07-22",
      }),
    ];

    const result = assignmentsForShiftAroundDate(list, "shift-1", "2026-07-22");

    expect(result.prev.date).toBe("2026-07-21");
    expect(result.current.date).toBe("2026-07-22");
    expect(result.next.date).toBe("2026-07-23");
    expect(result.prev.assignments.map((a) => a.employeeName)).toEqual(["Prev"]);
    expect(result.current.assignments.map((a) => a.employeeName)).toEqual(["Current"]);
    expect(result.next.assignments.map((a) => a.employeeName)).toEqual(["Next"]);
  });

  it("returns empty lists when neighboring days have no assignments", () => {
    const result = assignmentsForShiftAroundDate(
      [assignment({ assignmentDate: "2026-07-22" })],
      "shift-1",
      "2026-07-22",
    );

    expect(result.prev.assignments).toEqual([]);
    expect(result.current.assignments).toHaveLength(1);
    expect(result.next.assignments).toEqual([]);
  });

  it("supports overnight center dates (assignment date of morning segment)", () => {
    // Morning segment on 2026-07-21 → assignmentDate 2026-07-20
    const result = assignmentsForShiftAroundDate(
      [
        assignment({ id: "a0", employeeName: "Sun", assignmentDate: "2026-07-19" }),
        assignment({ id: "a1", employeeName: "Mon", assignmentDate: "2026-07-20" }),
        assignment({ id: "a2", employeeName: "Tue", assignmentDate: "2026-07-21" }),
      ],
      "shift-1",
      "2026-07-20",
    );

    expect(result.prev.assignments.map((a) => a.employeeName)).toEqual(["Sun"]);
    expect(result.current.assignments.map((a) => a.employeeName)).toEqual(["Mon"]);
    expect(result.next.assignments.map((a) => a.employeeName)).toEqual(["Tue"]);
  });

  it("sorts employees by name within each day", () => {
    const result = assignmentsForShiftAroundDate(
      [
        assignment({ id: "a2", employeeName: "Zimmermann", assignmentDate: "2026-07-22" }),
        assignment({ id: "a1", employeeName: "Anders", assignmentDate: "2026-07-22" }),
      ],
      "shift-1",
      "2026-07-22",
    );

    expect(result.current.assignments.map((a) => a.employeeName)).toEqual([
      "Anders",
      "Zimmermann",
    ]);
  });
});
