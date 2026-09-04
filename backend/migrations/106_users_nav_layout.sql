-- Per-user Hauptnavigation layout (order, group membership, visibility)

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "navLayout" jsonb NULL;
