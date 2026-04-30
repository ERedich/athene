-- UI string overrides (DE/EN) layered on top of bundled locale JSON in the frontend.

CREATE TABLE IF NOT EXISTS "uiTranslationOverride" (
  "messageKey" text NOT NULL,
  "locale" text NOT NULL CHECK ("locale" IN ('de', 'en')),
  "value" text NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("messageKey", "locale")
);

CREATE INDEX IF NOT EXISTS "uiTranslationOverride_locale_idx" ON "uiTranslationOverride" ("locale");
