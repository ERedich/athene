import { Router, type Request, type Response } from "express";

import {
  DEFAULT_PRIMARY_COLOR_HEX,
  fetchAppParameterBooleans,
  getAssetKeyGenerationMode,
  getAssetTypeDisplayConfig,
  getDefaultShiftHours,
  getDefaultWorkOrderWorkgroupId,
  getPrimaryColorHex,
  getShowAssetKeyPath,
} from "./appParameters.js";
import { isProduction, sessionSecret } from "./authSessionConfig.js";
import { pool } from "./db.js";
import { isDatabaseUnavailableError } from "./dbErrors.js";
import { clearSessionCookie, createSessionToken, writeSessionCookie } from "./sessionToken.js";

export type AuthUserRow = {
  id: string;
  loginName: string;
  name: string;
  workingSiteId: string;
  employeeId: string | null;
  employeeKey: string | null;
  employeeName: string | null;
  siteIds: string[];
  workgroups: Array<{ id: string; key: string; name: string; siteId: string }>;
  onboardingCompletedAt: string | null;
};

const router = Router();
const DEV_FALLBACK_USER: AuthUserRow = {
  id: "00000000-0000-0000-0000-000000000001",
  loginName: "admin",
  name: "admin",
  workingSiteId: "00000000-0000-0000-0000-000000000002",
  employeeId: null,
  employeeKey: null,
  employeeName: null,
  siteIds: ["00000000-0000-0000-0000-000000000002"],
  workgroups: [],
  onboardingCompletedAt: null,
};

const authUserSelect = `
  SELECT
    u."id",
    u."loginName",
    u."name",
    u."workingSiteId",
    u."employeeId",
    emp."key" AS "employeeKey",
    emp."name" AS "employeeName",
    COALESCE(site_access."siteIds", ARRAY[]::uuid[])::text[] AS "siteIds",
    COALESCE(workgroups."workgroups", '[]'::json) AS "workgroups",
    u."onboardingCompletedAt"::text AS "onboardingCompletedAt"
  FROM "users" u
  LEFT JOIN "employee" emp ON emp."id" = u."employeeId"
  LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT site_all."id") AS "siteIds"
    FROM (
      SELECT u."workingSiteId" AS "id"
      UNION
      SELECT us."siteId" AS "id"
      FROM "userSite" us
      WHERE us."userId" = u."id"
    ) site_all
  ) site_access ON true
  LEFT JOIN LATERAL (
    SELECT json_agg(
      jsonb_build_object(
        'id', wg."id",
        'key', wg."key",
        'name', wg."name",
        'siteId', wg."siteId"
      )
      ORDER BY wg."key" ASC
    ) AS "workgroups"
    FROM "workgroupUser" wgu
    JOIN "workgroup" wg ON wg."id" = wgu."workgroupId"
    WHERE wgu."employeeId" = u."employeeId"
  ) workgroups ON true
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
    if (!isProduction && isDatabaseUnavailableError(err)) {
      if (loginName === "admin" && password === "admin") {
        writeSessionCookie(res, DEV_FALLBACK_USER.id, sessionSecret, isProduction);
        res.json({ user: DEV_FALLBACK_USER });
        return;
      }
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
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
    let appParameterDefaultShiftHours = 8;
    let appParameterAssetKeyMode: Awaited<ReturnType<typeof getAssetKeyGenerationMode>> = "manual";
    let appParameterShowAssetKeyPath = false;
    let appParameterAssetKeyPathSeparator = ".";
    let appParameterPrimaryColorHex = DEFAULT_PRIMARY_COLOR_HEX;
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
      appParameterDefaultShiftHours = await getDefaultShiftHours(pool);
    } catch (dshErr) {
      console.warn("[athene-backend] SH-DSH load skipped:", dshErr);
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
    try {
      appParameterPrimaryColorHex = await getPrimaryColorHex(pool);
    } catch (primErr) {
      console.warn("[athene-backend] GN-PRIM load skipped:", primErr);
    }
    res.json({
      user,
      appParameterBooleans,
      appParameterAssetTypes,
      appParameterDefaultWorkgroupId,
      appParameterDefaultShiftHours,
      appParameterAssetKeyMode,
      appParameterShowAssetKeyPath,
      appParameterAssetKeyPathSeparator,
      appParameterPrimaryColorHex,
    });
  } catch (err) {
    if (!isProduction && userId === DEV_FALLBACK_USER.id && isDatabaseUnavailableError(err)) {
      res.json({
        user: DEV_FALLBACK_USER,
        appParameterBooleans: {},
        appParameterAssetTypes: null,
        appParameterDefaultWorkgroupId: null,
        appParameterDefaultShiftHours: 8,
        appParameterAssetKeyMode: "manual",
        appParameterShowAssetKeyPath: false,
        appParameterAssetKeyPathSeparator: ".",
        appParameterPrimaryColorHex: DEFAULT_PRIMARY_COLOR_HEX,
      });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/onboarding/complete", async (req: Request, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    await pool.query(
      `
      UPDATE "users"
      SET "onboardingCompletedAt" = COALESCE("onboardingCompletedAt", now())
      WHERE "id" = $1::uuid
      `,
      [userId],
    );
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
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    res.json({ user });
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
