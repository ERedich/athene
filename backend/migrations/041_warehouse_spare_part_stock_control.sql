CREATE TABLE IF NOT EXISTS "warehouse" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "warehouse_siteId_idx" ON "warehouse" ("siteId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_warehouse ON "warehouse";
CREATE TRIGGER audit_set_row_metadata_warehouse
  BEFORE INSERT OR UPDATE ON "warehouse"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_warehouse ON "warehouse";
CREATE TRIGGER audit_capture_change_warehouse
  AFTER INSERT OR UPDATE OR DELETE ON "warehouse"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

CREATE TABLE IF NOT EXISTS "sparePart" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "isActive" boolean NOT NULL DEFAULT true,
  "serialNumber" text,
  "classificationId" uuid REFERENCES "classification" ("id") ON DELETE SET NULL,
  "manufacturer" text,
  "articleNumber" text,
  "alternativeDesignation" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "sparePart_siteId_idx" ON "sparePart" ("siteId");
CREATE INDEX IF NOT EXISTS "sparePart_classificationId_idx" ON "sparePart" ("classificationId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_spare_part ON "sparePart";
CREATE TRIGGER audit_set_row_metadata_spare_part
  BEFORE INSERT OR UPDATE ON "sparePart"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_spare_part ON "sparePart";
CREATE TRIGGER audit_capture_change_spare_part
  AFTER INSERT OR UPDATE OR DELETE ON "sparePart"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

CREATE TABLE IF NOT EXISTS "stockControl" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sparePartId" uuid NOT NULL REFERENCES "sparePart" ("id") ON DELETE CASCADE,
  "warehouseId" uuid NOT NULL REFERENCES "warehouse" ("id") ON DELETE RESTRICT,
  "storageLocation" text NOT NULL DEFAULT '',
  "quantity" numeric(14, 4) NOT NULL CHECK ("quantity" >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  UNIQUE ("sparePartId", "warehouseId", "storageLocation")
);

CREATE INDEX IF NOT EXISTS "stockControl_sparePartId_idx" ON "stockControl" ("sparePartId");
CREATE INDEX IF NOT EXISTS "stockControl_warehouseId_idx" ON "stockControl" ("warehouseId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_stock_control ON "stockControl";
CREATE TRIGGER audit_set_row_metadata_stock_control
  BEFORE INSERT OR UPDATE ON "stockControl"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_stock_control ON "stockControl";
CREATE TRIGGER audit_capture_change_stock_control
  AFTER INSERT OR UPDATE OR DELETE ON "stockControl"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
