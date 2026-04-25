ALTER TABLE "assetDocument"
  ADD COLUMN IF NOT EXISTS "displayName" text,
  ADD COLUMN IF NOT EXISTS "category" text;

UPDATE "assetDocument"
SET "displayName" = COALESCE(NULLIF("displayName", ''), "fileName")
WHERE "displayName" IS NULL OR "displayName" = '';

UPDATE "assetDocument"
SET "category" = 'general'
WHERE "category" IS NULL OR btrim("category") = '';

ALTER TABLE "assetDocument"
  ALTER COLUMN "displayName" SET NOT NULL,
  ALTER COLUMN "category" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assetDocument_category_check'
      AND conrelid = '"assetDocument"'::regclass
  ) THEN
    ALTER TABLE "assetDocument"
      ADD CONSTRAINT "assetDocument_category_check"
      CHECK ("category" IN ('general', 'protocols', 'drawings', 'instructions', 'nameplates', 'certificates'));
  END IF;
END $$;
