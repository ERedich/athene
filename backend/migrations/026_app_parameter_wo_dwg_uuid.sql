-- App-Parameter WO-DWG: Standard-Fachgruppe (nullable UUID → workgroup)

ALTER TABLE "appParameter" DROP CONSTRAINT IF EXISTS "appParameter_valueType_check";

ALTER TABLE "appParameter"
  ADD CONSTRAINT "appParameter_valueType_check" CHECK ("valueType" IN ('boolean', 'json', 'uuid'));

ALTER TABLE "appParameter" ADD COLUMN IF NOT EXISTS "uuidValue" uuid NULL;

ALTER TABLE "appParameter" DROP CONSTRAINT IF EXISTS "appParameter_uuidValue_fkey";

ALTER TABLE "appParameter"
  ADD CONSTRAINT "appParameter_uuidValue_fkey"
  FOREIGN KEY ("uuidValue") REFERENCES "workgroup" ("id") ON DELETE SET NULL;

INSERT INTO "appParameter" (
  "key",
  "category",
  "codeSuffix",
  "nameDe",
  "nameEn",
  "descriptionDe",
  "descriptionEn",
  "valueType",
  "boolValue",
  "jsonValue",
  "uuidValue"
)
VALUES (
  'WO-DWG',
  'WO',
  'DWG',
  'Standard-Fachgruppe',
  'Default work group',
  'Wenn gesetzt, erhält jeder neu erstellte Auftrag diese Fachgruppe vorbelegt (anpassbar). Nur Fachgruppen des Arbeitsbuchungskreises sind wählbar.',
  'When set, every newly created work order pre-selects this work group (editable). Only work groups from your working site can be selected.',
  'uuid',
  false,
  NULL,
  NULL
)
ON CONFLICT ("key") DO NOTHING;
