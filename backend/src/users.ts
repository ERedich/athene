import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult } from "pg";

import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { assertSiteAccess, type SiteAccessClient, siteAccessSql } from "./siteAccess.js";
import { ensureMyOpenWorkOrdersPreset } from "./workOrderSearchPresets.js";

export type UserRow = {
  id: string;
  loginName: string;
  name: string;
  workingSiteId: string;
  workingSiteKey: string;
  workingSiteName: string;
  employeeId: string | null;
  employeeKey: string | null;
  employeeName: string | null;
  employeeSiteKey: string | null;
  employeeSiteName: string | null;
  employeeSiteColorHex: string | null;
  employeeIsActive: boolean | null;
  siteIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type MutableUserFields = {
  loginName: string;
  name: string;
  workingSiteId: string;
  siteIds: string[];
  employeeId: string | null;
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function parseSiteIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return [];
  const normalized = value.map((entry) => (typeof entry === "string" ? entry.trim() : ""));
  if (normalized.some((id) => !isUuid(id))) return null;
  return [...new Set(normalized)];
}

function withPrimarySite(siteIds: string[], workingSiteId: string): string[] {
  const all = new Set(siteIds);
  all.add(workingSiteId);
  return [...all];
}

/** Ensures every id exists in `site` (Benutzer-Zugriffskreise dürfen alle BKs umfassen). */
async function assertAllSitesExist(client: SiteAccessClient, siteIds: string[]): Promise<void> {
  if (siteIds.length === 0) return;
  const { rows } = await client.query<{ c: number }>(
    `
    SELECT COUNT(*)::int AS c
    FROM "site"
    WHERE "id" = ANY($1::uuid[])
    `,
    [siteIds],
  );
  if (rows[0]?.c !== siteIds.length) {
    throw new Error("invalid_site_ids");
  }
}

function parseMutableFields(body: unknown): MutableUserFields | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const loginName = typeof o.loginName === "string" ? o.loginName.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const workingSiteId = typeof o.workingSiteId === "string" ? o.workingSiteId.trim() : "";
  const rawEmployeeId = o.employeeId;
  if (
    rawEmployeeId !== undefined &&
    rawEmployeeId !== null &&
    typeof rawEmployeeId !== "string"
  ) {
    return null;
  }
  const employeeId =
    typeof rawEmployeeId === "string" && rawEmployeeId.trim().length > 0
      ? rawEmployeeId.trim()
      : null;
  const parsedSiteIds = parseSiteIds(o.siteIds);
  if (
    !loginName ||
    !name ||
    !isUuid(workingSiteId) ||
    !parsedSiteIds ||
    (employeeId !== null && !isUuid(employeeId))
  ) {
    return null;
  }
  return {
    loginName,
    name,
    workingSiteId,
    siteIds: withPrimarySite(parsedSiteIds, workingSiteId),
    employeeId,
  };
}

function parseCreateBody(
  body: unknown,
): (MutableUserFields & { password: string }) | null {
  const mutable = parseMutableFields(body);
  if (!mutable || body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const password = typeof o.password === "string" ? o.password : "";
  if (!password) return null;
  return { ...mutable, password };
}

function parseUpdateBody(
  body: unknown,
): (MutableUserFields & { password: string | null }) | null {
  const mutable = parseMutableFields(body);
  if (!mutable || body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const rawPassword = o.password;
  if (rawPassword !== undefined && rawPassword !== null && typeof rawPassword !== "string") {
    return null;
  }
  const password =
    typeof rawPassword === "string" && rawPassword.length > 0 ? rawPassword : null;
  return { ...mutable, password };
}

function sendPgError(res: Response, err: unknown) {
  const e = err as { code?: string; detail?: string; message?: string; constraint?: string };
  if (e.code === "23505") {
    if (e.constraint === "users_loginName_key") {
      res.status(409).json({ error: "duplicate_login_name", message: e.detail ?? e.message });
      return;
    }
    if (
      e.constraint === "users_employeeid_unique_idx" ||
      e.constraint === "users_employeeId_unique_idx"
    ) {
      res.status(409).json({ error: "employee_already_linked", message: e.detail ?? e.message });
      return;
    }
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

async function ensureWorkingSiteIsPlant(siteId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `
    SELECT "id"
    FROM "site"
    WHERE "id" = $1::uuid
      AND "isPlant" = true
    LIMIT 1
    `,
    [siteId],
  );
  return (rowCount ?? 0) > 0;
}

async function ensureEmployeeMatchesWorkingSite(
  client: SiteAccessClient,
  employeeId: string | null,
  workingSiteId: string,
): Promise<void> {
  if (!employeeId) return;
  const { rows } = await client.query<{ siteId: string }>(
    `
    SELECT e."siteId"::text AS "siteId"
    FROM "employee" e
    WHERE e."id" = $1::uuid
    LIMIT 1
    `,
    [employeeId],
  );
  const employeeSiteId = rows[0]?.siteId;
  if (!employeeSiteId) {
    throw new Error("employee_not_found");
  }
  if (employeeSiteId !== workingSiteId) {
    throw new Error("site_mismatch");
  }
}

const selectUsersSql = `
  SELECT
    u."id",
    u."loginName",
    u."name",
    u."workingSiteId",
    ws."key" AS "workingSiteKey",
    ws."name" AS "workingSiteName",
    u."employeeId",
    emp."key" AS "employeeKey",
    emp."name" AS "employeeName",
    emp."isActive" AS "employeeIsActive",
    emp_site."key" AS "employeeSiteKey",
    emp_site."name" AS "employeeSiteName",
    emp_site."colorHex" AS "employeeSiteColorHex",
    COALESCE(
      array_agg(DISTINCT us."siteId"::text) FILTER (WHERE us."siteId" IS NOT NULL),
      ARRAY[]::text[]
    ) AS "siteIds",
    u."createdAt",
    u."updatedAt",
    COALESCE(created_by."loginName", u."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", u."updatedBy"::text) AS "updatedBy"
  FROM "users" u
  JOIN "site" ws ON ws."id" = u."workingSiteId"
  LEFT JOIN "employee" emp ON emp."id" = u."employeeId"
  LEFT JOIN "site" emp_site ON emp_site."id" = emp."siteId"
  LEFT JOIN "userSite" us ON us."userId" = u."id"
  LEFT JOIN "users" created_by ON created_by."id" = u."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = u."updatedBy"
`;

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<UserRow>(
      `
      ${selectUsersSql}
      WHERE ${siteAccessSql('u."workingSiteId"', "$1")}
        OR EXISTS (
          SELECT 1
          FROM "userSite" target_us
          WHERE target_us."userId" = u."id"
            AND ${siteAccessSql('target_us."siteId"', "$1")}
        )
      GROUP BY u."id", ws."id", emp."id", emp_site."id", created_by."id", updated_by."id"
      ORDER BY u."loginName" ASC
      `,
      [userId],
    );
    const normalized = rows.map((row) => ({
      ...row,
      siteIds: withPrimarySite(row.siteIds ?? [], row.workingSiteId),
    }));
    res.json(normalized);
  } catch (err) {
    sendPgError(res, err);
  }
});

export type UserSiteOptionRow = {
  id: string;
  key: string;
  name: string;
  isPlant: boolean;
  colorHex: string;
};

router.get("/all-sites", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<UserSiteOptionRow>(
      `
      SELECT
        s."id",
        s."key",
        s."name",
        s."isPlant",
        s."colorHex"
      FROM "site" s
      ORDER BY s."key" ASC
      `,
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = parseCreateBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { loginName, name, workingSiteId, password, siteIds, employeeId } = parsed;

  if (!(await ensureWorkingSiteIsPlant(workingSiteId))) {
    res.status(400).json({ error: "invalid_working_site" });
    return;
  }

  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      await assertSiteAccess(client, meta.userId, workingSiteId);
      await assertAllSitesExist(client, siteIds);
      await ensureEmployeeMatchesWorkingSite(client, employeeId, workingSiteId);
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO "users" ("loginName", "name", "passwordHash", "workingSiteId", "employeeId")
        VALUES ($1, $2, crypt($3, gen_salt('bf')), $4::uuid, $5::uuid)
        RETURNING "id"
        `,
        [loginName, name, password, workingSiteId, employeeId],
      );
      const userId = inserted.rows[0]?.id;
      if (!userId) return null;

      if (siteIds.length > 0) {
        const placeholders = siteIds
          .map((_, idx) => `($1::uuid, $${idx + 2}::uuid)`)
          .join(", ");
        await client.query(
          `
          INSERT INTO "userSite" ("userId", "siteId")
          VALUES ${placeholders}
          ON CONFLICT ("userId", "siteId") DO NOTHING
          `,
          [userId, ...siteIds],
        );
      }

      await ensureMyOpenWorkOrdersPreset(client, userId);

      const { rows } = await client.query<UserRow>(
        `
        ${selectUsersSql}
        WHERE u."id" = $1::uuid
        GROUP BY u."id", ws."id", emp."id", emp_site."id", created_by."id", updated_by."id"
        `,
        [userId],
      );
      return rows[0] ?? null;
    });

    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }

    res.status(201).json({ ...row, siteIds: withPrimarySite(row.siteIds ?? [], row.workingSiteId) });
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if ((err as Error).message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if ((err as Error).message === "invalid_site_ids") {
      res.status(400).json({ error: "invalid_site_ids" });
      return;
    }
    if ((err as Error).message === "site_mismatch") {
      res.status(400).json({ error: "site_mismatch" });
      return;
    }
    if ((err as Error).message === "employee_not_found") {
      res.status(400).json({ error: "employee_not_found" });
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

  const parsed = parseUpdateBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { loginName, name, workingSiteId, password, siteIds, employeeId } = parsed;

  if (!(await ensureWorkingSiteIsPlant(workingSiteId))) {
    res.status(400).json({ error: "invalid_working_site" });
    return;
  }

  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const existing = await client.query<{ id: string }>(
        `
        SELECT u."id"
        FROM "users" u
        WHERE u."id" = $1::uuid
          AND (
            ${siteAccessSql('u."workingSiteId"', "$2")}
            OR EXISTS (
              SELECT 1
              FROM "userSite" target_us
              WHERE target_us."userId" = u."id"
                AND ${siteAccessSql('target_us."siteId"', "$2")}
            )
          )
        `,
        [id, meta.userId],
      );
      if (existing.rowCount === 0) return null;

      await assertSiteAccess(client, meta.userId, workingSiteId);
      await assertAllSitesExist(client, siteIds);
      await ensureEmployeeMatchesWorkingSite(client, employeeId, workingSiteId);
      if (password) {
        await client.query(
          `
          UPDATE "users"
          SET
            "loginName" = $1,
            "name" = $2,
            "workingSiteId" = $3::uuid,
            "passwordHash" = crypt($4, gen_salt('bf')),
            "employeeId" = $5::uuid
          WHERE "id" = $6::uuid
          `,
          [loginName, name, workingSiteId, password, employeeId, id],
        );
      } else {
        await client.query(
          `
          UPDATE "users"
          SET
            "loginName" = $1,
            "name" = $2,
            "workingSiteId" = $3::uuid,
            "employeeId" = $4::uuid
          WHERE "id" = $5::uuid
          `,
          [loginName, name, workingSiteId, employeeId, id],
        );
      }

      await client.query(`DELETE FROM "userSite" WHERE "userId" = $1::uuid`, [id]);
      if (siteIds.length > 0) {
        const placeholders = siteIds
          .map((_, idx) => `($1::uuid, $${idx + 2}::uuid)`)
          .join(", ");
        await client.query(
          `
          INSERT INTO "userSite" ("userId", "siteId")
          VALUES ${placeholders}
          ON CONFLICT ("userId", "siteId") DO NOTHING
          `,
          [id, ...siteIds],
        );
      }

      const { rows } = await client.query<UserRow>(
        `
        ${selectUsersSql}
        WHERE u."id" = $1::uuid
        GROUP BY u."id", ws."id", emp."id", emp_site."id", created_by."id", updated_by."id"
        `,
        [id],
      );
      return rows[0] ?? null;
    });

    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json({ ...row, siteIds: withPrimarySite(row.siteIds ?? [], row.workingSiteId) });
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if ((err as Error).message === "site_access_denied") {
      res.status(403).json({ error: "site_access_denied" });
      return;
    }
    if ((err as Error).message === "invalid_site_ids") {
      res.status(400).json({ error: "invalid_site_ids" });
      return;
    }
    if ((err as Error).message === "site_mismatch") {
      res.status(400).json({ error: "site_mismatch" });
      return;
    }
    if ((err as Error).message === "employee_not_found") {
      res.status(400).json({ error: "employee_not_found" });
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
        DELETE FROM "users" u
        WHERE u."id" = $1::uuid
          AND (
            ${siteAccessSql('u."workingSiteId"', "$2")}
            OR EXISTS (
              SELECT 1
              FROM "userSite" target_us
              WHERE target_us."userId" = u."id"
                AND ${siteAccessSql('target_us."siteId"', "$2")}
            )
          )
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

export const usersRouter = router;
