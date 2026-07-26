import { describe, expect, it } from "vitest";

import { computeBillingSummary } from "./workOrderBilling.js";
import { computeSlaState, enrichWorkOrderSla } from "./workOrderSla.js";
import { DOCUMENT_CATEGORIES, isDocumentCategory } from "./documents/documentTypes.js";

describe("workOrderSla", () => {
  it("computes due dates from createdAt", () => {
    const createdAt = "2026-01-01T00:00:00.000Z";
    const sla = enrichWorkOrderSla({
      createdAt,
      reactionMinutes: 60,
      resolutionMinutes: 120,
      now: new Date("2026-01-01T00:30:00.000Z"),
    });
    expect(sla.slaReactionDueAt).toBe("2026-01-01T01:00:00.000Z");
    expect(sla.slaResolutionDueAt).toBe("2026-01-01T02:00:00.000Z");
    expect(sla.slaReactionState).toBe("ok");
  });

  it("marks overdue after due", () => {
    expect(
      computeSlaState(new Date("2026-01-01T01:00:00.000Z"), 60, new Date("2026-01-01T02:00:00.000Z")),
    ).toBe("overdue");
  });
});

describe("workOrderBilling", () => {
  it("aggregates T&M labor travel material", () => {
    const summary = computeBillingSummary({
      billingModel: "timeAndMaterial",
      hourlyRate: 100,
      travelRate: 50,
      materialMarkupPercent: 10,
      flatRate: null,
      laborHours: 2,
      travelQuantity: 1,
      materialBaseAmount: 100,
    });
    expect(summary.total).toBe(200 + 50 + 110);
    expect(summary.lines).toHaveLength(3);
  });

  it("uses flat rate when flat", () => {
    const summary = computeBillingSummary({
      billingModel: "flat",
      hourlyRate: 100,
      travelRate: 50,
      materialMarkupPercent: 10,
      flatRate: 999,
      laborHours: 2,
      travelQuantity: 1,
      materialBaseAmount: 100,
    });
    expect(summary.total).toBe(999);
    expect(summary.lines[0]?.kind).toBe("flat");
  });
});

describe("document category customerSignoff", () => {
  it("allows customerSignoff", () => {
    expect(isDocumentCategory("customerSignoff")).toBe(true);
    expect(DOCUMENT_CATEGORIES).toContain("customerSignoff");
  });
});
