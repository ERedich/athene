ALTER TABLE "shift"
  ADD COLUMN IF NOT EXISTS "weekdays" text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN "shift"."weekdays" IS 'Weekday keys: mon, tue, wed, thu, fri, sat, sun';
