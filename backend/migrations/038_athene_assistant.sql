CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS "assistantConversation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("userId")
);

CREATE TABLE IF NOT EXISTS "assistantMessage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversationId" uuid NOT NULL REFERENCES "assistantConversation" ("id") ON DELETE CASCADE,
  "role" text NOT NULL CHECK ("role" IN ('user', 'assistant', 'system', 'tool')),
  "content" text NOT NULL,
  "locale" text NULL,
  "clientContext" jsonb NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "assistantMessage_conversation_createdAt_idx"
  ON "assistantMessage" ("conversationId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "assistantEmbeddingChunk" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sourceKind" text NOT NULL,
  "sourceId" uuid NOT NULL,
  "siteId" uuid NULL REFERENCES "site" ("id") ON DELETE CASCADE,
  "chunkIndex" integer NOT NULL DEFAULT 0,
  "content" text NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("sourceKind", "sourceId", "chunkIndex")
);

CREATE INDEX IF NOT EXISTS "assistantEmbeddingChunk_source_idx"
  ON "assistantEmbeddingChunk" ("sourceKind", "sourceId");

CREATE INDEX IF NOT EXISTS "assistantEmbeddingChunk_site_idx"
  ON "assistantEmbeddingChunk" ("siteId");

CREATE INDEX IF NOT EXISTS "assistantEmbeddingChunk_embedding_idx"
  ON "assistantEmbeddingChunk"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);
