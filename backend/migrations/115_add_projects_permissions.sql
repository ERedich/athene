-- Add projects permissions to the system
INSERT INTO "userPermission" ("userId", "permissionKey")
SELECT u."id", perm."permissionKey"
FROM "users" u
CROSS JOIN (
  VALUES
    ('projects.view'),
    ('projects.create'),
    ('projects.update'),
    ('projects.delete')
) AS perm("permissionKey")
ON CONFLICT DO NOTHING;
