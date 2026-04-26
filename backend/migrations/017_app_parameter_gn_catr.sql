-- App-Parameter: GN-CATR (Colored Asset Tree / Farbige Asset-Baumstruktur)

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
  'GN-CATR',
  'GN',
  'CATR',
  'Farbige Asset-Baumstruktur',
  'Colored Asset Tree',
  'Wenn aktiv (Y), werden die Zeilen im Asset-TreeTable in der Asset App mit der Farbe des Asset-Typs hinterlegt (abgeschwächt mit 10% Opazität).',
  'When enabled (Y), rows in the asset TreeTable in the Assets app are tinted using the asset type color (muted at 10% opacity).',
  'boolean',
  true
)
ON CONFLICT ("key") DO NOTHING;
