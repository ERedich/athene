-- Last-applied permission template per user (exclusive assignment in Zuweisungen).
-- Runtime grants remain copy-on-apply into userPermission; this FK tracks which template was assigned.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "permissionTemplateId" uuid NULL
    REFERENCES "permissionTemplate" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "users_permissionTemplateId_idx"
  ON "users" ("permissionTemplateId");
