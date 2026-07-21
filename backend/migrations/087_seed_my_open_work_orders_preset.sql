-- Seed standard search preset "Meine offenen Aufträge" for every user (idempotent)

INSERT INTO "workOrderSearchPreset" ("name", "createdBy", "payload")
SELECT
  'Meine offenen Aufträge',
  u."id",
  '{
    "version": 1,
    "quickSearch": "",
    "advanced": {
      "orderNumberFrom": "",
      "orderNumberTo": "",
      "plannedDurationFrom": "",
      "plannedDurationTo": "",
      "documentCountFrom": "",
      "documentCountTo": "",
      "assetDocumentCountFrom": "",
      "assetDocumentCountTo": "",
      "assignedEmployeeCountFrom": "",
      "assignedEmployeeCountTo": "",
      "name": "",
      "description": "",
      "createdBy": [],
      "updatedBy": [],
      "plannedStartFrom": "",
      "plannedStartTo": "",
      "plannedEndFrom": "",
      "plannedEndTo": "",
      "createdAtFrom": "",
      "createdAtTo": "",
      "updatedAtFrom": "",
      "updatedAtTo": "",
      "orderType": [],
      "status": ["open", "assigned", "started", "paused", "continued"],
      "siteId": [],
      "assetId": [],
      "costCenterId": [],
      "classificationId": [],
      "classificationUnassigned": false,
      "workgroupId": [],
      "responsibleEmployeeId": [],
      "employeeId": ["__ME__"]
    }
  }'::jsonb
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1
  FROM "workOrderSearchPreset" p
  WHERE p."createdBy" = u."id"
    AND p."name" = 'Meine offenen Aufträge'
);
