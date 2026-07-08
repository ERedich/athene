CREATE TABLE IF NOT EXISTS "employeeShiftAssignment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId" uuid NOT NULL REFERENCES "employee" ("id") ON DELETE RESTRICT,
  "shiftId" uuid NOT NULL REFERENCES "shift" ("id") ON DELETE RESTRICT,
  "assignmentDate" date NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "employeeShiftAssignment_employeeId_assignmentDate_key"
    UNIQUE ("employeeId", "assignmentDate")
);

CREATE INDEX IF NOT EXISTS "employeeShiftAssignment_employeeId_idx"
  ON "employeeShiftAssignment" ("employeeId");

CREATE INDEX IF NOT EXISTS "employeeShiftAssignment_shiftId_idx"
  ON "employeeShiftAssignment" ("shiftId");

CREATE INDEX IF NOT EXISTS "employeeShiftAssignment_assignmentDate_idx"
  ON "employeeShiftAssignment" ("assignmentDate");

CREATE INDEX IF NOT EXISTS "employeeShiftAssignment_shiftId_assignmentDate_idx"
  ON "employeeShiftAssignment" ("shiftId", "assignmentDate");

DROP TRIGGER IF EXISTS audit_set_row_metadata_employee_shift_assignment ON "employeeShiftAssignment";
CREATE TRIGGER audit_set_row_metadata_employee_shift_assignment
  BEFORE INSERT OR UPDATE ON "employeeShiftAssignment"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_employee_shift_assignment ON "employeeShiftAssignment";
CREATE TRIGGER audit_capture_change_employee_shift_assignment
  AFTER INSERT OR UPDATE OR DELETE ON "employeeShiftAssignment"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
