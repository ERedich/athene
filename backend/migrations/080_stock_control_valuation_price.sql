ALTER TABLE "stockControl"
  ADD COLUMN IF NOT EXISTS "valuationPrice" numeric(18, 4)
    CHECK ("valuationPrice" IS NULL OR "valuationPrice" >= 0),
  ADD COLUMN IF NOT EXISTS "valuationCurrency" text NOT NULL DEFAULT 'EUR';
