CREATE TABLE IF NOT EXISTS "serviceContract" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "customerId" uuid NOT NULL REFERENCES "customer" ("id") ON DELETE RESTRICT,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "validFrom" timestamptz NOT NULL DEFAULT now(),
  "validTo" timestamptz,
  "reactionMinutes" integer NOT NULL DEFAULT 240
    CHECK ("reactionMinutes" >= 0),
  "resolutionMinutes" integer NOT NULL DEFAULT 1440
    CHECK ("resolutionMinutes" >= 0),
  "billingModel" text NOT NULL DEFAULT 'timeAndMaterial'
    CHECK ("billingModel" IN ('flat', 'timeAndMaterial')),
  "hourlyRate" numeric(18, 4) CHECK ("hourlyRate" IS NULL OR "hourlyRate" >= 0),
  "travelRate" numeric(18, 4) CHECK ("travelRate" IS NULL OR "travelRate" >= 0),
  "materialMarkupPercent" numeric(8, 4)
    CHECK ("materialMarkupPercent" IS NULL OR "materialMarkupPercent" >= 0),
  "flatRate" numeric(18, 4) CHECK ("flatRate" IS NULL OR "flatRate" >= 0),
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "serviceContract_siteId_key_key" UNIQUE ("siteId", "key")
);

CREATE INDEX IF NOT EXISTS "serviceContract_siteId_idx" ON "serviceContract" ("siteId");
CREATE INDEX IF NOT EXISTS "serviceContract_customerId_idx" ON "serviceContract" ("customerId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_service_contract ON "serviceContract";
CREATE TRIGGER audit_set_row_metadata_service_contract
  BEFORE INSERT OR UPDATE ON "serviceContract"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_service_contract ON "serviceContract";
CREATE TRIGGER audit_capture_change_service_contract
  AFTER INSERT OR UPDATE OR DELETE ON "serviceContract"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
