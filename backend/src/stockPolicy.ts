/**
 * Stock planning policy resolution: most specific wins
 * STORAGE_LOCATION > WAREHOUSE > SITE.
 */

export type StockPolicyScopeType = "SITE" | "WAREHOUSE" | "STORAGE_LOCATION";

export type StockPolicyFields = {
  reorderLevel: number;
  minStock: number;
  orderQuantity: number;
};

export type StockPolicyRecord = StockPolicyFields & {
  id?: string;
  scopeType: StockPolicyScopeType;
  warehouseId: string | null;
  storageLocationId: string | null;
};

export type ResolvedStockPolicy = StockPolicyFields & {
  policyId: string | null;
  scopeType: StockPolicyScopeType;
  warehouseId: string | null;
  storageLocationId: string | null;
};

/**
 * Pick the most specific policy for an optional warehouse + storage location.
 * STORAGE_LOCATION is only considered when `storageLocationId` is present in opts.
 */
export function resolveEffectiveStockPolicy(
  policies: StockPolicyRecord[],
  opts?: { warehouseId?: string | null; storageLocationId?: string | null },
): ResolvedStockPolicy | null {
  const warehouseId = opts?.warehouseId ?? null;
  const considerBin =
    opts !== undefined && Object.prototype.hasOwnProperty.call(opts, "storageLocationId");
  const storageLocationId = opts?.storageLocationId ?? null;

  if (considerBin && storageLocationId) {
    const bin = policies.find(
      (p) =>
        p.scopeType === "STORAGE_LOCATION" && p.storageLocationId === storageLocationId,
    );
    if (bin) {
      return {
        policyId: bin.id ?? null,
        scopeType: "STORAGE_LOCATION",
        warehouseId: bin.warehouseId,
        storageLocationId: bin.storageLocationId,
        reorderLevel: bin.reorderLevel,
        minStock: bin.minStock,
        orderQuantity: bin.orderQuantity,
      };
    }
  }

  if (warehouseId !== null) {
    const warehouse = policies.find(
      (p) => p.scopeType === "WAREHOUSE" && p.warehouseId === warehouseId,
    );
    if (warehouse) {
      return {
        policyId: warehouse.id ?? null,
        scopeType: "WAREHOUSE",
        warehouseId: warehouse.warehouseId,
        storageLocationId: null,
        reorderLevel: warehouse.reorderLevel,
        minStock: warehouse.minStock,
        orderQuantity: warehouse.orderQuantity,
      };
    }
  }

  const site = policies.find((p) => p.scopeType === "SITE");
  if (site) {
    return {
      policyId: site.id ?? null,
      scopeType: "SITE",
      warehouseId: null,
      storageLocationId: null,
      reorderLevel: site.reorderLevel,
      minStock: site.minStock,
      orderQuantity: site.orderQuantity,
    };
  }

  return null;
}

export type StockQuantityLine = {
  warehouseId: string;
  storageLocationId: string;
  quantity: number;
};

/** On-hand quantity for the given policy scope. */
export function quantityForPolicyScope(
  lines: StockQuantityLine[],
  policy: Pick<StockPolicyRecord, "scopeType" | "warehouseId" | "storageLocationId">,
): number {
  if (policy.scopeType === "SITE") {
    return lines.reduce((sum, line) => sum + line.quantity, 0);
  }
  if (policy.scopeType === "WAREHOUSE" && policy.warehouseId) {
    return lines
      .filter((line) => line.warehouseId === policy.warehouseId)
      .reduce((sum, line) => sum + line.quantity, 0);
  }
  if (policy.scopeType === "STORAGE_LOCATION" && policy.storageLocationId) {
    return lines
      .filter((line) => line.storageLocationId === policy.storageLocationId)
      .reduce((sum, line) => sum + line.quantity, 0);
  }
  return 0;
}
