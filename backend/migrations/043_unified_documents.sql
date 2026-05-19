CREATE TABLE IF NOT EXISTS "document" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fileName" text NOT NULL,
  "displayName" text NOT NULL,
  "category" text NOT NULL CHECK ("category" IN ('general', 'protocols', 'drawings', 'instructions', 'nameplates', 'certificates')),
  "mimeType" text NOT NULL,
  "fileSize" integer NOT NULL CHECK ("fileSize" >= 0),
  "content" bytea NOT NULL,
  "referenceApp" text NOT NULL CHECK ("referenceApp" IN ('assets', 'workOrders')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "document_createdAt_idx" ON "document" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "document_referenceApp_idx" ON "document" ("referenceApp");

CREATE TABLE IF NOT EXISTS "documentLink" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "documentId" uuid NOT NULL UNIQUE REFERENCES "document" ("id") ON DELETE CASCADE,
  "entityType" text NOT NULL CHECK ("entityType" IN ('asset', 'workOrder')),
  "entityId" uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS "documentLink_entity_idx" ON "documentLink" ("entityType", "entityId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_document ON "document";
CREATE TRIGGER audit_set_row_metadata_document
  BEFORE INSERT OR UPDATE ON "document"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_document ON "document";
CREATE TRIGGER audit_capture_change_document
  AFTER INSERT OR UPDATE OR DELETE ON "document"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

-- Migrate assetDocument rows
INSERT INTO "document" (
  "id",
  "fileName",
  "displayName",
  "category",
  "mimeType",
  "fileSize",
  "content",
  "referenceApp",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  ad."id",
  ad."fileName",
  ad."displayName",
  ad."category",
  ad."mimeType",
  ad."fileSize",
  ad."content",
  'assets',
  ad."createdAt",
  ad."createdBy",
  ad."updatedAt",
  ad."updatedBy"
FROM "assetDocument" ad;

INSERT INTO "documentLink" ("documentId", "entityType", "entityId")
SELECT ad."id", 'asset', ad."assetId"
FROM "assetDocument" ad;

-- Migrate workOrderDocument rows
INSERT INTO "document" (
  "id",
  "fileName",
  "displayName",
  "category",
  "mimeType",
  "fileSize",
  "content",
  "referenceApp",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  wd."id",
  wd."fileName",
  wd."displayName",
  wd."category",
  wd."mimeType",
  wd."fileSize",
  wd."content",
  'workOrders',
  wd."createdAt",
  wd."createdBy",
  wd."updatedAt",
  wd."updatedBy"
FROM "workOrderDocument" wd;

INSERT INTO "documentLink" ("documentId", "entityType", "entityId")
SELECT wd."id", 'workOrder', wd."workOrderId"
FROM "workOrderDocument" wd;

DROP TABLE IF EXISTS "assetDocument";
DROP TABLE IF EXISTS "workOrderDocument";
