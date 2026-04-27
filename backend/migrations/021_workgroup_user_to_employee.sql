ALTER TABLE IF EXISTS "workgroupUser"
  DROP CONSTRAINT IF EXISTS "workgroupUser_userId_fkey";

ALTER TABLE IF EXISTS "workgroupUser"
  RENAME COLUMN "userId" TO "employeeId";

ALTER TABLE IF EXISTS "workgroupUser"
  ADD CONSTRAINT "workgroupUser_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employee" ("id") ON DELETE CASCADE;

ALTER TABLE IF EXISTS "workgroupUser"
  DROP CONSTRAINT IF EXISTS "workgroupUser_workgroupId_userId_key";

ALTER TABLE IF EXISTS "workgroupUser"
  ADD CONSTRAINT "workgroupUser_workgroupId_employeeId_key" UNIQUE ("workgroupId", "employeeId");

DROP INDEX IF EXISTS "workgroupUser_userId_idx";
CREATE INDEX IF NOT EXISTS "workgroupUser_employeeId_idx" ON "workgroupUser" ("employeeId");
