import type { PoolClient, QueryResultRow } from "pg";

export type DbClient = PoolClient;

/**
 * Replace work-order inspection-point snapshot from the linked inspection round.
 * Pass null roundId to clear the snapshot.
 */
export async function syncWorkOrderInspectionPointsSnapshot(
  client: DbClient,
  workOrderId: string,
  inspectionRoundId: string | null,
): Promise<void> {
  await client.query(`DELETE FROM "workOrderInspectionPoint" WHERE "workOrderId" = $1::uuid`, [
    workOrderId,
  ]);
  if (!inspectionRoundId) return;

  await client.query(
    `
    INSERT INTO "workOrderInspectionPoint"
      ("workOrderId", "pos", "name", "assetId", "assetKey", "assetName",
       "inspectionPointId", "inspectionPointKey", "inspectionPointName")
    SELECT
      $1::uuid,
      a."pos",
      a."name",
      a."assetId",
      ast."key",
      ast."name",
      a."inspectionPointId",
      ip."key",
      ip."name"
    FROM "inspectionRoundActivity" a
    LEFT JOIN "asset" ast ON ast."id" = a."assetId"
    LEFT JOIN "inspectionPoint" ip ON ip."id" = a."inspectionPointId"
    WHERE a."inspectionRoundId" = $2::uuid
    ORDER BY a."pos" ASC
    `,
    [workOrderId, inspectionRoundId],
  );
}

export async function assertInspectionRoundForSite(
  client: DbClient,
  userId: string,
  inspectionRoundId: string | null,
  siteId: string,
  siteAccessSql: (columnSql: string, userIdParam: string) => string,
): Promise<void> {
  if (!inspectionRoundId) return;
  const { rows } = await client.query<QueryResultRow & { id: string }>(
    `
    SELECT r."id"
    FROM "inspectionRound" r
    WHERE r."id" = $1::uuid
      AND r."siteId" = $2::uuid
      AND ${siteAccessSql('r."siteId"', "$3")}
    `,
    [inspectionRoundId, siteId, userId],
  );
  if (!rows[0]) throw new Error("invalid_inspection_round");
}
