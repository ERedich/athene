import { describe, expect, it } from "vitest";

import {
  WORK_ORDER_LIST_DEFAULT_LIMIT,
  buildWorkOrderListPath,
  parseWorkOrderListResponse,
} from "./workOrderListApi";
import type { WorkOrder } from "./workOrderTypes";

function sampleRow(partial: Partial<WorkOrder> & Pick<WorkOrder, "id" | "orderNumber">): WorkOrder {
  return {
    id: partial.id,
    orderNumber: partial.orderNumber,
    name: partial.name ?? "WO",
    description: partial.description ?? null,
    siteId: partial.siteId ?? "s1",
    siteKey: partial.siteKey ?? "S1",
    siteName: partial.siteName ?? "Site",
    assetId: partial.assetId ?? "a1",
    assetKey: partial.assetKey ?? "A1",
    assetName: partial.assetName ?? "Asset",
    costCenterId: partial.costCenterId ?? "c1",
    costCenterKey: partial.costCenterKey ?? "C1",
    costCenterName: partial.costCenterName ?? "CC",
    classificationId: null,
    classificationKey: null,
    classificationName: null,
    plannedStart: "2026-01-01T00:00:00.000Z",
    plannedEnd: "2026-01-02T00:00:00.000Z",
    plannedDurationMinutes: 60,
    orderType: "repair",
    status: "open",
    responsibleEmployeeIds: partial.responsibleEmployeeIds ?? ["e1"],
    responsibleEmployeeKey: "E1",
    responsibleEmployeeName: "Emp",
    doneBy: partial.doneBy ?? null,
    doneByEmployeeKey: null,
    doneByEmployeeName: null,
    pauseRemark: null,
    currentSegmentStartedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdBy: "admin",
    updatedBy: "admin",
    documentCount: 0,
    assetDocumentCount: 0,
    assignedEmployeeCount: 0,
    transactionCount: 0,
    inspectionPointCount: 0,
    checkedInspectionPointCount: 0,
    workgroupId: null,
    workgroupKey: null,
    workgroupName: null,
    originalWo: null,
    originalWoOrderNumber: null,
    originalWoName: null,
    maintenancePlanId: null,
    maintenancePlanKey: null,
    maintenancePlanName: null,
    inspectionRoundId: null,
    inspectionRoundKey: null,
    inspectionRoundName: null,
  };
}

describe("parseWorkOrderListResponse", () => {
  it("parses the soft-limit page shape", () => {
    const row = sampleRow({ id: "1", orderNumber: 10 });
    const parsed = parseWorkOrderListResponse({
      rows: [row],
      hasMore: true,
      limit: 250,
      offset: 0,
    });
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.hasMore).toBe(true);
    expect(parsed.limit).toBe(250);
    expect(parsed.offset).toBe(0);
  });

  it("accepts legacy bare arrays", () => {
    const parsed = parseWorkOrderListResponse([sampleRow({ id: "1", orderNumber: 1 })]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.hasMore).toBe(false);
  });

  it("normalizes omitted list fields", () => {
    const slim = {
      id: "1",
      orderNumber: 1,
      name: "WO",
      description: null,
      siteId: "s",
      siteKey: "S",
      siteName: "Site",
      assetId: "a",
      assetKey: "A",
      assetName: "Asset",
      costCenterId: "c",
      costCenterKey: "C",
      costCenterName: "CC",
      classificationId: null,
      classificationKey: null,
      classificationName: null,
      plannedStart: "2026-01-01T00:00:00.000Z",
      plannedEnd: "2026-01-02T00:00:00.000Z",
      plannedDurationMinutes: null,
      orderType: "repair",
      status: "open",
      responsibleEmployeeIds: ["e1"],
      responsibleEmployeeKey: "E1",
      responsibleEmployeeName: "Emp",
      currentSegmentStartedAt: null,
      workgroupId: null,
      workgroupKey: null,
      workgroupName: null,
      problemId: null,
      causeId: null,
      remedyId: null,
      originalWo: null,
      originalWoOrderNumber: null,
      maintenancePlanId: null,
      maintenancePlanKey: null,
      maintenancePlanName: null,
      inspectionRoundId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdBy: "admin",
      updatedBy: "admin",
      documentCount: 0,
      assetDocumentCount: 0,
      assignedEmployeeCount: 0,
      transactionCount: 0,
      inspectionPointCount: 0,
      checkedInspectionPointCount: 0,
    };
    const parsed = parseWorkOrderListResponse({ rows: [slim], hasMore: false, limit: 250, offset: 0 });
    expect(parsed.rows[0]?.doneBy).toBeNull();
    expect(parsed.rows[0]?.pauseRemark).toBeNull();
    expect(parsed.rows[0]?.originalWoName).toBeNull();
    expect(parsed.rows[0]?.responsibleEmployeeIds).toEqual(["e1"]);
  });
});

describe("buildWorkOrderListPath", () => {
  it("adds default limit/offset", () => {
    expect(buildWorkOrderListPath()).toBe(
      `/api/work-orders?limit=${WORK_ORDER_LIST_DEFAULT_LIMIT}&offset=0`,
    );
  });

  it("keeps filter params and clamps limit", () => {
    const path = buildWorkOrderListPath({
      queryString: "status=open&status=assigned",
      limit: 99999,
      offset: 250,
    });
    expect(path).toContain("status=open");
    expect(path).toContain("status=assigned");
    expect(path).toContain("limit=2000");
    expect(path).toContain("offset=250");
  });
});
