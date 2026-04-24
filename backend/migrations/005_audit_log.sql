-- Metadaten (Erstellt/Aktualisiert) und zentrales Audit-Log mit Trigger-Erfassung

-- ---------------------------------------------------------------------------
-- 1) Spalten ergänzen (zunächst nullable wo Backfill nötig)
-- ---------------------------------------------------------------------------
ALTER TABLE "site"
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "createdBy" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "updatedBy" uuid REFERENCES "users" ("id") ON DELETE SET NULL;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "createdBy" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "updatedBy" uuid REFERENCES "users" ("id") ON DELETE SET NULL;

ALTER TABLE "userSite"
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "createdBy" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "updatedBy" uuid REFERENCES "users" ("id") ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2) Backfill: Referenz-User (admin bevorzugt)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  ref_user_id uuid;
BEGIN
  SELECT "id" INTO ref_user_id FROM "users" WHERE "loginName" = 'admin' LIMIT 1;
  IF ref_user_id IS NULL THEN
    SELECT "id" INTO ref_user_id FROM "users" ORDER BY "createdAt" ASC LIMIT 1;
  END IF;

  IF ref_user_id IS NULL THEN
    RAISE EXCEPTION '005_audit_log: Kein Benutzer für Backfill vorhanden';
  END IF;

  UPDATE "site" SET
    "createdAt" = coalesce("createdAt", now()),
    "updatedAt" = coalesce("updatedAt", coalesce("createdAt", now())),
    "createdBy" = coalesce("createdBy", ref_user_id),
    "updatedBy" = coalesce("updatedBy", ref_user_id);

  UPDATE "users" SET
    "updatedAt" = coalesce("updatedAt", "createdAt"),
    "createdBy" = coalesce("createdBy", "id"),
    "updatedBy" = coalesce("updatedBy", "id");

  UPDATE "userSite" SET
    "createdAt" = coalesce("createdAt", now()),
    "updatedAt" = coalesce("updatedAt", coalesce("createdAt", now())),
    "createdBy" = coalesce("createdBy", ref_user_id),
    "updatedBy" = coalesce("updatedBy", ref_user_id);
END $$;

-- ---------------------------------------------------------------------------
-- 3) NOT NULL / Defaults
-- ---------------------------------------------------------------------------
ALTER TABLE "site"
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT now(),
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT now(),
  ALTER COLUMN "createdBy" SET NOT NULL,
  ALTER COLUMN "updatedBy" SET NOT NULL;

ALTER TABLE "users"
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT now(),
  ALTER COLUMN "createdBy" SET NOT NULL,
  ALTER COLUMN "updatedBy" SET NOT NULL;

ALTER TABLE "userSite"
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT now(),
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT now(),
  ALTER COLUMN "createdBy" SET NOT NULL,
  ALTER COLUMN "updatedBy" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Audit-Tabelle (append-only; keine Trigger auf dieser Tabelle)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "auditLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tableName" text NOT NULL,
  "recordId" text NOT NULL,
  "operation" text NOT NULL CHECK ("operation" IN ('INSERT', 'UPDATE', 'DELETE')),
  "changedAt" timestamptz NOT NULL DEFAULT now(),
  "changedBy" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "requestId" text,
  "oldData" jsonb,
  "newData" jsonb,
  "changedFields" text[],
  "reason" text,
  "source" text,
  "ipAddress" text,
  "userAgent" text
);

CREATE INDEX IF NOT EXISTS "auditLog_changedAt_idx" ON "auditLog" ("changedAt" DESC);
CREATE INDEX IF NOT EXISTS "auditLog_table_record_idx" ON "auditLog" ("tableName", "recordId");
CREATE INDEX IF NOT EXISTS "auditLog_changedBy_idx" ON "auditLog" ("changedBy");

-- ---------------------------------------------------------------------------
-- 5) Session-Kontext lesen (von App via set_config gesetzt)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_session_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text;
BEGIN
  BEGIN
    raw := current_setting('app.current_user_id', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION audit_session_text(setting_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text;
BEGIN
  BEGIN
    raw := current_setting(setting_name, true);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) BEFORE: Zeitstempel und Benutzer aus Session setzen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_set_row_metadata()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := audit_session_user_id();

  IF TG_OP = 'INSERT' THEN
    IF NEW."createdAt" IS NULL THEN
      NEW."createdAt" := now();
    END IF;
    IF NEW."updatedAt" IS NULL THEN
      NEW."updatedAt" := now();
    END IF;
    IF uid IS NOT NULL THEN
      IF NEW."createdBy" IS NULL THEN
        NEW."createdBy" := uid;
      END IF;
      IF NEW."updatedBy" IS NULL THEN
        NEW."updatedBy" := uid;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW."updatedAt" := now();
    IF uid IS NOT NULL THEN
      NEW."updatedBy" := uid;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_set_row_metadata_site ON "site";
CREATE TRIGGER audit_set_row_metadata_site
  BEFORE INSERT OR UPDATE ON "site"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_set_row_metadata_users ON "users";
CREATE TRIGGER audit_set_row_metadata_users
  BEFORE INSERT OR UPDATE ON "users"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_set_row_metadata_user_site ON "userSite";
CREATE TRIGGER audit_set_row_metadata_user_site
  BEFORE INSERT OR UPDATE ON "userSite"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

-- ---------------------------------------------------------------------------
-- 7) AFTER: Eintrag in auditLog
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_json_changed_fields(old_row jsonb, new_row jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text;
  out text[] := ARRAY[]::text[];
BEGIN
  IF old_row IS NULL OR new_row IS NULL THEN
    RETURN NULL;
  END IF;
  FOR k IN SELECT jsonb_object_keys(new_row)
  LOOP
    IF (old_row -> k) IS DISTINCT FROM (new_row -> k) THEN
      out := array_append(out, k);
    END IF;
  END LOOP;
  IF array_length(out, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION audit_capture_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid;
  v_record_id text;
  v_old jsonb;
  v_new jsonb;
  v_fields text[];
BEGIN
  IF TG_TABLE_NAME IN ('auditLog', '_migration') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_user := audit_session_user_id();

  IF TG_OP = 'INSERT' THEN
    v_record_id := NEW."id"::text;
    v_new := to_jsonb(NEW);
    INSERT INTO "auditLog" (
      "tableName", "recordId", "operation", "changedBy", "requestId",
      "oldData", "newData", "changedFields", "reason", "source", "ipAddress", "userAgent"
    ) VALUES (
      TG_TABLE_NAME,
      v_record_id,
      'INSERT',
      v_user,
      NULLIF(audit_session_text('app.request_id'), ''),
      NULL,
      v_new,
      NULL,
      NULLIF(audit_session_text('app.change_reason'), ''),
      NULLIF(audit_session_text('app.source'), ''),
      NULLIF(audit_session_text('app.ip_address'), ''),
      NULLIF(audit_session_text('app.user_agent'), '')
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW."id"::text;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_fields := audit_json_changed_fields(v_old, v_new);
    IF v_fields IS NULL OR array_length(v_fields, 1) IS NULL THEN
      RETURN NEW;
    END IF;
    INSERT INTO "auditLog" (
      "tableName", "recordId", "operation", "changedBy", "requestId",
      "oldData", "newData", "changedFields", "reason", "source", "ipAddress", "userAgent"
    ) VALUES (
      TG_TABLE_NAME,
      v_record_id,
      'UPDATE',
      v_user,
      NULLIF(audit_session_text('app.request_id'), ''),
      v_old,
      v_new,
      v_fields,
      NULLIF(audit_session_text('app.change_reason'), ''),
      NULLIF(audit_session_text('app.source'), ''),
      NULLIF(audit_session_text('app.ip_address'), ''),
      NULLIF(audit_session_text('app.user_agent'), '')
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_record_id := OLD."id"::text;
    v_old := to_jsonb(OLD);
    INSERT INTO "auditLog" (
      "tableName", "recordId", "operation", "changedBy", "requestId",
      "oldData", "newData", "changedFields", "reason", "source", "ipAddress", "userAgent"
    ) VALUES (
      TG_TABLE_NAME,
      v_record_id,
      'DELETE',
      v_user,
      NULLIF(audit_session_text('app.request_id'), ''),
      v_old,
      NULL,
      NULL,
      NULLIF(audit_session_text('app.change_reason'), ''),
      NULLIF(audit_session_text('app.source'), ''),
      NULLIF(audit_session_text('app.ip_address'), ''),
      NULLIF(audit_session_text('app.user_agent'), '')
    );
    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_capture_change_site ON "site";
CREATE TRIGGER audit_capture_change_site
  AFTER INSERT OR UPDATE OR DELETE ON "site"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

DROP TRIGGER IF EXISTS audit_capture_change_users ON "users";
CREATE TRIGGER audit_capture_change_users
  AFTER INSERT OR UPDATE OR DELETE ON "users"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

DROP TRIGGER IF EXISTS audit_capture_change_user_site ON "userSite";
CREATE TRIGGER audit_capture_change_user_site
  AFTER INSERT OR UPDATE OR DELETE ON "userSite"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
