import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";

export type UiTranslationOverrideRow = {
  messageKey: string;
  locale: "de" | "en";
  value: string;
  updatedAt: string;
};

const router = Router();

const messageKeyMax = 512;
const valueMax = 20_000;

const messageKeyRe = /^[\w.]+$/;

function parseMessageKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim();
  if (!k || k.length > messageKeyMax || !messageKeyRe.test(k)) return null;
  return k;
}

function parseValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length > valueMax) return null;
  return raw;
}

router.get("/", async (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const r = await pool.query<
      Omit<UiTranslationOverrideRow, "locale"> & { locale: string }
    >(
      `
      SELECT "messageKey", "locale", "value", "updatedAt"
      FROM "uiTranslationOverride"
      ORDER BY "messageKey", "locale"
      `,
    );
    const overrides: UiTranslationOverrideRow[] = r.rows.map((row) => ({
      messageKey: row.messageKey,
      locale: row.locale === "en" ? "en" : "de",
      value: row.value,
      updatedAt: row.updatedAt,
    }));
    res.json({ overrides });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

type PatchItem = {
  messageKey: string;
  de?: string | null;
  en?: string | null;
};

function parsePatchBody(body: unknown): PatchItem[] | null {
  if (body === null || typeof body !== "object") return null;
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  const out: PatchItem[] = [];
  for (const el of items) {
    if (el === null || typeof el !== "object" || Array.isArray(el)) return null;
    const o = el as Record<string, unknown>;
    const messageKey = parseMessageKey(o.messageKey);
    if (!messageKey) return null;

    let de: string | null | undefined;
    let en: string | null | undefined;
    if ("de" in o) {
      if (o.de === null) de = null;
      else {
        const v = parseValue(o.de);
        if (v === null) return null;
        de = v;
      }
    }
    if ("en" in o) {
      if (o.en === null) en = null;
      else {
        const v = parseValue(o.en);
        if (v === null) return null;
        en = v;
      }
    }
    if (de === undefined && en === undefined) continue;
    out.push({ messageKey, de, en });
  }
  return out;
}

router.patch("/", async (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const items = parsePatchBody(req.body);
  if (!items) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  if (items.length === 0) {
    res.json({ ok: true, updated: 0 });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let n = 0;
    for (const it of items) {
      if (it.de !== undefined) {
        if (it.de === null) {
          const d = await client.query(
            `DELETE FROM "uiTranslationOverride" WHERE "messageKey" = $1 AND "locale" = 'de'`,
            [it.messageKey],
          );
          n += d.rowCount ?? 0;
        } else {
          await client.query(
            `
            INSERT INTO "uiTranslationOverride" ("messageKey", "locale", "value", "updatedAt")
            VALUES ($1, 'de', $2, now())
            ON CONFLICT ("messageKey", "locale")
            DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now()
            `,
            [it.messageKey, it.de],
          );
          n += 1;
        }
      }
      if (it.en !== undefined) {
        if (it.en === null) {
          const d = await client.query(
            `DELETE FROM "uiTranslationOverride" WHERE "messageKey" = $1 AND "locale" = 'en'`,
            [it.messageKey],
          );
          n += d.rowCount ?? 0;
        } else {
          await client.query(
            `
            INSERT INTO "uiTranslationOverride" ("messageKey", "locale", "value", "updatedAt")
            VALUES ($1, 'en', $2, now())
            ON CONFLICT ("messageKey", "locale")
            DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now()
            `,
            [it.messageKey, it.en],
          );
          n += 1;
        }
      }
    }
    await client.query("COMMIT");
    res.json({ ok: true, updated: n });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  } finally {
    client.release();
  }
});

export const translationsRouter = router;
