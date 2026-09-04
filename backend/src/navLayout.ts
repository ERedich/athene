import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";
import {
  NAV_LAYOUT_VERSION,
  buildNavCatalogSets,
  defaultMobileLayoutJson,
  defaultWebLayoutJson,
  mobileRouteTos,
} from "./navCatalog.js";

const router = Router();

const { groupIds: CATALOG_GROUP_IDS, routeTos: WEB_TOS } = buildNavCatalogSets();
const MOBILE_TOS = mobileRouteTos();

type NavSource = "catalog" | "custom";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseSource(v: unknown): NavSource {
  return v === "custom" ? "custom" : "catalog";
}

function slugKey(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "config"}-${suffix}`;
}

function parseWebLayout(raw: unknown): object | null {
  if (!isPlainObject(raw)) return null;
  if (raw.version !== NAV_LAYOUT_VERSION) return null;
  if (!Array.isArray(raw.groups)) return null;

  const groups: unknown[] = [];
  const seenGroupIds = new Set<string>();
  const seenItemIds = new Set<string>();

  for (const g of raw.groups) {
    if (!isPlainObject(g)) return null;
    const id = typeof g.id === "string" ? g.id.trim() : "";
    if (!id || seenGroupIds.has(id)) return null;
    seenGroupIds.add(id);
    const source = parseSource(g.source);
    if (source === "catalog" && !CATALOG_GROUP_IDS.has(id)) return null;
    if (source === "custom" && !id.startsWith("custom:")) return null;
    const role = g.role === "leaf" ? "leaf" : "group";
    if (typeof g.hidden !== "boolean") return null;

    let name: string | undefined;
    if (source === "custom") {
      if (typeof g.name !== "string" || !g.name.trim()) return null;
      name = g.name.trim().slice(0, 80);
    }

    const to = typeof g.to === "string" ? g.to.trim() : undefined;
    if (role === "leaf") {
      if (!to || !WEB_TOS.has(to)) return null;
    }

    const items: unknown[] = [];
    if (!Array.isArray(g.items)) return null;
    for (const it of g.items) {
      if (!isPlainObject(it)) return null;
      const itemId = typeof it.id === "string" ? it.id.trim() : "";
      const itemTo = typeof it.to === "string" ? it.to.trim() : "";
      if (!itemId || !itemTo || seenItemIds.has(itemId)) return null;
      if (!WEB_TOS.has(itemTo)) return null;
      seenItemIds.add(itemId);
      const itemSource = parseSource(it.source);
      if (itemSource === "custom" && !itemId.startsWith("custom:")) return null;
      let itemName: string | undefined;
      if (itemSource === "custom") {
        if (typeof it.name !== "string" || !it.name.trim()) return null;
        itemName = it.name.trim().slice(0, 80);
      }
      if (typeof it.hidden !== "boolean") return null;
      items.push({
        id: itemId,
        source: itemSource,
        to: itemTo,
        name: itemName,
        hidden: it.hidden === true,
      });
    }

    groups.push({
      id,
      source,
      role,
      name,
      to: role === "leaf" ? to : source === "catalog" ? to : undefined,
      hidden: g.hidden,
      items: role === "leaf" ? [] : items,
    });
  }

  if (groups.length === 0) return null;

  return { version: NAV_LAYOUT_VERSION, platform: "web", groups };
}

function parseMobileLayout(raw: unknown): object | null {
  if (!isPlainObject(raw)) return null;
  if (raw.version !== NAV_LAYOUT_VERSION) return null;
  if (!Array.isArray(raw.items)) return null;

  const items: unknown[] = [];
  const seen = new Set<string>();
  for (const it of raw.items) {
    if (!isPlainObject(it)) return null;
    const id = typeof it.id === "string" ? it.id.trim() : "";
    const to = typeof it.to === "string" ? it.to.trim() : "";
    if (!id || !to || seen.has(id)) return null;
    if (!MOBILE_TOS.has(to)) return null;
    seen.add(id);
    const source = parseSource(it.source);
    if (source === "custom" && !id.startsWith("custom:")) return null;
    let name: string | undefined;
    if (source === "custom") {
      if (typeof it.name !== "string" || !it.name.trim()) return null;
      name = it.name.trim().slice(0, 80);
    }
    if (typeof it.hidden !== "boolean") return null;
    items.push({ id, source, to, name, hidden: it.hidden === true });
  }
  if (items.length === 0) return null;
  return { version: NAV_LAYOUT_VERSION, platform: "mobile", items };
}

type ConfigRow = {
  id: string;
  key: string;
  name: string;
  webLayout: unknown;
  mobileLayout: unknown;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

const selectSql = `
  SELECT
    c."id",
    c."key",
    c."name",
    c."webLayout",
    c."mobileLayout",
    c."createdAt",
    c."updatedAt",
    c."createdBy",
    c."updatedBy"
  FROM "navMenuConfig" c
`;

router.get("/", async (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query<ConfigRow>(
      `${selectSql} ORDER BY c."updatedAt" DESC`,
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/active", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const platform =
    String(req.query.platform ?? "web").toLowerCase() === "mobile"
      ? "mobile"
      : "web";
  try {
    const { rows } = await pool.query<{
      webLayout: unknown;
      mobileLayout: unknown;
      configId: string | null;
    }>(
      `
      SELECT
        c."webLayout",
        c."mobileLayout",
        u."navMenuConfigId"::text AS "configId"
      FROM "users" u
      LEFT JOIN "navMenuConfig" c ON c."id" = u."navMenuConfigId"
      WHERE u."id" = $1::uuid
      LIMIT 1
      `,
      [userId],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (!row.configId) {
      res.json({
        configId: null,
        platform,
        layout: null,
      });
      return;
    }
    res.json({
      configId: row.configId,
      platform,
      layout: platform === "mobile" ? row.mobileLayout : row.webLayout,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const id = String(req.params.id ?? "");
  try {
    const { rows } = await pool.query<ConfigRow>(
      `${selectSql} WHERE c."id" = $1::uuid LIMIT 1`,
      [id],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
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
  const body =
    req.body === null || typeof req.body !== "object"
      ? null
      : (req.body as Record<string, unknown>);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) {
    res.status(400).json({ error: "invalid_name" });
    return;
  }

  const webLayout =
    body?.webLayout === undefined
      ? defaultWebLayoutJson()
      : parseWebLayout(body.webLayout);
  const mobileLayout =
    body?.mobileLayout === undefined
      ? defaultMobileLayoutJson()
      : parseMobileLayout(body.mobileLayout);

  if (!webLayout || !mobileLayout) {
    res.status(400).json({ error: "invalid_layout" });
    return;
  }

  const key = slugKey(name);
  const assignSelf = body?.assignSelf === true;

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<ConfigRow>(
        `
        INSERT INTO "navMenuConfig" (
          "key", "name", "webLayout", "mobileLayout", "createdBy", "updatedBy"
        )
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::uuid, $5::uuid)
        RETURNING
          "id", "key", "name", "webLayout", "mobileLayout",
          "createdAt", "updatedAt", "createdBy", "updatedBy"
        `,
        [key, name, JSON.stringify(webLayout), JSON.stringify(mobileLayout), userId],
      );
      const row = rows[0];
      if (assignSelf && row) {
        await client.query(
          `UPDATE "users" SET "navMenuConfigId" = $2::uuid WHERE "id" = $1::uuid`,
          [userId, row.id],
        );
      }
      await client.query("COMMIT");
      res.status(201).json(row);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const id = String(req.params.id ?? "");
  const body =
    req.body === null || typeof req.body !== "object"
      ? null
      : (req.body as Record<string, unknown>);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) {
    res.status(400).json({ error: "invalid_name" });
    return;
  }
  const webLayout = parseWebLayout(body?.webLayout);
  const mobileLayout = parseMobileLayout(body?.mobileLayout);
  if (!webLayout || !mobileLayout) {
    res.status(400).json({ error: "invalid_layout" });
    return;
  }
  const assignSelf = body?.assignSelf === true;

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<ConfigRow>(
        `
        UPDATE "navMenuConfig"
        SET
          "name" = $2,
          "webLayout" = $3::jsonb,
          "mobileLayout" = $4::jsonb,
          "updatedBy" = $5::uuid,
          "updatedAt" = now()
        WHERE "id" = $1::uuid
        RETURNING
          "id", "key", "name", "webLayout", "mobileLayout",
          "createdAt", "updatedAt", "createdBy", "updatedBy"
        `,
        [id, name, JSON.stringify(webLayout), JSON.stringify(mobileLayout), userId],
      );
      const row = rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (assignSelf) {
        await client.query(
          `UPDATE "users" SET "navMenuConfigId" = $2::uuid WHERE "id" = $1::uuid`,
          [userId, row.id],
        );
      }
      await client.query("COMMIT");
      res.json(row);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const id = String(req.params.id ?? "");
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM "navMenuConfig" WHERE "id" = $1::uuid`,
      [id],
    );
    if (!rowCount) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export { router as navMenuConfigsRouter };

/** Active layout endpoint kept on legacy path for sidebar. */
export const navLayoutRouter = Router();

navLayoutRouter.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const platform =
    String(req.query.platform ?? "web").toLowerCase() === "mobile"
      ? "mobile"
      : "web";
  try {
    const { rows } = await pool.query<{
      webLayout: unknown;
      mobileLayout: unknown;
      configId: string | null;
    }>(
      `
      SELECT
        c."webLayout",
        c."mobileLayout",
        u."navMenuConfigId"::text AS "configId"
      FROM "users" u
      LEFT JOIN "navMenuConfig" c ON c."id" = u."navMenuConfigId"
      WHERE u."id" = $1::uuid
      LIMIT 1
      `,
      [userId],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({
      configId: row.configId,
      platform,
      navLayout:
        row.configId == null
          ? null
          : platform === "mobile"
            ? row.mobileLayout
            : row.webLayout,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});
