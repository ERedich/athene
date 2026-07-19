ALTER TABLE "maintenancePlan"
  ADD COLUMN IF NOT EXISTS "ignoreOpenWorkOrders" boolean NOT NULL DEFAULT false;
