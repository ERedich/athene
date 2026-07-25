-- App-Parameter GN-INTRO: Introduction / Onboarding-Guide beim ersten Login

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
  'GN-INTRO',
  'GN',
  'INTRO',
  'Introduction beim ersten Login',
  'Introduction on first login',
  'Wenn aktiv (Y), sieht der Benutzer beim ersten Login den Introduction-/Onboarding-Guide. Wenn inaktiv (N), wird der Guide nicht angezeigt.',
  'When enabled (Y), the user sees the introduction / onboarding guide on first login. When disabled (N), the guide is not shown.',
  'boolean',
  false,
  NULL,
  NULL
)
ON CONFLICT ("key") DO NOTHING;
