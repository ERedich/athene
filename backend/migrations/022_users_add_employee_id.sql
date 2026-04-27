ALTER TABLE "users"
  ADD COLUMN "employeeId" uuid NULL
    REFERENCES "employee" ("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX users_employeeId_unique_idx
  ON "users" ("employeeId")
  WHERE "employeeId" IS NOT NULL;
