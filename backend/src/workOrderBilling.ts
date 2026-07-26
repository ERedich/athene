export type BillingModel = "flat" | "timeAndMaterial";

export type BillingLine = {
  kind: "labor" | "travel" | "material" | "flat";
  quantity: number;
  unitRate: number | null;
  amount: number;
};

export type BillingSummaryInput = {
  billingModel: BillingModel | null;
  hourlyRate: number | null;
  travelRate: number | null;
  materialMarkupPercent: number | null;
  flatRate: number | null;
  /** Sum of IN transaction quantities (hours). */
  laborHours: number;
  /** Sum of TR transaction quantities (hours or units). */
  travelQuantity: number;
  /** Sum of RM quantity * unitPrice (pre-markup). */
  materialBaseAmount: number;
};

export type BillingSummary = {
  billingModel: BillingModel | null;
  lines: BillingLine[];
  total: number;
};

function n(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return value;
}

export function computeBillingSummary(input: BillingSummaryInput): BillingSummary {
  const lines: BillingLine[] = [];
  const model = input.billingModel;

  if (model === "flat") {
    const amount = n(input.flatRate);
    lines.push({
      kind: "flat",
      quantity: 1,
      unitRate: input.flatRate,
      amount,
    });
    return { billingModel: model, lines, total: amount };
  }

  const laborRate = input.hourlyRate;
  const laborAmount = n(input.laborHours) * n(laborRate);
  lines.push({
    kind: "labor",
    quantity: n(input.laborHours),
    unitRate: laborRate,
    amount: laborAmount,
  });

  const travelRate = input.travelRate;
  const travelAmount = n(input.travelQuantity) * n(travelRate);
  lines.push({
    kind: "travel",
    quantity: n(input.travelQuantity),
    unitRate: travelRate,
    amount: travelAmount,
  });

  const markup = n(input.materialMarkupPercent) / 100;
  const materialAmount = n(input.materialBaseAmount) * (1 + markup);
  lines.push({
    kind: "material",
    quantity: 1,
    unitRate: null,
    amount: materialAmount,
  });

  const total = laborAmount + travelAmount + materialAmount;
  return { billingModel: model, lines, total };
}
