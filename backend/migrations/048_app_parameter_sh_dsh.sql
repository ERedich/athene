-- App-Parameter SH-DSH: Standard Schichtstunden (Default Shift Hours)

ALTER TABLE "appParameter" ADD COLUMN IF NOT EXISTS "numValue" numeric NOT NULL DEFAULT 8;

ALTER TABLE "appParameter" DROP CONSTRAINT IF EXISTS "appParameter_valueType_check";

ALTER TABLE "appParameter"
  ADD CONSTRAINT "appParameter_valueType_check" CHECK ("valueType" IN ('boolean', 'json', 'uuid', 'number'));

ALTER TABLE "appParameter" DROP CONSTRAINT IF EXISTS "appParameter_numValue_positive_check";

ALTER TABLE "appParameter"
  ADD CONSTRAINT "appParameter_numValue_positive_check"
  CHECK ("valueType" <> 'number' OR ("numValue" IS NOT NULL AND "numValue" > 0));

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
  "uuidValue",
  "numValue"
)
VALUES (
  'SH-DSH',
  'SH',
  'DSH',
  'Standard Schichtstunden',
  'Default Shift Hours',
  'Wird für die Schichtplanung genutzt, wenn einem Mitarbeiterdatensatz keine Schichtangaben mitgegeben werden.',
  'Used for shift planning when no shift details are provided on an employee record.',
  'number',
  false,
  NULL,
  NULL,
  8
)
ON CONFLICT ("key") DO NOTHING;
