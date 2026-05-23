ALTER TABLE "workOrder"
  ADD COLUMN IF NOT EXISTS "originalWo" uuid REFERENCES "workOrder" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "workOrder_originalWo_idx" ON "workOrder" ("originalWo");
