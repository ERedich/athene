import { OpenAI } from "openai";

import { EMBEDDING_BATCH_SIZE, VECTOR_DIMENSIONS, isEmbeddingIngestEnabled } from "./embeddingTypes.js";

const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";

let openai: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!isEmbeddingIngestEnabled()) return null;
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!.trim() });
  }
  return openai;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getClient();
  if (!client) throw new Error("embedding_not_configured");

  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const response = await client.embeddings.create({
      model: embeddingModel,
      input: batch,
    });
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      if (!item.embedding?.length) {
        throw new Error("empty_embedding");
      }
      if (item.embedding.length !== VECTOR_DIMENSIONS) {
        throw new Error(`unexpected_embedding_dimensions:${item.embedding.length}`);
      }
      vectors.push(item.embedding);
    }
  }
  return vectors;
}
