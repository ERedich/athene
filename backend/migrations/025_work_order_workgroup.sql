ALTER TABLE "workOrder"
  ADD COLUMN IF NOT EXISTS "workgroupId" uuid NULL REFERENCES "workgroup" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "workOrder_workgroupId_idx" ON "workOrder" ("workgroupId");
