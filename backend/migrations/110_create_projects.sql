-- Project Management: Projects table
CREATE TABLE IF NOT EXISTS "project" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(50) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" varchar(2000),
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'planning' CHECK ("status" IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  "plannedStart" timestamptz NOT NULL DEFAULT now(),
  "plannedEnd" timestamptz,
  "actualStart" timestamptz,
  "actualEnd" timestamptz,
  "responsibleEmployeeId" uuid REFERENCES "employee" ("id") ON DELETE SET NULL,
  "costCenterId" uuid REFERENCES "costCenter" ("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_key_site_unique_idx" ON "project" ("siteId", "key");
CREATE INDEX IF NOT EXISTS "project_siteId_idx" ON "project" ("siteId");
CREATE INDEX IF NOT EXISTS "project_status_idx" ON "project" ("status");
CREATE INDEX IF NOT EXISTS "project_plannedStart_idx" ON "project" ("plannedStart");
CREATE INDEX IF NOT EXISTS "project_responsibleEmployeeId_idx" ON "project" ("responsibleEmployeeId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_project ON "project";
CREATE TRIGGER audit_set_row_metadata_project
  BEFORE INSERT OR UPDATE ON "project"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_project ON "project";
CREATE TRIGGER audit_capture_change_project
  AFTER INSERT OR UPDATE OR DELETE ON "project"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
