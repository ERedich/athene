-- Project Management: Project Tasks table
CREATE TABLE IF NOT EXISTS "projectTask" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectId" uuid NOT NULL REFERENCES "project" ("id") ON DELETE CASCADE,
  "key" varchar(50) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" varchar(2000),
  "taskType" text NOT NULL DEFAULT 'task' CHECK ("taskType" IN ('task', 'milestone')),
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'in_progress', 'completed', 'cancelled')),
  "plannedStart" timestamptz NOT NULL DEFAULT now(),
  "plannedEnd" timestamptz,
  "actualStart" timestamptz,
  "actualEnd" timestamptz,
  "progress" integer NOT NULL DEFAULT 0 CHECK ("progress" >= 0 AND "progress" <= 100),
  "priority" text NOT NULL DEFAULT 'medium' CHECK ("priority" IN ('low', 'medium', 'high', 'critical')),
  "assignedEmployeeId" uuid REFERENCES "employee" ("id") ON DELETE SET NULL,
  "parentTaskId" uuid REFERENCES "projectTask" ("id") ON DELETE SET NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "projectTask_key_project_unique_idx" ON "projectTask" ("projectId", "key");
CREATE INDEX IF NOT EXISTS "projectTask_projectId_idx" ON "projectTask" ("projectId");
CREATE INDEX IF NOT EXISTS "projectTask_status_idx" ON "projectTask" ("status");
CREATE INDEX IF NOT EXISTS "projectTask_taskType_idx" ON "projectTask" ("taskType");
CREATE INDEX IF NOT EXISTS "projectTask_plannedStart_idx" ON "projectTask" ("plannedStart");
CREATE INDEX IF NOT EXISTS "projectTask_assignedEmployeeId_idx" ON "projectTask" ("assignedEmployeeId");
CREATE INDEX IF NOT EXISTS "projectTask_parentTaskId_idx" ON "projectTask" ("parentTaskId");
CREATE INDEX IF NOT EXISTS "projectTask_sortOrder_idx" ON "projectTask" ("projectId", "sortOrder");

DROP TRIGGER IF EXISTS audit_set_row_metadata_projectTask ON "projectTask";
CREATE TRIGGER audit_set_row_metadata_projectTask
  BEFORE INSERT OR UPDATE ON "projectTask"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_projectTask ON "projectTask";
CREATE TRIGGER audit_capture_change_projectTask
  AFTER INSERT OR UPDATE OR DELETE ON "projectTask"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();
