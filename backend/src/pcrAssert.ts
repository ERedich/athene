import type { QueryResult, QueryResultRow } from "pg";

import { isPcrEnabledForOrderType } from "./siteAppParameters.js";

type PgClient = {
  query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>>;
};

export type PcrIds = {
  problemId: string | null;
  causeId: string | null;
  remedyId: string | null;
};

/**
 * Validates PCR IDs for a work order feedback/update.
 * - When required (end + PCR enabled for order type): all three must be set.
 * - When any is set: cascade + classification rules apply.
 * - When none set and not required: ok.
 */
export async function assertWorkOrderPcr(
  client: PgClient,
  opts: {
    siteId: string;
    orderType: string;
    assetId: string;
    pcr: PcrIds;
    required: boolean;
  },
): Promise<void> {
  const { siteId, orderType, assetId, pcr, required } = opts;
  const pcrEnabled = await isPcrEnabledForOrderType(client, siteId, orderType);
  const mustHave = required && pcrEnabled;

  const anySet = Boolean(pcr.problemId || pcr.causeId || pcr.remedyId);
  if (!anySet) {
    if (mustHave) throw new Error("pcr_required");
    return;
  }

  if (!pcr.problemId || !pcr.causeId || !pcr.remedyId) {
    throw new Error("pcr_incomplete");
  }

  const asset = await client.query<{ classificationId: string | null }>(
    `
    SELECT "classificationId"::text AS "classificationId"
    FROM "asset"
    WHERE "id" = $1::uuid AND "siteId" = $2::uuid
    LIMIT 1
    `,
    [assetId, siteId],
  );
  if (!asset.rows[0]) throw new Error("invalid_pcr_problem");
  const assetClassificationId = asset.rows[0].classificationId;

  const problem = await client.query<{
    id: string;
    classificationId: string | null;
    isActive: boolean;
  }>(
    `
    SELECT
      "id",
      "classificationId"::text AS "classificationId",
      "isActive"
    FROM "problem"
    WHERE "id" = $1::uuid
      AND "siteId" = $2::uuid
    LIMIT 1
    `,
    [pcr.problemId, siteId],
  );
  const problemRow = problem.rows[0];
  if (!problemRow || !problemRow.isActive) throw new Error("invalid_pcr_problem");

  if (assetClassificationId) {
    if (problemRow.classificationId !== assetClassificationId) {
      throw new Error("invalid_pcr_problem_classification");
    }
  }

  const linkPc = await client.query<{ ok: number }>(
    `
    SELECT 1 AS ok
    FROM "problemCause" pc
    JOIN "cause" c ON c."id" = pc."causeId"
    WHERE pc."problemId" = $1::uuid
      AND pc."causeId" = $2::uuid
      AND c."siteId" = $3::uuid
      AND c."isActive" = true
    LIMIT 1
    `,
    [pcr.problemId, pcr.causeId, siteId],
  );
  if (!linkPc.rows[0]) throw new Error("invalid_pcr_cause");

  const linkCr = await client.query<{ ok: number }>(
    `
    SELECT 1 AS ok
    FROM "causeRemedy" cr
    JOIN "remedy" r ON r."id" = cr."remedyId"
    WHERE cr."causeId" = $1::uuid
      AND cr."remedyId" = $2::uuid
      AND r."siteId" = $3::uuid
      AND r."isActive" = true
    LIMIT 1
    `,
    [pcr.causeId, pcr.remedyId, siteId],
  );
  if (!linkCr.rows[0]) throw new Error("invalid_pcr_remedy");
}

export function parseOptionalPcrUuid(value: unknown): string | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const t = value.trim();
  if (!t) return null;
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(t)) return "invalid";
  return t;
}
