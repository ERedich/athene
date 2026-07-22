-- Arbeitstypen (site-scoped Stammdaten) + workOrder CHECK entfernen + maintenancePlan.orderType

CREATE TABLE IF NOT EXISTS "workOrderType" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "isActive" boolean NOT NULL DEFAULT true,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "workOrderType_siteId_key_key" UNIQUE ("siteId", "key")
);

CREATE INDEX IF NOT EXISTS "workOrderType_siteId_idx" ON "workOrderType" ("siteId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_work_order_type ON "workOrderType";
CREATE TRIGGER audit_set_row_metadata_work_order_type
  BEFORE INSERT OR UPDATE ON "workOrderType"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_work_order_type ON "workOrderType";
CREATE TRIGGER audit_capture_change_work_order_type
  AFTER INSERT OR UPDATE OR DELETE ON "workOrderType"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

-- Drop hardcoded orderType enum check
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'workOrder'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%orderType%'
  LOOP
    EXECUTE format('ALTER TABLE "workOrder" DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

UPDATE "workOrder"
SET "orderType" = 'plannedRepair'
WHERE "orderType" = 'repair';

ALTER TABLE "maintenancePlan"
  ADD COLUMN IF NOT EXISTS "orderType" text NOT NULL DEFAULT 'maintenance';

-- Seed default types for every site
DO $$
DECLARE
  admin_id uuid;
  site_rec record;
BEGIN
  SELECT "id" INTO admin_id FROM "users" WHERE "loginName" = 'admin' LIMIT 1;
  IF admin_id IS NULL THEN
    SELECT "id" INTO admin_id FROM "users" ORDER BY "createdAt" ASC LIMIT 1;
  END IF;
  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'no user available to seed work order types';
  END IF;

  FOR site_rec IN SELECT s."id" AS "siteId" FROM "site" s
  LOOP
    INSERT INTO "workOrderType" ("key", "name", "siteId", "isActive", "sortOrder", "createdBy", "updatedBy")
    VALUES
      ('plannedRepair', 'Geplante Instandsetzung', site_rec."siteId", true, 10, admin_id, admin_id),
      ('breakdown', 'Störung', site_rec."siteId", true, 20, admin_id, admin_id),
      ('maintenance', 'Wartung', site_rec."siteId", true, 30, admin_id, admin_id),
      ('inspection', 'Inspektion', site_rec."siteId", true, 40, admin_id, admin_id)
    ON CONFLICT ("siteId", "key") DO NOTHING;
  END LOOP;
END $$;
