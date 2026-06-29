CREATE TABLE IF NOT EXISTS "workOrderSubscription" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "workOrderId" uuid NOT NULL REFERENCES "workOrder" ("id") ON DELETE CASCADE,
  "lastSnapshot" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workOrderSubscription_userId_workOrderId_key" UNIQUE ("userId", "workOrderId")
);

CREATE INDEX IF NOT EXISTS "workOrderSubscription_userId_idx"
  ON "workOrderSubscription" ("userId");

CREATE INDEX IF NOT EXISTS "workOrderSubscription_workOrderId_idx"
  ON "workOrderSubscription" ("workOrderId");

CREATE TABLE IF NOT EXISTS "workOrderSubscriptionNotification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "workOrderId" uuid NOT NULL REFERENCES "workOrder" ("id") ON DELETE CASCADE,
  "changeKinds" text[] NOT NULL,
  "orderNumber" integer NOT NULL,
  "workOrderName" text NOT NULL,
  "siteKey" text NOT NULL,
  "siteName" text NOT NULL,
  "readAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "workOrderSubscriptionNotification_userId_readAt_idx"
  ON "workOrderSubscriptionNotification" ("userId", "readAt", "createdAt" DESC);
