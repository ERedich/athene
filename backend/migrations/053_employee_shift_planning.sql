ALTER TABLE "employee"
  ADD COLUMN IF NOT EXISTS "isShiftPlanning" boolean NOT NULL DEFAULT false;
