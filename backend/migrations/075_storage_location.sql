-- Storage location master data (Lagerplatz); migrate free-text bins to FK.

CREATE TABLE IF NOT EXISTS "storageLocation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "warehouseId" uuid NOT NULL REFERENCES "warehouse" ("id") ON DELETE RESTRICT,
  "maxLoadKg" numeric(14, 4) NOT NULL DEFAULT 0 CHECK ("maxLoadKg" >= 0),
  "heightMm" integer NOT NULL DEFAULT 0 CHECK ("heightMm" >= 0),
  "widthMm" integer NOT NULL DEFAULT 0 CHECK ("widthMm" >= 0),
  "depthMm" integer NOT NULL DEFAULT 0 CHECK ("depthMm" >= 0),
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  UNIQUE ("warehouseId", "key")
);

CREATE INDEX IF NOT EXISTS "storageLocation_warehouseId_idx"
  ON "storageLocation" ("warehouseId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_storage_location ON "storageLocation";
CREATE TRIGGER audit_set_row_metadata_storage_location
  BEFORE INSERT OR UPDATE ON "storageLocation"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_storage_location ON "storageLocation";
CREATE TRIGGER audit_capture_change_storage_location
  AFTER INSERT OR UPDATE OR DELETE ON "storageLocation"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

-- Seed from existing free-text locations (stock + policies)
INSERT INTO "storageLocation" (
  "key",
  "warehouseId",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  src."storageLocation",
  src."warehouseId",
  MIN(src."createdAt"),
  (array_agg(src."createdBy" ORDER BY src."createdAt"))[1],
  MAX(src."updatedAt"),
  (array_agg(src."updatedBy" ORDER BY src."updatedAt" DESC))[1]
FROM (
  SELECT
    sc."warehouseId",
    sc."storageLocation",
    sc."createdAt",
    sc."createdBy",
    sc."updatedAt",
    sc."updatedBy"
  FROM "stockControl" sc
  UNION ALL
  SELECT
    p."warehouseId",
    p."storageLocation",
    p."createdAt",
    p."createdBy",
    p."updatedAt",
    p."updatedBy"
  FROM "sparePartStockPolicy" p
  WHERE p."scopeType" = 'STORAGE_LOCATION'
    AND p."warehouseId" IS NOT NULL
    AND p."storageLocation" IS NOT NULL
) src
GROUP BY src."warehouseId", src."storageLocation"
ON CONFLICT ("warehouseId", "key") DO NOTHING;

-- stockControl: add FK, backfill, drop text
ALTER TABLE "stockControl"
  ADD COLUMN IF NOT EXISTS "storageLocationId" uuid REFERENCES "storageLocation" ("id") ON DELETE RESTRICT;

UPDATE "stockControl" sc
SET "storageLocationId" = sl."id"
FROM "storageLocation" sl
WHERE sl."warehouseId" = sc."warehouseId"
  AND sl."key" = sc."storageLocation"
  AND sc."storageLocationId" IS NULL;

-- Any leftover without match should not exist; fail loudly if any
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "stockControl" WHERE "storageLocationId" IS NULL) THEN
    RAISE EXCEPTION '075_storage_location: stockControl rows without storageLocationId after backfill';
  END IF;
END $$;

ALTER TABLE "stockControl"
  ALTER COLUMN "storageLocationId" SET NOT NULL;

ALTER TABLE "stockControl"
  DROP CONSTRAINT IF EXISTS "stockControl_sparePartId_warehouseId_storageLocation_key";

ALTER TABLE "stockControl"
  DROP COLUMN IF EXISTS "storageLocation";

CREATE UNIQUE INDEX IF NOT EXISTS "stockControl_sparePartId_storageLocationId_uidx"
  ON "stockControl" ("sparePartId", "storageLocationId");

CREATE INDEX IF NOT EXISTS "stockControl_storageLocationId_idx"
  ON "stockControl" ("storageLocationId");

-- sparePartStockPolicy: add FK, backfill, replace text scope
ALTER TABLE "sparePartStockPolicy"
  ADD COLUMN IF NOT EXISTS "storageLocationId" uuid REFERENCES "storageLocation" ("id") ON DELETE RESTRICT;

UPDATE "sparePartStockPolicy" p
SET "storageLocationId" = sl."id"
FROM "storageLocation" sl
WHERE p."scopeType" = 'STORAGE_LOCATION'
  AND p."warehouseId" = sl."warehouseId"
  AND p."storageLocation" = sl."key"
  AND p."storageLocationId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "sparePartStockPolicy"
    WHERE "scopeType" = 'STORAGE_LOCATION'
      AND "storageLocationId" IS NULL
  ) THEN
    RAISE EXCEPTION '075_storage_location: STORAGE_LOCATION policies without storageLocationId after backfill';
  END IF;
END $$;

ALTER TABLE "sparePartStockPolicy"
  DROP CONSTRAINT IF EXISTS "sparePartStockPolicy_scope_chk";

ALTER TABLE "sparePartStockPolicy"
  ADD CONSTRAINT "sparePartStockPolicy_scope_chk" CHECK (
    (
      "scopeType" = 'SITE'
      AND "warehouseId" IS NULL
      AND "storageLocationId" IS NULL
    )
    OR (
      "scopeType" = 'WAREHOUSE'
      AND "warehouseId" IS NOT NULL
      AND "storageLocationId" IS NULL
    )
    OR (
      "scopeType" = 'STORAGE_LOCATION'
      AND "warehouseId" IS NOT NULL
      AND "storageLocationId" IS NOT NULL
    )
  );

DROP INDEX IF EXISTS "sparePartStockPolicy_storage_uidx";

CREATE UNIQUE INDEX IF NOT EXISTS "sparePartStockPolicy_storage_uidx"
  ON "sparePartStockPolicy" ("sparePartId", "storageLocationId")
  WHERE "scopeType" = 'STORAGE_LOCATION';

ALTER TABLE "sparePartStockPolicy"
  DROP COLUMN IF EXISTS "storageLocation";
