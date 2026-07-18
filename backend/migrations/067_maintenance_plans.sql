CREATE TABLE IF NOT EXISTS "maintenancePlan" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" varchar(2000),
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "assetId" uuid NOT NULL REFERENCES "asset" ("id") ON DELETE RESTRICT,
  "costCenterId" uuid NOT NULL REFERENCES "costCenter" ("id") ON DELETE RESTRICT,
  "workgroupId" uuid NOT NULL REFERENCES "workgroup" ("id") ON DELETE RESTRICT,
  "classificationId" uuid REFERENCES "classification" ("id") ON DELETE SET NULL,
  "plannedDurationMinutes" integer CHECK ("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" >= 0),
  "intervalUnit" text NOT NULL CHECK ("intervalUnit" IN ('day', 'week', 'month', 'year')),
  "intervalValue" integer NOT NULL CHECK ("intervalValue" >= 1),
  "anchorDate" date NOT NULL,
  "nextDueAt" timestamptz NOT NULL,
  "leadTimeDays" integer NOT NULL DEFAULT 7 CHECK ("leadTimeDays" >= 0),
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'paused', 'ended')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "maintenancePlan_siteId_key_key" UNIQUE ("siteId", "key")
);

CREATE INDEX IF NOT EXISTS "maintenancePlan_siteId_idx" ON "maintenancePlan" ("siteId");
CREATE INDEX IF NOT EXISTS "maintenancePlan_assetId_idx" ON "maintenancePlan" ("assetId");
CREATE INDEX IF NOT EXISTS "maintenancePlan_status_nextDueAt_idx" ON "maintenancePlan" ("status", "nextDueAt");
CREATE INDEX IF NOT EXISTS "maintenancePlan_workgroupId_idx" ON "maintenancePlan" ("workgroupId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_maintenance_plan ON "maintenancePlan";
CREATE TRIGGER audit_set_row_metadata_maintenance_plan
  BEFORE INSERT OR UPDATE ON "maintenancePlan"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_maintenance_plan ON "maintenancePlan";
CREATE TRIGGER audit_capture_change_maintenance_plan
  AFTER INSERT OR UPDATE OR DELETE ON "maintenancePlan"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

CREATE TABLE IF NOT EXISTS "maintenancePlanResponsibleEmployee" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "maintenancePlanId" uuid NOT NULL REFERENCES "maintenancePlan" ("id") ON DELETE CASCADE,
  "employeeId" uuid NOT NULL REFERENCES "employee" ("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "maintenancePlanResponsibleEmployee_planId_employeeId_key"
    UNIQUE ("maintenancePlanId", "employeeId")
);

CREATE INDEX IF NOT EXISTS "maintenancePlanResponsibleEmployee_planId_idx"
  ON "maintenancePlanResponsibleEmployee" ("maintenancePlanId");

CREATE INDEX IF NOT EXISTS "maintenancePlanResponsibleEmployee_employeeId_idx"
  ON "maintenancePlanResponsibleEmployee" ("employeeId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_maintenance_plan_responsible_employee
  ON "maintenancePlanResponsibleEmployee";
CREATE TRIGGER audit_set_row_metadata_maintenance_plan_responsible_employee
  BEFORE INSERT OR UPDATE ON "maintenancePlanResponsibleEmployee"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_maintenance_plan_responsible_employee
  ON "maintenancePlanResponsibleEmployee";
CREATE TRIGGER audit_capture_change_maintenance_plan_responsible_employee
  AFTER INSERT OR UPDATE OR DELETE ON "maintenancePlanResponsibleEmployee"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

ALTER TABLE "workOrder"
  ADD COLUMN IF NOT EXISTS "maintenancePlanId" uuid
    REFERENCES "maintenancePlan" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "workOrder_maintenancePlanId_idx"
  ON "workOrder" ("maintenancePlanId");

CREATE INDEX IF NOT EXISTS "workOrder_maintenancePlanId_status_idx"
  ON "workOrder" ("maintenancePlanId", "status")
  WHERE "maintenancePlanId" IS NOT NULL;
