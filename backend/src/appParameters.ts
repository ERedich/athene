import type { Pool } from "pg";
import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";

/** Allgemein: freie Standortwahl bei Stammdaten (siteId). */
export const APP_PARAM_KEY_ALLOW_SITE_CHANGE = "GN-ASC";

export type AppParameterRow = {
  id: string;
  key: string;
  category: string;
  codeSuffix: string;
  nameDe: string;
  nameEn: string;
  descriptionDe: string | null;
  descriptionEn: string | null;
  valueType: string;
  boolValue: boolean;
  updatedAt: string;
};

type DbQueryable = Pick<Pool, "query">;

/** Accept JSON booleans only (no Boolean() coercion — e.g. Boolean("false") === true). */
function parseBoolBody(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === 0 || raw === "0" || raw === "false") return false;
  return null;
}

export async function getAllowSiteChange(client: DbQueryable): Promise<boolean> {
  try {
    const { rows } = await client.query<{ boolValue: boolean }>(
      `SELECT "boolValue" FROM "appParameter" WHERE "key" = $1 LIMIT 1`,
      [APP_PARAM_KEY_ALLOW_SITE_CHANGE],
    );
    return rows[0]?.boolValue ?? false;
  } catch {
    return false;
  }
}

export async function getWorkingSiteId(client: DbQueryable, userId: string): Promise<string> {
  const { rows } = await client.query<{ workingSiteId: string }>(
    `SELECT "workingSiteId"::text AS "workingSiteId" FROM "users" WHERE "id" = $1::uuid LIMIT 1`,
    [userId],
  );
  const id = rows[0]?.workingSiteId;
  if (!id) throw new Error("user_not_found");
  return id;
}

export async function fetchAppParameterBooleans(client: DbQueryable): Promise<Record<string, boolean>> {
  const { rows } = await client.query<{ key: string; boolValue: boolean }>(
    `SELECT "key", "boolValue" FROM "appParameter" WHERE "valueType" = 'boolean'`,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.boolValue]));
}

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<AppParameterRow>(
      `
      SELECT
        "id",
        "key",
        "category",
        "codeSuffix",
        "nameDe",
        "nameEn",
        "descriptionDe",
        "descriptionEn",
        "valueType",
        "boolValue",
        "updatedAt"::text AS "updatedAt"
      FROM "appParameter"
      ORDER BY "category" ASC, "key" ASC
      `,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:key", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const key = typeof req.params.key === "string" ? req.params.key.trim() : "";
  if (!key) {
    res.status(400).json({ error: "invalid_key" });
    return;
  }
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body === null || typeof body !== "object") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const boolValue = parseBoolBody(body.boolValue);
  if (boolValue === null) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const { rows } = await pool.query<AppParameterRow>(
      `
      UPDATE "appParameter"
      SET "boolValue" = $1, "updatedAt" = now()
      WHERE "key" = $2 AND "valueType" = 'boolean'
      RETURNING
        "id",
        "key",
        "category",
        "codeSuffix",
        "nameDe",
        "nameEn",
        "descriptionDe",
        "descriptionEn",
        "valueType",
        "boolValue",
        "updatedAt"::text AS "updatedAt"
      `,
      [boolValue, key],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export const appParametersRouter = router;
