-- App-Parameter: JSON-Werttyp + GN-ATYP (Asset-Typen: Anzeigenamen + Farben)

ALTER TABLE "appParameter" DROP CONSTRAINT IF EXISTS "appParameter_valueType_check";

ALTER TABLE "appParameter"
  ADD CONSTRAINT "appParameter_valueType_check" CHECK ("valueType" IN ('boolean', 'json'));

ALTER TABLE "appParameter" ADD COLUMN IF NOT EXISTS "jsonValue" jsonb;

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
  "jsonValue"
)
VALUES (
  'GN-ATYP',
  'GN',
  'ATYP',
  'Asset Typen',
  'Asset types',
  'Definition der Asset-Typen. Hier können die unterschiedlichen Asset-Typen samt Farbzuweisungen geändert werden.',
  'Definition of asset types. Here you can change asset type labels and color assignments.',
  'json',
  false,
  '{
    "site": {"nameDe": "Location", "nameEn": "Location", "colorHex": "#f97316"},
    "structure": {"nameDe": "Struktur", "nameEn": "Structure", "colorHex": "#ea580c"},
    "line": {"nameDe": "Linie", "nameEn": "Line", "colorHex": "#78716c"},
    "maintenanceObject": {"nameDe": "Instandhaltungsobjekt", "nameEn": "Maintenance object", "colorHex": "#ef4444"}
  }'::jsonb
)
ON CONFLICT ("key") DO NOTHING;
