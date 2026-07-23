import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";

const router = Router();

const ACTIVE_STATUSES = [
  "open",
  "assigned",
  "started",
  "paused",
  "continued",
  "ended",
] as const;

export type LoginKpisResponse = {
  openActive: number;
  completedLast24h: number;
};

router.get("/login-kpis", async (_req: Request, res: Response) => {
  try {
    const [openResult, completedResult] = await Promise.all([
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS "count"
         FROM "workOrder"
         WHERE "status" = ANY($1::text[])`,
        [ACTIVE_STATUSES],
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(DISTINCT h."workOrderId")::int AS "count"
         FROM "workOrderStatusHistory" h
         WHERE h."status" = 'done'
           AND h."occurredAt" >= now() - interval '24 hours'`,
      ),
    ]);

    const payload: LoginKpisResponse = {
      openActive: openResult.rows[0]?.count ?? 0,
      completedLast24h: completedResult.rows[0]?.count ?? 0,
    };
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export const publicLoginKpisRouter = router;
