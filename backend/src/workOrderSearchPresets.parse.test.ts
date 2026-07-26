import { describe, expect, it } from "vitest";

import {
  buildPresetPayloadFromPartial,
  emptyWorkOrderSearchPresetPayload,
  parsePresetPayload,
} from "./workOrderSearchPresets.js";

describe("parsePresetPayload", () => {
  it("accepts legacy payloads without relative/overdue/maintenance fields", () => {
    const parsed = parsePresetPayload({
      version: 1,
      quickSearch: "",
      advanced: {
        orderNumberFrom: "",
        orderNumberTo: "",
        plannedDurationFrom: "",
        plannedDurationTo: "",
        documentCountFrom: "",
        documentCountTo: "",
        assetDocumentCountFrom: "",
        assetDocumentCountTo: "",
        assignedEmployeeCountFrom: "",
        assignedEmployeeCountTo: "",
        name: "",
        description: "",
        createdBy: [],
        updatedBy: [],
        plannedStartFrom: "",
        plannedStartTo: "",
        plannedEndFrom: "",
        plannedEndTo: "",
        createdAtFrom: "",
        createdAtTo: "",
        updatedAtFrom: "",
        updatedAtTo: "",
        orderType: [],
        status: ["open"],
        siteId: [],
        assetId: [],
        costCenterId: [],
        classificationId: [],
        classificationUnassigned: false,
        workgroupId: [],
        responsibleEmployeeId: [],
        employeeId: ["__ME__"],
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.advanced.plannedStartMode).toBe("relative");
    expect(parsed?.advanced.overdue).toBe(false);
    expect(parsed?.advanced.maintenancePlanId).toEqual([]);
    expect(parsed?.advanced.status).toEqual(["open"]);
  });

  it("accepts current frontend advanced search payloads", () => {
    const full = emptyWorkOrderSearchPresetPayload();
    full.advanced.status = ["open"];
    full.advanced.employeeId = ["__ME__"];
    full.advanced.plannedStartMode = "relative";
    full.advanced.plannedStartPastDays = "7";
    full.advanced.overdue = true;
    full.advanced.maintenancePlanId = [];
    const parsed = parsePresetPayload(full);
    expect(parsed).not.toBeNull();
    expect(parsed?.advanced.plannedStartPastDays).toBe("7");
    expect(parsed?.advanced.overdue).toBe(true);
  });

  it("rejects unknown advanced keys", () => {
    const full = emptyWorkOrderSearchPresetPayload();
    expect(
      parsePresetPayload({
        version: 1,
        quickSearch: "",
        advanced: { ...full.advanced, notARealFilter: "x" },
      }),
    ).toBeNull();
  });
});

describe("buildPresetPayloadFromPartial", () => {
  it("merges sparse advanced filters onto defaults", () => {
    const parsed = buildPresetPayloadFromPartial({
      quickSearch: "pump",
      advanced: { status: ["open"], overdue: true },
    });
    expect(parsed?.quickSearch).toBe("pump");
    expect(parsed?.advanced.status).toEqual(["open"]);
    expect(parsed?.advanced.overdue).toBe(true);
    expect(parsed?.advanced.plannedStartMode).toBe("relative");
  });
});
