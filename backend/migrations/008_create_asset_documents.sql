CREATE TABLE IF NOT EXISTS "assetDocument" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assetId" uuid NOT NULL REFERENCES "asset" ("id") ON DELETE CASCADE,
  "fileName" text NOT NULL,
  "mimeType" text NOT NULL,
  "fileSize" integer NOT NULL CHECK ("fileSize" >= 0),
  "content" bytea NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "assetDocument_assetId_idx" ON "assetDocument" ("assetId");
CREATE INDEX IF NOT EXISTS "assetDocument_createdAt_idx" ON "assetDocument" ("createdAt" DESC);

DROP TRIGGER IF EXISTS audit_set_row_metadata_asset_document ON "assetDocument";
CREATE TRIGGER audit_set_row_metadata_asset_document
  BEFORE INSERT OR UPDATE ON "assetDocument"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_asset_document ON "assetDocument";
CREATE TRIGGER audit_capture_change_asset_document
  AFTER INSERT OR UPDATE OR DELETE ON "assetDocument"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
