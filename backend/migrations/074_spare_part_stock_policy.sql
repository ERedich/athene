-- Scoped stock planning: SITE | WAREHOUSE | STORAGE_LOCATION
-- Migrates planning fields off stockControl into sparePartStockPolicy.

CREATE TABLE IF NOT EXISTS "sparePartStockPolicy" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sparePartId" uuid NOT NULL REFERENCES "sparePart" ("id") ON DELETE CASCADE,
  "scopeType" text NOT NULL CHECK ("scopeType" IN ('SITE', 'WAREHOUSE', 'STORAGE_LOCATION')),
  "warehouseId" uuid REFERENCES "warehouse" ("id") ON DELETE RESTRICT,
  "storageLocation" text,
  "reorderLevel" numeric(14, 4) NOT NULL DEFAULT 0 CHECK ("reorderLevel" >= 0),
  "minStock" numeric(14, 4) NOT NULL DEFAULT 0 CHECK ("minStock" >= 0),
  "orderQuantity" numeric(14, 4) NOT NULL DEFAULT 0 CHECK ("orderQuantity" >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "sparePartStockPolicy_scope_chk" CHECK (
    (
      "scopeType" = 'SITE'
      AND "warehouseId" IS NULL
      AND "storageLocation" IS NULL
    )
    OR (
      "scopeType" = 'WAREHOUSE'
      AND "warehouseId" IS NOT NULL
      AND "storageLocation" IS NULL
    )
    OR (
      "scopeType" = 'STORAGE_LOCATION'
      AND "warehouseId" IS NOT NULL
      AND "storageLocation" IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS "sparePartStockPolicy_sparePartId_idx"
  ON "sparePartStockPolicy" ("sparePartId");

CREATE INDEX IF NOT EXISTS "sparePartStockPolicy_warehouseId_idx"
  ON "sparePartStockPolicy" ("warehouseId");

CREATE UNIQUE INDEX IF NOT EXISTS "sparePartStockPolicy_site_uidx"
  ON "sparePartStockPolicy" ("sparePartId")
  WHERE "scopeType" = 'SITE';

CREATE UNIQUE INDEX IF NOT EXISTS "sparePartStockPolicy_warehouse_uidx"
  ON "sparePartStockPolicy" ("sparePartId", "warehouseId")
  WHERE "scopeType" = 'WAREHOUSE';

CREATE UNIQUE INDEX IF NOT EXISTS "sparePartStockPolicy_storage_uidx"
  ON "sparePartStockPolicy" ("sparePartId", "warehouseId", "storageLocation")
  WHERE "scopeType" = 'STORAGE_LOCATION';

DROP TRIGGER IF EXISTS audit_set_row_metadata_spare_part_stock_policy ON "sparePartStockPolicy";
CREATE TRIGGER audit_set_row_metadata_spare_part_stock_policy
  BEFORE INSERT OR UPDATE ON "sparePartStockPolicy"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_spare_part_stock_policy ON "sparePartStockPolicy";
CREATE TRIGGER audit_capture_change_spare_part_stock_policy
  AFTER INSERT OR UPDATE OR DELETE ON "sparePartStockPolicy"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

-- Migrate non-zero planning values from stockControl as STORAGE_LOCATION policies
INSERT INTO "sparePartStockPolicy" (
  "sparePartId",
  "scopeType",
  "warehouseId",
  "storageLocation",
  "reorderLevel",
  "minStock",
  "orderQuantity",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  sc."sparePartId",
  'STORAGE_LOCATION',
  sc."warehouseId",
  sc."storageLocation",
  sc."reorderLevel",
  sc."minStock",
  sc."orderQuantity",
  sc."createdAt",
  sc."createdBy",
  sc."updatedAt",
  sc."updatedBy"
FROM "stockControl" sc
WHERE sc."reorderLevel" > 0
   OR sc."minStock" > 0
   OR sc."orderQuantity" > 0;

ALTER TABLE "stockControl"
  DROP COLUMN IF EXISTS "reorderLevel",
  DROP COLUMN IF EXISTS "minStock",
  DROP COLUMN IF EXISTS "orderQuantity";
