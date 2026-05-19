export const EMBEDDING_SOURCE_KIND = {
  asset: "asset",
  workOrder: "workOrder",
  workOrderDocument: "workOrderDocument",
} as const;

export type EmbeddingSourceKind =
  (typeof EMBEDDING_SOURCE_KIND)[keyof typeof EMBEDDING_SOURCE_KIND];

export const CHUNK_MAX_CHARS =
  Number(process.env.ATHENE_CHUNK_MAX_CHARS) > 0
    ? Number(process.env.ATHENE_CHUNK_MAX_CHARS)
    : 3500;

export const CHUNK_OVERLAP_CHARS = 200;

export const EMBEDDING_BATCH_SIZE = 32;

export const DOCUMENT_TEXT_MAX_CHARS = 24_000;

export const VECTOR_DIMENSIONS = 1536;

export function isEmbeddingIngestEnabled(): boolean {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return false;
  const flag = process.env.ATHENE_EMBEDDING_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return true;
}
