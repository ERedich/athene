-- Low-stock (Meldebestand) notifications for Mitteilungszentrale.

CREATE TABLE IF NOT EXISTS "sparePartStockNotification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "sparePartId" uuid NOT NULL REFERENCES "sparePart" ("id") ON DELETE CASCADE,
  "sparePartKey" text NOT NULL,
  "sparePartName" text NOT NULL,
  "siteKey" text NOT NULL,
  "siteName" text NOT NULL,
  "scopeType" text NOT NULL
    CHECK ("scopeType" IN ('SITE', 'WAREHOUSE', 'STORAGE_LOCATION')),
  "warehouseId" uuid REFERENCES "warehouse" ("id") ON DELETE SET NULL,
  "storageLocationId" uuid REFERENCES "storageLocation" ("id") ON DELETE SET NULL,
  "warehouseKey" text,
  "storageLocationKey" text,
  "onHandQuantity" numeric(14, 4) NOT NULL,
  "reorderLevel" numeric(14, 4) NOT NULL CHECK ("reorderLevel" >= 0),
  "readAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sparePartStockNotification_userId_readAt_idx"
  ON "sparePartStockNotification" ("userId", "readAt", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "sparePartStockNotification_sparePartId_idx"
  ON "sparePartStockNotification" ("sparePartId");
