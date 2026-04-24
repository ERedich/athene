-- Akzentfarbe pro Standort (HEX #RRGGBB)
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "colorHex" text NOT NULL DEFAULT '#64748b';
