import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult } from "pg";

import { getAllowSiteChange, getWorkingSiteId } from "./appParameters.js";
import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, siteAccessSql } from "./siteAccess.js";

export type ShiftRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  shortCode: string;
  colorHex: string;
  startTime: string;
  endTime: string;
  breakHours: string;
  weekdays: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const timeRe = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const defaultColorHex = "#64748b";

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

function isWeekdayKey(value: string): value is WeekdayKey {
  return (WEEKDAY_KEYS as readonly string[]).includes(value);
}

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

function parseTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!timeRe.test(trimmed)) return null;
  const parts = trimmed.split(":");
  if (parts.length === 2) return `${parts[0]}:${parts[1]}:00`;
  return trimmed;
}

function parseBreakHours(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded > 999.99) return null;
  return rounded;
}

function parseWeekdays(value: unknown): WeekdayKey[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<WeekdayKey>();
  const result: WeekdayKey[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const key = item.trim().toLowerCase();
    if (!isWeekdayKey(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  if (result.length === 0) return null;
  result.sort((a, b) => WEEKDAY_KEYS.indexOf(a) - WEEKDAY_KEYS.indexOf(b));
  return result;
}

function parseBody(body: unknown): {
  key: string;
  name: string;
  siteId: string;
  shortCode: string;
  colorHex: string;
  startTime: string;
  endTime: string;
  breakHours: number;
  weekdays: WeekdayKey[];
  isActive: boolean;
} | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const shortCode = typeof o.shortCode === "string" ? o.shortCode.trim() : "";
  const colorHexRaw = o.colorHex;
  const colorHex =
    colorHexRaw === undefined || colorHexRaw === null || colorHexRaw === ""
      ? defaultColorHex
      : parseColorHexStrict(colorHexRaw);
  const startTime = parseTime(o.startTime);
  const endTime = parseTime(o.endTime);
  const breakHours = parseBreakHours(o.breakHours ?? 0);
  const weekdays = parseWeekdays(o.weekdays);
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  if (!key || !name || !isUuid(siteId) || !shortCode || shortCode.length > 5) return null;
  if (!colorHex || !startTime || !endTime || breakHours === null || !weekdays) return null;
  return { key, name, siteId, shortCode, colorHex, startTime, endTime, breakHours, weekdays, isActive };
}

function sendPgError(res: Response, err: unknown) {
  const e = err as { code?: string; detail?: string; message?: string; constraint?: string };
  if (e.code === "23505") {
    const isShortCode =
      e.constraint === "shift_siteId_shortCode_uidx" ||
      (e.detail ?? "").includes("shortCode");
    res.status(409).json({
      error: isShortCode ? "duplicate_short_code" : "duplicate_key",
      message: e.detail ?? e.message,
    });
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

const selectShiftColumns = `
  sh."id",
  sh."key",
  sh."name",
  sh."siteId",
  s."key" AS "siteKey",
  s."name" AS "siteName",
  s."colorHex" AS "siteColorHex",
  sh."shortCode",
  sh."colorHex",
  to_char(sh."startTime", 'HH24:MI') AS "startTime",
  to_char(sh."endTime", 'HH24:MI') AS "endTime",
  sh."breakHours"::text AS "breakHours",
  sh."weekdays",
  sh."isActive",
  sh."createdAt",
  sh."updatedAt",
  COALESCE(created_by."loginName", sh."createdBy"::text) AS "createdBy",
  COALESCE(updated_by."loginName", sh."updatedBy"::text) AS "updatedBy"
`;

const selectShiftsSql = `
  SELECT
    ${selectShiftColumns}
  FROM "shift" sh
  JOIN "site" s ON s."id" = sh."siteId"
  LEFT JOIN "users" created_by ON created_by."id" = sh."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = sh."updatedBy"
`;

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<ShiftRow>(
      `
      ${selectShiftsSql}
      WHERE ${siteAccessSql('sh."siteId"', "$1")}
      ORDER BY sh."key" ASC
      `,
      [userId],
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = parseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { key, name, siteId, shortCode, colorHex, startTime, endTime, breakHours, weekdays, isActive } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : await getWorkingSiteId(client, meta.userId);
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      const { rows } = await client.query<ShiftRow>(
        `
        WITH inserted AS (
          INSERT INTO "shift" (
            "key", "name", "siteId", "shortCode", "colorHex", "startTime", "endTime", "breakHours", "weekdays", "isActive"
          )
          VALUES ($1, $2, $3::uuid, $4, $5, $6::time, $7::time, $8, $9::text[], $10)
          RETURNING *
        )
        SELECT
          ${selectShiftColumns.replace(/sh\./g, "i.")}
        FROM inserted i
        JOIN "site" s ON s."id" = i."siteId"
        LEFT JOIN "users" created_by ON created_by."id" = i."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = i."updatedBy"
        `,
        [key, name, effectiveSiteId, shortCode, colorHex, startTime, endTime, breakHours, weekdays, isActive],
      );
      return rows[0];
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    if ((err as Error).message === "user_not_found") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if ((err as Error).message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    sendPgError(res, err);
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = parseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { key, name, siteId, shortCode, colorHex, startTime, endTime, breakHours, weekdays, isActive } = parsed;
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<Pick<ShiftRow, "id" | "siteId">>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "shift"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      if (existing.rowCount === 0) {
        return null;
      }
      const storedSiteId = existing.rows[0]!.siteId;
      const allowSiteChange = await getAllowSiteChange(client);
      const effectiveSiteId = allowSiteChange ? siteId : storedSiteId;
      await assertSiteAccess(client, meta.userId, effectiveSiteId);
      const { rows } = await client.query<ShiftRow>(
        `
        WITH updated AS (
          UPDATE "shift"
          SET
            "key" = $1,
            "name" = $2,
            "siteId" = $3::uuid,
            "shortCode" = $4,
            "colorHex" = $5,
            "startTime" = $6::time,
            "endTime" = $7::time,
            "breakHours" = $8,
            "weekdays" = $9::text[],
            "isActive" = $10
          WHERE "id" = $11::uuid
          RETURNING *
        )
        SELECT
          ${selectShiftColumns.replace(/sh\./g, "u.")}
        FROM updated u
        JOIN "site" s ON s."id" = u."siteId"
        LEFT JOIN "users" created_by ON created_by."id" = u."createdBy"
        LEFT JOIN "users" updated_by ON updated_by."id" = u."updatedBy"
        `,
        [key, name, effectiveSiteId, shortCode, colorHex, startTime, endTime, breakHours, weekdays, isActive, id],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    if ((err as Error).message === "user_not_found") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if ((err as Error).message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    sendPgError(res, err);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const deleted = await withAuditContext(meta, async (client) => {
      const result: QueryResult = await client.query(
        `
        DELETE FROM "shift"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [id, meta.userId],
      );
      return result.rowCount ?? 0;
    });
    if (deleted === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

export const shiftsRouter = router;
