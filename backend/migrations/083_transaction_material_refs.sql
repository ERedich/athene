-- Material references for RM (and future RT/IV) transactions.

ALTER TABLE "transaction"
  ADD COLUMN IF NOT EXISTS "sparePartId" uuid REFERENCES "sparePart" ("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "warehouseId" uuid REFERENCES "warehouse" ("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "storageLocationId" uuid REFERENCES "storageLocation" ("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "transaction_sparePartId_idx"
  ON "transaction" ("sparePartId");

CREATE INDEX IF NOT EXISTS "transaction_storageLocationId_idx"
  ON "transaction" ("storageLocationId");
