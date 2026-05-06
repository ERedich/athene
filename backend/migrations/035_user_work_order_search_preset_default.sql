-- Per-user default saved search preset for Aufträge vs Monitoring

CREATE TABLE IF NOT EXISTS "userWorkOrderSearchPresetDefault" (
  "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "context" text NOT NULL CHECK ("context" IN ('work_orders', 'monitoring')),
  "presetId" uuid NOT NULL REFERENCES "workOrderSearchPreset" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("userId", "context")
);

CREATE INDEX IF NOT EXISTS "userWorkOrderSearchPresetDefault_presetId_idx" ON "userWorkOrderSearchPresetDefault" ("presetId");
