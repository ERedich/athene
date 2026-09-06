import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { META_PERMISSION_KEYS, operationalPermissionKeys } from "../src/permissionCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ops = operationalPermissionKeys();
const meta = [...META_PERMISSION_KEYS];
const values = ops.map((k) => `  ('${k.replace(/'/g, "''")}')`).join(",\n");
const metaValues = meta.map((k) => `  ('${k.replace(/'/g, "''")}')`).join(",\n");

const sql = `-- Permissions: templates + per-user grants
CREATE TABLE IF NOT EXISTS "permissionTemplate" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "permissionTemplate_key_len"
    CHECK (char_length(trim("key")) > 0 AND char_length("key") <= 100),
  CONSTRAINT "permissionTemplate_name_len"
    CHECK (char_length(trim("name")) > 0 AND char_length("name") <= 200),
  CONSTRAINT "permissionTemplate_key_key" UNIQUE ("key")
);

CREATE INDEX IF NOT EXISTS "permissionTemplate_siteId_idx"
  ON "permissionTemplate" ("siteId");

DROP TRIGGER IF EXISTS audit_set_row_metadata_permission_template ON "permissionTemplate";
CREATE TRIGGER audit_set_row_metadata_permission_template
  BEFORE INSERT OR UPDATE ON "permissionTemplate"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_permission_template ON "permissionTemplate";
CREATE TRIGGER audit_capture_change_permission_template
  AFTER INSERT OR UPDATE OR DELETE ON "permissionTemplate"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

CREATE TABLE IF NOT EXISTS "permissionTemplateGrant" (
  "templateId" uuid NOT NULL REFERENCES "permissionTemplate" ("id") ON DELETE CASCADE,
  "permissionKey" text NOT NULL,
  PRIMARY KEY ("templateId", "permissionKey")
);

CREATE INDEX IF NOT EXISTS "permissionTemplateGrant_key_idx"
  ON "permissionTemplateGrant" ("permissionKey");

CREATE TABLE IF NOT EXISTS "userPermission" (
  "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "permissionKey" text NOT NULL,
  PRIMARY KEY ("userId", "permissionKey")
);

CREATE INDEX IF NOT EXISTS "userPermission_key_idx"
  ON "userPermission" ("permissionKey");

CREATE TEMP TABLE "_perm_ops" ("permissionKey" text PRIMARY KEY);
INSERT INTO "_perm_ops" ("permissionKey") VALUES
${values};

CREATE TEMP TABLE "_perm_meta" ("permissionKey" text PRIMARY KEY);
INSERT INTO "_perm_meta" ("permissionKey") VALUES
${metaValues};

DO $$
DECLARE
  v_admin uuid;
  v_site uuid;
  v_tpl uuid;
BEGIN
  SELECT u."id" INTO v_admin FROM "users" u WHERE u."loginName" = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    SELECT u."id" INTO v_admin FROM "users" u ORDER BY u."createdAt" ASC LIMIT 1;
  END IF;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'no users for permission seed';
  END IF;

  SELECT s."id" INTO v_site FROM "site" s ORDER BY s."key" ASC LIMIT 1;
  IF v_site IS NULL THEN
    RAISE EXCEPTION 'no site for permission seed';
  END IF;

  INSERT INTO "permissionTemplate" ("id", "key", "name", "siteId", "createdBy", "updatedBy")
  VALUES (gen_random_uuid(), 'ALL', 'All operational permissions', v_site, v_admin, v_admin)
  ON CONFLICT ("key") DO UPDATE SET "name" = EXCLUDED."name"
  RETURNING "id" INTO v_tpl;

  IF v_tpl IS NULL THEN
    SELECT "id" INTO v_tpl FROM "permissionTemplate" WHERE "key" = 'ALL';
  END IF;

  INSERT INTO "permissionTemplateGrant" ("templateId", "permissionKey")
  SELECT v_tpl, o."permissionKey" FROM "_perm_ops" o
  ON CONFLICT DO NOTHING;

  INSERT INTO "userPermission" ("userId", "permissionKey")
  SELECT u."id", o."permissionKey"
  FROM "users" u
  CROSS JOIN "_perm_ops" o
  ON CONFLICT DO NOTHING;

  INSERT INTO "userPermission" ("userId", "permissionKey")
  SELECT v_admin, m."permissionKey"
  FROM "_perm_meta" m
  ON CONFLICT DO NOTHING;
END
$$;
`;

const out = join(__dirname, "../migrations/108_permissions.sql");
writeFileSync(out, sql, "utf8");
console.log("wrote", out, "ops=", ops.length);
