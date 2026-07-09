ALTER TABLE "employeeShiftAssignment"
  DROP CONSTRAINT IF EXISTS "employeeShiftAssignment_employeeId_assignmentDate_key";

ALTER TABLE "employeeShiftAssignment"
  ADD CONSTRAINT "employeeShiftAssignment_employee_shift_date_key"
  UNIQUE ("employeeId", "shiftId", "assignmentDate");

CREATE INDEX IF NOT EXISTS "employeeShiftAssignment_employeeId_assignmentDate_idx"
  ON "employeeShiftAssignment" ("employeeId", "assignmentDate");
