import type { Pool } from "pg";
import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";

/** Allgemein: freie Standortwahl bei Stammdaten (siteId). */
export const APP_PARAM_KEY_ALLOW_SITE_CHANGE = "GN-ASC";

/** Allgemein: Anzeigenamen und Farben der Asset-Typen (JSON). */
export const APP_PARAM_KEY_ASSET_TYPES = "GN-ATYP";

/** Aufträge: Standard-Fachgruppe für Neuanlagen (nullable UUID). */
export const APP_PARAM_KEY_DEFAULT_WORKGROUP = "WO-DWG";

/** Aufträge: Clever Search / Schnellere Suche im Suchpanel. */
export const APP_PARAM_KEY_ENABLE_CLEVER_SEARCH = "WO-ECS";

/** Aufträge: Modal-Ansicht statt Vollbild auf Aufträge- und Monitoring-Seite. */
export const APP_PARAM_KEY_WO_MODAL_VIEW = "GN-WOMD";

/** Allgemein: Asset-Schlüssel manuell oder automatisch (Werk). */
export const APP_PARAM_KEY_ASSET_KEY_GEN = "GN-AAKG";

/** Allgemein: Asset-Schlüssel-Pfad in Listen anzeigen (JSON). */
export const APP_PARAM_KEY_SHOW_ASSET_KEY_PATH = "GN-SAKP";

/** Allgemein: Asset-TreeTable-Zeilen mit Asset-Typ-Farbe (10% Opazität). */
export const APP_PARAM_KEY_COLORED_ASSET_TREE = "GN-CATR";

/** Material: Lagerdaten in der Ersatzteil-App nachträglich bearbeiten. */
export const APP_PARAM_KEY_ALLOW_CHANGE_STOCKDATA = "MT-ACSD";

/** Schichten: Standard-Schichtstunden wenn Mitarbeiter keine Schichtangaben hat. */
export const APP_PARAM_KEY_DEFAULT_SHIFT_HOURS = "SH-DSH";

const ASSET_TYPE_KEYS = ["site", "structure", "line", "maintenanceObject"] as const;

export type AssetKeyGenerationMode = "manual" | "auto_incremental";

export type ShowAssetKeyPathConfig = {
  show: boolean;
  /** Single character when show is true; default "." */
  separator: string;
};
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
  uuidValue: string | null;
  numValue: number;
  updatedAt: string;
};

type DbQueryable = Pick<Pool, "query">;

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

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

export function parseGnAakgJsonValue(raw: unknown): { mode: AssetKeyGenerationMode } | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const mode = o.mode;
  if (mode === "manual" || mode === "auto_incremental") return { mode };
  return null;
}

export function parseGnSakpJsonValue(raw: unknown): ShowAssetKeyPathConfig | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const showParsed = parseBoolBody(o.show);
  if (showParsed === null) return null;
  const sepRaw = typeof o.separator === "string" ? o.separator : ".";
  if (!showParsed) {
    return { show: false, separator: sepRaw.length === 1 ? sepRaw : "." };
  }
  if (sepRaw.length !== 1) return null;
  return { show: true, separator: sepRaw };
}

function parseNumValueBody(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 0 ? raw : null;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
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

export async function getAllowChangeStockdata(client: DbQueryable): Promise<boolean> {
  try {
    const { rows } = await client.query<{ boolValue: boolean }>(
      `SELECT "boolValue" FROM "appParameter" WHERE "key" = $1 LIMIT 1`,
      [APP_PARAM_KEY_ALLOW_CHANGE_STOCKDATA],
    );
    return rows[0]?.boolValue ?? true;
  } catch {
    return true;
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

export async function getAssetKeyGenerationMode(client: DbQueryable): Promise<AssetKeyGenerationMode> {
  try {
    const { rows } = await client.query<{ jsonValue: unknown }>(
      `SELECT "jsonValue" FROM "appParameter" WHERE "key" = $1 AND "valueType" = 'json' LIMIT 1`,
      [APP_PARAM_KEY_ASSET_KEY_GEN],
    );
    return parseGnAakgJsonValue(rows[0]?.jsonValue ?? null)?.mode ?? "manual";
  } catch {
    return "manual";
  }
}

export async function getShowAssetKeyPath(client: DbQueryable): Promise<ShowAssetKeyPathConfig> {
  try {
    const { rows } = await client.query<{ jsonValue: unknown }>(
      `SELECT "jsonValue" FROM "appParameter" WHERE "key" = $1 AND "valueType" = 'json' LIMIT 1`,
      [APP_PARAM_KEY_SHOW_ASSET_KEY_PATH],
    );
    return parseGnSakpJsonValue(rows[0]?.jsonValue ?? null) ?? { show: false, separator: "." };
  } catch {
    return { show: false, separator: "." };
  }
}

export async function getDefaultShiftHours(client: DbQueryable): Promise<number> {
  try {
    const { rows } = await client.query<{ numValue: string | number }>(
      `
      SELECT "numValue"
      FROM "appParameter"
      WHERE "key" = $1 AND "valueType" = 'number'
      LIMIT 1
      `,
      [APP_PARAM_KEY_DEFAULT_SHIFT_HOURS],
    );
    const raw = rows[0]?.numValue;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 8;
  } catch {
    return 8;
  }
}

export async function getDefaultWorkOrderWorkgroupId(client: DbQueryable): Promise<string | null> {
  try {
    const { rows } = await client.query<{ uuidValue: string | null }>(
      `
      SELECT "uuidValue"::text AS "uuidValue"
      FROM "appParameter"
      WHERE "key" = $1 AND "valueType" = 'uuid'
      LIMIT 1
      `,
      [APP_PARAM_KEY_DEFAULT_WORKGROUP],
    );
    return rows[0]?.uuidValue ?? null;
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
    "uuidValue"::text AS "uuidValue",
    "numValue",
    "updatedAt"::text AS "updatedAt"
`;

const returningRowColumns = `
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
  "uuidValue"::text AS "uuidValue",
  "numValue",
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
        RETURNING ${returningRowColumns}
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
      let payload: unknown = null;
      if (key === APP_PARAM_KEY_ASSET_TYPES) {
        const parsed = parseGnAtypJsonValue(body.jsonValue);
        if (!parsed) {
          res.status(400).json({ error: "invalid_json_value" });
          return;
        }
        payload = parsed;
      } else if (key === APP_PARAM_KEY_ASSET_KEY_GEN) {
        const parsed = parseGnAakgJsonValue(body.jsonValue);
        if (!parsed) {
          res.status(400).json({ error: "invalid_json_value" });
          return;
        }
        payload = parsed;
      } else if (key === APP_PARAM_KEY_SHOW_ASSET_KEY_PATH) {
        const parsed = parseGnSakpJsonValue(body.jsonValue);
        if (!parsed) {
          res.status(400).json({ error: "invalid_json_value" });
          return;
        }
        payload = parsed;
      } else {
        res.status(400).json({ error: "unsupported_json_parameter" });
        return;
      }
      const { rows } = await pool.query<AppParameterRow>(
        `
        UPDATE "appParameter"
        SET "jsonValue" = $1::jsonb, "updatedAt" = now()
        WHERE "key" = $2 AND "valueType" = 'json'
        RETURNING ${returningRowColumns}
        `,
        [JSON.stringify(payload), key],
      );
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(row);
      return;
    }

    if (vt === "uuid") {
      if (key !== APP_PARAM_KEY_DEFAULT_WORKGROUP) {
        res.status(400).json({ error: "unsupported_uuid_parameter" });
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(body, "uuidValue")) {
        res.status(400).json({ error: "invalid_body" });
        return;
      }
      const raw = body.uuidValue;
      let nextUuid: string | null;
      if (raw === null) {
        nextUuid = null;
      } else if (isUuid(raw)) {
        nextUuid = raw;
      } else {
        res.status(400).json({ error: "invalid_uuid_value" });
        return;
      }
      if (nextUuid !== null) {
        const { rows: okRows } = await pool.query<{ ok: boolean }>(
          `
          SELECT true AS "ok"
          FROM "workgroup" w
          JOIN "users" u ON u."id" = $2::uuid
          WHERE w."id" = $1::uuid
            AND w."siteId" = u."workingSiteId"
          LIMIT 1
          `,
          [nextUuid, userId],
        );
        if (!okRows[0]?.ok) {
          res.status(400).json({ error: "workgroup_site_mismatch" });
          return;
        }
      }
      const { rows } = await pool.query<AppParameterRow>(
        `
        UPDATE "appParameter"
        SET "uuidValue" = $1::uuid, "updatedAt" = now()
        WHERE "key" = $2 AND "valueType" = 'uuid'
        RETURNING ${returningRowColumns}
        `,
        [nextUuid, key],
      );
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(row);
      return;
    }

    if (vt === "number") {
      if (key !== APP_PARAM_KEY_DEFAULT_SHIFT_HOURS) {
        res.status(400).json({ error: "unsupported_number_parameter" });
        return;
      }
      const numValue = parseNumValueBody(body.numValue);
      if (numValue === null) {
        res.status(400).json({ error: "invalid_num_value" });
        return;
      }
      const { rows } = await pool.query<AppParameterRow>(
        `
        UPDATE "appParameter"
        SET "numValue" = $1, "updatedAt" = now()
        WHERE "key" = $2 AND "valueType" = 'number'
        RETURNING ${returningRowColumns}
        `,
        [numValue, key],
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
