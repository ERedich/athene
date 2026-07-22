/**
 * One-off seed: 5 maintenance PCR problems with linked causes and remedies.
 * Run: npx tsx scripts/seedPcrDemo.ts
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=")
    ? { rejectUnauthorized: false }
    : undefined,
});

type Catalog = {
  problem: { key: string; name: string };
  causes: { key: string; name: string }[];
  remedies: { key: string; name: string }[];
  /** cause key → remedy keys */
  causeRemedies: Record<string, string[]>;
};

const CATALOG: Catalog[] = [
  {
    problem: { key: "VIB-001", name: "Ungewöhnliche Vibration" },
    causes: [
      { key: "VIB-C-LAGER", name: "Lagerverschleiß / Lagerschaden" },
      { key: "VIB-C-FLUCHT", name: "Wellenfluchtungsfehler" },
    ],
    remedies: [
      { key: "VIB-R-LAGER", name: "Lager tauschen und Schmierung prüfen" },
      { key: "VIB-R-AUSRICHT", name: "Welle neu ausrichten (Laser/Messuhr)" },
    ],
    causeRemedies: {
      "VIB-C-LAGER": ["VIB-R-LAGER"],
      "VIB-C-FLUCHT": ["VIB-R-AUSRICHT", "VIB-R-LAGER"],
    },
  },
  {
    problem: { key: "LEK-001", name: "Leckage (Öl/Medium)" },
    causes: [
      { key: "LEK-C-DICHT", name: "Defekte Dichtung / Wellendichtring" },
      { key: "LEK-C-VERSCHR", name: "Lose Verschraubung / Fitting" },
    ],
    remedies: [
      { key: "LEK-R-DICHT", name: "Dichtung / Dichtring erneuern" },
      { key: "LEK-R-ANZIEH", name: "Verbindungen nachziehen und auf Dichtheit prüfen" },
    ],
    causeRemedies: {
      "LEK-C-DICHT": ["LEK-R-DICHT"],
      "LEK-C-VERSCHR": ["LEK-R-ANZIEH"],
    },
  },
  {
    problem: { key: "HIT-001", name: "Überhitzung" },
    causes: [
      { key: "HIT-C-SCHMIER", name: "Mangelhafte Schmierung" },
      { key: "HIT-C-KUEHL", name: "Kühlung gestört (Filter/Ventilator)" },
    ],
    remedies: [
      { key: "HIT-R-SCHMIER", name: "Nachschmieren / Schmierstoff wechseln" },
      { key: "HIT-R-KUEHL", name: "Kühlkreislauf reinigen / Ventilator prüfen" },
    ],
    causeRemedies: {
      "HIT-C-SCHMIER": ["HIT-R-SCHMIER"],
      "HIT-C-KUEHL": ["HIT-R-KUEHL"],
    },
  },
  {
    problem: { key: "NOI-001", name: "Ungewöhnliche Geräusche" },
    causes: [
      { key: "NOI-C-LOCKER", name: "Lose Befestigung / Schwingung" },
      { key: "NOI-C-RIEMEN", name: "Verschlissener Riemen / Kette" },
    ],
    remedies: [
      { key: "NOI-R-FIX", name: "Schrauben/Befestigungen nachziehen" },
      { key: "NOI-R-RIEMEN", name: "Riemen/Kette tauschen und spannen" },
    ],
    causeRemedies: {
      "NOI-C-LOCKER": ["NOI-R-FIX"],
      "NOI-C-RIEMEN": ["NOI-R-RIEMEN"],
    },
  },
  {
    problem: { key: "STR-001", name: "Kein Anlauf / Anlage startet nicht" },
    causes: [
      { key: "STR-C-ELEKTRO", name: "Elektrischer Fehler (Schütz/Kabel/Motor)" },
      { key: "STR-C-SICHER", name: "Sicherheitsschaltung / Verriegelung aktiv" },
    ],
    remedies: [
      { key: "STR-R-ELEKTRO", name: "Elektrik prüfen, fehlerhafte Bauteile tauschen" },
      { key: "STR-R-SICHER", name: "Sicherheitskreis prüfen und freigeben" },
    ],
    causeRemedies: {
      "STR-C-ELEKTRO": ["STR-R-ELEKTRO"],
      "STR-C-SICHER": ["STR-R-SICHER"],
    },
  },
];

async function main() {
  const client = await pool.connect();
  try {
    const userRes = await client.query<{ id: string }>(
      `SELECT "id" FROM "users" WHERE "loginName" = 'admin' LIMIT 1`,
    );
    let userId = userRes.rows[0]?.id;
    if (!userId) {
      const anyUser = await client.query<{ id: string }>(
        `SELECT "id" FROM "users" ORDER BY "createdAt" ASC LIMIT 1`,
      );
      userId = anyUser.rows[0]?.id;
    }
    if (!userId) throw new Error("no user for audit columns");

    const sites = await client.query<{ id: string; key: string }>(
      `SELECT "id", "key" FROM "site" ORDER BY "key" ASC`,
    );
    if (sites.rows.length === 0) throw new Error("no sites");

    await client.query("BEGIN");
    // Set audit session vars if the project uses them — inserts still need createdBy
    for (const site of sites.rows) {
      console.log(`Seeding PCR catalog for site ${site.key}…`);

      const causeIdByKey = new Map<string, string>();
      const remedyIdByKey = new Map<string, string>();
      const problemIdByKey = new Map<string, string>();

      // Upsert causes
      for (const cat of CATALOG) {
        for (const c of cat.causes) {
          if (causeIdByKey.has(c.key)) continue;
          const { rows } = await client.query<{ id: string }>(
            `
            INSERT INTO "cause" ("key", "name", "siteId", "isActive", "createdBy", "updatedBy")
            VALUES ($1, $2, $3::uuid, true, $4::uuid, $4::uuid)
            ON CONFLICT ("siteId", "key") DO UPDATE
              SET "name" = EXCLUDED."name", "isActive" = true, "updatedBy" = EXCLUDED."updatedBy"
            RETURNING "id"
            `,
            [c.key, c.name, site.id, userId],
          );
          causeIdByKey.set(c.key, rows[0]!.id);
        }
        for (const r of cat.remedies) {
          if (remedyIdByKey.has(r.key)) continue;
          const { rows } = await client.query<{ id: string }>(
            `
            INSERT INTO "remedy" ("key", "name", "siteId", "isActive", "createdBy", "updatedBy")
            VALUES ($1, $2, $3::uuid, true, $4::uuid, $4::uuid)
            ON CONFLICT ("siteId", "key") DO UPDATE
              SET "name" = EXCLUDED."name", "isActive" = true, "updatedBy" = EXCLUDED."updatedBy"
            RETURNING "id"
            `,
            [r.key, r.name, site.id, userId],
          );
          remedyIdByKey.set(r.key, rows[0]!.id);
        }
      }

      for (const cat of CATALOG) {
        const { rows } = await client.query<{ id: string }>(
          `
          INSERT INTO "problem" ("key", "name", "siteId", "classificationId", "isActive", "createdBy", "updatedBy")
          VALUES ($1, $2, $3::uuid, NULL, true, $4::uuid, $4::uuid)
          ON CONFLICT ("siteId", "key") DO UPDATE
            SET "name" = EXCLUDED."name", "isActive" = true, "updatedBy" = EXCLUDED."updatedBy"
          RETURNING "id"
          `,
          [cat.problem.key, cat.problem.name, site.id, userId],
        );
        const problemId = rows[0]!.id;
        problemIdByKey.set(cat.problem.key, problemId);

        for (const c of cat.causes) {
          const causeId = causeIdByKey.get(c.key)!;
          await client.query(
            `
            INSERT INTO "problemCause" ("problemId", "causeId", "createdBy", "updatedBy")
            VALUES ($1::uuid, $2::uuid, $3::uuid, $3::uuid)
            ON CONFLICT ("problemId", "causeId") DO NOTHING
            `,
            [problemId, causeId, userId],
          );
        }

        for (const [causeKey, remedyKeys] of Object.entries(cat.causeRemedies)) {
          const causeId = causeIdByKey.get(causeKey)!;
          for (const remedyKey of remedyKeys) {
            const remedyId = remedyIdByKey.get(remedyKey)!;
            await client.query(
              `
              INSERT INTO "causeRemedy" ("causeId", "remedyId", "createdBy", "updatedBy")
              VALUES ($1::uuid, $2::uuid, $3::uuid, $3::uuid)
              ON CONFLICT ("causeId", "remedyId") DO NOTHING
              `,
              [causeId, remedyId, userId],
            );
          }
        }
      }

      console.log(
        `  problems=${problemIdByKey.size}, causes=${causeIdByKey.size}, remedies=${remedyIdByKey.size}`,
      );
    }

    await client.query("COMMIT");
    console.log("PCR demo seed complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
