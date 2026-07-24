-- Site-scoped saved report definitions (SQL + layout + target app)

CREATE TABLE IF NOT EXISTS "reportDefinition" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "targetAppKey" text NOT NULL DEFAULT '',
  "sql" text NOT NULL,
  "layout" jsonb NOT NULL,
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "reportDefinition_key_len" CHECK (char_length(trim("key")) > 0 AND char_length("key") <= 100),
  CONSTRAINT "reportDefinition_name_len" CHECK (char_length(trim("name")) > 0 AND char_length("name") <= 200),
  CONSTRAINT "reportDefinition_targetAppKey_len" CHECK (char_length("targetAppKey") <= 64),
  CONSTRAINT "reportDefinition_sql_len" CHECK (char_length("sql") > 0 AND char_length("sql") <= 8000),
  CONSTRAINT "reportDefinition_siteId_key_key" UNIQUE ("siteId", "key")
);

CREATE INDEX IF NOT EXISTS "reportDefinition_siteId_idx" ON "reportDefinition" ("siteId");
CREATE INDEX IF NOT EXISTS "reportDefinition_siteId_targetAppKey_idx" ON "reportDefinition" ("siteId", "targetAppKey");
CREATE INDEX IF NOT EXISTS "reportDefinition_createdBy_idx" ON "reportDefinition" ("createdBy");

CREATE OR REPLACE FUNCTION "reportDefinition_touch_updatedAt"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "reportDefinition_touch_updatedAt_trg" ON "reportDefinition";
CREATE TRIGGER "reportDefinition_touch_updatedAt_trg"
  BEFORE UPDATE ON "reportDefinition"
  FOR EACH ROW
  EXECUTE PROCEDURE "reportDefinition_touch_updatedAt"();
