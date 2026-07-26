ALTER TABLE "workOrder"
  ADD COLUMN IF NOT EXISTS "customerId" uuid REFERENCES "customer" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "serviceContractId" uuid REFERENCES "serviceContract" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "signoffRemark" text,
  ADD COLUMN IF NOT EXISTS "signoffSatisfaction" text,
  ADD COLUMN IF NOT EXISTS "signedOffAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "signedOffBy" uuid REFERENCES "users" ("id") ON DELETE SET NULL;

ALTER TABLE "workOrder" DROP CONSTRAINT IF EXISTS "workOrder_signoffRemark_len";
ALTER TABLE "workOrder"
  ADD CONSTRAINT "workOrder_signoffRemark_len"
  CHECK ("signoffRemark" IS NULL OR char_length("signoffRemark") <= 2000);

ALTER TABLE "workOrder" DROP CONSTRAINT IF EXISTS "workOrder_signoffSatisfaction_len";
ALTER TABLE "workOrder"
  ADD CONSTRAINT "workOrder_signoffSatisfaction_len"
  CHECK ("signoffSatisfaction" IS NULL OR char_length("signoffSatisfaction") <= 200);

CREATE INDEX IF NOT EXISTS "workOrder_customerId_idx" ON "workOrder" ("customerId");
CREATE INDEX IF NOT EXISTS "workOrder_serviceContractId_idx" ON "workOrder" ("serviceContractId");
