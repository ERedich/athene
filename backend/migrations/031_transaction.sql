CREATE SEQUENCE IF NOT EXISTS "transaction_transactionNumber_seq"
  START WITH 100000
  INCREMENT BY 1
  MINVALUE 100000
  NO MAXVALUE
  CACHE 1;

CREATE TABLE IF NOT EXISTS "transaction" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "transactionNumber" bigint NOT NULL UNIQUE DEFAULT nextval('"transaction_transactionNumber_seq"'),
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "type" text NOT NULL CHECK ("type" IN ('IN', 'EX', 'RM', 'RT', 'IV')),
  "bookedAt" timestamptz NOT NULL DEFAULT now(),
  "quantity" numeric(14, 4) NOT NULL,
  "workOrderId" uuid REFERENCES "workOrder" ("id") ON DELETE SET NULL,
  "remark" text CHECK ("remark" IS NULL OR char_length("remark") <= 2000),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "transaction_siteId_bookedAt_idx" ON "transaction" ("siteId", "bookedAt" DESC);
CREATE INDEX IF NOT EXISTS "transaction_type_idx" ON "transaction" ("type");

DROP TRIGGER IF EXISTS audit_set_row_metadata_transaction ON "transaction";
CREATE TRIGGER audit_set_row_metadata_transaction
  BEFORE INSERT OR UPDATE ON "transaction"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_transaction ON "transaction";
CREATE TRIGGER audit_capture_change_transaction
  AFTER INSERT OR UPDATE OR DELETE ON "transaction"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
