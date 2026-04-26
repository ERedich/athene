import { Router, type Request, type Response } from "express";

import { fetchAppParameterBooleans, getAssetTypeDisplayConfig } from "./appParameters.js";
import { isProduction, sessionSecret } from "./authSessionConfig.js";
import { pool } from "./db.js";
import { clearSessionCookie, writeSessionCookie } from "./sessionToken.js";

export type AuthUserRow = {
  id: string;
  loginName: string;
  name: string;
  workingSiteId: string;
};

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown> | null | undefined;
  const loginName = typeof body?.loginName === "string" ? body.loginName.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!loginName || !password) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const { rows } = await pool.query<AuthUserRow>(
      `
      SELECT "id", "loginName", "name", "workingSiteId"
      FROM "users"
      WHERE "loginName" = $1
        AND "passwordHash" = crypt($2, "passwordHash")
      LIMIT 1
      `,
      [loginName, password],
    );
    const user = rows[0];
    if (!user) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    writeSessionCookie(res, user.id, sessionSecret, isProduction);
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/me", async (req: Request, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<AuthUserRow>(
      `
      SELECT "id", "loginName", "name", "workingSiteId"
      FROM "users"
      WHERE "id" = $1::uuid
      LIMIT 1
      `,
      [userId],
    );
    const user = rows[0];
    if (!user) {
      clearSessionCookie(res, isProduction);
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    let appParameterBooleans: Record<string, boolean> = {};
    let appParameterAssetTypes: Awaited<ReturnType<typeof getAssetTypeDisplayConfig>> = null;
    try {
      appParameterBooleans = await fetchAppParameterBooleans(pool);
    } catch (paramErr) {
      console.warn("[athene-backend] appParameter load skipped:", paramErr);
    }
    try {
      appParameterAssetTypes = await getAssetTypeDisplayConfig(pool);
    } catch (atypErr) {
      console.warn("[athene-backend] GN-ATYP load skipped:", atypErr);
    }
    res.json({ user, appParameterBooleans, appParameterAssetTypes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    // No server-side session store to clear; cookie is removed below.
  });
  clearSessionCookie(res, isProduction);
  res.status(204).send();
});

export const authRouter = router;
