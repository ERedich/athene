import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { assertClassificationForSiteAndScope } from "./classificationAssert.js";
import {
  assertInspectionRoundForSite,
  syncWorkOrderInspectionPointsSnapshot,
} from "./inspectionRoundSnapshot.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";
import { assertWorkOrderTypeForSite } from "./workOrderTypes.js";

export type WorkOrderType = string;

export type WorkOrderCreateInput = {
  name: string;
  description: string | null;
  assetId: string;
  costCenterId: string;
  plannedStart: string;
  plannedEnd: string | null;
  plannedDurationMinutes: number | null;
  orderType: WorkOrderType;
  responsibleEmployeeIds: string[];
  workgroupId: string;
  classificationId: string | null;
  originalWo: string | null;
  maintenancePlanId: string | null;
  inspectionRoundId: string | null;
  /** Optional FSM links; omit or null for internal WOs. */
  customerId?: string | null;
  serviceContractId?: string | null;
};

export type DbClient = PoolClient;

type AssetSiteRow = QueryResultRow & { id: string; siteId: string };
type CostCenterSiteRow = QueryResultRow & { id: string; siteId: string };

export async function assertAssetAndCostCenterContext(
  client: DbClient,
  userId: string,
  assetId: string,
  costCenterId: string,
  siteIdOverride?: string,
): Promise<string> {
  const asset = await client.query<AssetSiteRow>(
    `
    SELECT "id", "siteId"
    FROM "asset"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    `,
    [assetId, userId],
  );
  const assetRow = asset.rows[0];
  if (!assetRow) throw new Error("invalid_asset");

  if (siteIdOverride && assetRow.siteId !== siteIdOverride) {
    throw new Error("asset_site_mismatch");
  }

  const cc = await client.query<CostCenterSiteRow>(
    `
    SELECT "id", "siteId"
    FROM "costCenter"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    `,
    [costCenterId, userId],
  );
  const ccRow = cc.rows[0];
  if (!ccRow) throw new Error("invalid_cost_center");
  if (ccRow.siteId !== assetRow.siteId) throw new Error("asset_cost_center_mismatch");

  return assetRow.siteId;
}

export async function assertWorkgroupForOrderSite(
  client: DbClient,
  userId: string,
  workgroupId: string | null,
  orderSiteId: string,
): Promise<void> {
  if (!workgroupId) return;
  const { rows } = await client.query<{ id: string }>(
    `
    SELECT w."id"
    FROM "workgroup" w
    WHERE w."id" = $1::uuid
      AND w."siteId" = $2::uuid
      AND ${siteAccessSql('w."siteId"', "$3")}
    `,
    [workgroupId, orderSiteId, userId],
  );
  if (!rows[0]) throw new Error("invalid_workgroup");
}

export async function assertResponsibleEmployeesContext(
  client: DbClient,
  userId: string,
  responsibleEmployeeIds: string[],
  siteId: string,
  workgroupId: string | null,
): Promise<void> {
  if (responsibleEmployeeIds.length === 0) {
    throw new Error("responsible_required");
  }
  for (const responsibleEmployeeId of responsibleEmployeeIds) {
    const employee = await client.query<QueryResultRow & { id: string; siteId: string }>(
      `
      SELECT "id", "siteId"::text AS "siteId"
      FROM "employee"
      WHERE "id" = $1::uuid
        AND ${siteAccessSql('"siteId"', "$2")}
      `,
      [responsibleEmployeeId, userId],
    );
    const employeeRow = employee.rows[0];
    if (!employeeRow) throw new Error("invalid_responsible_employee");
    if (employeeRow.siteId !== siteId) throw new Error("responsible_employee_site_mismatch");
    if (workgroupId) {
      const m = await client.query<{ ok: string }>(
        `
        SELECT '1' AS ok
        FROM "workgroupUser"
        WHERE "workgroupId" = $1::uuid
          AND "employeeId" = $2::uuid
          AND "isLeader" = true
        LIMIT 1
        `,
        [workgroupId, responsibleEmployeeId],
      );
      if (!m.rows[0]) {
        throw new Error("responsible_employee_not_leader");
      }
    }
  }
}

export async function setWorkOrderResponsibles(
  client: DbClient,
  workOrderId: string,
  employeeIds: string[],
): Promise<void> {
  await client.query(`DELETE FROM "workOrderResponsibleEmployee" WHERE "workOrderId" = $1::uuid`, [
    workOrderId,
  ]);
  if (employeeIds.length === 0) return;
  const placeholders = employeeIds.map((_, idx) => `($1::uuid, $${idx + 2}::uuid)`).join(", ");
  await client.query(
    `
    INSERT INTO "workOrderResponsibleEmployee" ("workOrderId", "employeeId")
    VALUES ${placeholders}
    ON CONFLICT ("workOrderId", "employeeId") DO NOTHING
    `,
    [workOrderId, ...employeeIds],
  );
}

/**
 * Validates context and inserts an open work order with responsibles.
 * Caller must run inside withAuditContext. Returns id + effective siteId.
 */
export async function createWorkOrderRecord(
  client: DbClient,
  userId: string,
  input: WorkOrderCreateInput,
): Promise<{ id: string; siteId: string }> {
  const siteIdFromRelations = await assertAssetAndCostCenterContext(
    client,
    userId,
    input.assetId,
    input.costCenterId,
  );
  const allowSiteChange = await getAllowSiteChange(client);
  const effectiveSiteId = allowSiteChange
    ? siteIdFromRelations
    : await getWorkingSiteId(client, userId);
  if (effectiveSiteId !== siteIdFromRelations) {
    throw new Error("site_access_denied");
  }
  await assertSiteAccess(client, userId, effectiveSiteId);
  await assertWorkgroupForOrderSite(client, userId, input.workgroupId, effectiveSiteId);
  await assertResponsibleEmployeesContext(
    client,
    userId,
    input.responsibleEmployeeIds,
    effectiveSiteId,
    input.workgroupId,
  );
  await assertClassificationForSiteAndScope(
    client,
    userId,
    effectiveSiteId,
    input.classificationId,
    "work_order",
  );

  if (input.originalWo) {
    const templateAccess = await client.query<{ id: string }>(
      `
      SELECT "id"
      FROM "workOrder"
      WHERE "id" = $1::uuid
        AND ${siteAccessSql('"siteId"', "$2")}
      LIMIT 1
      `,
      [input.originalWo, userId],
    );
    if (!templateAccess.rows[0]) throw new Error("invalid_original_wo");
  }

  if (input.maintenancePlanId) {
    const planAccess = await client.query<{ id: string }>(
      `
      SELECT "id"
      FROM "maintenancePlan"
      WHERE "id" = $1::uuid
        AND ${siteAccessSql('"siteId"', "$2")}
      LIMIT 1
      `,
      [input.maintenancePlanId, userId],
    );
    if (!planAccess.rows[0]) throw new Error("invalid_maintenance_plan");
  }

  await assertInspectionRoundForSite(
    client,
    userId,
    input.inspectionRoundId,
    effectiveSiteId,
    siteAccessSql,
  );

  await assertWorkOrderTypeForSite(client, effectiveSiteId, input.orderType);

  if (input.customerId) {
    const cust = await client.query<{ id: string }>(
      `
      SELECT "id"
      FROM "customer"
      WHERE "id" = $1::uuid
        AND "siteId" = $2::uuid
        AND ${siteAccessSql('"siteId"', "$3")}
      LIMIT 1
      `,
      [input.customerId, effectiveSiteId, userId],
    );
    if (!cust.rows[0]) throw new Error("invalid_customer");
  }

  if (input.serviceContractId) {
    const contract = await client.query<{ id: string; customerId: string }>(
      `
      SELECT "id", "customerId"::text AS "customerId"
      FROM "serviceContract"
      WHERE "id" = $1::uuid
        AND "siteId" = $2::uuid
        AND ${siteAccessSql('"siteId"', "$3")}
      LIMIT 1
      `,
      [input.serviceContractId, effectiveSiteId, userId],
    );
    const c = contract.rows[0];
    if (!c) throw new Error("invalid_service_contract");
    if (input.customerId && c.customerId !== input.customerId) {
      throw new Error("service_contract_customer_mismatch");
    }
  }

  const customerId = input.customerId ?? null;
  const serviceContractId = input.serviceContractId ?? null;

  const inserted = await client.query<{ id: string }>(
    `
    INSERT INTO "workOrder"
      ("name", "description", "siteId", "assetId", "costCenterId", "plannedStart", "plannedEnd",
       "plannedDurationMinutes", "orderType", "status", "workgroupId", "classificationId",
       "originalWo", "maintenancePlanId", "inspectionRoundId", "customerId", "serviceContractId")
    VALUES
      ($1, $2, $3::uuid, $4::uuid, $5::uuid, $6::timestamptz, $7::timestamptz, $8::integer, $9,
       'open', $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid)
    RETURNING "id"
    `,
    [
      input.name,
      input.description,
      effectiveSiteId,
      input.assetId,
      input.costCenterId,
      input.plannedStart,
      input.plannedEnd,
      input.plannedDurationMinutes,
      input.orderType,
      input.workgroupId,
      input.classificationId,
      input.originalWo,
      input.maintenancePlanId,
      input.inspectionRoundId,
      customerId,
      serviceContractId,
    ],
  );
  const workOrderId = inserted.rows[0]?.id;
  if (!workOrderId) throw new Error("no_row");
  await setWorkOrderResponsibles(client, workOrderId, input.responsibleEmployeeIds);
  await syncWorkOrderInspectionPointsSnapshot(client, workOrderId, input.inspectionRoundId);
  return { id: workOrderId, siteId: effectiveSiteId };
}
