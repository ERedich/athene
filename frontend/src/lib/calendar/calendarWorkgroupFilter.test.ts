import { describe, expect, it } from "vitest";

import {
  buildEmployeeWorkgroupMap,
  employeeMatchesWorkgroupFilter,
} from "./calendarEmployeeAssignment";
import { maintenancePlanMatchesWorkgroupFilter } from "./calendarMaintenancePlans";
import {
  WORKGROUP_FILTER_NONE,
  matchesWorkgroupFilter,
} from "./calendarWorkgroupFilter";
import { workOrderMatchesWorkgroupFilter, workOrderMeetsCalendarMinDuration, type CalendarWorkOrder } from "./calendarWorkOrders";
import type { CalendarMaintenancePlan } from "./calendarMaintenancePlans";
import type { WorkOrderReferenceWorkgroup } from "../workOrderTypes";

const WG_A = "wg-a";

function workOrder(workgroupId: string | null): CalendarWorkOrder {
  return {
    id: "wo-1",
    orderNumber: 1,
    name: "Test",
    description: null,
    siteId: "s1",
    siteKey: "S1",
    siteName: "Site",
    siteColorHex: "#000",
    assetId: "a1",
    assetKey: "A1",
    assetName: "Asset",
    costCenterId: "c1",
    costCenterKey: "C1",
    costCenterName: "CC",
    classificationId: null,
    classificationKey: null,
    classificationName: null,
    workgroupId,
    workgroupKey: null,
    workgroupName: null,
    plannedStart: "2026-09-01T08:00:00.000Z",
    plannedEnd: "2026-09-01T10:00:00.000Z",
    plannedDurationMinutes: 120,
    orderType: "corrective",
    status: "open",
    responsibleEmployeeIds: [],
    responsibleEmployeeKey: null,
    responsibleEmployeeName: null,
    currentSegmentStartedAt: null,
    documentCount: 0,
    assetDocumentCount: 0,
    assignedEmployeeCount: 0,
    transactionCount: 0,
  };
}

function plan(workgroupId: string): CalendarMaintenancePlan {
  return {
    id: "mp-1",
    key: "MP1",
    name: "Plan",
    siteId: "s1",
    siteKey: "S1",
    siteName: "Site",
    siteColorHex: "#000",
    assetId: "a1",
    assetKey: "A1",
    assetName: "Asset",
    workgroupId,
    workgroupKey: "WG",
    workgroupName: "Group",
    plannedDurationMinutes: 60,
    nextDueAt: "2026-09-01T08:00:00.000Z",
    status: "active",
  };
}

function workgroup(id: string, employeeIds: string[]): WorkOrderReferenceWorkgroup {
  return {
    id,
    key: id,
    name: id,
    siteId: "s1",
    isActive: true,
    employeeIds,
    leaderEmployeeIds: [],
  };
}

describe("matchesWorkgroupFilter", () => {
  it("matches everything when no filter is set", () => {
    expect(matchesWorkgroupFilter(WG_A, null)).toBe(true);
    expect(matchesWorkgroupFilter(null, null)).toBe(true);
  });

  it("highlights unassigned workgroups for the none sentinel", () => {
    expect(matchesWorkgroupFilter(null, WORKGROUP_FILTER_NONE)).toBe(true);
    expect(matchesWorkgroupFilter("", WORKGROUP_FILTER_NONE)).toBe(true);
    expect(matchesWorkgroupFilter("  ", WORKGROUP_FILTER_NONE)).toBe(true);
    expect(matchesWorkgroupFilter(WG_A, WORKGROUP_FILTER_NONE)).toBe(false);
  });

  it("matches a specific workgroup id", () => {
    expect(matchesWorkgroupFilter(WG_A, WG_A)).toBe(true);
    expect(matchesWorkgroupFilter(null, WG_A)).toBe(false);
    expect(matchesWorkgroupFilter("wg-b", WG_A)).toBe(false);
  });
});

describe("workOrderMatchesWorkgroupFilter", () => {
  it("treats orders without a workgroup as matching the none filter", () => {
    expect(workOrderMatchesWorkgroupFilter(workOrder(null), WORKGROUP_FILTER_NONE)).toBe(true);
    expect(workOrderMatchesWorkgroupFilter(workOrder(WG_A), WORKGROUP_FILTER_NONE)).toBe(false);
  });
});

describe("maintenancePlanMatchesWorkgroupFilter", () => {
  it("does not match assigned plans for the none filter", () => {
    expect(maintenancePlanMatchesWorkgroupFilter(plan(WG_A), WORKGROUP_FILTER_NONE)).toBe(false);
    expect(maintenancePlanMatchesWorkgroupFilter(plan(WG_A), WG_A)).toBe(true);
  });
});

describe("employeeMatchesWorkgroupFilter", () => {
  const map = buildEmployeeWorkgroupMap([workgroup(WG_A, ["emp-in"])]);

  it("highlights employees with no workgroup membership", () => {
    expect(employeeMatchesWorkgroupFilter("emp-none", map, WORKGROUP_FILTER_NONE)).toBe(true);
    expect(employeeMatchesWorkgroupFilter("emp-in", map, WORKGROUP_FILTER_NONE)).toBe(false);
  });

  it("still matches a named workgroup", () => {
    expect(employeeMatchesWorkgroupFilter("emp-in", map, WG_A)).toBe(true);
    expect(employeeMatchesWorkgroupFilter("emp-none", map, WG_A)).toBe(false);
  });
});

describe("workOrderMeetsCalendarMinDuration", () => {
  it("hides orders shorter than the hour threshold", () => {
    const twoHours = workOrder(null);
    expect(workOrderMeetsCalendarMinDuration(twoHours, 4)).toBe(false);
    expect(workOrderMeetsCalendarMinDuration({ ...twoHours, plannedDurationMinutes: 240 }, 4)).toBe(true);
  });

  it("shows every order when the threshold is 0", () => {
    expect(workOrderMeetsCalendarMinDuration(workOrder(null), 0)).toBe(true);
  });

  it("falls back to planned start/end when duration minutes are missing", () => {
    const spanTwoHours = { ...workOrder(null), plannedDurationMinutes: null };
    expect(workOrderMeetsCalendarMinDuration(spanTwoHours, 4)).toBe(false);
    expect(workOrderMeetsCalendarMinDuration(spanTwoHours, 2)).toBe(true);
  });
});
