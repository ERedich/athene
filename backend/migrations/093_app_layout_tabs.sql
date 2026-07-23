-- App layout: tabs chrome payload + design system LY-STANDARD-TABS

ALTER TABLE "appLayout"
  ADD COLUMN IF NOT EXISTS "tabs" jsonb;

UPDATE "appLayout"
SET "tabs" = '{
  "version": 1,
  "preset": "standard",
  "hostClass": "app-standard-tabs",
  "tabViewClass": "app-sticky-tabs",
  "badgeClass": "app-tab-badge",
  "sticky": true,
  "ink": true,
  "label": {
    "fontFamily": "Space Grotesk",
    "fontSize": "0.75rem",
    "fontWeight": 500,
    "letterSpacing": "0.08em",
    "textTransform": "uppercase"
  },
  "badge": {
    "fontSize": "10px",
    "borderRadius": "2px",
    "hideZero": true
  }
}'::jsonb
WHERE "tabs" IS NULL;

ALTER TABLE "appLayout"
  ALTER COLUMN "tabs" SET DEFAULT '{
    "version": 1,
    "preset": "standard",
    "hostClass": "app-standard-tabs",
    "tabViewClass": "app-sticky-tabs",
    "badgeClass": "app-tab-badge",
    "sticky": true,
    "ink": true,
    "label": {
      "fontFamily": "Space Grotesk",
      "fontSize": "0.75rem",
      "fontWeight": 500,
      "letterSpacing": "0.08em",
      "textTransform": "uppercase"
    },
    "badge": {
      "fontSize": "10px",
      "borderRadius": "2px",
      "hideZero": true
    }
  }'::jsonb;

ALTER TABLE "appLayout"
  ALTER COLUMN "tabs" SET NOT NULL;

-- Seed LY-STANDARD-TABS (design app) on every site
DO $$
DECLARE
  v_admin uuid;
  v_site record;
  v_tabs jsonb := '{
    "version": 1,
    "preset": "standard",
    "hostClass": "app-standard-tabs",
    "tabViewClass": "app-sticky-tabs",
    "badgeClass": "app-tab-badge",
    "sticky": true,
    "ink": true,
    "label": {
      "fontFamily": "Space Grotesk",
      "fontSize": "0.75rem",
      "fontWeight": 500,
      "letterSpacing": "0.08em",
      "textTransform": "uppercase"
    },
    "badge": {
      "fontSize": "10px",
      "borderRadius": "2px",
      "hideZero": true
    }
  }'::jsonb;
  v_modal jsonb := '{"version": 1, "rows": []}'::jsonb;
  v_table jsonb := '{"version": 1, "columns": [], "sort": [], "groupBy": []}'::jsonb;
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
    RAISE NOTICE '093_app_layout_tabs: no admin user, skip seed';
    RETURN;
  END IF;

  FOR v_site IN SELECT s."id" FROM "site" s LOOP
    INSERT INTO "appLayout" (
      "key", "name", "siteId", "appKey", "isSystem", "modal", "table", "contextMenu", "tabs",
      "createdBy", "updatedBy"
    )
    VALUES (
      'LY-STANDARD-TABS',
      'Standard Tabs',
      v_site."id",
      'design',
      true,
      v_modal,
      v_table,
      v_context_menu,
      v_tabs,
      v_admin,
      v_admin
    )
    ON CONFLICT ("siteId", "appKey", "key") DO NOTHING;
  END LOOP;
END $$;
