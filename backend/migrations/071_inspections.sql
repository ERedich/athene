-- Inspection points on assets, inspection rounds (with activities), and work-order snapshots.

CREATE TABLE IF NOT EXISTS "inspectionPoint" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assetId" uuid NOT NULL REFERENCES "asset" ("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL DEFAULT 'inspection'
    CHECK ("type" IN ('inspection', 'lubrication')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "inspectionPoint_assetId_key_key" UNIQUE ("assetId", "key")
);

CREATE INDEX IF NOT EXISTS "inspectionPoint_assetId_idx" ON "inspectionPoint" ("assetId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_inspection_point ON "inspectionPoint";
CREATE TRIGGER audit_set_row_metadata_inspection_point
  BEFORE INSERT OR UPDATE ON "inspectionPoint"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_inspection_point ON "inspectionPoint";
CREATE TRIGGER audit_capture_change_inspection_point
  AFTER INSERT OR UPDATE OR DELETE ON "inspectionPoint"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

CREATE TABLE IF NOT EXISTS "inspectionRound" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" varchar(200) NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "assetId" uuid REFERENCES "asset" ("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "inspectionRound_siteId_key_key" UNIQUE ("siteId", "key")
);

CREATE INDEX IF NOT EXISTS "inspectionRound_siteId_idx" ON "inspectionRound" ("siteId");
CREATE INDEX IF NOT EXISTS "inspectionRound_assetId_idx" ON "inspectionRound" ("assetId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_inspection_round ON "inspectionRound";
CREATE TRIGGER audit_set_row_metadata_inspection_round
  BEFORE INSERT OR UPDATE ON "inspectionRound"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_inspection_round ON "inspectionRound";
CREATE TRIGGER audit_capture_change_inspection_round
  AFTER INSERT OR UPDATE OR DELETE ON "inspectionRound"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

CREATE TABLE IF NOT EXISTS "inspectionRoundActivity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "inspectionRoundId" uuid NOT NULL REFERENCES "inspectionRound" ("id") ON DELETE CASCADE,
  "pos" integer NOT NULL CHECK ("pos" >= 1 AND "pos" <= 9999),
  "name" text NOT NULL,
  "assetId" uuid REFERENCES "asset" ("id") ON DELETE RESTRICT,
  "inspectionPointId" uuid REFERENCES "inspectionPoint" ("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "inspectionRoundActivity_roundId_pos_key" UNIQUE ("inspectionRoundId", "pos")
);

CREATE INDEX IF NOT EXISTS "inspectionRoundActivity_roundId_idx"
  ON "inspectionRoundActivity" ("inspectionRoundId");
CREATE INDEX IF NOT EXISTS "inspectionRoundActivity_assetId_idx"
  ON "inspectionRoundActivity" ("assetId");
CREATE INDEX IF NOT EXISTS "inspectionRoundActivity_inspectionPointId_idx"
  ON "inspectionRoundActivity" ("inspectionPointId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_inspection_round_activity ON "inspectionRoundActivity";
CREATE TRIGGER audit_set_row_metadata_inspection_round_activity
  BEFORE INSERT OR UPDATE ON "inspectionRoundActivity"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_inspection_round_activity ON "inspectionRoundActivity";
CREATE TRIGGER audit_capture_change_inspection_round_activity
  AFTER INSERT OR UPDATE OR DELETE ON "inspectionRoundActivity"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

ALTER TABLE "workOrder"
  ADD COLUMN IF NOT EXISTS "inspectionRoundId" uuid
    REFERENCES "inspectionRound" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "workOrder_inspectionRoundId_idx"
  ON "workOrder" ("inspectionRoundId");

ALTER TABLE "maintenancePlan"
  ADD COLUMN IF NOT EXISTS "inspectionRoundId" uuid
    REFERENCES "inspectionRound" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "maintenancePlan_inspectionRoundId_idx"
  ON "maintenancePlan" ("inspectionRoundId");

CREATE TABLE IF NOT EXISTS "workOrderInspectionPoint" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workOrderId" uuid NOT NULL REFERENCES "workOrder" ("id") ON DELETE CASCADE,
  "pos" integer NOT NULL CHECK ("pos" >= 1 AND "pos" <= 9999),
  "name" text NOT NULL,
  "assetId" uuid REFERENCES "asset" ("id") ON DELETE SET NULL,
  "assetKey" text,
  "assetName" text,
  "inspectionPointId" uuid REFERENCES "inspectionPoint" ("id") ON DELETE SET NULL,
  "inspectionPointKey" text,
  "inspectionPointName" text,
  "checked" boolean NOT NULL DEFAULT false,
  "checkedAt" timestamptz,
  "checkedBy" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "workOrderInspectionPoint_workOrderId_pos_key" UNIQUE ("workOrderId", "pos")
);

CREATE INDEX IF NOT EXISTS "workOrderInspectionPoint_workOrderId_idx"
  ON "workOrderInspectionPoint" ("workOrderId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_work_order_inspection_point ON "workOrderInspectionPoint";
CREATE TRIGGER audit_set_row_metadata_work_order_inspection_point
  BEFORE INSERT OR UPDATE ON "workOrderInspectionPoint"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_work_order_inspection_point ON "workOrderInspectionPoint";
CREATE TRIGGER audit_capture_change_work_order_inspection_point
  AFTER INSERT OR UPDATE OR DELETE ON "workOrderInspectionPoint"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
