-- Invalidate existing thumbs so GET ?size=thumb regenerates at 256px.
UPDATE "sparePart"
SET "photoThumbMimeType" = NULL,
    "photoThumbContent" = NULL
WHERE "photoThumbContent" IS NOT NULL;
