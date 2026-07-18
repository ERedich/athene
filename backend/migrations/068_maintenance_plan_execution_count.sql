ALTER TABLE "maintenancePlan"
  ADD COLUMN IF NOT EXISTS "executionCount" integer NOT NULL DEFAULT 0
    CHECK ("executionCount" >= 0);

-- Backfill from linked work orders (past successful generations that still exist).
UPDATE "maintenancePlan" p
SET "executionCount" = COALESCE(
  (
    SELECT COUNT(*)::integer
    FROM "workOrder" w
    WHERE w."maintenancePlanId" = p."id"
  ),
  0
)
WHERE p."executionCount" = 0;
