-- Saved work-order search presets (shared between Auftragswesen and Monitoring)

CREATE TABLE IF NOT EXISTS "workOrderSearchPreset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workOrderSearchPreset_name_len" CHECK (char_length(trim("name")) > 0 AND char_length("name") <= 200),
  CONSTRAINT "workOrderSearchPreset_createdBy_name_key" UNIQUE ("createdBy", "name")
);

CREATE INDEX IF NOT EXISTS "workOrderSearchPreset_createdBy_idx" ON "workOrderSearchPreset" ("createdBy");

CREATE TABLE IF NOT EXISTS "workOrderSearchPresetShare" (
  "presetId" uuid NOT NULL REFERENCES "workOrderSearchPreset" ("id") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "createdBy" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("presetId", "userId")
);

CREATE INDEX IF NOT EXISTS "workOrderSearchPresetShare_userId_idx" ON "workOrderSearchPresetShare" ("userId");

CREATE OR REPLACE FUNCTION "workOrderSearchPreset_touch_updatedAt"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "workOrderSearchPreset_touch_updatedAt_trg" ON "workOrderSearchPreset";
CREATE TRIGGER "workOrderSearchPreset_touch_updatedAt_trg"
  BEFORE UPDATE ON "workOrderSearchPreset"
  FOR EACH ROW
  EXECUTE PROCEDURE "workOrderSearchPreset_touch_updatedAt"();
