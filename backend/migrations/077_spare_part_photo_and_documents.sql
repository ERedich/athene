ALTER TABLE "sparePart"
  ADD COLUMN IF NOT EXISTS "photoMimeType" text,
  ADD COLUMN IF NOT EXISTS "photoContent" bytea;

ALTER TABLE "document" DROP CONSTRAINT IF EXISTS "document_referenceApp_check";
ALTER TABLE "document"
  ADD CONSTRAINT "document_referenceApp_check"
  CHECK ("referenceApp" IN ('assets', 'workOrders', 'spareParts'));

ALTER TABLE "documentLink" DROP CONSTRAINT IF EXISTS "documentLink_entityType_check";
ALTER TABLE "documentLink"
  ADD CONSTRAINT "documentLink_entityType_check"
  CHECK ("entityType" IN ('asset', 'workOrder', 'sparePart'));
