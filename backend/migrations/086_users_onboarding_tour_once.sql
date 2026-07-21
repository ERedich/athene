-- All users should see the Athene spotlight tour once.
-- Clears the previous backfill from 085 so existing accounts are included.

UPDATE "users"
SET "onboardingCompletedAt" = NULL;
