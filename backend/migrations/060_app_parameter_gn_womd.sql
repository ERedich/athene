-- App-Parameter GN-WOMD: WO Modal View / Auftrags Modal

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
  'GN-WOMD',
  'GN',
  'WOMD',
  'WO Modal View / Auftrags Modal',
  'WO Modal View / Work Order Modal',
  'Wenn aktiv (Y), werden Aufträge in der App Aufträge und Monitoring in einem Modalfenster geöffnet. Wenn inaktiv (N), wird der Auftrag im Haupt-Viewport (Vollbild) dargestellt.',
  'When enabled (Y), work orders on the Work orders and Monitoring pages open in a modal dialog. When disabled (N), the work order is shown in the main viewport (full screen).',
  'boolean',
  true,
  NULL,
  NULL
)
ON CONFLICT ("key") DO NOTHING;
