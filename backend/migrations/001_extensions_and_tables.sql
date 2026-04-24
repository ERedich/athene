CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "site" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "isPlant" boolean NOT NULL DEFAULT false,
  "colorHex" text NOT NULL DEFAULT '#64748b'
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "loginName" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "passwordHash" text NOT NULL,
  "workingSiteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "userSite" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE CASCADE,
  UNIQUE ("userId", "siteId")
);

CREATE INDEX IF NOT EXISTS "userSite_userId_idx" ON "userSite" ("userId");
CREATE INDEX IF NOT EXISTS "userSite_siteId_idx" ON "userSite" ("siteId");
