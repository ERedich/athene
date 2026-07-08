CREATE TABLE IF NOT EXISTS "shift" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "shortCode" text NOT NULL CHECK (char_length("shortCode") <= 5),
  "colorHex" text NOT NULL DEFAULT '#64748b',
  "startTime" time NOT NULL,
  "endTime" time NOT NULL,
  "breakHours" numeric(5,2) NOT NULL DEFAULT 0 CHECK ("breakHours" >= 0),
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "shift_siteId_shortCode_uidx" ON "shift" ("siteId", "shortCode");
CREATE INDEX IF NOT EXISTS "shift_siteId_idx" ON "shift" ("siteId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_shift ON "shift";
CREATE TRIGGER audit_set_row_metadata_shift
  BEFORE INSERT OR UPDATE ON "shift"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_shift ON "shift";
CREATE TRIGGER audit_capture_change_shift
  AFTER INSERT OR UPDATE OR DELETE ON "shift"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
