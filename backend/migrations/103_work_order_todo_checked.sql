-- Checklist state for work-order instructions (workOrderTodo only; not on maintenancePlanTodo).

ALTER TABLE "workOrderTodo"
  ADD COLUMN IF NOT EXISTS "checked" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "checkedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "checkedBy" uuid REFERENCES "users" ("id") ON DELETE SET NULL;
