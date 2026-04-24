CREATE TABLE IF NOT EXISTS "costCenter" (
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

CREATE INDEX IF NOT EXISTS "costCenter_siteId_idx" ON "costCenter" ("siteId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_cost_center ON "costCenter";
CREATE TRIGGER audit_set_row_metadata_cost_center
  BEFORE INSERT OR UPDATE ON "costCenter"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_cost_center ON "costCenter";
CREATE TRIGGER audit_capture_change_cost_center
  AFTER INSERT OR UPDATE OR DELETE ON "costCenter"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
