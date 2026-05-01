-- Extend work order status enum (CHECK) with cancelled + continued (Aufgenommen).

ALTER TABLE "workOrder" DROP CONSTRAINT IF EXISTS "workOrder_status_check";

ALTER TABLE "workOrder"
  ADD CONSTRAINT "workOrder_status_check"
  CHECK (
    "status" IN (
      'open',
      'assigned',
      'started',
      'paused',
      'continued',
      'ended',
      'done',
      'cancelled'
    )
  );

ALTER TABLE "workOrderStatusHistory" DROP CONSTRAINT IF EXISTS "workOrderStatusHistory_status_check";

ALTER TABLE "workOrderStatusHistory"
  ADD CONSTRAINT "workOrderStatusHistory_status_check"
  CHECK (
    "status" IN (
      'open',
      'assigned',
      'started',
      'paused',
      'continued',
      'ended',
      'done',
      'cancelled'
    )
  );
