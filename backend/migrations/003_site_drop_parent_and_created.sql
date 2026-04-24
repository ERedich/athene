-- Standorte ohne Hierarchie und ohne Anlagezeitstempel (nur noch id, key, name, isPlant)
ALTER TABLE "site" DROP COLUMN IF EXISTS "fkSiteId";
ALTER TABLE "site" DROP COLUMN IF EXISTS "createdAt";
