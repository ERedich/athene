import {
  assetDocumentCountSubquery,
  workOrderAssetDocumentCountSubquery,
  workOrderDocumentCountSubquery,
} from "../../documents/documentSql.js";

export const selectAssetsForEmbeddingSql = `
  SELECT
    a."id",
    a."key",
    a."name",
    a."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    a."type",
    parent."key" AS "parentAssetKey",
    parent."name" AS "parentAssetName",
    a."serialNumber",
    a."buildDate"::text AS "buildDate",
    a."manufacturer",
    a."remark",
    cc."key" AS "costCenterKey",
    cc."name" AS "costCenterName",
    clf."key" AS "classificationKey",
    clf."name" AS "classificationName",
    COALESCE(doc_counts."documentCount", 0)::int AS "documentCount"
  FROM "asset" a
  JOIN "site" s ON s."id" = a."siteId"
  LEFT JOIN "asset" parent ON parent."id" = a."parentAssetId"
  LEFT JOIN "costCenter" cc ON cc."id" = a."costCenterId"
  LEFT JOIN "classification" clf ON clf."id" = a."classificationId"
  ${assetDocumentCountSubquery}
`;

export const selectWorkOrdersForEmbeddingSql = `
  SELECT
    w."id",
    w."orderNumber",
    w."name",
    w."description",
    w."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    a."key" AS "assetKey",
    a."name" AS "assetName",
    c."key" AS "costCenterKey",
    c."name" AS "costCenterName",
    cl."key" AS "classificationKey",
    cl."name" AS "classificationName",
    w."plannedStart",
    w."plannedEnd",
    w."plannedDurationMinutes",
    w."orderType",
    w."status",
    (
      SELECT NULLIF(COALESCE(string_agg(e."key", ', ' ORDER BY e."key"), ''), '')
      FROM "workOrderResponsibleEmployee" wor
      JOIN "employee" e ON e."id" = wor."employeeId"
      WHERE wor."workOrderId" = w."id"
    ) AS "responsibleEmployeeKey",
    (
      SELECT NULLIF(COALESCE(string_agg(e."name", ', ' ORDER BY e."key"), ''), '')
      FROM "workOrderResponsibleEmployee" wor
      JOIN "employee" e ON e."id" = wor."employeeId"
      WHERE wor."workOrderId" = w."id"
    ) AS "responsibleEmployeeName",
    dbe."key" AS "doneByEmployeeKey",
    dbe."name" AS "doneByEmployeeName",
    done_history."doneAt",
    ended_history."endedAt",
    wg."key" AS "workgroupKey",
    wg."name" AS "workgroupName",
    COALESCE(doc_counts."documentCount", 0)::int AS "documentCount",
    COALESCE(asset_doc_counts."assetDocumentCount", 0)::int AS "assetDocumentCount",
    COALESCE(assign_counts."assignedEmployeeCount", 0)::int AS "assignedEmployeeCount"
  FROM "workOrder" w
  JOIN "site" s ON s."id" = w."siteId"
  JOIN "asset" a ON a."id" = w."assetId"
  JOIN "costCenter" c ON c."id" = w."costCenterId"
  LEFT JOIN "classification" cl ON cl."id" = w."classificationId"
  LEFT JOIN "employee" dbe ON dbe."id" = w."doneBy"
  LEFT JOIN (
    SELECT "workOrderId", max("occurredAt") AS "doneAt"
    FROM "workOrderStatusHistory"
    WHERE "status" = 'done'
    GROUP BY "workOrderId"
  ) done_history ON done_history."workOrderId" = w."id"
  LEFT JOIN (
    SELECT "workOrderId", max("occurredAt") AS "endedAt"
    FROM "workOrderStatusHistory"
    WHERE "status" = 'ended'
    GROUP BY "workOrderId"
  ) ended_history ON ended_history."workOrderId" = w."id"
  LEFT JOIN "workgroup" wg ON wg."id" = w."workgroupId"
  ${workOrderDocumentCountSubquery}
  ${workOrderAssetDocumentCountSubquery}
  LEFT JOIN (
    SELECT "workOrderId", COUNT(*)::int AS "assignedEmployeeCount"
    FROM "workOrderEmployeeAssignment"
    GROUP BY "workOrderId"
  ) assign_counts ON assign_counts."workOrderId" = w."id"
`;

/** Documents visible on at least one work order (direct WO link or asset on WO). */
export const workOrderVisibleDocumentsWhere = `
  EXISTS (
    SELECT 1
    FROM "workOrder" w
    WHERE (
      dl."entityType" = 'workOrder' AND dl."entityId" = w."id"
    ) OR (
      dl."entityType" = 'asset' AND dl."entityId" = w."assetId"
    )
  )
`;

export const selectWorkOrderDocumentIdsSql = `
  SELECT DISTINCT d."id"
  FROM "document" d
  JOIN "documentLink" dl ON dl."documentId" = d."id"
  WHERE ${workOrderVisibleDocumentsWhere}
`;

export const selectSparePartsForEmbeddingSql = `
  SELECT
    sp."id",
    sp."key",
    sp."name",
    sp."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    sp."isActive",
    sp."serialNumber",
    clf."key" AS "classificationKey",
    clf."name" AS "classificationName",
    sp."manufacturer",
    sp."articleNumber",
    sp."alternativeDesignation"
  FROM "sparePart" sp
  JOIN "site" s ON s."id" = sp."siteId"
  LEFT JOIN "classification" clf ON clf."id" = sp."classificationId"
`;

export const selectWarehousesForEmbeddingSql = `
  SELECT
    w."id",
    w."key",
    w."name",
    w."siteId",
    s."key" AS "siteKey",
    s."name" AS "siteName",
    w."isActive"
  FROM "warehouse" w
  JOIN "site" s ON s."id" = w."siteId"
`;
