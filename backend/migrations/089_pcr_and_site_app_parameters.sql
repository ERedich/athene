-- Site-scoped app parameters + PCR master data (Problem / Cause / Remedy) + workOrder PCR FKs

-- ---------------------------------------------------------------------------
-- siteAppParameter
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "siteAppParameter" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "category" text NOT NULL CHECK ("category" IN ('GN', 'WO', 'SH', 'MT', 'PO', 'SV')),
  "codeSuffix" text NOT NULL CHECK (char_length("codeSuffix") BETWEEN 3 AND 6),
  "nameDe" text NOT NULL,
  "nameEn" text NOT NULL,
  "descriptionDe" text,
  "descriptionEn" text,
  "valueType" text NOT NULL CHECK ("valueType" IN ('boolean', 'json', 'uuid', 'number', 'time')),
  "boolValue" boolean NOT NULL DEFAULT false,
  "jsonValue" jsonb,
  "uuidValue" uuid,
  "numValue" numeric,
  "timeValue" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "siteAppParameter_siteId_key_key" UNIQUE ("siteId", "key")
);

CREATE INDEX IF NOT EXISTS "siteAppParameter_siteId_idx" ON "siteAppParameter" ("siteId");
CREATE INDEX IF NOT EXISTS "siteAppParameter_category_idx" ON "siteAppParameter" ("category");

DROP TRIGGER IF EXISTS audit_set_row_metadata_site_app_parameter ON "siteAppParameter";
CREATE TRIGGER audit_set_row_metadata_site_app_parameter
  BEFORE INSERT OR UPDATE ON "siteAppParameter"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_site_app_parameter ON "siteAppParameter";
CREATE TRIGGER audit_capture_change_site_app_parameter
  AFTER INSERT OR UPDATE OR DELETE ON "siteAppParameter"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

-- Seed WO-PCR for every site (default order types: breakdown)
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
    RAISE EXCEPTION 'no user available to seed siteAppParameter WO-PCR';
  END IF;

  FOR site_rec IN SELECT s."id" AS "siteId" FROM "site" s
  LOOP
    INSERT INTO "siteAppParameter" (
      "siteId",
      "key",
      "category",
      "codeSuffix",
      "nameDe",
      "nameEn",
      "descriptionDe",
      "descriptionEn",
      "valueType",
      "boolValue",
      "jsonValue",
      "createdBy",
      "updatedBy"
    )
    VALUES (
      site_rec."siteId",
      'WO-PCR',
      'WO',
      'PCR',
      'Problem-Ursache-Maßnahme Auftragstypen',
      'Problem Cause Remedy work order types',
      'Auswahl der Auftragsarten, für die in der Rückmeldung PCR-Felder (Problem / Ursache / Maßnahme) gelten. Standard: Störung (breakdown).',
      'Selects work order types for which PCR fields (Problem / Cause / Remedy) apply in feedback. Default: breakdown.',
      'json',
      false,
      '["breakdown"]'::jsonb,
      admin_id,
      admin_id
    )
    ON CONFLICT ("siteId", "key") DO NOTHING;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- problem / cause / remedy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "problem" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "classificationId" uuid REFERENCES "classification" ("id") ON DELETE RESTRICT,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "problem_siteId_key_key" UNIQUE ("siteId", "key")
);

CREATE INDEX IF NOT EXISTS "problem_siteId_idx" ON "problem" ("siteId");
CREATE INDEX IF NOT EXISTS "problem_classificationId_idx" ON "problem" ("classificationId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_problem ON "problem";
CREATE TRIGGER audit_set_row_metadata_problem
  BEFORE INSERT OR UPDATE ON "problem"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_problem ON "problem";
CREATE TRIGGER audit_capture_change_problem
  AFTER INSERT OR UPDATE OR DELETE ON "problem"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

CREATE TABLE IF NOT EXISTS "cause" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "cause_siteId_key_key" UNIQUE ("siteId", "key")
);

CREATE INDEX IF NOT EXISTS "cause_siteId_idx" ON "cause" ("siteId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_cause ON "cause";
CREATE TRIGGER audit_set_row_metadata_cause
  BEFORE INSERT OR UPDATE ON "cause"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_cause ON "cause";
CREATE TRIGGER audit_capture_change_cause
  AFTER INSERT OR UPDATE OR DELETE ON "cause"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

CREATE TABLE IF NOT EXISTS "remedy" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "remedy_siteId_key_key" UNIQUE ("siteId", "key")
);

CREATE INDEX IF NOT EXISTS "remedy_siteId_idx" ON "remedy" ("siteId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_remedy ON "remedy";
CREATE TRIGGER audit_set_row_metadata_remedy
  BEFORE INSERT OR UPDATE ON "remedy"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_remedy ON "remedy";
CREATE TRIGGER audit_capture_change_remedy
  AFTER INSERT OR UPDATE OR DELETE ON "remedy"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

-- ---------------------------------------------------------------------------
-- Junctions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "problemCause" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "problemId" uuid NOT NULL REFERENCES "problem" ("id") ON DELETE CASCADE,
  "causeId" uuid NOT NULL REFERENCES "cause" ("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "problemCause_problem_cause_uidx" UNIQUE ("problemId", "causeId")
);

CREATE INDEX IF NOT EXISTS "problemCause_problemId_idx" ON "problemCause" ("problemId");
CREATE INDEX IF NOT EXISTS "problemCause_causeId_idx" ON "problemCause" ("causeId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_problem_cause ON "problemCause";
CREATE TRIGGER audit_set_row_metadata_problem_cause
  BEFORE INSERT OR UPDATE ON "problemCause"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_problem_cause ON "problemCause";
CREATE TRIGGER audit_capture_change_problem_cause
  AFTER INSERT OR UPDATE OR DELETE ON "problemCause"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

CREATE TABLE IF NOT EXISTS "causeRemedy" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "causeId" uuid NOT NULL REFERENCES "cause" ("id") ON DELETE CASCADE,
  "remedyId" uuid NOT NULL REFERENCES "remedy" ("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "causeRemedy_cause_remedy_uidx" UNIQUE ("causeId", "remedyId")
);

CREATE INDEX IF NOT EXISTS "causeRemedy_causeId_idx" ON "causeRemedy" ("causeId");
CREATE INDEX IF NOT EXISTS "causeRemedy_remedyId_idx" ON "causeRemedy" ("remedyId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_cause_remedy ON "causeRemedy";
CREATE TRIGGER audit_set_row_metadata_cause_remedy
  BEFORE INSERT OR UPDATE ON "causeRemedy"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_cause_remedy ON "causeRemedy";
CREATE TRIGGER audit_capture_change_cause_remedy
  AFTER INSERT OR UPDATE OR DELETE ON "causeRemedy"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

-- ---------------------------------------------------------------------------
-- workOrder PCR FKs
-- ---------------------------------------------------------------------------
ALTER TABLE "workOrder"
  ADD COLUMN IF NOT EXISTS "problemId" uuid REFERENCES "problem" ("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "causeId" uuid REFERENCES "cause" ("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "remedyId" uuid REFERENCES "remedy" ("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "workOrder_problemId_idx" ON "workOrder" ("problemId");
CREATE INDEX IF NOT EXISTS "workOrder_causeId_idx" ON "workOrder" ("causeId");
CREATE INDEX IF NOT EXISTS "workOrder_remedyId_idx" ON "workOrder" ("remedyId");
