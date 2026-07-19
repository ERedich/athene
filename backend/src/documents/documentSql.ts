/** Document counts for asset list queries (join on asset id). */
export const assetDocumentCountSubquery = `
  LEFT JOIN (
    SELECT dl."entityId" AS "assetId", COUNT(*)::int AS "documentCount"
    FROM "documentLink" dl
    WHERE dl."entityType" = 'asset'
    GROUP BY dl."entityId"
  ) doc_counts ON doc_counts."assetId" = a."id"
`;

/** Work-order counts for asset list queries (join on asset id). */
export const assetWorkOrderCountSubquery = `
  LEFT JOIN (
    SELECT wo."assetId", COUNT(*)::int AS "workOrderCount"
    FROM "workOrder" wo
    GROUP BY wo."assetId"
  ) wo_counts ON wo_counts."assetId" = a."id"
`;

/** Inspection-point counts for asset list queries. */
export const assetInspectionPointCountSubquery = `
  LEFT JOIN (
    SELECT ip."assetId", COUNT(*)::int AS "inspectionPointCount"
    FROM "inspectionPoint" ip
    GROUP BY ip."assetId"
  ) ip_counts ON ip_counts."assetId" = a."id"
`;

/** Document counts for work-order list queries. */
export const workOrderDocumentCountSubquery = `
  LEFT JOIN (
    SELECT dl."entityId" AS "workOrderId", COUNT(*)::int AS "documentCount"
    FROM "documentLink" dl
    WHERE dl."entityType" = 'workOrder'
    GROUP BY dl."entityId"
  ) doc_counts ON doc_counts."workOrderId" = w."id"
`;

export const workOrderAssetDocumentCountSubquery = `
  LEFT JOIN (
    SELECT dl."entityId" AS "assetId", COUNT(*)::int AS "assetDocumentCount"
    FROM "documentLink" dl
    WHERE dl."entityType" = 'asset'
    GROUP BY dl."entityId"
  ) asset_doc_counts ON asset_doc_counts."assetId" = w."assetId"
`;

/** For INSERT/UPDATE RETURNING on assets (alias `i` / `u`). */
export const assetDocumentCountSubqueryOnInsert = `
  LEFT JOIN (
    SELECT dl."entityId" AS "assetId", COUNT(*)::int AS "documentCount"
    FROM "documentLink" dl
    WHERE dl."entityType" = 'asset'
    GROUP BY dl."entityId"
  ) doc_counts ON doc_counts."assetId" = i."id"
`;

export const assetWorkOrderCountSubqueryOnInsert = `
  LEFT JOIN (
    SELECT wo."assetId", COUNT(*)::int AS "workOrderCount"
    FROM "workOrder" wo
    GROUP BY wo."assetId"
  ) wo_counts ON wo_counts."assetId" = i."id"
`;

export const assetInspectionPointCountSubqueryOnInsert = `
  LEFT JOIN (
    SELECT ip."assetId", COUNT(*)::int AS "inspectionPointCount"
    FROM "inspectionPoint" ip
    GROUP BY ip."assetId"
  ) ip_counts ON ip_counts."assetId" = i."id"
`;

export const assetDocumentCountSubqueryOnUpdate = `
  LEFT JOIN (
    SELECT dl."entityId" AS "assetId", COUNT(*)::int AS "documentCount"
    FROM "documentLink" dl
    WHERE dl."entityType" = 'asset'
    GROUP BY dl."entityId"
  ) doc_counts ON doc_counts."assetId" = u."id"
`;

export const assetWorkOrderCountSubqueryOnUpdate = `
  LEFT JOIN (
    SELECT wo."assetId", COUNT(*)::int AS "workOrderCount"
    FROM "workOrder" wo
    GROUP BY wo."assetId"
  ) wo_counts ON wo_counts."assetId" = u."id"
`;

export const assetInspectionPointCountSubqueryOnUpdate = `
  LEFT JOIN (
    SELECT ip."assetId", COUNT(*)::int AS "inspectionPointCount"
    FROM "inspectionPoint" ip
    GROUP BY ip."assetId"
  ) ip_counts ON ip_counts."assetId" = u."id"
`;

export const workOrderDocumentCountSubqueryOnInsert = `
  LEFT JOIN (
    SELECT dl."entityId" AS "workOrderId", COUNT(*)::int AS "documentCount"
    FROM "documentLink" dl
    WHERE dl."entityType" = 'workOrder'
    GROUP BY dl."entityId"
  ) doc_counts ON doc_counts."workOrderId" = i."id"
`;

export const workOrderAssetDocumentCountSubqueryOnInsert = `
  LEFT JOIN (
    SELECT dl."entityId" AS "assetId", COUNT(*)::int AS "assetDocumentCount"
    FROM "documentLink" dl
    WHERE dl."entityType" = 'asset'
    GROUP BY dl."entityId"
  ) asset_doc_counts ON asset_doc_counts."assetId" = i."assetId"
`;

export const workOrderDocumentCountSubqueryOnUpdate = `
  LEFT JOIN (
    SELECT dl."entityId" AS "workOrderId", COUNT(*)::int AS "documentCount"
    FROM "documentLink" dl
    WHERE dl."entityType" = 'workOrder'
    GROUP BY dl."entityId"
  ) doc_counts ON doc_counts."workOrderId" = u."id"
`;

export const workOrderAssetDocumentCountSubqueryOnUpdate = `
  LEFT JOIN (
    SELECT dl."entityId" AS "assetId", COUNT(*)::int AS "assetDocumentCount"
    FROM "documentLink" dl
    WHERE dl."entityType" = 'asset'
    GROUP BY dl."entityId"
  ) asset_doc_counts ON asset_doc_counts."assetId" = u."assetId"
`;
