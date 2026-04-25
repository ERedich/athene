-- Allow Site Change: key SH-ASC -> GN-ASC (category SH -> GN)
UPDATE "appParameter"
SET
  "key" = 'GN-ASC',
  "category" = 'GN',
  "updatedAt" = now()
WHERE "key" = 'SH-ASC';
