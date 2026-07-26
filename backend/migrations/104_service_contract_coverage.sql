CREATE TABLE IF NOT EXISTS "serviceContractAsset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "serviceContractId" uuid NOT NULL REFERENCES "serviceContract" ("id") ON DELETE CASCADE,
  "assetId" uuid NOT NULL REFERENCES "asset" ("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "serviceContractAsset_contract_asset_key" UNIQUE ("serviceContractId", "assetId")
);

CREATE INDEX IF NOT EXISTS "serviceContractAsset_serviceContractId_idx"
  ON "serviceContractAsset" ("serviceContractId");
CREATE INDEX IF NOT EXISTS "serviceContractAsset_assetId_idx"
  ON "serviceContractAsset" ("assetId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_service_contract_asset ON "serviceContractAsset";
CREATE TRIGGER audit_set_row_metadata_service_contract_asset
  BEFORE INSERT OR UPDATE ON "serviceContractAsset"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_service_contract_asset ON "serviceContractAsset";
CREATE TRIGGER audit_capture_change_service_contract_asset
  AFTER INSERT OR UPDATE OR DELETE ON "serviceContractAsset"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

CREATE TABLE IF NOT EXISTS "serviceContractSite" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "serviceContractId" uuid NOT NULL REFERENCES "serviceContract" ("id") ON DELETE CASCADE,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "serviceContractSite_contract_site_key" UNIQUE ("serviceContractId", "siteId")
);

CREATE INDEX IF NOT EXISTS "serviceContractSite_serviceContractId_idx"
  ON "serviceContractSite" ("serviceContractId");
CREATE INDEX IF NOT EXISTS "serviceContractSite_siteId_idx"
  ON "serviceContractSite" ("siteId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_service_contract_site ON "serviceContractSite";
CREATE TRIGGER audit_set_row_metadata_service_contract_site
  BEFORE INSERT OR UPDATE ON "serviceContractSite"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_service_contract_site ON "serviceContractSite";
CREATE TRIGGER audit_capture_change_service_contract_site
  AFTER INSERT OR UPDATE OR DELETE ON "serviceContractSite"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
