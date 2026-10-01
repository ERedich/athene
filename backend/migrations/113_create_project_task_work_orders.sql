-- Project Management: Task to Work Order link table
CREATE TABLE IF NOT EXISTS "projectTaskWorkOrder" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectTaskId" uuid NOT NULL REFERENCES "projectTask" ("id") ON DELETE CASCADE,
  "workOrderId" uuid NOT NULL REFERENCES "workOrder" ("id") ON DELETE CASCADE,
  "linkType" text NOT NULL DEFAULT 'implements' CHECK ("linkType" IN ('implements', 'related', 'blocks')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "projectTaskWorkOrder_unique_idx" ON "projectTaskWorkOrder" ("projectTaskId", "workOrderId");
CREATE INDEX IF NOT EXISTS "projectTaskWorkOrder_projectTaskId_idx" ON "projectTaskWorkOrder" ("projectTaskId");
CREATE INDEX IF NOT EXISTS "projectTaskWorkOrder_workOrderId_idx" ON "projectTaskWorkOrder" ("workOrderId");
