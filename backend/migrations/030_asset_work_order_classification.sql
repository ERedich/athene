ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "classificationId" uuid REFERENCES "classification" ("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "asset_classificationId_idx" ON "asset" ("classificationId");

ALTER TABLE "workOrder" ADD COLUMN IF NOT EXISTS "classificationId" uuid REFERENCES "classification" ("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "workOrder_classificationId_idx" ON "workOrder" ("classificationId");
