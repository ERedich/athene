import { afterEach, describe, expect, it, vi } from "vitest";

import { __test__ } from "./shiftPlanner.js";

const {
  addDaysIso,
  weekdayKeyForDate,
  isAssignmentDateBeforeToday,
  parseSegmentKind,
  assignmentDateForBlock,
  computeShiftWindowBounds,
  parseAssignmentBody,
  parseRolloutBody,
  enumerateShiftAssignmentDates,
  timeToMinutes,
  normalizeTimeToHm,
} = __test__;

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const SHIFT_ID = "22222222-2222-4222-8222-222222222222";

describe("shiftPlanner helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("date / time helpers", () => {
    it("adds days across month boundaries", () => {
      expect(addDaysIso("2026-07-31", 1)).toBe("2026-08-01");
      expect(addDaysIso("2026-07-20", -1)).toBe("2026-07-19");
    });

    it("maps weekdays consistently", () => {
      expect(weekdayKeyForDate("2026-07-20")).toBe("mon");
      expect(weekdayKeyForDate("2026-07-26")).toBe("sun");
    });

    it("normalizes and converts times", () => {
      expect(normalizeTimeToHm("06:00:00")).toBe("06:00");
      expect(timeToMinutes("24:00")).toBe(24 * 60);
      expect(timeToMinutes("06:30")).toBe(6 * 60 + 30);
    });
  });

  describe("isAssignmentDateBeforeToday", () => {
    it("compares against the calendar day in Berlin planning TZ", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-20T10:00:00+02:00"));
      expect(isAssignmentDateBeforeToday("2026-07-19")).toBe(true);
      expect(isAssignmentDateBeforeToday("2026-07-20")).toBe(false);
      expect(isAssignmentDateBeforeToday("2026-07-21")).toBe(false);
    });
  });

  describe("parseSegmentKind", () => {
    it("accepts known segment kinds and ignores empty", () => {
      expect(parseSegmentKind("full")).toBe("full");
      expect(parseSegmentKind("evening")).toBe("evening");
      expect(parseSegmentKind("morning")).toBe("morning");
      expect(parseSegmentKind("")).toBeNull();
      expect(parseSegmentKind(null)).toBeNull();
      expect(parseSegmentKind("noon")).toBeNull();
    });
  });

  describe("assignmentDateForBlock", () => {
    it("shifts morning segments one day back", () => {
      expect(assignmentDateForBlock("2026-07-21", "morning")).toBe("2026-07-20");
      expect(assignmentDateForBlock("2026-07-20", "evening")).toBe("2026-07-20");
      expect(assignmentDateForBlock("2026-07-20", null)).toBe("2026-07-20");
    });
  });

  describe("computeShiftWindowBounds", () => {
    it("handles same-day full shifts", () => {
      expect(computeShiftWindowBounds("2026-07-20", "06:00:00", "14:00:00", "full")).toEqual({
        startDate: "2026-07-20",
        startTimeHm: "06:00",
        endDate: "2026-07-20",
        endTimeHm: "14:00",
      });
    });

    it("handles evening segments ending at midnight", () => {
      expect(computeShiftWindowBounds("2026-07-20", "22:00:00", "06:00:00", "evening")).toEqual({
        startDate: "2026-07-20",
        startTimeHm: "22:00",
        endDate: "2026-07-21",
        endTimeHm: "00:00",
      });
    });

    it("handles morning segments from midnight", () => {
      expect(computeShiftWindowBounds("2026-07-21", "22:00:00", "06:00:00", "morning")).toEqual({
        startDate: "2026-07-21",
        startTimeHm: "00:00",
        endDate: "2026-07-21",
        endTimeHm: "06:00",
      });
    });

    it("spans overnight when segmentKind is null/full and end <= start", () => {
      expect(computeShiftWindowBounds("2026-07-20", "22:00", "06:00", null)).toEqual({
        startDate: "2026-07-20",
        startTimeHm: "22:00",
        endDate: "2026-07-21",
        endTimeHm: "06:00",
      });
    });
  });

  describe("body parsers", () => {
    it("parses valid assignment bodies", () => {
      expect(
        parseAssignmentBody({
          employeeId: EMPLOYEE_ID,
          shiftId: SHIFT_ID,
          assignmentDate: "2026-07-20",
        }),
      ).toEqual({
        employeeId: EMPLOYEE_ID,
        shiftId: SHIFT_ID,
        assignmentDate: "2026-07-20",
      });
    });

    it("rejects invalid assignment bodies", () => {
      expect(parseAssignmentBody(null)).toBeNull();
      expect(
        parseAssignmentBody({
          employeeId: "not-uuid",
          shiftId: SHIFT_ID,
          assignmentDate: "2026-07-20",
        }),
      ).toBeNull();
      expect(
        parseAssignmentBody({
          employeeId: EMPLOYEE_ID,
          shiftId: SHIFT_ID,
          assignmentDate: "20-07-2026",
        }),
      ).toBeNull();
    });

    it("parses and rejects rollout bodies", () => {
      expect(
        parseRolloutBody({
          employeeId: EMPLOYEE_ID,
          shiftId: SHIFT_ID,
          fromDate: "2026-07-20",
          toDate: "2026-08-20",
        }),
      ).toEqual({
        employeeId: EMPLOYEE_ID,
        shiftId: SHIFT_ID,
        fromDate: "2026-07-20",
        toDate: "2026-08-20",
      });
      expect(
        parseRolloutBody({
          employeeId: EMPLOYEE_ID,
          shiftId: SHIFT_ID,
          fromDate: "2026-07-20",
        }),
      ).toBeNull();
    });
  });

  describe("enumerateShiftAssignmentDates", () => {
    it("filters by weekday keys", () => {
      expect(
        enumerateShiftAssignmentDates("2026-07-20", "2026-07-26", ["mon", "fri"]),
      ).toEqual(["2026-07-20", "2026-07-24"]);
    });
  });
});
