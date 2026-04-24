import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult } from "pg";

import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";

export type CostCenterRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

const router = Router();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function parseBody(body: unknown): { key: string; name: string; siteId: string; isActive: boolean } | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const siteId = typeof o.siteId === "string" ? o.siteId.trim() : "";
  const isActive = o.isActive === undefined ? true : Boolean(o.isActive);
  if (!key || !name || !isUuid(siteId)) return null;
  return { key, name, siteId, isActive };
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

const selectCostCentersSql = `
  SELECT
    c."id",
    c."key",
    c."name",
    c."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    c."isActive",
    c."createdAt",
    c."updatedAt",
    c."createdBy",
    c."updatedBy"
  FROM "costCenter" c
  JOIN "site" s ON s."id" = c."siteId"
`;

router.get("/", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query<CostCenterRow>(
      `
      ${selectCostCentersSql}
      ORDER BY c."key" ASC
      `,
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
  const { key, name, siteId, isActive } = parsed;
  try {
    const row = await withAuditContext(auditMeta(req), async (client) => {
      const { rows } = await client.query<CostCenterRow>(
        `
        WITH inserted AS (
          INSERT INTO "costCenter" ("key", "name", "siteId", "isActive")
          VALUES ($1, $2, $3::uuid, $4)
          RETURNING *
        )
        SELECT
          i."id",
          i."key",
          i."name",
          i."siteId",
          s."key" AS "siteKey",
          s."name" AS "siteName",
          i."isActive",
          i."createdAt",
          i."updatedAt",
          i."createdBy",
          i."updatedBy"
        FROM inserted i
        JOIN "site" s ON s."id" = i."siteId"
        `,
        [key, name, siteId, isActive],
      );
      return rows[0];
    });
    if (!row) {
      res.status(500).json({ error: "no_row" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
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
  const { key, name, siteId, isActive } = parsed;
  try {
    const row = await withAuditContext(auditMeta(req), async (client) => {
      const existing = await client.query<Pick<CostCenterRow, "id">>(
        `SELECT "id" FROM "costCenter" WHERE "id" = $1::uuid`,
        [id],
      );
      if (existing.rowCount === 0) {
        return null;
      }
      const { rows } = await client.query<CostCenterRow>(
        `
        WITH updated AS (
          UPDATE "costCenter"
          SET "key" = $1, "name" = $2, "siteId" = $3::uuid, "isActive" = $4
          WHERE "id" = $5::uuid
          RETURNING *
        )
        SELECT
          u."id",
          u."key",
          u."name",
          u."siteId",
          s."key" AS "siteKey",
          s."name" AS "siteName",
          u."isActive",
          u."createdAt",
          u."updatedAt",
          u."createdBy",
          u."updatedBy"
        FROM updated u
        JOIN "site" s ON s."id" = u."siteId"
        `,
        [key, name, siteId, isActive, id],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
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
    const deleted = await withAuditContext(auditMeta(req), async (client) => {
      const result: QueryResult = await client.query(
        `DELETE FROM "costCenter" WHERE "id" = $1::uuid`,
        [id],
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

export const costCentersRouter = router;
