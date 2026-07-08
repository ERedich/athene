ALTER TABLE "employee"
  ADD COLUMN IF NOT EXISTS "photoMimeType" text,
  ADD COLUMN IF NOT EXISTS "photoContent" bytea;
