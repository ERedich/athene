CREATE TABLE IF NOT EXISTS "supplier" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "customerNumber" text,
  "address" text,
  "phone" text,
  "email" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "supplier_siteId_idx" ON "supplier" ("siteId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_supplier ON "supplier";
CREATE TRIGGER audit_set_row_metadata_supplier
  BEFORE INSERT OR UPDATE ON "supplier"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_supplier ON "supplier";
CREATE TRIGGER audit_capture_change_supplier
  AFTER INSERT OR UPDATE OR DELETE ON "supplier"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
