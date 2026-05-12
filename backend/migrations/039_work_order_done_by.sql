-- Employee who set work order status to "done" (Erledigt); optional attribution for closed orders.
ALTER TABLE "workOrder"
  ADD COLUMN IF NOT EXISTS "doneBy" uuid NULL
    REFERENCES "employee" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "workOrder_doneBy_idx" ON "workOrder" ("doneBy");

-- Backfill orders already in status "done" (Erledigt) with employee "Erwin Redich"
-- (row must exist in employee with exact name match).
UPDATE "workOrder" wo
SET "doneBy" = e."id"
FROM "employee" e
WHERE e."name" = 'Erwin Redich'
  AND wo."status" = 'done'
  AND wo."doneBy" IS NULL;
