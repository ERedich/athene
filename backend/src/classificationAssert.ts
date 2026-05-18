import type { QueryResult, QueryResultRow } from "pg";

import { siteAccessSql } from "./siteAccess.js";

export type ClassificationScope = "asset" | "work_order" | "material";

type PgClient = {
  query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>>;
};

/** Ensures classification exists, matches siteId, user has site access, and appliesTo* matches scope. */
export async function assertClassificationForSiteAndScope(
  client: PgClient,
  userId: string,
  siteId: string,
  classificationId: string | null,
  scope: ClassificationScope,
): Promise<void> {
  if (classificationId === null) return;
  const appliesClause =
    scope === "asset"
      ? `cl."appliesToAsset" = true`
      : scope === "work_order"
        ? `cl."appliesToWorkOrder" = true`
        : `cl."appliesToMaterial" = true`;
  const { rows } = await client.query<{ id: string }>(
    `
    SELECT cl."id"
    FROM "classification" cl
    WHERE cl."id" = $1::uuid
      AND cl."siteId" = $2::uuid
      AND ${appliesClause}
      AND ${siteAccessSql('cl."siteId"', "$3")}
    `,
    [classificationId, siteId, userId],
  );
  if (!rows[0]) {
    throw new Error("invalid_classification");
  }
}
