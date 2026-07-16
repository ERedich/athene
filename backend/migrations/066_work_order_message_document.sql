ALTER TABLE "workOrderMessage"
  ADD COLUMN IF NOT EXISTS "documentId" uuid REFERENCES "document" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "workOrderMessage_documentId_idx"
  ON "workOrderMessage" ("documentId");
