INSERT INTO "site" ("key", "name", "isPlant")
VALUES ('DF', 'Default', true)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "users" ("loginName", "name", "passwordHash", "workingSiteId")
SELECT
  'admin',
  'admin',
  crypt('admin', gen_salt('bf')),
  s."id"
FROM "site" s
WHERE s."key" = 'DF'
ON CONFLICT ("loginName") DO NOTHING;

INSERT INTO "userSite" ("userId", "siteId")
SELECT u."id", u."workingSiteId"
FROM "users" u
WHERE u."loginName" = 'admin'
ON CONFLICT ("userId", "siteId") DO NOTHING;
