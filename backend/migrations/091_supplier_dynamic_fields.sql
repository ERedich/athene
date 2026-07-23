-- Supplier free-form slots (dynamicField0–10); values stored as text, widget from app layout

ALTER TABLE "supplier"
  ADD COLUMN IF NOT EXISTS "dynamicField0" text,
  ADD COLUMN IF NOT EXISTS "dynamicField1" text,
  ADD COLUMN IF NOT EXISTS "dynamicField2" text,
  ADD COLUMN IF NOT EXISTS "dynamicField3" text,
  ADD COLUMN IF NOT EXISTS "dynamicField4" text,
  ADD COLUMN IF NOT EXISTS "dynamicField5" text,
  ADD COLUMN IF NOT EXISTS "dynamicField6" text,
  ADD COLUMN IF NOT EXISTS "dynamicField7" text,
  ADD COLUMN IF NOT EXISTS "dynamicField8" text,
  ADD COLUMN IF NOT EXISTS "dynamicField9" text,
  ADD COLUMN IF NOT EXISTS "dynamicField10" text;
