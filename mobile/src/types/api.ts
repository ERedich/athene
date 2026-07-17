export type AuthUser = {
  id: string;
  loginName: string;
  name: string;
  workingSiteId: string;
  employeeId: string | null;
  employeeKey: string | null;
  employeeName: string | null;
  siteIds: string[];
  workgroups: Array<{ id: string; key: string; name: string; siteId: string }>;
};

export type SiteRow = {
  id: string;
  key: string;
  name: string;
  isPlant: boolean;
  colorHex: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type CostCenterRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type ClassificationRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  appliesToMaterial: boolean;
  appliesToAsset: boolean;
  appliesToWorkOrder: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type AssetType = "site" | "structure" | "line" | "maintenanceObject";

export type AssetRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  type: AssetType;
  parentAssetId: string | null;
  parentAssetKey: string | null;
  parentAssetName: string | null;
  parentAssetType: AssetType | null;
  serialNumber: string | null;
  buildDate: string | null;
  manufacturer: string | null;
  remark: string | null;
  costCenterId: string | null;
  costCenterKey: string | null;
  costCenterName: string | null;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
  workOrderCount: number;
  keyPath?: string | null;
};

export type WorkOrderType = "maintenance" | "repair" | "breakdown";

/** Aligns with `frontend/src/index.css` work-order status cell backgrounds (~30%). */
export type WorkOrderStatus =
  | "open"
  | "assigned"
  | "started"
  | "paused"
  | "continued"
  | "ended"
  | "done"
  | "cancelled";

export type WorkOrderDocumentCategory =
  | "general"
  | "protocols"
  | "drawings"
  | "instructions"
  | "nameplates"
  | "certificates";

export type WorkOrderRow = {
  id: string;
  orderNumber: number;
  name: string;
  description: string | null;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  assetId: string;
  assetKey: string;
  assetName: string;
  costCenterId: string;
  costCenterKey: string;
  costCenterName: string;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationMinutes: number | null;
  orderType: WorkOrderType;
  status: WorkOrderStatus;
  pauseRemark: string | null;
  currentSegmentStartedAt: string | null;
  workgroupId: string | null;
  workgroupKey: string | null;
  workgroupName: string | null;
  responsibleEmployeeIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
  assetDocumentCount: number;
};

export type WorkgroupRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  employeeIds: string[];
  leaderEmployeeIds: string[];
};

export type EmployeeRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
};

export type WorkOrderDocumentSource = "workOrder" | "asset";

export type WorkOrderAssignmentRow = {
  id: string;
  workOrderId: string;
  employeeId: string;
  employeeKey: string;
  employeeName: string;
  createdAt: string;
  createdBy: string;
};

export type TransactionRow = {
  id: string;
  transactionNumber: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  type: string;
  bookedAt: string;
  quantity: string;
  workOrderId: string | null;
  workOrderOrderNumber: string | null;
  remark: string | null;
};

export type DocumentReferenceApp = "assets" | "workOrders";

export type AssetDocumentRow = {
  id: string;
  fileName: string;
  displayName: string | null;
  category: WorkOrderDocumentCategory;
  mimeType: string | null;
  fileSize: number;
};

export type WorkOrderDocumentRow = {
  id: string;
  source: WorkOrderDocumentSource;
  workOrderId: string | null;
  assetId: string | null;
  fileName: string;
  displayName: string;
  category: WorkOrderDocumentCategory;
  mimeType: string;
  fileSize: number;
  referenceApp?: DocumentReferenceApp;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type WorkOrderMessage = {
  id: string;
  workOrderId: string;
  authorUserId: string;
  authorUserName: string;
  body: string;
  replyToMessageId: string | null;
  replyToAuthorUserName: string | null;
  replyToBodyPreview: string | null;
  replyToCreatedAt: string | null;
  createdAt: string;
  documentId: string | null;
  documentDisplayName: string | null;
  documentMimeType: string | null;
  documentFileName: string | null;
};

export type DashboardStatusCount = { status: string; count: number };
export type DashboardDayCount = { date: string; count: number };
export type DashboardOrderTypeCount = { orderType: string; count: number };

export type DashboardMetrics = {
  openActive: { total: number; byStatus: DashboardStatusCount[] };
  completedLast7Days: { total: number; byDay: DashboardDayCount[] };
  myOrders: { total: number; byStatus: DashboardStatusCount[]; employeeLinked: boolean };
  transactionsLast7Days: { total: number; byDay: DashboardDayCount[] };
  ordersByType: { total: number; byType: DashboardOrderTypeCount[] };
  delayedOrders: { total: number };
  avgDelayHours: { hours: number | null };
  topAssetByOrders: {
    assetId: string | null;
    assetKey: string | null;
    assetName: string | null;
    count: number;
  };
  transactionsLast24h: { total: number };
  transactionsLastMonth: { total: number };
};

export type AtheneBriefingCounts = {
  created24h: number;
  completed24h: number;
  bookings24h: number;
  maintenanceNext48h: number;
  unreadNotifications: number;
};

export type AtheneBriefing = {
  counts: AtheneBriefingCounts;
  news: string;
  lookback: string;
  outlook: string;
  summarySource: "ai" | "fallback";
  maintenancePreview: Array<{
    orderNumber: number | null;
    name: string;
    plannedStart: string;
  }>;
};
