-- GLD (moving average): transaction type ZU, unitPrice, history per stock line.

ALTER TABLE "transaction" DROP CONSTRAINT IF EXISTS "transaction_type_check";

ALTER TABLE "transaction"
  ADD CONSTRAINT "transaction_type_check"
  CHECK ("type" IN ('IN', 'EX', 'RM', 'RT', 'IV', 'ZU'));

ALTER TABLE "transaction"
  ADD COLUMN IF NOT EXISTS "unitPrice" numeric(18, 4)
    CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0);

CREATE TABLE IF NOT EXISTS "stockControlMovingAverageHistory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stockControlId" uuid NOT NULL REFERENCES "stockControl" ("id") ON DELETE CASCADE,
  "transactionId" uuid REFERENCES "transaction" ("id") ON DELETE SET NULL,
  "bookedAt" timestamptz NOT NULL DEFAULT now(),
  "quantity" numeric(14, 4) NOT NULL CHECK ("quantity" > 0),
  "unitPrice" numeric(18, 4) CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0),
  "movingAveragePrice" numeric(18, 4) NOT NULL CHECK ("movingAveragePrice" >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "stockControlMovingAverageHistory_stock_booked_idx"
  ON "stockControlMovingAverageHistory" ("stockControlId", "bookedAt" DESC);

CREATE INDEX IF NOT EXISTS "stockControlMovingAverageHistory_transactionId_idx"
  ON "stockControlMovingAverageHistory" ("transactionId");
