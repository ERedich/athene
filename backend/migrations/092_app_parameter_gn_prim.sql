-- App-Parameter GN-PRIM: Primärfarbe der Anwendung (CSS --color-primary)

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
  'GN-PRIM',
  'GN',
  'PRIM',
  'Primärfarbe',
  'Primary color',
  'Primärfarbe der Benutzeroberfläche (CSS-Variable --color-primary). Gilt für Buttons, Links, Fokusringe und verwandte Akzente.',
  'Primary color of the user interface (CSS variable --color-primary). Applies to buttons, links, focus rings, and related accents.',
  'json',
  false,
  '{"colorHex":"#f97316"}'::jsonb
)
ON CONFLICT ("key") DO NOTHING;
