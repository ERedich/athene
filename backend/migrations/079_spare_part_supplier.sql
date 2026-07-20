-- Material–supplier catalog: per-supplier article numbers, texts, and prices.

CREATE TABLE IF NOT EXISTS "sparePartSupplier" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sparePartId" uuid NOT NULL REFERENCES "sparePart" ("id") ON DELETE CASCADE,
  "supplierId" uuid NOT NULL REFERENCES "supplier" ("id") ON DELETE RESTRICT,
  "supplierArticleNumber" text,
  "supplierArticleText" text,
  "supplierArticleLongText" text,
  "unitPrice" numeric(18, 4) CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0),
  "currency" text NOT NULL DEFAULT 'EUR',
  "priceValidFrom" date,
  "minOrderQuantity" numeric(14, 4) CHECK ("minOrderQuantity" IS NULL OR "minOrderQuantity" >= 0),
  "orderMultiple" numeric(14, 4) CHECK ("orderMultiple" IS NULL OR "orderMultiple" >= 0),
  "leadTimeDays" integer CHECK ("leadTimeDays" IS NULL OR "leadTimeDays" >= 0),
  "isPreferred" boolean NOT NULL DEFAULT false,
  "isActive" boolean NOT NULL DEFAULT true,
  "remark" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "sparePartSupplier_sparePart_supplier_uidx" UNIQUE ("sparePartId", "supplierId")
);

CREATE INDEX IF NOT EXISTS "sparePartSupplier_sparePartId_idx"
  ON "sparePartSupplier" ("sparePartId");

CREATE INDEX IF NOT EXISTS "sparePartSupplier_supplierId_idx"
  ON "sparePartSupplier" ("supplierId");

CREATE UNIQUE INDEX IF NOT EXISTS "sparePartSupplier_preferred_uidx"
  ON "sparePartSupplier" ("sparePartId")
  WHERE "isPreferred" = true;

DROP TRIGGER IF EXISTS audit_set_row_metadata_spare_part_supplier ON "sparePartSupplier";
CREATE TRIGGER audit_set_row_metadata_spare_part_supplier
  BEFORE INSERT OR UPDATE ON "sparePartSupplier"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_spare_part_supplier ON "sparePartSupplier";
CREATE TRIGGER audit_capture_change_spare_part_supplier
  AFTER INSERT OR UPDATE OR DELETE ON "sparePartSupplier"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
