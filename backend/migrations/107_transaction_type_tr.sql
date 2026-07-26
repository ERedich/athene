ALTER TABLE "transaction" DROP CONSTRAINT IF EXISTS "transaction_type_check";

ALTER TABLE "transaction"
  ADD CONSTRAINT "transaction_type_check"
  CHECK ("type" IN ('IN', 'EX', 'RM', 'RT', 'IV', 'ZU', 'TR'));
