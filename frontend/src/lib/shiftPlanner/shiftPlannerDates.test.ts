import { afterEach, describe, expect, it, vi } from "vitest";

import { canAssignEmployeeOnDate } from "./shiftPlannerDates";
import {
  contrastTextOnBackground,
  groupShiftsByDate,
  normalizeColorHex,
} from "./shiftCalendarLayout";
import type { ShiftCalendarBlock } from "./shiftCalendarTypes";

describe("canAssignEmployeeOnDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows today and future dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 20, 15, 0, 0));
    expect(canAssignEmployeeOnDate("2026-07-20")).toBe(true);
    expect(canAssignEmployeeOnDate("2026-07-21")).toBe(true);
  });

  it("rejects past dates and invalid input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 20, 15, 0, 0));
    expect(canAssignEmployeeOnDate("2026-07-19")).toBe(false);
    expect(canAssignEmployeeOnDate("not-a-date")).toBe(false);
  });
});

describe("groupShiftsByDate", () => {
  it("groups and sorts blocks within each day", () => {
    const blocks: ShiftCalendarBlock[] = [
      {
        id: "2",
        date: "2026-07-20",
        shiftId: "b",
        shiftKey: "SS",
        shiftName: "Spät",
        shortCode: "SS",
        colorHex: "#f00",
        startTime: "14:00",
        endTime: "22:00",
        assignments: [],
      },
      {
        id: "1",
        date: "2026-07-20",
        shiftId: "a",
        shiftKey: "FS",
        shiftName: "Früh",
        shortCode: "FS",
        colorHex: "#0f0",
        startTime: "06:00",
        endTime: "14:00",
        assignments: [],
      },
      {
        id: "3",
        date: "2026-07-21",
        shiftId: "a",
        shiftKey: "FS",
        shiftName: "Früh",
        shortCode: "FS",
        colorHex: "#0f0",
        startTime: "06:00",
        endTime: "14:00",
        assignments: [],
      },
    ];
    const byDate = groupShiftsByDate(blocks);
    expect([...byDate.keys()]).toEqual(["2026-07-20", "2026-07-21"]);
    expect(byDate.get("2026-07-20")!.map((b) => b.shiftName)).toEqual(["Früh", "Spät"]);
  });
});

describe("normalizeColorHex / contrastTextOnBackground", () => {
  it("adds a leading hash when missing", () => {
    expect(normalizeColorHex("3b82f6")).toBe("#3b82f6");
    expect(normalizeColorHex("#3b82f6")).toBe("#3b82f6");
  });

  it("returns dark text on light backgrounds and white on dark", () => {
    expect(contrastTextOnBackground("#ffffff")).toBe("#0f1419");
    expect(contrastTextOnBackground("#000000")).toBe("#ffffff");
  });

  it("falls back to white for invalid colors", () => {
    expect(contrastTextOnBackground("red")).toBe("#ffffff");
  });
});
