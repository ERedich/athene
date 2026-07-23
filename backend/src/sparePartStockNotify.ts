import { pool } from "./db.js";
import {
  quantityForPolicyScope,
  resolveEffectiveStockPolicy,
  type StockPolicyRecord,
  type StockPolicyScopeType,
  type StockQuantityLine,
} from "./stockPolicy.js";
import { broadcastStockNotification } from "./workOrderRealtime.js";

export type SparePartStockNotificationPayload = {
  id: string;
  userId: string;
  sparePartId: string;
  sparePartKey: string;
  sparePartName: string;
  siteKey: string;
  siteName: string;
  scopeType: StockPolicyScopeType;
  warehouseId: string | null;
  storageLocationId: string | null;
  warehouseKey: string | null;
  storageLocationKey: string | null;
  onHandQuantity: number;
  reorderLevel: number;
  createdAt: string;
  readAt: string | null;
};

export type StockScopeSnapshot = {
  key: string;
  policyId: string | null;
  scopeType: StockPolicyScopeType;
  warehouseId: string | null;
  storageLocationId: string | null;
  warehouseKey: string | null;
  storageLocationKey: string | null;
  onHandQuantity: number;
  reorderLevel: number;
};

type StockLineRow = {
  warehouseId: string;
  warehouseKey: string;
  storageLocationId: string;
  storageLocationKey: string;
  quantity: string;
};

type PolicyRow = {
  id: string;
  scopeType: StockPolicyScopeType;
  warehouseId: string | null;
  warehouseKey: string | null;
  storageLocationId: string | null;
  storageLocationKey: string | null;
  reorderLevel: string;
  minStock: string;
  orderQuantity: string;
};

function scopeKey(
  scopeType: StockPolicyScopeType,
  warehouseId: string | null,
  storageLocationId: string | null,
): string {
  return `${scopeType}\0${warehouseId ?? ""}\0${storageLocationId ?? ""}`;
}

function evaluateScopes(
  policies: PolicyRow[],
  lines: StockLineRow[],
): StockScopeSnapshot[] {
  const quantityLines: StockQuantityLine[] = lines.map((line) => ({
    warehouseId: line.warehouseId,
    storageLocationId: line.storageLocationId,
    quantity: Number(line.quantity) || 0,
  }));
  const policyRecords: StockPolicyRecord[] = policies.map((p) => ({
    id: p.id,
    scopeType: p.scopeType,
    warehouseId: p.warehouseId,
    storageLocationId: p.storageLocationId,
    reorderLevel: Number(p.reorderLevel) || 0,
    minStock: Number(p.minStock) || 0,
    orderQuantity: Number(p.orderQuantity) || 0,
  }));

  const warehouseKeyById = new Map<string, string>();
  const storageKeyById = new Map<string, string>();
  for (const line of lines) {
    warehouseKeyById.set(line.warehouseId, line.warehouseKey);
    storageKeyById.set(line.storageLocationId, line.storageLocationKey);
  }
  for (const p of policies) {
    if (p.warehouseId && p.warehouseKey) warehouseKeyById.set(p.warehouseId, p.warehouseKey);
    if (p.storageLocationId && p.storageLocationKey) {
      storageKeyById.set(p.storageLocationId, p.storageLocationKey);
    }
  }

  const results: StockScopeSnapshot[] = [];
  const seen = new Set<string>();

  const pushResolved = (
    resolved: NonNullable<ReturnType<typeof resolveEffectiveStockPolicy>>,
  ) => {
    const key = scopeKey(resolved.scopeType, resolved.warehouseId, resolved.storageLocationId);
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      key,
      policyId: resolved.policyId,
      scopeType: resolved.scopeType,
      warehouseId: resolved.warehouseId,
      storageLocationId: resolved.storageLocationId,
      warehouseKey: resolved.warehouseId
        ? (warehouseKeyById.get(resolved.warehouseId) ?? null)
        : null,
      storageLocationKey: resolved.storageLocationId
        ? (storageKeyById.get(resolved.storageLocationId) ?? null)
        : null,
      onHandQuantity: quantityForPolicyScope(quantityLines, resolved),
      reorderLevel: resolved.reorderLevel,
    });
  };

  const siteResolved = resolveEffectiveStockPolicy(policyRecords);
  if (siteResolved?.scopeType === "SITE") pushResolved(siteResolved);

  const warehouseIds = new Set<string>();
  for (const line of quantityLines) warehouseIds.add(line.warehouseId);
  for (const policy of policyRecords) {
    if (policy.warehouseId) warehouseIds.add(policy.warehouseId);
  }
  for (const warehouseId of warehouseIds) {
    const resolved = resolveEffectiveStockPolicy(policyRecords, { warehouseId });
    if (resolved) pushResolved(resolved);
  }

  for (const line of quantityLines) {
    const resolved = resolveEffectiveStockPolicy(policyRecords, {
      warehouseId: line.warehouseId,
      storageLocationId: line.storageLocationId,
    });
    if (resolved) pushResolved(resolved);
  }

  return results;
}

async function loadPoliciesAndLines(sparePartId: string): Promise<{
  policies: PolicyRow[];
  lines: StockLineRow[];
}> {
  const [policyRes, lineRes] = await Promise.all([
    pool.query<PolicyRow>(
      `
      SELECT
        p."id"::text AS "id",
        p."scopeType",
        p."warehouseId"::text AS "warehouseId",
        wh."key" AS "warehouseKey",
        p."storageLocationId"::text AS "storageLocationId",
        sl."key" AS "storageLocationKey",
        p."reorderLevel"::text AS "reorderLevel",
        p."minStock"::text AS "minStock",
        p."orderQuantity"::text AS "orderQuantity"
      FROM "sparePartStockPolicy" p
      LEFT JOIN "warehouse" wh ON wh."id" = p."warehouseId"
      LEFT JOIN "storageLocation" sl ON sl."id" = p."storageLocationId"
      WHERE p."sparePartId" = $1::uuid
      `,
      [sparePartId],
    ),
    pool.query<StockLineRow>(
      `
      SELECT
        sc."warehouseId"::text AS "warehouseId",
        wh."key" AS "warehouseKey",
        sc."storageLocationId"::text AS "storageLocationId",
        sl."key" AS "storageLocationKey",
        sc."quantity"::text AS "quantity"
      FROM "stockControl" sc
      JOIN "warehouse" wh ON wh."id" = sc."warehouseId"
      JOIN "storageLocation" sl ON sl."id" = sc."storageLocationId"
      WHERE sc."sparePartId" = $1::uuid
      `,
      [sparePartId],
    ),
  ]);
  return { policies: policyRes.rows, lines: lineRes.rows };
}

/** Snapshot effective on-hand vs Meldebestand before a stock decrease. */
export async function snapshotSparePartStockScopes(
  sparePartId: string,
): Promise<StockScopeSnapshot[]> {
  const { policies, lines } = await loadPoliciesAndLines(sparePartId);
  return evaluateScopes(policies, lines);
}

/**
 * After a stock decrease, notify policy-responsible users for every scope that crossed
 * from onHand >= reorderLevel to onHand < reorderLevel.
 */
export async function notifySparePartStockBelowReorder(
  sparePartId: string,
  beforeScopes: StockScopeSnapshot[],
): Promise<SparePartStockNotificationPayload[]> {
  const { policies, lines } = await loadPoliciesAndLines(sparePartId);
  const afterScopes = evaluateScopes(policies, lines);
  const beforeByKey = new Map(beforeScopes.map((s) => [s.key, s]));

  const crossed = afterScopes.filter((after) => {
    if (!(after.reorderLevel > 0) || !(after.onHandQuantity < after.reorderLevel)) {
      return false;
    }
    const before = beforeByKey.get(after.key);
    const beforeOnHand = before?.onHandQuantity ?? after.onHandQuantity;
    return beforeOnHand >= after.reorderLevel;
  });
  if (crossed.length === 0) return [];

  const spareRes = await pool.query<{
    id: string;
    key: string;
    name: string;
    siteId: string;
    siteKey: string;
    siteName: string;
  }>(
    `
    SELECT
      sp."id"::text AS "id",
      sp."key",
      sp."name",
      sp."siteId"::text AS "siteId",
      s."key" AS "siteKey",
      s."name" AS "siteName"
    FROM "sparePart" sp
    JOIN "site" s ON s."id" = sp."siteId"
    WHERE sp."id" = $1::uuid
    LIMIT 1
    `,
    [sparePartId],
  );
  const spare = spareRes.rows[0];
  if (!spare) return [];

  const emitted: SparePartStockNotificationPayload[] = [];
  for (const scope of crossed) {
    if (!scope.policyId) continue;
    const recipientUserIds = await resolveRecipientUserIdsForPolicy(scope.policyId);
    for (const userId of recipientUserIds) {
      const { rows } = await pool.query<SparePartStockNotificationPayload>(
        `
        INSERT INTO "sparePartStockNotification" (
          "userId",
          "sparePartId",
          "sparePartKey",
          "sparePartName",
          "siteKey",
          "siteName",
          "scopeType",
          "warehouseId",
          "storageLocationId",
          "warehouseKey",
          "storageLocationKey",
          "onHandQuantity",
          "reorderLevel"
        )
        VALUES (
          $1::uuid, $2::uuid, $3, $4, $5, $6, $7,
          $8::uuid, $9::uuid, $10, $11, $12::numeric, $13::numeric
        )
        RETURNING
          "id"::text AS "id",
          "userId"::text AS "userId",
          "sparePartId"::text AS "sparePartId",
          "sparePartKey",
          "sparePartName",
          "siteKey",
          "siteName",
          "scopeType",
          "warehouseId"::text AS "warehouseId",
          "storageLocationId"::text AS "storageLocationId",
          "warehouseKey",
          "storageLocationKey",
          "onHandQuantity"::float8 AS "onHandQuantity",
          "reorderLevel"::float8 AS "reorderLevel",
          "createdAt"::text AS "createdAt",
          "readAt"::text AS "readAt"
        `,
        [
          userId,
          spare.id,
          spare.key,
          spare.name,
          spare.siteKey,
          spare.siteName,
          scope.scopeType,
          scope.warehouseId,
          scope.storageLocationId,
          scope.warehouseKey,
          scope.storageLocationKey,
          scope.onHandQuantity,
          scope.reorderLevel,
        ],
      );
      const row = rows[0];
      if (row) {
        emitted.push({
          ...row,
          onHandQuantity: Number(row.onHandQuantity),
          reorderLevel: Number(row.reorderLevel),
        });
      }
    }
  }

  await Promise.all(
    emitted.map((notification) => broadcastStockNotification(notification)),
  );
  return emitted;
}

async function resolveRecipientUserIdsForPolicy(stockPolicyId: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `
    SELECT DISTINCT u."id"::text AS "id"
    FROM "sparePartStockPolicyResponsibleEmployee" r
    JOIN "users" u ON u."employeeId" = r."employeeId"
    WHERE r."stockPolicyId" = $1::uuid
    `,
    [stockPolicyId],
  );
  return rows.map((row) => row.id);
}
