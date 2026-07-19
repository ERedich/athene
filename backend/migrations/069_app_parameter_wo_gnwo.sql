-- App-Parameter WO-GNWO: tägliche Uhrzeit für Wartungsplan-Auftragserzeugung

ALTER TABLE "appParameter" ADD COLUMN IF NOT EXISTS "timeValue" time;

ALTER TABLE "appParameter" DROP CONSTRAINT IF EXISTS "appParameter_valueType_check";

ALTER TABLE "appParameter"
  ADD CONSTRAINT "appParameter_valueType_check"
  CHECK ("valueType" IN ('boolean', 'json', 'uuid', 'number', 'time'));

ALTER TABLE "appParameter" DROP CONSTRAINT IF EXISTS "appParameter_timeValue_required_check";

ALTER TABLE "appParameter"
  ADD CONSTRAINT "appParameter_timeValue_required_check"
  CHECK ("valueType" <> 'time' OR "timeValue" IS NOT NULL);

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
  "numValue",
  "timeValue"
)
VALUES (
  'WO-GNWO',
  'WO',
  'GNWO',
  'Wartungsplan Generierung',
  'Generate Workorder from Maintenance Plan',
  'Uhrzeit (Europe/Berlin), zu der täglich fällige Aufträge aus aktiven Wartungsplänen erzeugt werden.',
  'Daily local time (Europe/Berlin) when the system generates due work orders from active maintenance plans.',
  'time',
  false,
  NULL,
  NULL,
  8,
  TIME '06:00:00'
)
ON CONFLICT ("key") DO NOTHING;
