CREATE TABLE IF NOT EXISTS "customer" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "street" text,
  "zip" text,
  "city" text,
  "country" text,
  "contactName" text,
  "phone" text,
  "email" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "customer_siteId_key_key" UNIQUE ("siteId", "key")
);

CREATE INDEX IF NOT EXISTS "customer_siteId_idx" ON "customer" ("siteId");
CREATE INDEX IF NOT EXISTS "customer_name_idx" ON "customer" ("name");

DROP TRIGGER IF EXISTS audit_set_row_metadata_customer ON "customer";
CREATE TRIGGER audit_set_row_metadata_customer
  BEFORE INSERT OR UPDATE ON "customer"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_customer ON "customer";
CREATE TRIGGER audit_capture_change_customer
  AFTER INSERT OR UPDATE OR DELETE ON "customer"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
