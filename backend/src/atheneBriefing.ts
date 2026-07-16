import { Router, type Request, type Response } from "express";
import { OpenAI } from "openai";

import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";

const router = Router();

const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
const chatModel = process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";

const CACHE_TTL_MS = 10 * 60 * 1000;

type BriefingCounts = {
  created24h: number;
  completed24h: number;
  bookings24h: number;
  maintenanceNext48h: number;
  unreadNotifications: number;
};

type MaintenancePreview = {
  orderNumber: number | null;
  name: string;
  plannedStart: string;
};

type BriefingParagraphs = {
  news: string;
  lookback: string;
  outlook: string;
};

type AtheneBriefingResponse = {
  counts: BriefingCounts;
  news: string;
  lookback: string;
  outlook: string;
  summarySource: "ai" | "fallback";
  maintenancePreview: MaintenancePreview[];
};

type CacheEntry = {
  expiresAt: number;
  payload: AtheneBriefingResponse;
};

const briefingCache = new Map<string, CacheEntry>();

function sendPgError(res: Response, err: unknown) {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

function resolveLang(req: Request): "de" | "en" {
  const q = typeof req.query.lang === "string" ? req.query.lang.toLowerCase() : "";
  if (q.startsWith("en")) return "en";
  if (q.startsWith("de")) return "de";
  const accept = (req.headers["accept-language"] ?? "").toLowerCase();
  if (accept.startsWith("en")) return "en";
  return "de";
}

function fallbackNews(unread: number, lang: "de" | "en"): string {
  if (lang === "en") {
    if (unread <= 0) return "You currently have no new notifications in the notification center.";
    if (unread === 1) return "You have one new unread notification waiting in the notification center.";
    return `You have ${unread} new unread notifications waiting in the notification center.`;
  }
  if (unread <= 0) return "Du hast derzeit keine neuen Mitteilungen in der Mitteilungszentrale.";
  if (unread === 1) return "Du hast eine neue ungelesene Mitteilung in der Mitteilungszentrale.";
  return `Du hast ${unread} neue ungelesene Mitteilungen in der Mitteilungszentrale.`;
}

function fallbackParagraphs(counts: BriefingCounts, lang: "de" | "en"): BriefingParagraphs {
  if (lang === "en") {
    return {
      news: fallbackNews(counts.unreadNotifications, lang),
      lookback: `In the last 24 hours, ${counts.created24h} work orders were created, ${counts.completed24h} were completed, and ${counts.bookings24h} bookings were recorded.`,
      outlook: `There ${counts.maintenanceNext48h === 1 ? "is" : "are"} ${counts.maintenanceNext48h} maintenance order${counts.maintenanceNext48h === 1 ? "" : "s"} planned in the next 48 hours.`,
    };
  }
  return {
    news: fallbackNews(counts.unreadNotifications, lang),
    lookback: `In den letzten 24 Stunden wurden ${counts.created24h} Aufträge erstellt, ${counts.completed24h} auf erledigt/beendet gesetzt und ${counts.bookings24h} Buchungen erfasst.`,
    outlook: `Für die kommenden 48 Stunden ${counts.maintenanceNext48h === 1 ? "steht" : "stehen"} ${counts.maintenanceNext48h} Wartung${counts.maintenanceNext48h === 1 ? "" : "en"} an.`,
  };
}

async function generateAiParagraphs(
  counts: BriefingCounts,
  preview: MaintenancePreview[],
  lang: "de" | "en",
): Promise<BriefingParagraphs | null> {
  if (!openai) return null;
  const language = lang === "en" ? "English" : "German";
  const previewLines =
    preview.length === 0
      ? "none"
      : preview
          .map((m) => `- ${m.orderNumber ?? "—"}: ${m.name} @ ${m.plannedStart}`)
          .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: chatModel,
      temperature: 0.4,
      max_tokens: 320,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are Athene, the CMMS assistant. Write a short warm operational briefing for the dashboard.",
            `Respond in ${language} only.`,
            'Return JSON with exactly three string fields: "news" (unread notifications for the user), "lookback" (past 24h activity), and "outlook" (next 48h maintenance preview).',
            "Each field is one short flowing paragraph (1–3 sentences). No markdown, no bullet lists, no greetings, no section titles inside the strings.",
            "Use only the provided facts. Do not invent numbers or orders.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Unread notifications for this user: ${counts.unreadNotifications}`,
            `Last 24h — created work orders: ${counts.created24h}`,
            `Last 24h — completed/ended work orders: ${counts.completed24h}`,
            `Last 24h — bookings (transactions): ${counts.bookings24h}`,
            `Next 48h — upcoming maintenance work orders: ${counts.maintenanceNext48h}`,
            `Upcoming maintenance samples:\n${previewLines}`,
          ].join("\n"),
        },
      ],
    });
    const raw = (completion.choices[0]?.message?.content ?? "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      news?: unknown;
      lookback?: unknown;
      outlook?: unknown;
    };
    const news = typeof parsed.news === "string" ? parsed.news.trim() : "";
    const lookback = typeof parsed.lookback === "string" ? parsed.lookback.trim() : "";
    const outlook = typeof parsed.outlook === "string" ? parsed.outlook.trim() : "";
    if (!news || !lookback || !outlook) return null;
    return { news, lookback, outlook };
  } catch (err) {
    console.error("athene_briefing_openai_failed", err);
    return null;
  }
}

router.get("/athene-briefing", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const lang = resolveLang(req);
  const cacheKey = `v3:${userId}:${lang}`;
  const cached = briefingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.payload);
    return;
  }

  const siteFilterWo = siteAccessSql('w."siteId"', "$1");
  const siteFilterTx = siteAccessSql('t."siteId"', "$1");

  try {
    const [
      createdRes,
      completedRes,
      bookingsRes,
      maintenanceCountRes,
      maintenancePreviewRes,
      unreadRes,
    ] = await Promise.all([
      pool.query<{ count: number }>(
        `
        SELECT COUNT(*)::int AS "count"
        FROM "workOrder" w
        WHERE ${siteFilterWo}
          AND w."createdAt" >= now() - interval '24 hours'
        `,
        [userId],
      ),
      pool.query<{ count: number }>(
        `
        SELECT COUNT(DISTINCT h."workOrderId")::int AS "count"
        FROM "workOrderStatusHistory" h
        JOIN "workOrder" w ON w."id" = h."workOrderId"
        WHERE ${siteFilterWo}
          AND h."status" IN ('ended', 'done')
          AND h."occurredAt" >= now() - interval '24 hours'
        `,
        [userId],
      ),
      pool.query<{ count: number }>(
        `
        SELECT COUNT(*)::int AS "count"
        FROM "transaction" t
        WHERE ${siteFilterTx}
          AND t."bookedAt" >= now() - interval '24 hours'
        `,
        [userId],
      ),
      pool.query<{ count: number }>(
        `
        SELECT COUNT(*)::int AS "count"
        FROM "workOrder" w
        WHERE ${siteFilterWo}
          AND w."orderType" = 'maintenance'
          AND w."status" NOT IN ('cancelled', 'ended', 'done')
          AND w."plannedStart" >= now()
          AND w."plannedStart" < now() + interval '48 hours'
        `,
        [userId],
      ),
      pool.query<MaintenancePreview>(
        `
        SELECT
          w."orderNumber",
          w."name",
          w."plannedStart"::text AS "plannedStart"
        FROM "workOrder" w
        WHERE ${siteFilterWo}
          AND w."orderType" = 'maintenance'
          AND w."status" NOT IN ('cancelled', 'ended', 'done')
          AND w."plannedStart" >= now()
          AND w."plannedStart" < now() + interval '48 hours'
        ORDER BY w."plannedStart" ASC
        LIMIT 5
        `,
        [userId],
      ),
      pool.query<{ count: number }>(
        `
        SELECT (
          (SELECT COUNT(*)::int FROM "workOrderSubscriptionNotification" WHERE "userId" = $1::uuid AND "readAt" IS NULL)
          +
          (SELECT COUNT(*)::int FROM "workOrderMessageNotification" WHERE "userId" = $1::uuid AND "readAt" IS NULL)
        ) AS "count"
        `,
        [userId],
      ),
    ]);

    const counts: BriefingCounts = {
      created24h: createdRes.rows[0]?.count ?? 0,
      completed24h: completedRes.rows[0]?.count ?? 0,
      bookings24h: bookingsRes.rows[0]?.count ?? 0,
      maintenanceNext48h: maintenanceCountRes.rows[0]?.count ?? 0,
      unreadNotifications: unreadRes.rows[0]?.count ?? 0,
    };

    const maintenancePreview = maintenancePreviewRes.rows.map((r) => ({
      orderNumber: r.orderNumber,
      name: r.name,
      plannedStart: r.plannedStart,
    }));

    const ai = await generateAiParagraphs(counts, maintenancePreview, lang);
    const paragraphs = ai ?? fallbackParagraphs(counts, lang);
    const payload: AtheneBriefingResponse = {
      counts,
      news: paragraphs.news,
      lookback: paragraphs.lookback,
      outlook: paragraphs.outlook,
      summarySource: ai ? "ai" : "fallback",
      maintenancePreview,
    };

    briefingCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    res.json(payload);
  } catch (err) {
    sendPgError(res, err);
  }
});

export const atheneBriefingRouter = router;
