ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "costCenterId" uuid REFERENCES "costCenter" ("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "asset_costCenterId_idx" ON "asset" ("costCenterId");
