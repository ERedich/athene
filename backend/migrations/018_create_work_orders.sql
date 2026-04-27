CREATE SEQUENCE IF NOT EXISTS "workOrder_orderNumber_seq"
  START WITH 100000
  INCREMENT BY 1
  MINVALUE 100000
  NO MAXVALUE
  CACHE 1;

CREATE TABLE IF NOT EXISTS "workOrder" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderNumber" bigint NOT NULL UNIQUE DEFAULT nextval('"workOrder_orderNumber_seq"'),
  "name" varchar(200) NOT NULL,
  "description" varchar(2000),
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "assetId" uuid NOT NULL REFERENCES "asset" ("id") ON DELETE RESTRICT,
  "costCenterId" uuid NOT NULL REFERENCES "costCenter" ("id") ON DELETE RESTRICT,
  "plannedStart" timestamptz NOT NULL DEFAULT now(),
  "plannedEnd" timestamptz,
  "plannedDurationMinutes" integer CHECK ("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" >= 0),
  "orderType" text NOT NULL CHECK ("orderType" IN ('maintenance', 'repair', 'breakdown')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "workOrder_siteId_idx" ON "workOrder" ("siteId");
CREATE INDEX IF NOT EXISTS "workOrder_assetId_idx" ON "workOrder" ("assetId");
CREATE INDEX IF NOT EXISTS "workOrder_costCenterId_idx" ON "workOrder" ("costCenterId");
CREATE INDEX IF NOT EXISTS "workOrder_plannedStart_idx" ON "workOrder" ("plannedStart");
CREATE INDEX IF NOT EXISTS "workOrder_siteId_plannedStart_idx" ON "workOrder" ("siteId", "plannedStart" DESC);

CREATE OR REPLACE FUNCTION "work_order_apply_planning_defaults"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."plannedStart" IS NULL THEN
    NEW."plannedStart" := now();
  END IF;

  IF NEW."plannedDurationMinutes" IS NOT NULL THEN
    NEW."plannedEnd" := NEW."plannedStart" + make_interval(mins => NEW."plannedDurationMinutes");
  ELSIF NEW."plannedEnd" IS NULL THEN
    NEW."plannedEnd" := NEW."plannedStart" + interval '24 hours';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "work_order_apply_planning_defaults_trg" ON "workOrder";
CREATE TRIGGER "work_order_apply_planning_defaults_trg"
  BEFORE INSERT OR UPDATE ON "workOrder"
  FOR EACH ROW
  EXECUTE PROCEDURE "work_order_apply_planning_defaults"();

DROP TRIGGER IF EXISTS audit_set_row_metadata_work_order ON "workOrder";
CREATE TRIGGER audit_set_row_metadata_work_order
  BEFORE INSERT OR UPDATE ON "workOrder"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_work_order ON "workOrder";
CREATE TRIGGER audit_capture_change_work_order
  AFTER INSERT OR UPDATE OR DELETE ON "workOrder"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
