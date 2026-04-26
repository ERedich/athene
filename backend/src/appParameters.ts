import type { Pool } from "pg";
import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";

/** Allgemein: freie Standortwahl bei Stammdaten (siteId). */
export const APP_PARAM_KEY_ALLOW_SITE_CHANGE = "GN-ASC";

/** Allgemein: Asset-Baumstruktur in Asset APP farbig nach Asset-Typ. */
export const APP_PARAM_KEY_COLORED_ASSET_TREE = "GN-CATR";

/** Allgemein: Anzeigenamen und Farben der Asset-Typen (JSON). */
export const APP_PARAM_KEY_ASSET_TYPES = "GN-ATYP";

const ASSET_TYPE_KEYS = ["site", "structure", "line", "maintenanceObject"] as const;
export type AssetTypeSlug = (typeof ASSET_TYPE_KEYS)[number];

export type AssetTypeDisplayEntry = {
  nameDe: string;
  nameEn: string;
  colorHex: string;
};

export type AssetTypeDisplayConfig = Record<AssetTypeSlug, AssetTypeDisplayEntry>;

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
  jsonValue: unknown | null;
  updatedAt: string;
};

type DbQueryable = Pick<Pool, "query">;

const DEFAULT_BOOLEAN_PARAMETERS: Record<string, boolean> = {
  [APP_PARAM_KEY_COLORED_ASSET_TREE]: true,
};

/** Accepts #RGB / #RRGGBB or without #; returns normalized #rrggbb or null if invalid. */
function parseColorHexStrict(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(s);
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return `#${h.toLowerCase()}`;
}

function parseGnAtypJsonValue(raw: unknown): AssetTypeDisplayConfig | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out = {} as Partial<AssetTypeDisplayConfig>;
  for (const k of ASSET_TYPE_KEYS) {
    const v = o[k];
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    const e = v as Record<string, unknown>;
    const nameDe = typeof e.nameDe === "string" ? e.nameDe.trim() : "";
    const nameEn = typeof e.nameEn === "string" ? e.nameEn.trim() : "";
    if (!nameDe || !nameEn || nameDe.length > 160 || nameEn.length > 160) return null;
    const colorHex = parseColorHexStrict(e.colorHex);
    if (!colorHex) return null;
    out[k] = { nameDe, nameEn, colorHex };
  }
  return out as AssetTypeDisplayConfig;
}

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
  return {
    ...DEFAULT_BOOLEAN_PARAMETERS,
    ...Object.fromEntries(rows.map((r) => [r.key, r.boolValue])),
  };
}

export async function getAssetTypeDisplayConfig(client: DbQueryable): Promise<AssetTypeDisplayConfig | null> {
  try {
    const { rows } = await client.query<{ jsonValue: unknown }>(
      `SELECT "jsonValue" FROM "appParameter" WHERE "key" = $1 AND "valueType" = 'json' LIMIT 1`,
      [APP_PARAM_KEY_ASSET_TYPES],
    );
    return parseGnAtypJsonValue(rows[0]?.jsonValue ?? null);
  } catch {
    return null;
  }
}

const selectRowSql = `
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
    "jsonValue",
    "updatedAt"::text AS "updatedAt"
`;

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
      ${selectRowSql}
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

  try {
    const kind = await pool.query<{ valueType: string }>(
      `SELECT "valueType" FROM "appParameter" WHERE "key" = $1 LIMIT 1`,
      [key],
    );
    const vt = kind.rows[0]?.valueType;
    if (!vt) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (vt === "boolean") {
      const boolValue = parseBoolBody(body.boolValue);
      if (boolValue === null) {
        res.status(400).json({ error: "invalid_body" });
        return;
      }
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
          "jsonValue",
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
      return;
    }

    if (vt === "json") {
      if (key !== APP_PARAM_KEY_ASSET_TYPES) {
        res.status(400).json({ error: "unsupported_json_parameter" });
        return;
      }
      const parsed = parseGnAtypJsonValue(body.jsonValue);
      if (!parsed) {
        res.status(400).json({ error: "invalid_json_value" });
        return;
      }
      const { rows } = await pool.query<AppParameterRow>(
        `
        UPDATE "appParameter"
        SET "jsonValue" = $1::jsonb, "updatedAt" = now()
        WHERE "key" = $2 AND "valueType" = 'json'
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
          "jsonValue",
          "updatedAt"::text AS "updatedAt"
        `,
        [JSON.stringify(parsed), key],
      );
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(row);
      return;
    }

    res.status(400).json({ error: "unsupported_value_type" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export const appParametersRouter = router;
