-- Repair blank monitoring layouts, seed "Standard Monitoring" per user, set as monitoring default

DO $$
DECLARE
  original_payload jsonb := '{
    "version": 1,
    "columnOrder": [
      "orderNumber",
      "originalWoOrderNumber",
      "name",
      "status",
      "assetName",
      "costCenterName",
      "classificationName",
      "workgroupKey",
      "documentCount",
      "orderType",
      "plannedStart",
      "plannedEnd",
      "plannedDuration",
      "startStop"
    ],
    "sort": [],
    "columnWidths": {
      "originalWoOrderNumber": 112,
      "documentCount": 112,
      "startStop": 120
    },
    "frozenLeft": [],
    "frozenRight": [],
    "hiddenColumns": []
  }'::jsonb;
BEGIN
  -- Fix layouts with no visible columns
  UPDATE "tableLayout" l
  SET "payload" = original_payload
  WHERE l."tableKey" = 'monitoring_work_orders'
    AND (
      COALESCE(jsonb_array_length(l."payload" -> 'columnOrder'), 0) < 1
      OR NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(l."payload" -> 'columnOrder') AS co(id)
        WHERE NOT (l."payload" -> 'hiddenColumns' @> jsonb_build_array(co.id))
      )
    );

  -- Seed standard layout per user (owner copy)
  INSERT INTO "tableLayout" ("name", "tableKey", "createdBy", "payload")
  SELECT 'Standard Monitoring', 'monitoring_work_orders', u."id", original_payload
  FROM "users" u
  WHERE NOT EXISTS (
    SELECT 1
    FROM "tableLayout" l
    WHERE l."createdBy" = u."id"
      AND l."tableKey" = 'monitoring_work_orders'
      AND l."name" = 'Standard Monitoring'
  );

  -- All users: monitoring default = their Standard Monitoring layout
  INSERT INTO "userTableLayoutDefault" ("userId", "context", "layoutId")
  SELECT u."id", 'monitoring', l."id"
  FROM "users" u
  INNER JOIN "tableLayout" l
    ON l."createdBy" = u."id"
   AND l."tableKey" = 'monitoring_work_orders'
   AND l."name" = 'Standard Monitoring'
  ON CONFLICT ("userId", "context") DO UPDATE SET "layoutId" = EXCLUDED."layoutId";
END $$;
