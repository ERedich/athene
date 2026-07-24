import { describe, expect, it } from "vitest";

import {
  DAY_MINUTES,
  DAY_TRACK_HEIGHT_PX,
  MIN_BLOCK_HEIGHT_PX,
  currentTimeTrackTopPx,
  shiftBlockPositionStyle,
  splitOvernightSegments,
  timeToMinutes,
} from "./shiftDayTimelineLayout";
import type { ShiftCalendarBlock } from "./shiftCalendarTypes";

function baseBlock(overrides: Partial<ShiftCalendarBlock> = {}): ShiftCalendarBlock {
  return {
    id: "shift-1:2026-07-20",
    date: "2026-07-20",
    shiftId: "shift-1",
    shiftKey: "NS",
    shiftName: "Nachtschicht",
    shortCode: "NS",
    colorHex: "#1a1a2e",
    startTime: "22:00",
    endTime: "06:00",
    assignments: [],
    ...overrides,
  };
}

describe("timeToMinutes", () => {
  it("parses HH:MM", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("08:30")).toBe(8 * 60 + 30);
    expect(timeToMinutes("23:59")).toBe(23 * 60 + 59);
  });

  it("treats 24:00 as end of day", () => {
    expect(timeToMinutes("24:00")).toBe(DAY_MINUTES);
  });
});

describe("shiftBlockPositionStyle", () => {
  it("places a day shift proportionally on the track", () => {
    const style = shiftBlockPositionStyle("08:00", "16:00");
    expect(style.topPx).toBe((8 * 60 / DAY_MINUTES) * DAY_TRACK_HEIGHT_PX);
    expect(style.heightPx).toBe((8 * 60 / DAY_MINUTES) * DAY_TRACK_HEIGHT_PX);
  });

  it("enforces a minimum block height", () => {
    const style = shiftBlockPositionStyle("12:00", "12:05");
    expect(style.heightPx).toBe(MIN_BLOCK_HEIGHT_PX);
  });

  it("supports evening segments ending at 24:00", () => {
    const style = shiftBlockPositionStyle("22:00", "24:00");
    expect(style.topPx).toBe((22 * 60 / DAY_MINUTES) * DAY_TRACK_HEIGHT_PX);
    expect(style.heightPx).toBe((2 * 60 / DAY_MINUTES) * DAY_TRACK_HEIGHT_PX);
  });
});

describe("currentTimeTrackTopPx", () => {
  it("maps the clock time onto the day track", () => {
    const noon = new Date(2026, 6, 20, 12, 0, 0);
    expect(currentTimeTrackTopPx(noon)).toBe((12 * 60 / DAY_MINUTES) * DAY_TRACK_HEIGHT_PX);
  });
});

describe("splitOvernightSegments", () => {
  it("leaves same-day shifts as a full segment", () => {
    const dayShift = baseBlock({
      startTime: "06:00",
      endTime: "14:00",
      shiftName: "Früh",
    });
    const result = splitOvernightSegments([dayShift], "2026-07-20");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      segmentKind: "full",
      continuesBefore: false,
      continuesAfter: false,
      startTime: "06:00",
      endTime: "14:00",
    });
  });

  it("splits overnight shifts into evening and morning segments", () => {
    const result = splitOvernightSegments([baseBlock()], "2026-07-20");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      date: "2026-07-20",
      startTime: "22:00",
      endTime: "24:00",
      segmentKind: "evening",
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(result[1]).toMatchObject({
      id: "shift-1:2026-07-21:morning",
      date: "2026-07-21",
      startTime: "00:00",
      endTime: "06:00",
      segmentKind: "morning",
      continuesBefore: true,
      continuesAfter: false,
      assignments: [],
    });
  });

  it("clips morning segment when overnight starts on the last day of the week", () => {
    const sundayNight = baseBlock({
      id: "shift-1:2026-07-26",
      date: "2026-07-26",
    });
    const result = splitOvernightSegments([sundayNight], "2026-07-20");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: "2026-07-26",
      segmentKind: "evening",
      endTime: "24:00",
      continuesAfter: true,
    });
  });

  it("sorts segments by date then start time", () => {
    const early = baseBlock({
      id: "a:2026-07-21",
      date: "2026-07-21",
      startTime: "06:00",
      endTime: "14:00",
      shiftName: "A",
    });
    const late = baseBlock({
      id: "b:2026-07-20",
      date: "2026-07-20",
      startTime: "14:00",
      endTime: "22:00",
      shiftName: "B",
    });
    const result = splitOvernightSegments([early, late], "2026-07-20");
    expect(result.map((b) => b.id)).toEqual(["b:2026-07-20", "a:2026-07-21"]);
  });
});
