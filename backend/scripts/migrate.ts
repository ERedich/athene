import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL missing. Copy backend/.env.example to backend/.env and set it.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_migration" (
        "id" text PRIMARY KEY,
        "appliedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);

    const migrationsDir = path.join(__dirname, "..", "migrations");
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const id = file;
      const done = await client.query(`SELECT 1 FROM "_migration" WHERE "id" = $1`, [id]);
      if (done.rowCount) continue;

      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO "_migration" ("id") VALUES ($1)`, [id]);
        await client.query("COMMIT");
        console.log("applied:", id);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }

    console.log("migrations complete");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
