-- Saved table layouts (column order, sort, widths, frozen, visibility)

CREATE TABLE IF NOT EXISTS "tableLayout" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "tableKey" text NOT NULL,
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tableLayout_name_len" CHECK (char_length(trim("name")) > 0 AND char_length("name") <= 200),
  CONSTRAINT "tableLayout_createdBy_name_tableKey_key" UNIQUE ("createdBy", "name", "tableKey")
);

CREATE INDEX IF NOT EXISTS "tableLayout_createdBy_idx" ON "tableLayout" ("createdBy");
CREATE INDEX IF NOT EXISTS "tableLayout_tableKey_idx" ON "tableLayout" ("tableKey");

CREATE TABLE IF NOT EXISTS "tableLayoutShare" (
  "layoutId" uuid NOT NULL REFERENCES "tableLayout" ("id") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "createdBy" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("layoutId", "userId")
);

CREATE INDEX IF NOT EXISTS "tableLayoutShare_userId_idx" ON "tableLayoutShare" ("userId");

CREATE TABLE IF NOT EXISTS "userTableLayoutDefault" (
  "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "context" text NOT NULL CHECK ("context" IN ('monitoring')),
  "layoutId" uuid NOT NULL REFERENCES "tableLayout" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("userId", "context")
);

CREATE INDEX IF NOT EXISTS "userTableLayoutDefault_layoutId_idx" ON "userTableLayoutDefault" ("layoutId");

CREATE OR REPLACE FUNCTION "tableLayout_touch_updatedAt"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "tableLayout_touch_updatedAt_trg" ON "tableLayout";
CREATE TRIGGER "tableLayout_touch_updatedAt_trg"
  BEFORE UPDATE ON "tableLayout"
  FOR EACH ROW
  EXECUTE PROCEDURE "tableLayout_touch_updatedAt"();
