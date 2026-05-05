import { Router, type Request, type Response } from "express";

import {
  fetchAppParameterBooleans,
  getAssetKeyGenerationMode,
  getAssetTypeDisplayConfig,
  getDefaultWorkOrderWorkgroupId,
  getShowAssetKeyPath,
} from "./appParameters.js";
import { isProduction, sessionSecret } from "./authSessionConfig.js";
import { pool } from "./db.js";
import { clearSessionCookie, createSessionToken, writeSessionCookie } from "./sessionToken.js";

export type AuthUserRow = {
  id: string;
  loginName: string;
  name: string;
  workingSiteId: string;
  employeeId: string | null;
  employeeKey: string | null;
  employeeName: string | null;
};

const router = Router();

const authUserSelect = `
  SELECT
    u."id",
    u."loginName",
    u."name",
    u."workingSiteId",
    u."employeeId",
    emp."key" AS "employeeKey",
    emp."name" AS "employeeName"
  FROM "users" u
  LEFT JOIN "employee" emp ON emp."id" = u."employeeId"
`;

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
      ${authUserSelect}
      WHERE u."loginName" = $1
        AND u."passwordHash" = crypt($2, u."passwordHash")
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
    const wantsMobileBearer =
      String(req.headers["x-athene-mobile-auth"] ?? "").trim() === "1";
    if (wantsMobileBearer) {
      res.json({ user, sessionToken: createSessionToken(user.id, sessionSecret) });
      return;
    }
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
      ${authUserSelect}
      WHERE u."id" = $1::uuid
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
    let appParameterDefaultWorkgroupId: string | null = null;
    let appParameterAssetKeyMode: Awaited<ReturnType<typeof getAssetKeyGenerationMode>> = "manual";
    let appParameterShowAssetKeyPath = false;
    let appParameterAssetKeyPathSeparator = ".";
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
    try {
      appParameterDefaultWorkgroupId = await getDefaultWorkOrderWorkgroupId(pool);
    } catch (dwgErr) {
      console.warn("[athene-backend] WO-DWG load skipped:", dwgErr);
    }
    try {
      appParameterAssetKeyMode = await getAssetKeyGenerationMode(pool);
    } catch (aakgErr) {
      console.warn("[athene-backend] GN-AAKG load skipped:", aakgErr);
    }
    try {
      const sakp = await getShowAssetKeyPath(pool);
      appParameterShowAssetKeyPath = sakp.show;
      appParameterAssetKeyPathSeparator = sakp.separator;
    } catch (sakpErr) {
      console.warn("[athene-backend] GN-SAKP load skipped:", sakpErr);
    }
    res.json({
      user,
      appParameterBooleans,
      appParameterAssetTypes,
      appParameterDefaultWorkgroupId,
      appParameterAssetKeyMode,
      appParameterShowAssetKeyPath,
      appParameterAssetKeyPathSeparator,
    });
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
