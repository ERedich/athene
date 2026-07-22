import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult, QueryResultRow } from "pg";

import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

export const SITE_APP_PARAM_KEY_WO_PCR = "WO-PCR";

export type SiteAppParameterRow = {
  id: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  key: string;
  category: string;
  codeSuffix: string;
  nameDe: string;
  nameEn: string;
  descriptionDe: string | null;
  descriptionEn: string | null;
  valueType: string;
  boolValue: boolean;
  jsonValue: unknown | null;
  uuidValue: string | null;
  numValue: number | null;
  timeValue: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type PgClient = {
  query: <T extends QueryResultRow>(queryText: string, values?: unknown[]) => Promise<QueryResult<T>>;
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function sendPgError(res: Response, err: unknown) {
  const e = err as { code?: string; detail?: string; message?: string };
  if (e.code === "23505") {
    res.status(409).json({ error: "duplicate_key", message: e.detail ?? e.message });
    return;
  }
  if (e.code === "23503") {
    res.status(409).json({ error: "foreign_key_violation", message: e.detail ?? e.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

function auditMeta(req: Request) {
  const userId = req.session.userId;
  if (!userId) {
    throw new Error("missing_session_user");
  }
  return {
    userId,
    requestId: randomUUID(),
    reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
    source: "api",
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? "",
  };
}

/** Parse WO-PCR jsonValue into order-type key list. */
export function parseWoPcrJsonValue(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const keys: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") return null;
    const t = entry.trim();
    if (!t || t.length > 100) return null;
    keys.push(t);
  }
  return [...new Set(keys)];
}

export async function ensureDefaultSiteAppParameters(
  client: PgClient,
  siteId: string,
  userId: string,
): Promise<void> {
  await client.query(
    `
    INSERT INTO "siteAppParameter" (
      "siteId",
      "key",
      "category",
      "codeSuffix",
      "nameDe",
      "nameEn",
      "descriptionDe",
      "descriptionEn",
      "valueType",
      "boolValue",
      "jsonValue",
      "createdBy",
      "updatedBy"
    )
    VALUES (
      $1::uuid,
      'WO-PCR',
      'WO',
      'PCR',
      'Problem-Ursache-Maßnahme Auftragstypen',
      'Problem Cause Remedy work order types',
      'Auswahl der Auftragsarten, für die in der Rückmeldung PCR-Felder (Problem / Ursache / Maßnahme) gelten. Standard: Störung (breakdown).',
      'Selects work order types for which PCR fields (Problem / Cause / Remedy) apply in feedback. Default: breakdown.',
      'json',
      false,
      '["breakdown"]'::jsonb,
      $2::uuid,
      $2::uuid
    )
    ON CONFLICT ("siteId", "key") DO NOTHING
    `,
    [siteId, userId],
  );
}

/** Returns order-type keys for which PCR applies on the site (default breakdown). */
export async function getSitePcrOrderTypeKeys(
  client: PgClient,
  siteId: string,
): Promise<string[]> {
  const { rows } = await client.query<{ jsonValue: unknown }>(
    `
    SELECT "jsonValue"
    FROM "siteAppParameter"
    WHERE "siteId" = $1::uuid
      AND "key" = $2
      AND "valueType" = 'json'
    LIMIT 1
    `,
    [siteId, SITE_APP_PARAM_KEY_WO_PCR],
  );
  const parsed = parseWoPcrJsonValue(rows[0]?.jsonValue ?? null);
  return parsed ?? ["breakdown"];
}

export async function isPcrEnabledForOrderType(
  client: PgClient,
  siteId: string,
  orderType: string,
): Promise<boolean> {
  const keys = await getSitePcrOrderTypeKeys(client, siteId);
  return keys.includes(orderType);
}

const selectSql = `
  SELECT
    p."id",
    p."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    s."colorHex" AS "siteColorHex",
    p."key",
    p."category",
    p."codeSuffix",
    p."nameDe",
    p."nameEn",
    p."descriptionDe",
    p."descriptionEn",
    p."valueType",
    p."boolValue",
    p."jsonValue",
    p."uuidValue"::text AS "uuidValue",
    p."numValue",
    p."timeValue",
    p."createdAt",
    p."updatedAt",
    COALESCE(created_by."loginName", p."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", p."updatedBy"::text) AS "updatedBy"
  FROM "siteAppParameter" p
  JOIN "site" s ON s."id" = p."siteId"
  LEFT JOIN "users" created_by ON created_by."id" = p."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = p."updatedBy"
`;

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const siteIdRaw = typeof req.query.siteId === "string" ? req.query.siteId.trim() : "";
  if (!isUuid(siteIdRaw)) {
    res.status(400).json({ error: "invalid_site_id" });
    return;
  }
  try {
    await assertSiteAccess(pool, userId, siteIdRaw);
    const { rows } = await pool.query<SiteAppParameterRow>(
      `
      ${selectSql}
      WHERE p."siteId" = $1::uuid
        AND ${siteAccessSql('p."siteId"', "$2")}
      ORDER BY p."category" ASC, p."key" ASC
      `,
      [siteIdRaw, userId],
    );
    res.json(rows);
  } catch (err) {
    if ((err as Error).message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    sendPgError(res, err);
  }
});

router.put("/:siteId/:key", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { siteId, key } = req.params;
  if (!isUuid(siteId) || !key || typeof key !== "string") {
    res.status(400).json({ error: "invalid_params" });
    return;
  }
  const body = req.body;
  if (body === null || typeof body !== "object") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      await assertSiteAccess(client, meta.userId, siteId);
      const kind = await client.query<{ valueType: string }>(
        `
        SELECT "valueType"
        FROM "siteAppParameter"
        WHERE "siteId" = $1::uuid AND "key" = $2
        LIMIT 1
        `,
        [siteId, key],
      );
      const vt = kind.rows[0]?.valueType;
      if (!vt) return null;

      if (key === SITE_APP_PARAM_KEY_WO_PCR && vt === "json") {
        const parsed = parseWoPcrJsonValue((body as Record<string, unknown>).jsonValue);
        if (parsed === null) throw new Error("invalid_json_value");
        if (parsed.length > 0) {
          const { rows: typeRows } = await client.query<{ key: string }>(
            `
            SELECT "key"
            FROM "workOrderType"
            WHERE "siteId" = $1::uuid
              AND "key" = ANY($2::text[])
            `,
            [siteId, parsed],
          );
          const found = new Set(typeRows.map((r) => r.key));
          for (const ot of parsed) {
            if (!found.has(ot)) throw new Error("invalid_order_type_key");
          }
        }
        await client.query(
          `
          UPDATE "siteAppParameter"
          SET "jsonValue" = $1::jsonb, "updatedAt" = now()
          WHERE "siteId" = $2::uuid AND "key" = $3 AND "valueType" = 'json'
          `,
          [JSON.stringify(parsed), siteId, key],
        );
        const refetch = await client.query<SiteAppParameterRow>(
          `
          ${selectSql}
          WHERE p."siteId" = $1::uuid AND p."key" = $2
          LIMIT 1
          `,
          [siteId, key],
        );
        return refetch.rows[0] ?? null;
      }

      throw new Error("unsupported_parameter");
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if (message === "invalid_json_value" || message === "invalid_order_type_key") {
      res.status(400).json({ error: message });
      return;
    }
    if (message === "unsupported_parameter") {
      res.status(400).json({ error: "unsupported_parameter" });
      return;
    }
    sendPgError(res, err);
  }
});

export const siteAppParametersRouter = router;
