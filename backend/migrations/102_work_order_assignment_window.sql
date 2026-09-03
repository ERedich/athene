ALTER TABLE "workOrderEmployeeAssignment"
  ADD COLUMN IF NOT EXISTS "assignedFrom" timestamptz,
  ADD COLUMN IF NOT EXISTS "assignedTo" timestamptz;

UPDATE "workOrderEmployeeAssignment" AS a
SET
  "assignedFrom" = w."plannedStart",
  "assignedTo" = CASE
    WHEN w."plannedEnd" > w."plannedStart" THEN w."plannedEnd"
    ELSE w."plannedStart" + interval '1 minute'
  END
FROM "workOrder" AS w
WHERE w."id" = a."workOrderId"
  AND (a."assignedFrom" IS NULL OR a."assignedTo" IS NULL);

ALTER TABLE "workOrderEmployeeAssignment"
  ALTER COLUMN "assignedFrom" SET NOT NULL,
  ALTER COLUMN "assignedTo" SET NOT NULL;

ALTER TABLE "workOrderEmployeeAssignment"
  DROP CONSTRAINT IF EXISTS "workOrderEmployeeAssignment_window_check";

ALTER TABLE "workOrderEmployeeAssignment"
  ADD CONSTRAINT "workOrderEmployeeAssignment_window_check"
  CHECK ("assignedTo" > "assignedFrom");

CREATE INDEX IF NOT EXISTS "workOrderEmployeeAssignment_window_idx"
  ON "workOrderEmployeeAssignment" ("assignedFrom", "assignedTo");
