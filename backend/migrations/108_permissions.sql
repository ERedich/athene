-- Permissions: templates + per-user grants
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
  ('dashboard.view'),
  ('report-designer.view'),
  ('report-designer.create'),
  ('report-designer.update'),
  ('report-designer.delete'),
  ('getting-started.view'),
  ('feedback.view'),
  ('feedback.create'),
  ('audit-log.view'),
  ('app-parameters.view'),
  ('app-parameters.update'),
  ('translations.view'),
  ('translations.update'),
  ('customize-menu.view'),
  ('customize-menu.create'),
  ('customize-menu.update'),
  ('customize-menu.delete'),
  ('system-tools.view'),
  ('system-tools.execute'),
  ('users.view'),
  ('users.create'),
  ('users.update'),
  ('users.delete'),
  ('assignments.view'),
  ('assignments.update'),
  ('sites.view'),
  ('sites.create'),
  ('sites.update'),
  ('sites.delete'),
  ('kpi-builder.view'),
  ('kpi-builder.create'),
  ('kpi-builder.update'),
  ('kpi-builder.delete'),
  ('layout-editor.view'),
  ('layout-editor.create'),
  ('layout-editor.update'),
  ('layout-editor.delete'),
  ('search-presets.view'),
  ('search-presets.create'),
  ('search-presets.update'),
  ('search-presets.delete'),
  ('table-viewer.view'),
  ('stammdaten-manager.view'),
  ('assets.view'),
  ('assets.create'),
  ('assets.update'),
  ('assets.delete'),
  ('baumstruktur.view'),
  ('employees.view'),
  ('employees.create'),
  ('employees.update'),
  ('employees.delete'),
  ('cost-centers.view'),
  ('cost-centers.create'),
  ('cost-centers.update'),
  ('cost-centers.delete'),
  ('work-order-types.view'),
  ('work-order-types.create'),
  ('work-order-types.update'),
  ('work-order-types.delete'),
  ('problems.view'),
  ('problems.create'),
  ('problems.update'),
  ('problems.delete'),
  ('causes.view'),
  ('causes.create'),
  ('causes.update'),
  ('causes.delete'),
  ('remedies.view'),
  ('remedies.create'),
  ('remedies.update'),
  ('remedies.delete'),
  ('classifications.view'),
  ('classifications.create'),
  ('classifications.update'),
  ('classifications.delete'),
  ('workgroups.view'),
  ('workgroups.create'),
  ('workgroups.update'),
  ('workgroups.delete'),
  ('suppliers.view'),
  ('suppliers.create'),
  ('suppliers.update'),
  ('suppliers.delete'),
  ('maintenance-plans.view'),
  ('maintenance-plans.create'),
  ('maintenance-plans.update'),
  ('maintenance-plans.delete'),
  ('maintenance-plans.generateDue'),
  ('inspection-rounds.view'),
  ('inspection-rounds.create'),
  ('inspection-rounds.update'),
  ('inspection-rounds.delete'),
  ('work-orders.view'),
  ('work-orders.create'),
  ('work-orders.update'),
  ('work-orders.delete'),
  ('order-creation.view'),
  ('order-creation.create'),
  ('kalendar.view'),
  ('kalendar.update'),
  ('transactions.view'),
  ('transactions.create'),
  ('transactions.delete'),
  ('monitoring.view'),
  ('monitoring.create'),
  ('monitoring.update'),
  ('monitoring.delete'),
  ('notification-center.view'),
  ('subscriptions.view'),
  ('shifts.view'),
  ('shifts.create'),
  ('shifts.update'),
  ('shifts.delete'),
  ('shift-planner.view'),
  ('shift-planner.update'),
  ('warehouses.view'),
  ('warehouses.create'),
  ('warehouses.update'),
  ('warehouses.delete'),
  ('storage-locations.view'),
  ('storage-locations.create'),
  ('storage-locations.update'),
  ('storage-locations.delete'),
  ('spare-parts.view'),
  ('spare-parts.create'),
  ('spare-parts.update'),
  ('spare-parts.delete'),
  ('workOrder.start'),
  ('workOrder.pause'),
  ('workOrder.cancel'),
  ('workOrder.complete'),
  ('workOrder.feedback'),
  ('workOrder.assign'),
  ('workOrder.subscribe');

CREATE TEMP TABLE "_perm_meta" ("permissionKey" text PRIMARY KEY);
INSERT INTO "_perm_meta" ("permissionKey") VALUES
  ('permissions.manage'),
  ('permission-templates.view'),
  ('permission-templates.create'),
  ('permission-templates.update'),
  ('permission-templates.delete'),
  ('layout-editor.editSystem');

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
