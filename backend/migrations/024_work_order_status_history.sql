CREATE TABLE IF NOT EXISTS "workOrderStatusHistory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workOrderId" uuid NOT NULL REFERENCES "workOrder" ("id") ON DELETE CASCADE,
  "status" text NOT NULL CHECK ("status" IN ('open', 'assigned', 'started', 'paused', 'ended', 'done')),
  "occurredAt" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "workOrderStatusHistory_workOrderId_idx" ON "workOrderStatusHistory" ("workOrderId");
CREATE INDEX IF NOT EXISTS "workOrderStatusHistory_workOrderId_occurredAt_idx" ON "workOrderStatusHistory" ("workOrderId", "occurredAt");

CREATE OR REPLACE FUNCTION "work_order_status_history_fn"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "workOrderStatusHistory" ("workOrderId", "status", "occurredAt")
    VALUES (NEW."id", NEW."status", NEW."createdAt");
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" IS DISTINCT FROM NEW."status" THEN
    INSERT INTO "workOrderStatusHistory" ("workOrderId", "status", "occurredAt")
    VALUES (NEW."id", NEW."status", NEW."updatedAt");
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_order_status_history_trg ON "workOrder";
CREATE TRIGGER work_order_status_history_trg
  AFTER INSERT OR UPDATE ON "workOrder"
  FOR EACH ROW
  EXECUTE PROCEDURE "work_order_status_history_fn"();

INSERT INTO "workOrderStatusHistory" ("workOrderId", "status", "occurredAt")
SELECT w."id", 'open', w."createdAt"
FROM "workOrder" w
WHERE NOT EXISTS (
  SELECT 1 FROM "workOrderStatusHistory" h WHERE h."workOrderId" = w."id"
);

INSERT INTO "workOrderStatusHistory" ("workOrderId", "status", "occurredAt")
SELECT w."id", w."status", w."updatedAt"
FROM "workOrder" w
WHERE w."status" <> 'open'
  AND NOT EXISTS (
    SELECT 1
    FROM "workOrderStatusHistory" h
    WHERE h."workOrderId" = w."id" AND h."status" = w."status"
  );
