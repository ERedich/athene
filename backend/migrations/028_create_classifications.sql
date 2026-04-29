CREATE TABLE IF NOT EXISTS "classification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "appliesToMaterial" boolean NOT NULL DEFAULT false,
  "appliesToAsset" boolean NOT NULL DEFAULT false,
  "appliesToWorkOrder" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "classification_siteId_idx" ON "classification" ("siteId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_classification ON "classification";
CREATE TRIGGER audit_set_row_metadata_classification
  BEFORE INSERT OR UPDATE ON "classification"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_classification ON "classification";
CREATE TRIGGER audit_capture_change_classification
  AFTER INSERT OR UPDATE OR DELETE ON "classification"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
