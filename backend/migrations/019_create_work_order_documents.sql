CREATE TABLE IF NOT EXISTS "workOrderDocument" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workOrderId" uuid NOT NULL REFERENCES "workOrder" ("id") ON DELETE CASCADE,
  "fileName" text NOT NULL,
  "displayName" text NOT NULL,
  "category" text NOT NULL CHECK ("category" IN ('general', 'protocols', 'drawings', 'instructions', 'nameplates', 'certificates')),
  "mimeType" text NOT NULL,
  "fileSize" integer NOT NULL CHECK ("fileSize" >= 0),
  "content" bytea NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "workOrderDocument_workOrderId_idx" ON "workOrderDocument" ("workOrderId");
CREATE INDEX IF NOT EXISTS "workOrderDocument_createdAt_idx" ON "workOrderDocument" ("createdAt" DESC);

DROP TRIGGER IF EXISTS audit_set_row_metadata_work_order_document ON "workOrderDocument";
CREATE TRIGGER audit_set_row_metadata_work_order_document
  BEFORE INSERT OR UPDATE ON "workOrderDocument"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_work_order_document ON "workOrderDocument";
CREATE TRIGGER audit_capture_change_work_order_document
  AFTER INSERT OR UPDATE OR DELETE ON "workOrderDocument"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
