-- Track onboarding completion per user. NULL = tour not yet completed.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" timestamptz NULL;
