import type { QueryResult, QueryResultRow } from "pg";

export type SiteAccessClient = {
  query: <T extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[],
  ) => Promise<QueryResult<T>>;
};

export function siteAccessSql(siteIdExpression: string, userIdParam: string): string {
  return `
    (
      EXISTS (
        SELECT 1
        FROM "userSite" access_us
        WHERE access_us."userId" = ${userIdParam}::uuid
          AND access_us."siteId" = ${siteIdExpression}
      )
      OR EXISTS (
        SELECT 1
        FROM "users" access_u
        WHERE access_u."id" = ${userIdParam}::uuid
          AND access_u."workingSiteId" = ${siteIdExpression}
      )
    )
  `;
}

export async function assertSiteAccess(
  client: SiteAccessClient,
  userId: string,
  siteId: string,
): Promise<void> {
  const { rowCount } = await client.query(
    `
    SELECT 1
    WHERE ${siteAccessSql("$2::uuid", "$1")}
    `,
    [userId, siteId],
  );
  if ((rowCount ?? 0) === 0) {
    throw new Error("site_access_denied");
  }
}
