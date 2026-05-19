import type { PoolClient } from "pg";

import { pool } from "../db.js";
import { siteAccessSql } from "../siteAccess.js";
import type { DocumentEntityType } from "./documentTypes.js";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDocumentUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

export async function assertEntityAccessible(
  userId: string,
  entityType: DocumentEntityType,
  entityId: string,
  client: PoolClient | typeof pool = pool,
): Promise<boolean> {
  if (entityType === "asset") {
    const result = await client.query<{ id: string }>(
      `
      SELECT "id"
      FROM "asset"
      WHERE "id" = $1::uuid
        AND ${siteAccessSql('"siteId"', "$2")}
      `,
      [entityId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }
  const result = await client.query<{ id: string }>(
    `
    SELECT "id"
    FROM "workOrder"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    `,
    [entityId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getWorkOrderAssetId(
  workOrderId: string,
  client: PoolClient | typeof pool = pool,
): Promise<string | null> {
  const result = await client.query<{ assetId: string }>(
    `SELECT "assetId" FROM "workOrder" WHERE "id" = $1::uuid`,
    [workOrderId],
  );
  return result.rows[0]?.assetId ?? null;
}
