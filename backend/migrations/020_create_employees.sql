CREATE TABLE IF NOT EXISTS "employee" (
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

CREATE INDEX IF NOT EXISTS "employee_siteId_idx" ON "employee" ("siteId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_employee ON "employee";
CREATE TRIGGER audit_set_row_metadata_employee
  BEFORE INSERT OR UPDATE ON "employee"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_employee ON "employee";
CREATE TRIGGER audit_capture_change_employee
  AFTER INSERT OR UPDATE OR DELETE ON "employee"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
