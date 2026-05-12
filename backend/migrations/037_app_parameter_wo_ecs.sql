-- App-Parameter WO-ECS: Clever Search / schnellere Suche im Auftrags-Suchpanel

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
  'WO-ECS',
  'WO',
  'ECS',
  'Enable Clever Search / Schnellere Suche',
  'Enable Clever Search / Faster search',
  'Aktiviert die Clever Search im Auftrags-Suchpanel. Bei geöffnetem Drawer werden Werte der ausgewählten Auftragszeile in passende Suchfelder übernommen.',
  'Enables Clever Search in the work-order search panel. When the drawer is open, values from the selected work-order row are copied into matching search fields.',
  'boolean',
  false,
  NULL,
  NULL
)
ON CONFLICT ("key") DO NOTHING;
