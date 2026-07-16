-- Align GN-CATR copy: colored TreeTable rows by asset type (not app visibility)

UPDATE "appParameter"
SET
  "nameDe" = 'Farbige Asset-Baumstruktur',
  "nameEn" = 'Colored asset tree structure',
  "descriptionDe" = 'Wenn aktiv (Y), werden die Zeilen im Asset-TreeTable in der Asset App mit der Farbe des Asset-Typs hinterlegt (abgeschwächt mit 10% Opazität).',
  "descriptionEn" = 'When enabled (Y), rows in the asset TreeTable in the Tree structure app are tinted with the asset type color at 10% opacity.',
  "updatedAt" = now()
WHERE "key" = 'GN-CATR';
