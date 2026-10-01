-- Project Management: Task Dependencies table
CREATE TABLE IF NOT EXISTS "projectTaskDependency" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "predecessorTaskId" uuid NOT NULL REFERENCES "projectTask" ("id") ON DELETE CASCADE,
  "successorTaskId" uuid NOT NULL REFERENCES "projectTask" ("id") ON DELETE CASCADE,
  "dependencyType" text NOT NULL DEFAULT 'finish_to_start' CHECK ("dependencyType" IN ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')),
  "lagDays" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,

  CONSTRAINT "projectTaskDependency_no_self_reference" CHECK ("predecessorTaskId" != "successorTaskId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "projectTaskDependency_unique_idx" ON "projectTaskDependency" ("predecessorTaskId", "successorTaskId");
CREATE INDEX IF NOT EXISTS "projectTaskDependency_predecessorTaskId_idx" ON "projectTaskDependency" ("predecessorTaskId");
CREATE INDEX IF NOT EXISTS "projectTaskDependency_successorTaskId_idx" ON "projectTaskDependency" ("successorTaskId");
