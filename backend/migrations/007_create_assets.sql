CREATE TABLE IF NOT EXISTS "asset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "type" text NOT NULL CHECK ("type" IN ('site', 'structure', 'line', 'maintenanceObject')),
  "parentAssetId" uuid REFERENCES "asset" ("id") ON DELETE RESTRICT,
  "serialNumber" text,
  "buildDate" date,
  "manufacturer" text,
  "remark" text CHECK (char_length("remark") <= 2000),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "asset_siteId_idx" ON "asset" ("siteId");
CREATE INDEX IF NOT EXISTS "asset_parentAssetId_idx" ON "asset" ("parentAssetId");
CREATE INDEX IF NOT EXISTS "asset_type_idx" ON "asset" ("type");

DROP TRIGGER IF EXISTS audit_set_row_metadata_asset ON "asset";
CREATE TRIGGER audit_set_row_metadata_asset
  BEFORE INSERT OR UPDATE ON "asset"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_asset ON "asset";
CREATE TRIGGER audit_capture_change_asset
  AFTER INSERT OR UPDATE OR DELETE ON "asset"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
