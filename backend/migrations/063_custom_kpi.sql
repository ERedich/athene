-- Site-scoped custom KPI definitions (semantic NoCode builder)

CREATE TABLE IF NOT EXISTS "customKpi" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "definition" jsonb NOT NULL,
  "style" jsonb NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "customKpi_key_len" CHECK (char_length(trim("key")) > 0 AND char_length("key") <= 100),
  CONSTRAINT "customKpi_name_len" CHECK (char_length(trim("name")) > 0 AND char_length("name") <= 200),
  CONSTRAINT "customKpi_siteId_key_key" UNIQUE ("siteId", "key")
);

CREATE INDEX IF NOT EXISTS "customKpi_siteId_idx" ON "customKpi" ("siteId");
CREATE INDEX IF NOT EXISTS "customKpi_createdBy_idx" ON "customKpi" ("createdBy");
CREATE INDEX IF NOT EXISTS "customKpi_isActive_idx" ON "customKpi" ("isActive");

CREATE OR REPLACE FUNCTION "customKpi_touch_updatedAt"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "customKpi_touch_updatedAt_trg" ON "customKpi";
CREATE TRIGGER "customKpi_touch_updatedAt_trg"
  BEFORE UPDATE ON "customKpi"
  FOR EACH ROW
  EXECUTE PROCEDURE "customKpi_touch_updatedAt"();
