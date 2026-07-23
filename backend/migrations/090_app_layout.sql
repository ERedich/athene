-- App layouts: site-scoped UI definitions (modal, table, context menu) with system/user copies

CREATE TABLE IF NOT EXISTS "appLayout" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "siteId" uuid NOT NULL REFERENCES "site" ("id") ON DELETE RESTRICT,
  "appKey" text NOT NULL,
  "isSystem" boolean NOT NULL DEFAULT false,
  "modal" jsonb NOT NULL,
  "table" jsonb NOT NULL,
  "contextMenu" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedBy" uuid NOT NULL REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "appLayout_key_len" CHECK (char_length(trim("key")) > 0 AND char_length("key") <= 100),
  CONSTRAINT "appLayout_name_len" CHECK (char_length(trim("name")) > 0 AND char_length("name") <= 200),
  CONSTRAINT "appLayout_appKey_len" CHECK (char_length(trim("appKey")) > 0 AND char_length("appKey") <= 100),
  CONSTRAINT "appLayout_siteId_appKey_key_key" UNIQUE ("siteId", "appKey", "key")
);

CREATE INDEX IF NOT EXISTS "appLayout_appKey_siteId_idx" ON "appLayout" ("appKey", "siteId");
CREATE INDEX IF NOT EXISTS "appLayout_siteId_idx" ON "appLayout" ("siteId");
CREATE INDEX IF NOT EXISTS "appLayout_isSystem_idx" ON "appLayout" ("isSystem");

DROP TRIGGER IF EXISTS audit_set_row_metadata_app_layout ON "appLayout";
CREATE TRIGGER audit_set_row_metadata_app_layout
  BEFORE INSERT OR UPDATE ON "appLayout"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_set_row_metadata();

DROP TRIGGER IF EXISTS audit_capture_change_app_layout ON "appLayout";
CREATE TRIGGER audit_capture_change_app_layout
  AFTER INSERT OR UPDATE OR DELETE ON "appLayout"
  FOR EACH ROW
  EXECUTE PROCEDURE audit_capture_change();

-- Seed system layout for Lieferant (suppliers) on every site
DO $$
DECLARE
  v_admin uuid;
  v_site record;
  v_modal jsonb := '{
    "version": 1,
    "rows": [
      {"id": "r-key", "columns": [{"id": "c-key", "fieldKey": "key", "span": 12, "required": true, "readonly": false, "visible": true}]},
      {"id": "r-name", "columns": [{"id": "c-name", "fieldKey": "name", "span": 12, "required": true, "readonly": false, "visible": true}]},
      {"id": "r-customerNumber", "columns": [{"id": "c-customerNumber", "fieldKey": "customerNumber", "span": 12, "required": false, "readonly": false, "visible": true}]},
      {"id": "r-address", "columns": [{"id": "c-address", "fieldKey": "address", "span": 12, "required": false, "readonly": false, "visible": true}]},
      {"id": "r-phone", "columns": [{"id": "c-phone", "fieldKey": "phone", "span": 12, "required": false, "readonly": false, "visible": true}]},
      {"id": "r-email", "columns": [{"id": "c-email", "fieldKey": "email", "span": 12, "required": false, "readonly": false, "visible": true}]},
      {"id": "r-siteId", "columns": [{"id": "c-siteId", "fieldKey": "siteId", "span": 12, "required": true, "readonly": false, "visible": true}]},
      {"id": "r-isActive", "columns": [{"id": "c-isActive", "fieldKey": "isActive", "span": 12, "required": false, "readonly": false, "visible": true}]}
    ]
  }'::jsonb;
  v_table jsonb := '{
    "version": 1,
    "columns": [
      {"fieldKey": "key", "width": null, "visible": true, "sortable": true, "frozen": false},
      {"fieldKey": "name", "width": null, "visible": true, "sortable": true, "frozen": false},
      {"fieldKey": "customerNumber", "width": null, "visible": true, "sortable": true, "frozen": false},
      {"fieldKey": "phone", "width": null, "visible": true, "sortable": true, "frozen": false},
      {"fieldKey": "email", "width": null, "visible": true, "sortable": true, "frozen": false},
      {"fieldKey": "siteName", "width": null, "visible": true, "sortable": true, "frozen": false},
      {"fieldKey": "isActive", "width": null, "visible": true, "sortable": false, "frozen": false},
      {"fieldKey": "createdAt", "width": null, "visible": true, "sortable": true, "frozen": false},
      {"fieldKey": "createdBy", "width": null, "visible": true, "sortable": true, "frozen": false},
      {"fieldKey": "updatedAt", "width": null, "visible": true, "sortable": true, "frozen": false},
      {"fieldKey": "updatedBy", "width": null, "visible": true, "sortable": true, "frozen": false}
    ],
    "sort": [],
    "groupBy": []
  }'::jsonb;
  v_context_menu jsonb := '{
    "version": 1,
    "items": [
      {"action": "create", "enabled": true},
      {"action": "edit", "enabled": true},
      {"action": "delete", "enabled": true}
    ]
  }'::jsonb;
BEGIN
  SELECT u."id" INTO v_admin FROM "users" u WHERE u."loginName" = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION '090_app_layout: kein Benutzer admin';
  END IF;

  FOR v_site IN SELECT s."id" FROM "site" s
  LOOP
    INSERT INTO "appLayout" (
      "key", "name", "siteId", "appKey", "isSystem", "modal", "table", "contextMenu",
      "createdBy", "updatedBy"
    )
    VALUES (
      'SYS-SUPPLIERS',
      'Lieferanten (System)',
      v_site."id",
      'suppliers',
      true,
      v_modal,
      v_table,
      v_context_menu,
      v_admin,
      v_admin
    )
    ON CONFLICT ("siteId", "appKey", "key") DO NOTHING;
  END LOOP;
END $$;
