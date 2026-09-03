import { describe, expect, it } from "vitest";

function parseIsoDatetime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseAssignmentWindow(body: unknown): { assignedFrom: string; assignedTo: string } | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const assignedFrom = parseIsoDatetime(o.assignedFrom);
  const assignedTo = parseIsoDatetime(o.assignedTo);
  if (!assignedFrom || !assignedTo) return null;
  if (new Date(assignedTo).getTime() <= new Date(assignedFrom).getTime()) return null;
  return { assignedFrom, assignedTo };
}

function assignmentWindowInsideOrder(
  window: { assignedFrom: string; assignedTo: string },
  plannedStart: string,
  plannedEnd: string,
): boolean {
  const fromMs = new Date(window.assignedFrom).getTime();
  const toMs = new Date(window.assignedTo).getTime();
  const startMs = new Date(plannedStart).getTime();
  const endMs = new Date(plannedEnd).getTime();
  return fromMs >= startMs && toMs <= endMs;
}

describe("work order assignment window parsing", () => {
  it("rejects missing or inverted windows", () => {
    expect(parseAssignmentWindow({ employeeId: "x" })).toBeNull();
    expect(
      parseAssignmentWindow({
        assignedFrom: "2026-09-08T16:00:00.000Z",
        assignedTo: "2026-09-08T08:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("accepts a valid ISO window", () => {
    const parsed = parseAssignmentWindow({
      assignedFrom: "2026-09-08T08:00:00.000Z",
      assignedTo: "2026-09-08T16:00:00.000Z",
    });
    expect(parsed?.assignedFrom).toBe("2026-09-08T08:00:00.000Z");
    expect(parsed?.assignedTo).toBe("2026-09-08T16:00:00.000Z");
  });

  it("requires the window to stay inside the order", () => {
    const window = {
      assignedFrom: "2026-09-08T08:00:00.000Z",
      assignedTo: "2026-09-08T16:00:00.000Z",
    };
    expect(
      assignmentWindowInsideOrder(window, "2026-09-07T00:00:00.000Z", "2026-09-10T00:00:00.000Z"),
    ).toBe(true);
    expect(
      assignmentWindowInsideOrder(window, "2026-09-08T10:00:00.000Z", "2026-09-10T00:00:00.000Z"),
    ).toBe(false);
  });
});
