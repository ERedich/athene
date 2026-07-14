ALTER TABLE "workgroupUser"
  ADD COLUMN IF NOT EXISTS "isLeader" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "workOrderResponsibleEmployee" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workOrderId" uuid NOT NULL REFERENCES "workOrder" ("id") ON DELETE CASCADE,
  "employeeId" uuid NOT NULL REFERENCES "employee" ("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "workOrderResponsibleEmployee_workOrderId_employeeId_key" UNIQUE ("workOrderId", "employeeId")
);

CREATE INDEX IF NOT EXISTS "workOrderResponsibleEmployee_workOrderId_idx"
  ON "workOrderResponsibleEmployee" ("workOrderId");

CREATE INDEX IF NOT EXISTS "workOrderResponsibleEmployee_employeeId_idx"
  ON "workOrderResponsibleEmployee" ("employeeId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_work_order_responsible_employee ON "workOrderResponsibleEmployee";
CREATE TRIGGER audit_set_row_metadata_work_order_responsible_employee
  BEFORE INSERT OR UPDATE ON "workOrderResponsibleEmployee"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_work_order_responsible_employee ON "workOrderResponsibleEmployee";
CREATE TRIGGER audit_capture_change_work_order_responsible_employee
  AFTER INSERT OR UPDATE OR DELETE ON "workOrderResponsibleEmployee"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

INSERT INTO "workOrderResponsibleEmployee" ("workOrderId", "employeeId", "createdBy", "updatedBy")
SELECT w."id", w."responsibleEmployeeId", w."createdBy", w."updatedBy"
FROM "workOrder" w
WHERE w."responsibleEmployeeId" IS NOT NULL
ON CONFLICT ("workOrderId", "employeeId") DO NOTHING;

DROP INDEX IF EXISTS "workOrder_responsibleEmployeeId_idx";

ALTER TABLE "workOrder"
  DROP COLUMN IF EXISTS "responsibleEmployeeId";
