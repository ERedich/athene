import { describe, expect, it } from "vitest";

import {
  expandShiftsForWeek,
  formatShiftTimeRange,
  getShiftsAvailableForWeekday,
  removeShiftFromWeekday,
  shiftDisplayTimes,
  weekdayKeyForDate,
} from "./shiftCalendarExpand";
import type { ShiftMasterRow } from "./shiftCalendarTypes";

function shift(overrides: Partial<ShiftMasterRow> = {}): ShiftMasterRow {
  return {
    id: "shift-1",
    key: "FS",
    name: "Frühschicht",
    siteId: "site-1",
    shortCode: "FS",
    colorHex: "#3b82f6",
    startTime: "06:00:00",
    endTime: "14:00:00",
    breakHours: 0.5,
    weekdays: ["mon", "tue", "wed", "thu", "fri"],
    isActive: true,
    ...overrides,
  };
}

describe("weekdayKeyForDate", () => {
  it("maps ISO dates to weekday keys", () => {
    expect(weekdayKeyForDate("2026-07-20")).toBe("mon");
    expect(weekdayKeyForDate("2026-07-21")).toBe("tue");
    expect(weekdayKeyForDate("2026-07-26")).toBe("sun");
  });
});

describe("shiftDisplayTimes / formatShiftTimeRange", () => {
  it("normalizes HH:MM:SS to HH:MM", () => {
    expect(shiftDisplayTimes(shift())).toEqual({
      startTime: "06:00",
      endTime: "14:00",
    });
  });

  it("formats a readable time range", () => {
    expect(formatShiftTimeRange("06:00", "14:00")).toBe("06:00 – 14:00");
  });
});

describe("expandShiftsForWeek", () => {
  it("expands active shifts onto matching weekdays", () => {
    const blocks = expandShiftsForWeek([shift()], "2026-07-20", { splitOvernight: false });
    expect(blocks).toHaveLength(5);
    expect(blocks.map((b) => b.date)).toEqual([
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
    ]);
    expect(blocks[0]).toMatchObject({
      id: "shift-1:2026-07-20",
      shiftName: "Frühschicht",
      startTime: "06:00",
      endTime: "14:00",
      assignments: [],
    });
  });

  it("skips inactive shifts", () => {
    const blocks = expandShiftsForWeek(
      [shift({ isActive: false })],
      "2026-07-20",
      { splitOvernight: false },
    );
    expect(blocks).toHaveLength(0);
  });

  it("splits overnight shifts by default", () => {
    const night = shift({
      id: "night-1",
      key: "NS",
      name: "Nacht",
      startTime: "22:00:00",
      endTime: "06:00:00",
      weekdays: ["fri"],
    });
    const blocks = expandShiftsForWeek([night], "2026-07-20");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      date: "2026-07-24",
      segmentKind: "evening",
      endTime: "24:00",
    });
    expect(blocks[1]).toMatchObject({
      date: "2026-07-25",
      segmentKind: "morning",
      startTime: "00:00",
      endTime: "06:00",
    });
  });
});

describe("getShiftsAvailableForWeekday", () => {
  it("returns active shifts not already on that weekday, sorted by name", () => {
    const shifts = [
      shift({ id: "2", name: "Spät", weekdays: ["mon", "tue"] }),
      shift({ id: "1", name: "Früh", weekdays: ["mon"] }),
      shift({ id: "3", name: "Nacht", weekdays: ["wed"], isActive: false }),
    ];
    const available = getShiftsAvailableForWeekday(shifts, "wed");
    expect(available.map((s) => s.name)).toEqual(["Früh", "Spät"]);
  });
});

describe("removeShiftFromWeekday", () => {
  it("rejects removing the last weekday without calling the API", async () => {
    const result = await removeShiftFromWeekday(
      shift({ weekdays: ["mon"] }),
      "mon",
    );
    expect(result).toEqual({ ok: false, error: "last_weekday" });
  });
});
