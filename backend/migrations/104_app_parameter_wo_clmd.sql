-- App-Parameter WO-CLMD: Kalendar Minimum Auftragsdauer (Stunden, 0–100, Default 4)

ALTER TABLE "appParameter" DROP CONSTRAINT IF EXISTS "appParameter_numValue_positive_check";

ALTER TABLE "appParameter" DROP CONSTRAINT IF EXISTS "appParameter_numValue_nonnegative_check";

ALTER TABLE "appParameter"
  ADD CONSTRAINT "appParameter_numValue_nonnegative_check"
  CHECK ("valueType" <> 'number' OR ("numValue" IS NOT NULL AND "numValue" >= 0));

ALTER TABLE "appParameter" DROP CONSTRAINT IF EXISTS "appParameter_wo_clmd_range_check";

ALTER TABLE "appParameter"
  ADD CONSTRAINT "appParameter_wo_clmd_range_check"
  CHECK (
    "key" <> 'WO-CLMD'
    OR (
      "valueType" = 'number'
      AND "numValue" >= 0
      AND "numValue" <= 100
    )
  );

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
  'WO-CLMD',
  'WO',
  'CLMD',
  'Kalendar Minimum Auftragsdauer',
  'Calendar Minimum Duration',
  'Aufträge mit einer geplanten Dauer unter diesem Grenzwert (Stunden) werden im Kalendar nicht dargestellt und sind dort nicht planbar. Zulässig: 0–100, Standard 4. 0 zeigt alle Aufträge.',
  'Work orders whose planned duration is below this threshold (hours) are hidden from the calendar and cannot be planned there. Allowed: 0–100, default 4. 0 shows all orders.',
  'number',
  false,
  NULL,
  NULL,
  4
)
ON CONFLICT ("key") DO NOTHING;
