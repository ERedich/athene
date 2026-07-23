CREATE TABLE IF NOT EXISTS "sparePartStockPolicyResponsibleEmployee" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stockPolicyId" uuid NOT NULL REFERENCES "sparePartStockPolicy" ("id") ON DELETE CASCADE,
  "employeeId" uuid NOT NULL REFERENCES "employee" ("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "sparePartStockPolicyResponsibleEmployee_policy_employee_key"
    UNIQUE ("stockPolicyId", "employeeId")
);

CREATE INDEX IF NOT EXISTS "sparePartStockPolicyResponsibleEmployee_stockPolicyId_idx"
  ON "sparePartStockPolicyResponsibleEmployee" ("stockPolicyId");

CREATE INDEX IF NOT EXISTS "sparePartStockPolicyResponsibleEmployee_employeeId_idx"
  ON "sparePartStockPolicyResponsibleEmployee" ("employeeId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_sp_stock_policy_responsible_employee
  ON "sparePartStockPolicyResponsibleEmployee";
CREATE TRIGGER audit_set_row_metadata_sp_stock_policy_responsible_employee
  BEFORE INSERT OR UPDATE ON "sparePartStockPolicyResponsibleEmployee"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_sp_stock_policy_responsible_employee
  ON "sparePartStockPolicyResponsibleEmployee";
CREATE TRIGGER audit_capture_change_sp_stock_policy_responsible_employee
  AFTER INSERT OR UPDATE OR DELETE ON "sparePartStockPolicyResponsibleEmployee"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
