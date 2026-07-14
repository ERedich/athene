CREATE TABLE IF NOT EXISTS "workOrderMessage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workOrderId" uuid NOT NULL REFERENCES "workOrder" ("id") ON DELETE CASCADE,
  "authorUserId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "replyToMessageId" uuid REFERENCES "workOrderMessage" ("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "workOrderMessage_workOrderId_createdAt_idx"
  ON "workOrderMessage" ("workOrderId", "createdAt");

CREATE TABLE IF NOT EXISTS "workOrderMessageNotification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "workOrderId" uuid NOT NULL REFERENCES "workOrder" ("id") ON DELETE CASCADE,
  "messageId" uuid NOT NULL REFERENCES "workOrderMessage" ("id") ON DELETE CASCADE,
  "readAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "workOrderMessageNotification_userId_readAt_idx"
  ON "workOrderMessageNotification" ("userId", "readAt", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "workOrderMessageNotification_workOrderId_idx"
  ON "workOrderMessageNotification" ("workOrderId");
