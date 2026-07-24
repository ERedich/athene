-- Seed single-work-order detail report for every site, targetApp = workOrders

INSERT INTO "reportDefinition" ("key", "name", "siteId", "targetAppKey", "sql", "layout", "createdBy")
SELECT
  'work-order-detail-report',
  'Auftrags-Report',
  s."id",
  'workOrders',
  $report_sql$
SELECT
  wo."id",
  wo."orderNumber",
  wo."name",
  wo."description",
  wo."status",
  wo."orderType",
  wo."orderNumber"::text AS "qrValue",
  s."key" AS "siteKey",
  s."name" AS "siteName",
  a."key" AS "assetKey",
  a."name" AS "assetName",
  CASE
    WHEN a."id" IS NULL THEN '—'
    ELSE COALESCE(a."key", '') || ' — ' || COALESCE(a."name", '')
  END AS "assetLabel",
  CASE
    WHEN cc."id" IS NULL THEN '—'
    ELSE COALESCE(cc."key", '') || ' — ' || COALESCE(cc."name", '')
  END AS "costCenterLabel",
  CASE
    WHEN wg."id" IS NULL THEN '—'
    ELSE COALESCE(wg."key", '') || ' — ' || COALESCE(wg."name", '')
  END AS "workgroupLabel",
  COALESCE(to_char(wo."plannedStart", 'DD.MM.YYYY HH24:MI'), '—') AS "plannedStart",
  COALESCE(to_char(wo."plannedEnd", 'DD.MM.YYYY HH24:MI'), '—') AS "plannedEnd",
  COALESCE(wo."plannedDurationMinutes"::text, '—') AS "plannedDurationMinutes",
  to_char(wo."createdAt", 'DD.MM.YYYY HH24:MI') AS "createdAt",
  COALESCE(created_by."loginName", wo."createdBy"::text) AS "createdBy",
  to_char(wo."updatedAt", 'DD.MM.YYYY HH24:MI') AS "updatedAt",
  COALESCE(updated_by."loginName", wo."updatedBy"::text) AS "updatedBy"
FROM "workOrder" wo
JOIN "site" s ON s."id" = wo."siteId"
LEFT JOIN "asset" a ON a."id" = wo."assetId"
LEFT JOIN "costCenter" cc ON cc."id" = wo."costCenterId"
LEFT JOIN "workgroup" wg ON wg."id" = wo."workgroupId"
LEFT JOIN "users" created_by ON created_by."id" = wo."createdBy"
LEFT JOIN "users" updated_by ON updated_by."id" = wo."updatedBy"
WHERE wo."id" = {{recordId}}
$report_sql$,
  $report_layout${
  "header": { "height": 100, "firstPageOnly": false, "backgroundColor": "" },
  "groupHeader": { "height": 16, "backgroundColor": "" },
  "detail": { "height": 240, "backgroundColor": "" },
  "groupFooter": { "height": 16, "backgroundColor": "" },
  "footer": { "height": 32, "backgroundColor": "" },
  "grouping": {
    "enabled": false,
    "field": "",
    "sort": "asc",
    "granularity": "day",
    "dateFormat": "YYYY-MM-DD"
  },
  "filters": [],
  "elements": [
    {
      "id": "b0000001-0001-4000-8000-000000000001",
      "section": "header",
      "text": "Auftrags-Report",
      "x": 40,
      "y": 16,
      "width": 360,
      "height": 22,
      "fontSize": 20,
      "align": "left",
      "bold": true,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000002",
      "section": "header",
      "text": "#{{orderNumber}}  —  {{name}}",
      "x": 40,
      "y": 46,
      "width": 400,
      "height": 18,
      "fontSize": 12,
      "align": "left",
      "bold": false,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000003",
      "section": "header",
      "text": "Status: {{status}}  ·  Typ: {{orderType}}",
      "x": 40,
      "y": 70,
      "width": 400,
      "height": 16,
      "fontSize": 10,
      "align": "left",
      "bold": false,
      "italic": true,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000004",
      "section": "header",
      "text": "QR",
      "x": 483,
      "y": 12,
      "width": 76,
      "height": 76,
      "fontSize": 10,
      "align": "left",
      "bold": false,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "qr",
      "sourceField": "qrValue",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000010",
      "section": "detail",
      "text": "Asset",
      "x": 40,
      "y": 16,
      "width": 120,
      "height": 14,
      "fontSize": 9,
      "align": "left",
      "bold": true,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000011",
      "section": "detail",
      "text": "{{assetLabel}}",
      "x": 160,
      "y": 16,
      "width": 360,
      "height": 14,
      "fontSize": 10,
      "align": "left",
      "bold": false,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000012",
      "section": "detail",
      "text": "Kostenstelle",
      "x": 40,
      "y": 40,
      "width": 120,
      "height": 14,
      "fontSize": 9,
      "align": "left",
      "bold": true,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000013",
      "section": "detail",
      "text": "{{costCenterLabel}}",
      "x": 160,
      "y": 40,
      "width": 360,
      "height": 14,
      "fontSize": 10,
      "align": "left",
      "bold": false,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000014",
      "section": "detail",
      "text": "Fachgruppe",
      "x": 40,
      "y": 64,
      "width": 120,
      "height": 14,
      "fontSize": 9,
      "align": "left",
      "bold": true,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000015",
      "section": "detail",
      "text": "{{workgroupLabel}}",
      "x": 160,
      "y": 64,
      "width": 360,
      "height": 14,
      "fontSize": 10,
      "align": "left",
      "bold": false,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000016",
      "section": "detail",
      "text": "Planung",
      "x": 40,
      "y": 96,
      "width": 120,
      "height": 14,
      "fontSize": 9,
      "align": "left",
      "bold": true,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000017",
      "section": "detail",
      "text": "{{plannedStart}}  →  {{plannedEnd}}  ({{plannedDurationMinutes}} min)",
      "x": 160,
      "y": 96,
      "width": 360,
      "height": 14,
      "fontSize": 10,
      "align": "left",
      "bold": false,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000018",
      "section": "detail",
      "text": "Beschreibung",
      "x": 40,
      "y": 128,
      "width": 480,
      "height": 14,
      "fontSize": 9,
      "align": "left",
      "bold": true,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000019",
      "section": "detail",
      "text": "{{description}}",
      "x": 40,
      "y": 148,
      "width": 500,
      "height": 72,
      "fontSize": 10,
      "align": "left",
      "bold": false,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000070",
      "section": "footer",
      "text": "Athene CMMS  ·  Auftrags-Report  ·  Seite {{_pageNumber}}",
      "x": 40,
      "y": 8,
      "width": 360,
      "height": 16,
      "fontSize": 9,
      "align": "left",
      "bold": false,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    },
    {
      "id": "b0000001-0001-4000-8000-000000000071",
      "section": "footer",
      "text": "ID: {{id}}",
      "x": 360,
      "y": 8,
      "width": 195,
      "height": 16,
      "fontSize": 8,
      "align": "right",
      "bold": false,
      "italic": false,
      "underline": false,
      "color": "#111827",
      "kind": "text",
      "sourceField": "",
      "dateFormat": ""
    }
  ]
}$report_layout$::jsonb,
  creator."id"
FROM "site" s
CROSS JOIN LATERAL (
  SELECT u."id"
  FROM "users" u
  ORDER BY CASE WHEN u."loginName" = 'admin' THEN 0 ELSE 1 END, u."loginName"
  LIMIT 1
) creator
WHERE NOT EXISTS (
  SELECT 1
  FROM "reportDefinition" d
  WHERE d."siteId" = s."id"
    AND d."key" = 'work-order-detail-report'
);
