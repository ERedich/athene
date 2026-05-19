import "dotenv/config";

import { isEmbeddingIngestEnabled, reindexAll, type ReindexScope } from "../src/assistant/embedding/index.js";

function parseArgs(argv: string[]): { only?: ReindexScope; limit?: number } {
  let only: ReindexScope | undefined;
  let limit: number | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--only=")) {
      const value = arg.slice("--only=".length) as ReindexScope;
      if (value === "assets" || value === "workOrders" || value === "documents" || value === "all") {
        only = value === "all" ? "all" : value;
      } else {
        console.error(`Unknown --only value: ${value}`);
        process.exit(1);
      }
    } else if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      if (!Number.isFinite(n) || n < 1) {
        console.error("Invalid --limit");
        process.exit(1);
      }
      limit = n;
    }
  }

  return { only, limit };
}

async function main() {
  if (!isEmbeddingIngestEnabled()) {
    console.error(
      "Embedding ingest is not configured. Set OPENAI_API_KEY and ATHENE_EMBEDDING_ENABLED=1 in backend/.env",
    );
    process.exit(1);
  }

  const { only, limit } = parseArgs(process.argv.slice(2));
  console.log(
    `Athene embedding reindex started${only ? ` (only=${only})` : ""}${limit ? ` (limit=${limit})` : ""}...`,
  );

  const result = await reindexAll({
    only: only ?? "all",
    limit,
    onProgress: (message) => console.log(message),
  });

  console.log(
    `Done. assets=${result.assets} workOrders=${result.workOrders} documents=${result.documents} errors=${result.errors}`,
  );
  if (result.errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
