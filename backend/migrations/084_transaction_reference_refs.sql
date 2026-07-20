-- Reference fields for RM (and future material) transactions.

ALTER TABLE "transaction"
  ADD COLUMN IF NOT EXISTS "assetId" uuid REFERENCES "asset" ("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "costCenterId" uuid REFERENCES "costCenter" ("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "transaction_assetId_idx"
  ON "transaction" ("assetId");

CREATE INDEX IF NOT EXISTS "transaction_costCenterId_idx"
  ON "transaction" ("costCenterId");
