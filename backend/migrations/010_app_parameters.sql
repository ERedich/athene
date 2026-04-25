-- System-wide application parameters (key = category + "-" + 3–6 char code suffix)

CREATE TABLE IF NOT EXISTS "appParameter" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "category" text NOT NULL CHECK ("category" IN ('GN', 'WO', 'SH', 'MT', 'PO', 'SV')),
  "codeSuffix" text NOT NULL CHECK (char_length("codeSuffix") BETWEEN 3 AND 6),
  "nameDe" text NOT NULL,
  "nameEn" text NOT NULL,
  "descriptionDe" text,
  "descriptionEn" text,
  "valueType" text NOT NULL CHECK ("valueType" = 'boolean'),
  "boolValue" boolean NOT NULL DEFAULT false,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "appParameter_category_idx" ON "appParameter" ("category");

INSERT INTO "appParameter" (
  "key",
  "category",
  "codeSuffix",
  "nameDe",
  "nameEn",
  "descriptionDe",
  "descriptionEn",
  "valueType",
  "boolValue"
)
VALUES (
  'GN-ASC',
  'GN',
  'ASC',
  'Wahl des Buchungskreises',
  'Allow Site Change',
  'Wenn aktiv (Y), dürfen Benutzer den Standort bei Stammdaten (z. B. Assets, Kostenstellen) selbst wählen und ändern. Wenn inaktiv (N), setzt das System den Standort bei Neuanlagen auf den Arbeitsstandort des Benutzers; bei bestehenden Datensätzen bleibt der gespeicherte Standort erhalten und das Feld ist nicht editierbar.',
  'When enabled (Y), users can choose and edit the site on master data (e.g. assets, cost centers). When disabled (N), new records use the user''s working site; existing records keep their stored site and the field is read-only.',
  'boolean',
  false
)
ON CONFLICT ("key") DO NOTHING;
