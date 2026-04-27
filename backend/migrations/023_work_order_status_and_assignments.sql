ALTER TABLE "workOrder"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'open'
    CHECK ("status" IN ('open', 'assigned', 'started', 'paused', 'ended', 'done'));

ALTER TABLE "workOrder"
  ADD COLUMN IF NOT EXISTS "responsibleEmployeeId" uuid NULL
    REFERENCES "employee" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "workOrder_status_idx" ON "workOrder" ("status");
CREATE INDEX IF NOT EXISTS "workOrder_responsibleEmployeeId_idx" ON "workOrder" ("responsibleEmployeeId");

CREATE TABLE IF NOT EXISTS "workOrderEmployeeAssignment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workOrderId" uuid NOT NULL REFERENCES "workOrder" ("id") ON DELETE CASCADE,
  "employeeId" uuid NOT NULL REFERENCES "employee" ("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "workOrderEmployeeAssignment_workOrderId_employeeId_key" UNIQUE ("workOrderId", "employeeId")
);

CREATE INDEX IF NOT EXISTS "workOrderEmployeeAssignment_workOrderId_idx"
  ON "workOrderEmployeeAssignment" ("workOrderId");

CREATE INDEX IF NOT EXISTS "workOrderEmployeeAssignment_employeeId_idx"
  ON "workOrderEmployeeAssignment" ("employeeId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_work_order_employee_assignment ON "workOrderEmployeeAssignment";
CREATE TRIGGER audit_set_row_metadata_work_order_employee_assignment
  BEFORE INSERT OR UPDATE ON "workOrderEmployeeAssignment"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_work_order_employee_assignment ON "workOrderEmployeeAssignment";
CREATE TRIGGER audit_capture_change_work_order_employee_assignment
  AFTER INSERT OR UPDATE OR DELETE ON "workOrderEmployeeAssignment"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
