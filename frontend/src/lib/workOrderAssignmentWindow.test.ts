import { describe, expect, it } from "vitest";

import {
  assignmentWindowIsValid,
  defaultAssignmentWindow,
  intersectAssignmentWindows,
  shiftHintToRange,
} from "./workOrderAssignmentWindow";

describe("shiftHintToRange", () => {
  it("maps a same-day shift to local start/end", () => {
    const range = shiftHintToRange({
      date: "2026-09-07",
      startTime: "08:00",
      endTime: "16:00",
    });
    expect(range.assignedFrom.getHours()).toBe(8);
    expect(range.assignedTo.getHours()).toBe(16);
    expect(range.assignedTo.getDate()).toBe(range.assignedFrom.getDate());
  });

  it("splits overnight evening to midnight", () => {
    const range = shiftHintToRange({
      date: "2026-09-07",
      startTime: "22:00",
      endTime: "06:00",
      segmentKind: "evening",
    });
    expect(range.assignedFrom.getHours()).toBe(22);
    expect(range.assignedTo.getHours()).toBe(0);
    expect(range.assignedTo.getDate()).toBe(range.assignedFrom.getDate() + 1);
  });

  it("maps morning overnight remainder from midnight", () => {
    const range = shiftHintToRange({
      date: "2026-09-08",
      startTime: "22:00",
      endTime: "06:00",
      segmentKind: "morning",
    });
    expect(range.assignedFrom.getHours()).toBe(0);
    expect(range.assignedTo.getHours()).toBe(6);
  });
});

describe("defaultAssignmentWindow", () => {
  const orderStart = new Date("2026-09-07T06:00:00");
  const orderEnd = new Date("2026-09-10T18:00:00");

  it("clips a multi-day order to the drop day", () => {
    const window = defaultAssignmentWindow(orderStart, orderEnd, "2026-09-08");
    expect(window).not.toBeNull();
    expect(window!.assignedFrom.getDate()).toBe(8);
    expect(window!.assignedFrom.getHours()).toBe(0);
    expect(window!.assignedTo.getDate()).toBe(9);
    expect(window!.assignedTo.getHours()).toBe(0);
  });

  it("intersects the drop day with shift hours", () => {
    const window = defaultAssignmentWindow(orderStart, orderEnd, "2026-09-08", {
      date: "2026-09-08",
      startTime: "08:00",
      endTime: "16:00",
    });
    expect(window).not.toBeNull();
    expect(window!.assignedFrom.getHours()).toBe(8);
    expect(window!.assignedTo.getHours()).toBe(16);
    expect(window!.assignedFrom.getDate()).toBe(8);
    expect(window!.assignedTo.getDate()).toBe(8);
  });

  it("falls back to the day/order intersection when the shift does not overlap", () => {
    const window = defaultAssignmentWindow(
      new Date("2026-09-08T08:00:00"),
      new Date("2026-09-08T16:00:00"),
      "2026-09-08",
      {
        date: "2026-09-08",
        startTime: "22:00",
        endTime: "06:00",
        segmentKind: "evening",
      },
    );
    expect(window).not.toBeNull();
    expect(window!.assignedFrom.getHours()).toBe(8);
    expect(window!.assignedTo.getHours()).toBe(16);
  });

  it("returns null when the drop day is outside the order", () => {
    expect(defaultAssignmentWindow(orderStart, orderEnd, "2026-09-01")).toBeNull();
  });

  it("clips the first day to the order start", () => {
    const window = defaultAssignmentWindow(orderStart, orderEnd, "2026-09-07");
    expect(window).not.toBeNull();
    expect(window!.assignedFrom.getTime()).toBe(orderStart.getTime());
  });
});

describe("assignmentWindowIsValid", () => {
  const orderStart = new Date("2026-09-07T08:00:00");
  const orderEnd = new Date("2026-09-09T16:00:00");

  it("accepts a window inside the order", () => {
    expect(
      assignmentWindowIsValid(
        new Date("2026-09-07T09:00:00"),
        new Date("2026-09-07T12:00:00"),
        orderStart,
        orderEnd,
      ),
    ).toBe(true);
  });

  it("rejects an inverted window", () => {
    expect(
      assignmentWindowIsValid(
        new Date("2026-09-07T12:00:00"),
        new Date("2026-09-07T09:00:00"),
        orderStart,
        orderEnd,
      ),
    ).toBe(false);
  });

  it("rejects a window that starts before the order", () => {
    expect(
      assignmentWindowIsValid(
        new Date("2026-09-07T07:00:00"),
        new Date("2026-09-07T12:00:00"),
        orderStart,
        orderEnd,
      ),
    ).toBe(false);
  });
});

describe("intersectAssignmentWindows", () => {
  it("returns null for non-overlapping ranges", () => {
    expect(
      intersectAssignmentWindows(
        { assignedFrom: new Date("2026-09-07T08:00:00"), assignedTo: new Date("2026-09-07T12:00:00") },
        { assignedFrom: new Date("2026-09-07T13:00:00"), assignedTo: new Date("2026-09-07T16:00:00") },
      ),
    ).toBeNull();
  });
});
