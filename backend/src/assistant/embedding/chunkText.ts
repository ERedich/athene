import { CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS } from "./embeddingTypes.js";

/** Split long text into overlapping chunks for embedding. */
export function splitIntoChunks(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= CHUNK_MAX_CHARS) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_MAX_CHARS, normalized.length);
    chunks.push(normalized.slice(start, end));
    if (end >= normalized.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP_CHARS);
  }
  return chunks;
}
