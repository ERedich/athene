CREATE TABLE IF NOT EXISTS "workgroup" (
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

CREATE INDEX IF NOT EXISTS "workgroup_siteId_idx" ON "workgroup" ("siteId");

CREATE TABLE IF NOT EXISTS "workgroupUser" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workgroupId" uuid NOT NULL REFERENCES "workgroup" ("id") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  UNIQUE ("workgroupId", "userId")
);

CREATE INDEX IF NOT EXISTS "workgroupUser_userId_idx" ON "workgroupUser" ("userId");
CREATE INDEX IF NOT EXISTS "workgroupUser_workgroupId_idx" ON "workgroupUser" ("workgroupId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_workgroup ON "workgroup";
CREATE TRIGGER audit_set_row_metadata_workgroup
  BEFORE INSERT OR UPDATE ON "workgroup"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_workgroup ON "workgroup";
CREATE TRIGGER audit_capture_change_workgroup
  AFTER INSERT OR UPDATE OR DELETE ON "workgroup"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

DROP TRIGGER IF EXISTS audit_set_row_metadata_workgroup_user ON "workgroupUser";
CREATE TRIGGER audit_set_row_metadata_workgroup_user
  BEFORE INSERT OR UPDATE ON "workgroupUser"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_workgroup_user ON "workgroupUser";
CREATE TRIGGER audit_capture_change_workgroup_user
  AFTER INSERT OR UPDATE OR DELETE ON "workgroupUser"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
