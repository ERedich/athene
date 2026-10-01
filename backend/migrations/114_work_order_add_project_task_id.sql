-- Add project task reference to work orders
ALTER TABLE "workOrder"
  ADD COLUMN IF NOT EXISTS "projectTaskId" uuid REFERENCES "projectTask" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "workOrder_projectTaskId_idx" ON "workOrder" ("projectTaskId");
