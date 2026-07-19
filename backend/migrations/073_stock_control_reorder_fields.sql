ALTER TABLE "stockControl"
  ADD COLUMN IF NOT EXISTS "reorderLevel" numeric(14, 4) NOT NULL DEFAULT 0
    CHECK ("reorderLevel" >= 0),
  ADD COLUMN IF NOT EXISTS "minStock" numeric(14, 4) NOT NULL DEFAULT 0
    CHECK ("minStock" >= 0),
  ADD COLUMN IF NOT EXISTS "orderQuantity" numeric(14, 4) NOT NULL DEFAULT 0
    CHECK ("orderQuantity" >= 0);
