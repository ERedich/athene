-- GN-AAKG (asset key generation mode), GN-SAKP (show asset key path), plant key sequence

CREATE TABLE IF NOT EXISTS "assetPlantKeySeq" (
  "siteId" uuid PRIMARY KEY REFERENCES "site" ("id") ON DELETE RESTRICT,
  "nextNum" integer NOT NULL CHECK ("nextNum" >= 100001)
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
  "jsonValue"
)
VALUES (
  'GN-AAKG',
  'GN',
  'AAKG',
  'Automatische Asset-Schlüssel',
  'Auto asset key generation',
  'Manual: freie Vergabe des Schlüssels. Auto incremental: für Werke (Standort Werk = Ja) wird der Schlüssel automatisch als <Standort>-<fortlaufende Nummer> vergeben (ab 100001); Schlüssel im Editor nicht mehr änderbar.',
  'Manual: free key entry. Auto incremental: for plant sites (site is plant), keys are assigned as <site>-<serial> starting at 100001; key field becomes read-only in the editor.',
  'json',
  false,
  '{"mode":"manual"}'::jsonb
)
ON CONFLICT ("key") DO NOTHING;

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
  'GN-SAKP',
  'GN',
  'SAKP',
  'Asset-Schlüssel-Pfad anzeigen',
  'Show asset key path',
  'Wenn aktiv: unter dem Schlüssel wird ein Pfad angezeigt (Standort-Schlüssel plus Hierarchie), mit konfigurierbarem Trennzeichen (ein Zeichen, Standard Punkt).',
  'When enabled: a path is shown below the key (site key plus hierarchy) using one separator character (default dot).',
  'json',
  false,
  '{"show":false,"separator":"."}'::jsonb
)
ON CONFLICT ("key") DO NOTHING;

-- Seed sequence per plant site from existing keys matching "<siteKey>-<digits only>"
INSERT INTO "assetPlantKeySeq" ("siteId", "nextNum")
SELECT
  s."id",
  GREATEST(
    100001,
    COALESCE(MAX(
      CASE
        WHEN a."key" LIKE s."key" || '-%'
          AND substring(a."key" FROM (length(s."key") + 2)) ~ '^[0-9]+$'
        THEN substring(a."key" FROM (length(s."key") + 2))::integer
        ELSE NULL
      END
    ), 100000) + 1
  ) AS "nextNum"
FROM "site" s
LEFT JOIN "asset" a ON a."siteId" = s."id"
WHERE s."isPlant" = true
GROUP BY s."id"
ON CONFLICT ("siteId") DO NOTHING;
