import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";

export type AppFeedbackRow = {
  id: string;
  entryNumber: number;
  body: string;
  createdAt: string;
  createdBy: string;
  loginName: string;
};

const router = Router();

const bodyMax = 4000;

function parseBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > bodyMax) return null;
  return trimmed;
}

const selectSql = `
  SELECT
    f."id",
    f."entryNumber",
    f."body",
    f."createdAt",
    f."createdBy",
    COALESCE(u."loginName", f."createdBy"::text) AS "loginName"
  FROM "appFeedback" f
  LEFT JOIN "users" u ON u."id" = f."createdBy"
`;

router.get("/", async (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<AppFeedbackRow>(
      `
      ${selectSql}
      ORDER BY f."entryNumber" DESC
      `,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const bodyObj =
    req.body === null || typeof req.body !== "object"
      ? null
      : (req.body as Record<string, unknown>);
  const body = parseBody(bodyObj?.body);
  if (!body) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  try {
    const { rows } = await pool.query<AppFeedbackRow>(
      `
      WITH inserted AS (
        INSERT INTO "appFeedback" ("body", "createdBy")
        VALUES ($1, $2::uuid)
        RETURNING "id", "entryNumber", "body", "createdAt", "createdBy"
      )
      SELECT
        i."id",
        i."entryNumber",
        i."body",
        i."createdAt",
        i."createdBy",
        COALESCE(u."loginName", i."createdBy"::text) AS "loginName"
      FROM inserted i
      LEFT JOIN "users" u ON u."id" = i."createdBy"
      `,
      [body, userId],
    );
    const row = rows[0];
    if (!row) {
      res.status(500).json({ error: "internal_error" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export const appFeedbackRouter = router;
