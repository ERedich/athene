-- Revert the resource-planning assignment window. The columns are NOT NULL without
-- a default, so they break inserts once the resource-planning code is gone.
-- Dropping the columns also drops the dependent check constraint and index.

ALTER TABLE "workOrderEmployeeAssignment"
  DROP COLUMN IF EXISTS "assignedFrom",
  DROP COLUMN IF EXISTS "assignedTo";
