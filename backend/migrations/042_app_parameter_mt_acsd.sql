-- App-Parameter MT-ACSD: Lagerdaten in der Ersatzteil-App nachträglich bearbeiten

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
  'MT-ACSD',
  'MT',
  'ACSD',
  'Lagerdaten dürfen aktualisiert werden',
  'Allow Change Stockdata',
  'Wenn aktiv (Y), dürfen Lagerdaten eines Ersatzteils im Dialog weiter bearbeitet werden. Wenn inaktiv (N) und bereits Lagerzeilen gespeichert sind, können Lager, Lagerplatz und Menge nur noch über Transaktionen geändert werden.',
  'When enabled (Y), stock data for a spare part can still be edited in the dialog. When disabled (N) and stock lines already exist, warehouse, storage location, and quantity can only be changed via transactions.',
  'boolean',
  true,
  NULL,
  NULL
)
ON CONFLICT ("key") DO NOTHING;
