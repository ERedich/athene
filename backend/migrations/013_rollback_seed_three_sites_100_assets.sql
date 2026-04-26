-- Rollback der Demo-Daten (ehem. 012): Assets SEED3S-*, Kostenstellen SEED-CC-*,
-- userSite-Zuordnungen und Standorte DEMO-WH / DEMO-NO.
-- Idempotent: mehrfaches Ausführen ist unkritisch.

DELETE FROM "asset" WHERE "key" LIKE 'SEED3S-%' AND "type" = 'maintenanceObject';
DELETE FROM "asset" WHERE "key" LIKE 'SEED3S-%' AND "type" = 'line';
DELETE FROM "asset" WHERE "key" LIKE 'SEED3S-%' AND "type" = 'structure';
DELETE FROM "asset" WHERE "key" LIKE 'SEED3S-%' AND "type" = 'site';

DELETE FROM "costCenter" c
WHERE c."key" LIKE 'SEED-CC-%'
  AND NOT EXISTS (SELECT 1 FROM "asset" a WHERE a."costCenterId" = c."id");

DELETE FROM "userSite" us
USING "site" s
WHERE us."siteId" = s."id"
  AND s."key" IN ('DEMO-WH', 'DEMO-NO');

DELETE FROM "site" WHERE "key" IN ('DEMO-WH', 'DEMO-NO');
