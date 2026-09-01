-- Work-order and maintenance-plan todo lists (structured description alternative).

CREATE TABLE IF NOT EXISTS "workOrderTodo" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workOrderId" uuid NOT NULL REFERENCES "workOrder" ("id") ON DELETE CASCADE,
  "pos" integer NOT NULL CHECK ("pos" >= 1 AND "pos" <= 9999),
  "text" varchar(500) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "workOrderTodo_workOrderId_pos_key" UNIQUE ("workOrderId", "pos")
);

CREATE INDEX IF NOT EXISTS "workOrderTodo_workOrderId_idx"
  ON "workOrderTodo" ("workOrderId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_work_order_todo ON "workOrderTodo";
CREATE TRIGGER audit_set_row_metadata_work_order_todo
  BEFORE INSERT OR UPDATE ON "workOrderTodo"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_work_order_todo ON "workOrderTodo";
CREATE TRIGGER audit_capture_change_work_order_todo
  AFTER INSERT OR UPDATE OR DELETE ON "workOrderTodo"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

CREATE TABLE IF NOT EXISTS "maintenancePlanTodo" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "maintenancePlanId" uuid NOT NULL REFERENCES "maintenancePlan" ("id") ON DELETE CASCADE,
  "pos" integer NOT NULL CHECK ("pos" >= 1 AND "pos" <= 9999),
  "text" varchar(500) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "maintenancePlanTodo_maintenancePlanId_pos_key" UNIQUE ("maintenancePlanId", "pos")
);

CREATE INDEX IF NOT EXISTS "maintenancePlanTodo_maintenancePlanId_idx"
  ON "maintenancePlanTodo" ("maintenancePlanId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_maintenance_plan_todo ON "maintenancePlanTodo";
CREATE TRIGGER audit_set_row_metadata_maintenance_plan_todo
  BEFORE INSERT OR UPDATE ON "maintenancePlanTodo"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_maintenance_plan_todo ON "maintenancePlanTodo";
CREATE TRIGGER audit_capture_change_maintenance_plan_todo
  AFTER INSERT OR UPDATE OR DELETE ON "maintenancePlanTodo"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
