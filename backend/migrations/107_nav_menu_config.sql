-- Named menu configurations (web + mobile layouts) and per-user active assignment

CREATE TABLE IF NOT EXISTS "navMenuConfig" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "webLayout" jsonb NOT NULL,
  "mobileLayout" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  CONSTRAINT "navMenuConfig_key_len"
    CHECK (char_length(trim("key")) > 0 AND char_length("key") <= 100),
  CONSTRAINT "navMenuConfig_name_len"
    CHECK (char_length(trim("name")) > 0 AND char_length("name") <= 200),
  CONSTRAINT "navMenuConfig_key_key" UNIQUE ("key")
);

CREATE INDEX IF NOT EXISTS "navMenuConfig_updatedAt_idx"
  ON "navMenuConfig" ("updatedAt" DESC);

DROP TRIGGER IF EXISTS audit_set_row_metadata_nav_menu_config ON "navMenuConfig";
CREATE TRIGGER audit_set_row_metadata_nav_menu_config
  BEFORE INSERT OR UPDATE ON "navMenuConfig"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_nav_menu_config ON "navMenuConfig";
CREATE TRIGGER audit_capture_change_nav_menu_config
  AFTER INSERT OR UPDATE OR DELETE ON "navMenuConfig"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "navMenuConfigId" uuid NULL
    REFERENCES "navMenuConfig" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "users_navMenuConfigId_idx"
  ON "users" ("navMenuConfigId");

ALTER TABLE "users" DROP COLUMN IF EXISTS "navLayout";
