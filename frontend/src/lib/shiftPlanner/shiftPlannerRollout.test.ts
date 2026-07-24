import { describe, expect, it } from "vitest";

import { countRolloutDays, enumerateShiftAssignmentDates } from "./shiftPlannerRollout";
import { assignmentDateForBlock, shiftBlockQueryParams } from "./shiftBlockWindow";
import type { ShiftCalendarBlock } from "./shiftCalendarTypes";

describe("enumerateShiftAssignmentDates", () => {
  it("returns only matching weekdays in the inclusive range", () => {
    const dates = enumerateShiftAssignmentDates("2026-07-20", "2026-07-26", ["mon", "wed", "fri"]);
    expect(dates).toEqual(["2026-07-20", "2026-07-22", "2026-07-24"]);
  });

  it("returns a single day when from equals to and weekday matches", () => {
    expect(enumerateShiftAssignmentDates("2026-07-21", "2026-07-21", ["tue"])).toEqual([
      "2026-07-21",
    ]);
  });

  it("returns empty when no weekdays match", () => {
    expect(enumerateShiftAssignmentDates("2026-07-20", "2026-07-22", ["sat"])).toEqual([]);
  });
});

describe("countRolloutDays", () => {
  it("counts enumerated assignment days", () => {
    expect(countRolloutDays("2026-07-20", "2026-08-02", ["mon", "tue", "wed", "thu", "fri"])).toBe(
      10,
    );
  });
});

describe("assignmentDateForBlock / shiftBlockQueryParams", () => {
  it("maps morning segments one day back", () => {
    expect(
      assignmentDateForBlock({ date: "2026-07-21", segmentKind: "morning" }),
    ).toBe("2026-07-20");
  });

  it("keeps full/evening on the block date", () => {
    expect(assignmentDateForBlock({ date: "2026-07-20", segmentKind: "evening" })).toBe(
      "2026-07-20",
    );
    expect(assignmentDateForBlock({ date: "2026-07-20", segmentKind: "full" })).toBe(
      "2026-07-20",
    );
  });

  it("builds KPI query params including segmentKind", () => {
    const block: ShiftCalendarBlock = {
      id: "s:2026-07-20",
      date: "2026-07-20",
      shiftId: "shift-1",
      shiftKey: "NS",
      shiftName: "Nacht",
      shortCode: "NS",
      colorHex: "#000",
      startTime: "22:00",
      endTime: "24:00",
      assignments: [],
      segmentKind: "evening",
    };
    expect(shiftBlockQueryParams(block)).toBe(
      "shiftId=shift-1&date=2026-07-20&segmentKind=evening",
    );
  });
});
