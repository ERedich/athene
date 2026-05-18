ALTER TABLE "workOrder"
  ADD COLUMN IF NOT EXISTS "pauseRemark" text NULL;

ALTER TABLE "workOrder"
  DROP CONSTRAINT IF EXISTS "workOrder_pauseRemark_len";

ALTER TABLE "workOrder"
  ADD CONSTRAINT "workOrder_pauseRemark_len"
  CHECK ("pauseRemark" IS NULL OR char_length("pauseRemark") <= 2000);

ALTER TABLE "transaction"
  ADD COLUMN IF NOT EXISTS "employeeId" uuid NULL REFERENCES "employee" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "transaction_employeeId_idx" ON "transaction" ("employeeId");
