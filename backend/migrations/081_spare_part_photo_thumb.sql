ALTER TABLE "sparePart"
  ADD COLUMN IF NOT EXISTS "photoThumbMimeType" text,
  ADD COLUMN IF NOT EXISTS "photoThumbContent" bytea;
