-- App-Parameter GN-CATR: Farbige Asset-Baumstruktur (Zeilenfarbe nach Asset-Typ)

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
  'GN-CATR',
  'GN',
  'CATR',
  'Farbige Asset-Baumstruktur',
  'Colored asset tree structure',
  'Wenn aktiv (Y), werden die Zeilen im Asset-TreeTable in der Asset App mit der Farbe des Asset-Typs hinterlegt (abgeschwächt mit 10% Opazität).',
  'When enabled (Y), rows in the asset TreeTable in the Tree structure app are tinted with the asset type color at 10% opacity.',
  'boolean',
  true,
  NULL,
  NULL
)
ON CONFLICT ("key") DO NOTHING;
