import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import {
  Check,
  CircleX,
  File,
  FileText,
  Filter,
  Image,
  MessageCircle,
  Pencil,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  Upload,
  UserPlus,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Badge } from "primereact/badge";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { MultiSelect } from "primereact/multiselect";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";
import { Toast } from "primereact/toast";

import { useAtheneAssistant } from "../assistant/AtheneAssistantContext";
import { useAuth } from "../auth/AuthContext";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE, APP_PARAM_KEY_ENABLE_CLEVER_SEARCH } from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { useTableContextMenu } from "../lib/useTableContextMenu";
import { WorkOrderDialogTitle } from "../components/workOrders/WorkOrderDialogTitle";
import { WorkOrderFeedbackTabContent } from "../components/workOrders/WorkOrderFeedbackTabContent";
import { WorkOrderFeedbackTransactionsSection } from "../components/workOrders/WorkOrderFeedbackTransactionsSection";
import { WorkOrderOverviewOverlay } from "../components/workOrders/WorkOrderOverviewOverlay";
import { WorkOrderSearchPanel } from "../components/workOrders/WorkOrderSearchPanel";
import { useWorkOrderOverviewPanel } from "../hooks/useWorkOrderOverviewPanel";
import {
  computeSegmentHours,
  feedbackStatusActionForEntryMode,
  orderDialogTabs,
  type FeedbackAdditionalHoursRow,
  type FeedbackEntryMode,
  type FeedbackStatusAction,
  type OrderDialogTab,
} from "../lib/workOrderDialog";
import { mergeWorkOrderIntoAdvancedSearch } from "../lib/workOrderCleverSearch";
import {
  buildWorkOrderListQueryString,
  emptyWorkOrderAdvancedSearch,
  hasActiveWorkOrderAdvancedSearch,
  type WorkOrderAdvancedSearchState,
} from "../lib/workOrderApiFilters";
import type { TransactionRow } from "./TransactionsPage";
import {
  createWorkOrderSearchPreset,
  fetchWorkOrderSearchPresetDefaults,
  fetchWorkOrderSearchPresetDetail,
  fetchWorkOrderSearchPresets,
  isSamePresetId,
} from "../lib/workOrderSearchPresetApi";
import {
  ASSET_DOCUMENT_CATEGORY_ORDER,
  type AssetDocumentCategory,
  documentCategoryBadgeClass,
  isAssetDocumentCategory,
} from "../constants/assetDocumentCategory";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import {
  AppPauseIcon,
  AppPlayStartIcon,
  AppSquareStopIcon,
  LucideSpinner,
  lucidePrimeBtnIcon,
} from "../icons/lucide";

type WorkOrderType = "maintenance" | "repair" | "breakdown";
type WorkOrderStatus =
  | "open"
  | "assigned"
  | "started"
  | "paused"
  | "continued"
  | "ended"
  | "done"
  | "cancelled";

type WorkOrder = {
  id: string;
  orderNumber: number;
  name: string;
  description: string | null;
  siteId: string;
  siteKey: string;
  siteName: string;
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
  responsibleEmployeeId: string | null;
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  doneBy: string | null;
  doneByEmployeeKey: string | null;
  doneByEmployeeName: string | null;
  pauseRemark: string | null;
  currentSegmentStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
  assetDocumentCount: number;
  assignedEmployeeCount: number;
  transactionCount: number;
  workgroupId: string | null;
  workgroupKey: string | null;
  workgroupName: string | null;
};

type WorkOrderAssignment = {
  id: string;
  workOrderId: string;
  employeeId: string;
  employeeKey: string;
  employeeName: string;
  createdAt: string;
  createdBy: string;
};

type WorkOrderDocumentSource = "workOrder" | "asset";

type WorkOrderDocument = {
  id: string;
  source: WorkOrderDocumentSource;
  workOrderId: string | null;
  assetId: string | null;
  fileName: string;
  displayName: string;
  category: AssetDocumentCategory;
  mimeType: string;
  fileSize: number;
  referenceApp?: "assets" | "workOrders";
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

type PendingDocumentUpload = {
  localId: string;
  file: File;
  displayName: string;
  category: AssetDocumentCategory;
  addedAt: number;
};

type Asset = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  costCenterId: string | null;
};

type CostCenter = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
};

type ClassificationListRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  appliesToAsset: boolean;
  appliesToWorkOrder: boolean;
};

type Employee = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
};

type Workgroup = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  employeeIds: string[];
};

type SiteOption = { id: string; key: string; name: string };

type UserDirectoryRow = { id: string; loginName: string; name: string };

type FormState = {
  orderNumber: number | null;
  name: string;
  description: string;
  assetId: string;
  costCenterId: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  plannedDurationHours: string;
  orderType: WorkOrderType;
  responsibleEmployeeId: string;
  workgroupId: string;
  classificationId: string;
};

type SelectOption = { label: string; value: string };

const ORDERS_TABLE_VIRTUAL_ROW_PX = 38;
const PENDING_AUTO_UPLOAD_MS = 5_000;
const MONITOR_HIGHLIGHT_MS = 10_000;
const MONITOR_HIGHLIGHT_FADE_MS = 1_000;

/** Matches POST /api/work-orders/:id/feedback — only started, continued, ended. */
function workOrderStatusAllowsFeedback(status: WorkOrderStatus | undefined): boolean {
  return status === "started" || status === "continued" || status === "ended";
}

/** Feedback tab visible (includes „Erledigt“ for read-only „Erledigt von“). */
function workOrderStatusAllowsFeedbackTab(status: WorkOrderStatus | undefined): boolean {
  return workOrderStatusAllowsFeedback(status) || status === "done";
}

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const deleteActionIcon = "text-red-500";

const typeOrder: WorkOrderType[] = ["maintenance", "repair", "breakdown"];

function newPendingLocalId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileExtension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

function documentTypeMimeIcon(
  mimeType: string,
  fileName: string,
): { Icon: LucideIcon; className: string } {
  const ext = fileExtension(fileName);
  const mt = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (mt.includes("pdf") || ext === "pdf")
    return { Icon: FileText, className: "text-red-500" };
  if (mt.startsWith("image/")) return { Icon: Image, className: "text-sky-500" };
  if (mt.startsWith("video/")) return { Icon: Video, className: "text-violet-500" };
  return { Icon: File, className: "text-on-surface-variant" };
}

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

function formatHoursForInput(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return "";
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function emptyForm(): FormState {
  const start = new Date();
  return {
    orderNumber: null,
    name: "",
    description: "",
    assetId: "",
    costCenterId: "",
    plannedStart: start,
    plannedEnd: addHours(start, 24),
    plannedDurationHours: "24",
    orderType: "maintenance",
    responsibleEmployeeId: "",
    workgroupId: "",
    classificationId: "",
  };
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function supportsOrdersVirtualScroller(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const firefox = /firefox\//i.test(ua) || /fxios/i.test(ua);
  const chromium = /chrome\//i.test(ua) || /crios/i.test(ua) || /edg\//i.test(ua) || /opr\//i.test(ua);
  return !firefox && !chromium;
}

function monitoringEventsWsUrl(): string {
  const url = new URL("/api/work-orders/events", window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function MonitoringPage() {
  const { t, i18n } = useTranslation();
  const athene = useAtheneAssistant();
  const { user, appParameterBooleans, appParameterDefaultWorkgroupId } = useAuth();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const overview = useWorkOrderOverviewPanel();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tabHostRef = useRef<HTMLDivElement | null>(null);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [newlyCreatedOrderIds, setNewlyCreatedOrderIds] = useState<Record<string, number>>({});
  const [updatedOrderIds, setUpdatedOrderIds] = useState<Record<string, number>>({});
  const [assets, setAssets] = useState<Asset[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [classifications, setClassifications] = useState<ClassificationListRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workgroups, setWorkgroups] = useState<Workgroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState<OrderDialogTab>(orderDialogTabs.General);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const prevCreateAssetIdForDefaultWgRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<UserDirectoryRow[]>([]);
  const [appliedAdvanced, setAppliedAdvanced] = useState<WorkOrderAdvancedSearchState>(() => emptyWorkOrderAdvancedSearch());
  const [panelDraft, setPanelDraft] = useState<WorkOrderAdvancedSearchState>(() => emptyWorkOrderAdvancedSearch());
  const [searchPanelVisible, setSearchPanelVisible] = useState(false);
  const [searchPresets, setSearchPresets] = useState<{ id: string; name: string; isOwner: boolean }[]>([]);
  const [headerPresetSelectionId, setHeaderPresetSelectionId] = useState<string | null>(null);
  const [searchBootstrapDone, setSearchBootstrapDone] = useState(false);
  const searchBootstrapDoneRef = useRef(false);
  const [documents, setDocuments] = useState<WorkOrderDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsSearchTerm, setDocumentsSearchTerm] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingDocumentUpload[]>([]);
  const [pendingUiTick, setPendingUiTick] = useState(0);
  const [pendingRowUploading, setPendingRowUploading] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [documentEdit, setDocumentEdit] = useState<WorkOrderDocument | null>(null);
  const [documentEditDisplayName, setDocumentEditDisplayName] = useState("");
  const [documentEditCategory, setDocumentEditCategory] = useState<AssetDocumentCategory>("general");
  const [documentEditSaving, setDocumentEditSaving] = useState(false);
  const [feedbackHours, setFeedbackHours] = useState("");
  const [feedbackRemark, setFeedbackRemark] = useState("");
  const [feedbackPauseRemark, setFeedbackPauseRemark] = useState("");
  const [feedbackStatusAction, setFeedbackStatusAction] = useState<FeedbackStatusAction>("none");
  const [feedbackEntryMode, setFeedbackEntryMode] = useState<FeedbackEntryMode>("create");
  const [feedbackAdditionalHours, setFeedbackAdditionalHours] = useState<FeedbackAdditionalHoursRow[]>([]);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackTransactions, setFeedbackTransactions] = useState<TransactionRow[]>([]);
  const [feedbackTransactionsLoading, setFeedbackTransactionsLoading] = useState(false);
  const [feedbackTransactionsLoadedOrderId, setFeedbackTransactionsLoadedOrderId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<WorkOrderAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentEmployeeIds, setAssignmentEmployeeIds] = useState<string[]>([]);
  const [assignmentAdding, setAssignmentAdding] = useState(false);
  const [assignmentsCascadeSeed, setAssignmentsCascadeSeed] = useState(0);
  const prevDialogTabRef = useRef<OrderDialogTab | null>(null);
  const assignmentAddingRef = useRef(false);

  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const cleverSearchEnabled = Boolean(appParameterBooleans[APP_PARAM_KEY_ENABLE_CLEVER_SEARCH]);
  const canUseVirtual = useMemo(() => supportsOrdersVirtualScroller(), []);
  const virtualScrollerOptions = useMemo(
    () => (canUseVirtual ? { itemSize: ORDERS_TABLE_VIRTUAL_ROW_PX, showLoader: true } : undefined),
    [canUseVirtual],
  );
  const pendingFilesRef = useRef(pendingFiles);
  const pendingAutoTimersRef = useRef(new Map<string, number>());
  const editingIdRef = useRef<string | null>(null);
  const formRef = useRef(form);
  const orderCreateLockRef = useRef<Promise<string | null> | null>(null);
  const selectedOrderRef = useRef<WorkOrder | null>(null);
  selectedOrderRef.current = selectedOrder;

  const accessibleAssets = useMemo(
    () => assets.filter((asset) => !siteFieldLocked || asset.siteId === user.workingSiteId),
    [assets, siteFieldLocked, user.workingSiteId],
  );

  const searchSiteOptions = useMemo(
    () =>
      sites
        .filter((s) => !siteFieldLocked || s.id === user.workingSiteId)
        .map((s) => ({ label: `${s.key} - ${s.name}`, value: s.id })),
    [sites, siteFieldLocked, user.workingSiteId],
  );

  const searchAssetOptions = useMemo(
    () => accessibleAssets.map((asset) => ({ label: `${asset.key} - ${asset.name}`, value: asset.id })),
    [accessibleAssets],
  );

  const searchCostCenterOptions = useMemo(
    () =>
      costCenters
        .filter((cc) => (!siteFieldLocked || cc.siteId === user.workingSiteId) && cc.isActive)
        .map((cc) => ({ label: `${cc.key} - ${cc.name}`, value: cc.id })),
    [costCenters, siteFieldLocked, user.workingSiteId],
  );

  const searchClassificationOptions = useMemo(
    () =>
      classifications
        .filter((cl) => (!siteFieldLocked || cl.siteId === user.workingSiteId) && cl.appliesToWorkOrder)
        .map((cl) => ({ label: `${cl.key} - ${cl.name}`, value: cl.id })),
    [classifications, siteFieldLocked, user.workingSiteId],
  );

  const searchWorkgroupOptions = useMemo(
    () =>
      workgroups
        .filter((w) => w.isActive && (!siteFieldLocked || w.siteId === user.workingSiteId))
        .map((w) => ({ label: `${w.key} - ${w.name}`, value: w.id })),
    [workgroups, siteFieldLocked, user.workingSiteId],
  );

  const searchEmployeeOptions = useMemo(
    () =>
      employees
        .filter((e) => e.isActive && (!siteFieldLocked || e.siteId === user.workingSiteId))
        .map((e) => ({ label: `${e.key} - ${e.name}`, value: e.id })),
    [employees, siteFieldLocked, user.workingSiteId],
  );

  const searchUserOptions = useMemo<SelectOption[]>(
    () => directoryUsers.map((u) => ({ label: `${u.loginName} — ${u.name}`, value: u.id })),
    [directoryUsers],
  );

  const userIdByLoginName = useMemo(() => {
    const byLoginName = new Map(directoryUsers.map((u) => [u.loginName.trim().toLowerCase(), u.id]));
    return (loginName: string) => byLoginName.get(loginName.trim().toLowerCase()) ?? null;
  }, [directoryUsers]);

  const headerPresetDropdownOptions = useMemo(
    () => searchPresets.map((p) => ({ label: p.name, value: p.id })),
    [searchPresets],
  );

  const assetOptions = useMemo<SelectOption[]>(
    () =>
      accessibleAssets.map((asset) => ({
        label: `${asset.key} - ${asset.name}`,
        value: asset.id,
      })),
    [accessibleAssets],
  );

  const selectedAsset = useMemo(
    () => accessibleAssets.find((asset) => asset.id === form.assetId) ?? null,
    [accessibleAssets, form.assetId],
  );

  const costCenterOptions = useMemo<SelectOption[]>(
    () =>
      costCenters
        .filter((cc) => selectedAsset?.siteId && cc.siteId === selectedAsset.siteId)
        .filter((cc) => cc.isActive || cc.id === form.costCenterId)
        .map((cc) => ({
          label: `${cc.key} - ${cc.name}${cc.isActive ? "" : ` (${t("costCenters.inactive")})`}`,
          value: cc.id,
        })),
    [costCenters, form.costCenterId, selectedAsset?.siteId, t],
  );

  const classificationOptions = useMemo<SelectOption[]>(
    () =>
      classifications
        .filter((cl) => selectedAsset?.siteId && cl.siteId === selectedAsset.siteId && cl.appliesToWorkOrder)
        .map((cl) => ({
          label: `${cl.key} - ${cl.name}`,
          value: cl.id,
        })),
    [classifications, selectedAsset?.siteId],
  );

  const selectedWorkgroup = useMemo(
    () => (form.workgroupId ? workgroups.find((w) => w.id === form.workgroupId) ?? null : null),
    [form.workgroupId, workgroups],
  );

  const employeeOptions = useMemo<SelectOption[]>(
    () =>
      employees
        .filter((emp) => !selectedAsset?.siteId || emp.siteId === selectedAsset.siteId)
        .filter((emp) => !form.workgroupId || (selectedWorkgroup?.employeeIds?.includes(emp.id) ?? false))
        .filter((emp) => emp.isActive || emp.id === form.responsibleEmployeeId)
        .map((emp) => ({ label: `${emp.key} - ${emp.name}`, value: emp.id })),
    [employees, form.responsibleEmployeeId, form.workgroupId, selectedAsset?.siteId, selectedWorkgroup],
  );

  const workgroupOptions = useMemo<SelectOption[]>(
    () =>
      workgroups
        .filter((wg) => selectedAsset?.siteId && wg.siteId === selectedAsset.siteId)
        .filter((wg) => wg.isActive || wg.id === form.workgroupId)
        .map((wg) => ({
          label: `${wg.key} - ${wg.name}${wg.isActive ? "" : ` (${t("workgroups.inactive")})`}`,
          value: wg.id,
        })),
    [form.workgroupId, selectedAsset?.siteId, t, workgroups],
  );

  const assignmentEmployeeOptions = useMemo<SelectOption[]>(
    () =>
      employeeOptions.filter((opt) => !assignments.some((a) => a.employeeId === opt.value)),
    [assignments, employeeOptions],
  );

  useEffect(() => {
    const allowed = new Set(assignmentEmployeeOptions.map((o) => o.value));
    setAssignmentEmployeeIds((cur) => {
      const next = cur.filter((id) => allowed.has(id));
      if (next.length === cur.length && next.every((id, i) => id === cur[i])) return cur;
      return next;
    });
  }, [assignmentEmployeeOptions]);

  useEffect(() => {
    if (!form.workgroupId || !form.responsibleEmployeeId) return;
    if (!selectedWorkgroup) return;
    if (selectedWorkgroup.employeeIds.includes(form.responsibleEmployeeId)) return;
    setForm((cur) => (cur.responsibleEmployeeId ? { ...cur, responsibleEmployeeId: "" } : cur));
    toastRef.current?.show({
      severity: "info",
      summary: t("workOrders.responsibleClearedDueToWorkgroup"),
      life: 5000,
    });
  }, [form.responsibleEmployeeId, form.workgroupId, selectedWorkgroup, t]);

  const filteredDocuments = useMemo(() => {
    const q = documentsSearchTerm.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((doc) =>
      [
        doc.displayName,
        doc.fileName,
        doc.mimeType,
        doc.createdBy,
        t(`workOrders.documentCategories.${doc.category}`),
        t(`workOrders.documentsSource.${doc.source}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [documents, documentsSearchTerm, t]);

  const filteredPendingFiles = useMemo(() => {
    const q = documentsSearchTerm.trim().toLowerCase();
    if (!q) return pendingFiles;
    return pendingFiles.filter((doc) =>
      [doc.displayName, doc.file.name, doc.file.type, t(`workOrders.documentCategories.${doc.category}`)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [documentsSearchTerm, pendingFiles, t]);

  const preloadRows = useMemo<WorkOrder[]>(
    () =>
      loading && orders.length === 0
        ? Array.from({ length: 48 }, (_, index) => ({
            id: `preload-${index}`,
            orderNumber: 0,
            name: "…",
            description: null,
            siteId: "",
            siteKey: "",
            siteName: "…",
            assetId: "",
            assetKey: "",
            assetName: "…",
            costCenterId: "",
            costCenterKey: "",
            costCenterName: "…",
            classificationId: null,
            classificationKey: null,
            classificationName: null,
            plannedStart: new Date().toISOString(),
            plannedEnd: new Date().toISOString(),
            plannedDurationMinutes: null,
            orderType: "maintenance",
            status: "open",
            responsibleEmployeeId: null,
            responsibleEmployeeKey: null,
            responsibleEmployeeName: null,
            doneBy: null,
            doneByEmployeeKey: null,
            doneByEmployeeName: null,
            pauseRemark: null,
            currentSegmentStartedAt: null,
            workgroupId: null,
            workgroupKey: null,
            workgroupName: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: "…",
            updatedBy: "…",
            documentCount: 0,
            assetDocumentCount: 0,
            assignedEmployeeCount: 0,
            transactionCount: 0,
          }))
        : [],
    [loading, orders.length],
  );

  const tableRows = preloadRows.length > 0 ? preloadRows : orders;

  const overviewOrder = useMemo(() => {
    if (!overview.activeOrder) return null;
    return orders.find((row) => row.id === overview.activeOrder!.id) ?? overview.activeOrder;
  }, [overview.activeOrder, orders]);

  useEffect(() => {
    setHeaderRowCount(orders.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [orders.length, setHeaderRowCount]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => window.clearTimeout(id);
  }, [searchTerm]);
  const isPreloadMode = preloadRows.length > 0;

  const applyCleverSearchFromOrder = useCallback(
    (row: WorkOrder | null) => {
      if (!row || !cleverSearchEnabled || !searchPanelVisible || isPreloadMode) return;
      setPanelDraft((cur) => mergeWorkOrderIntoAdvancedSearch(cur, row, { userIdByLoginName }));
    },
    [cleverSearchEnabled, isPreloadMode, searchPanelVisible, userIdByLoginName],
  );

  const handleTablePointerDownCapture = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !cleverSearchEnabled || !searchPanelVisible || isPreloadMode) return;
      window.requestAnimationFrame(() => applyCleverSearchFromOrder(selectedOrderRef.current));
    },
    [applyCleverSearchFromOrder, cleverSearchEnabled, isPreloadMode, searchPanelVisible],
  );

  const loadSearchPresets = useCallback(async () => {
    try {
      const rows = await fetchWorkOrderSearchPresets();
      setSearchPresets(rows);
    } catch {
      setSearchPresets([]);
    }
  }, []);

  const bootstrapSearchPresets = useCallback(async () => {
    try {
      const [rows, defaults] = await Promise.all([fetchWorkOrderSearchPresets(), fetchWorkOrderSearchPresetDefaults()]);
      setSearchPresets(rows);
      const defaultId = defaults.monitoringPresetId;
      const match = defaultId ? rows.find((p) => isSamePresetId(p.id, defaultId)) : undefined;
      if (match) {
        const d = await fetchWorkOrderSearchPresetDetail(match.id);
        const q = d.payload.quickSearch ?? "";
        setSearchTerm(q);
        setDebouncedSearch(q.trim());
        setAppliedAdvanced({ ...d.payload.advanced });
        setPanelDraft({ ...d.payload.advanced });
        setHeaderPresetSelectionId(match.id);
      }
    } catch {
      setSearchPresets([]);
    } finally {
      setSearchBootstrapDone(true);
    }
  }, []);

  useEffect(() => {
    void bootstrapSearchPresets();
  }, [bootstrapSearchPresets]);

  useEffect(() => {
    searchBootstrapDoneRef.current = searchBootstrapDone;
  }, [searchBootstrapDone]);

  const resetSearchToUnconfiguredState = useCallback(() => {
    const empty = emptyWorkOrderAdvancedSearch();
    setSearchTerm("");
    setDebouncedSearch("");
    setAppliedAdvanced(empty);
    setPanelDraft(empty);
    setHeaderPresetSelectionId(null);
  }, []);

  useEffect(() => {
    if (!searchBootstrapDone || !headerPresetSelectionId) return;
    const stillListed = searchPresets.some((p) => isSamePresetId(p.id, headerPresetSelectionId));
    if (stillListed) return;
    if (searchPresets.length > 0) {
      resetSearchToUnconfiguredState();
      return;
    }
    setHeaderPresetSelectionId(null);
  }, [headerPresetSelectionId, resetSearchToUnconfiguredState, searchBootstrapDone, searchPresets]);

  const applyHeaderSearchPreset = useCallback(
    async (presetId: string | null) => {
      if (!presetId) {
        resetSearchToUnconfiguredState();
        return;
      }
      try {
        const d = await fetchWorkOrderSearchPresetDetail(presetId);
        const q = d.payload.quickSearch ?? "";
        setSearchTerm(q);
        setDebouncedSearch(q.trim());
        setAppliedAdvanced({ ...d.payload.advanced });
        setPanelDraft({ ...d.payload.advanced });
        setHeaderPresetSelectionId(presetId);
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("workOrders.searchPresets.applyError"),
          life: 6000,
        });
      }
    },
    [resetSearchToUnconfiguredState, t],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildWorkOrderListQueryString(debouncedSearch, appliedAdvanced);
      const ordersPath = qs ? `/api/work-orders?${qs}` : "/api/work-orders";
      const [ordersRes, assetsRes, costCentersRes, classificationsRes, employeesRes, workgroupsRes, sitesRes, usersRes] = await Promise.all([
        apiFetch(ordersPath),
        apiFetch("/api/assets"),
        apiFetch("/api/cost-centers"),
        apiFetch("/api/classifications"),
        apiFetch("/api/employees"),
        apiFetch("/api/workgroups"),
        apiFetch("/api/sites"),
        apiFetch("/api/users"),
      ]);
      if (
        !ordersRes.ok ||
        !assetsRes.ok ||
        !costCentersRes.ok ||
        !classificationsRes.ok ||
        !employeesRes.ok ||
        !workgroupsRes.ok ||
        !sitesRes.ok ||
        !usersRes.ok
      ) {
        throw new Error("load");
      }
      const [ordersData, assetsData, costCentersData, classificationsData, employeesData, workgroupsRaw, sitesData, usersData] = (await Promise.all([
        ordersRes.json(),
        assetsRes.json(),
        costCentersRes.json(),
        classificationsRes.json(),
        employeesRes.json(),
        workgroupsRes.json(),
        sitesRes.json(),
        usersRes.json(),
      ])) as [WorkOrder[], Asset[], CostCenter[], ClassificationListRow[], Employee[], Workgroup[], SiteOption[], UserDirectoryRow[]];
      setOrders(ordersData);
      setAssets(assetsData);
      setCostCenters(costCentersData);
      setClassifications(classificationsData);
      setEmployees(employeesData);
      setSites(Array.isArray(sitesData) ? sitesData : []);
      setDirectoryUsers(
        Array.isArray(usersData)
          ? usersData.map((u) => ({ id: u.id, loginName: u.loginName, name: u.name }))
          : [],
      );
      setWorkgroups(
        Array.isArray(workgroupsRaw)
          ? workgroupsRaw.map((wg) => ({
              ...wg,
              employeeIds: Array.isArray(wg.employeeIds) ? wg.employeeIds : [],
            }))
          : [],
      );
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("workOrders.loadError"), life: 6000 });
    } finally {
      setLoading(false);
    }
  }, [appliedAdvanced, debouncedSearch, t]);

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  const shouldRefetchOrdersOnWs = useMemo(
    () => debouncedSearch.length > 0 || hasActiveWorkOrderAdvancedSearch(appliedAdvanced),
    [appliedAdvanced, debouncedSearch],
  );
  const shouldRefetchOrdersOnWsRef = useRef(shouldRefetchOrdersOnWs);
  shouldRefetchOrdersOnWsRef.current = shouldRefetchOrdersOnWs;
  const wsReloadTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!searchBootstrapDone) return;
    void loadData();
  }, [loadData, searchBootstrapDone]);

  useEffect(() => {
    const totalHighlightMs = MONITOR_HIGHLIGHT_MS + MONITOR_HIGHLIGHT_FADE_MS;
    const id = window.setInterval(() => {
      const now = Date.now();
      setNewlyCreatedOrderIds((current) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const [orderId, createdAt] of Object.entries(current)) {
          if (now - createdAt <= totalHighlightMs) {
            next[orderId] = createdAt;
          } else {
            changed = true;
          }
        }
        return changed ? next : current;
      });
      setUpdatedOrderIds((current) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const [orderId, updatedAt] of Object.entries(current)) {
          if (now - updatedAt <= totalHighlightMs) {
            next[orderId] = updatedAt;
          } else {
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: number | undefined;
    let ws: WebSocket | undefined;
    let reconnectAttempt = 0;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(monitoringEventsWsUrl());
      ws.onopen = () => {
        reconnectAttempt = 0;
      };
      ws.onmessage = (event) => {
        let payload: unknown;
        try {
          payload = JSON.parse(event.data as string);
        } catch {
          return;
        }
        if (!payload || typeof payload !== "object") return;
        const message = payload as { type?: string; workOrder?: WorkOrder };
        if ((message.type !== "work_order_created" && message.type !== "work_order_updated") || !message.workOrder?.id) return;
        const incoming = message.workOrder;
        if (shouldRefetchOrdersOnWsRef.current) {
          if (wsReloadTimerRef.current) window.clearTimeout(wsReloadTimerRef.current);
          wsReloadTimerRef.current = window.setTimeout(() => {
            wsReloadTimerRef.current = null;
            if (!searchBootstrapDoneRef.current) return;
            void loadDataRef.current();
          }, 400);
        } else {
          setOrders((current) => {
            const existing = current.find((row) => row.id === incoming.id);
            const withoutExisting = existing ? current.filter((row) => row.id !== incoming.id) : current;
            return [incoming, ...withoutExisting].sort((a, b) => b.orderNumber - a.orderNumber);
          });
        }
        if (message.type === "work_order_created") {
          setNewlyCreatedOrderIds((current) => ({ ...current, [incoming.id]: Date.now() }));
          return;
        }
        setUpdatedOrderIds((current) => ({ ...current, [incoming.id]: Date.now() }));
      };
      ws.onclose = () => {
        if (cancelled) return;
        const delay = Math.min(15_000, 1_000 * 2 ** reconnectAttempt);
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => {
    if (!dialogVisible || pendingFiles.length === 0) return;
    const id = window.setInterval(() => setPendingUiTick((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, [dialogVisible, pendingFiles.length]);

  useEffect(() => {
    if (!selectedAsset) return;
    const stillAllowed = costCenterOptions.some((opt) => opt.value === form.costCenterId);
    if (stillAllowed) return;
    if (selectedAsset.costCenterId && costCenterOptions.some((opt) => opt.value === selectedAsset.costCenterId)) {
      setForm((cur) => ({ ...cur, costCenterId: selectedAsset.costCenterId ?? "" }));
      return;
    }
    setForm((cur) => ({ ...cur, costCenterId: "" }));
  }, [costCenterOptions, form.costCenterId, selectedAsset]);

  useEffect(() => {
    if (!form.classificationId) return;
    const stillAllowed = classificationOptions.some((opt) => opt.value === form.classificationId);
    if (stillAllowed) return;
    setForm((cur) => ({ ...cur, classificationId: "" }));
  }, [classificationOptions, form.classificationId]);

  useEffect(() => {
    if (!form.workgroupId) return;
    const wg = workgroups.find((w) => w.id === form.workgroupId);
    if (!wg || !selectedAsset?.siteId || wg.siteId !== selectedAsset.siteId) {
      setForm((cur) => ({ ...cur, workgroupId: "" }));
    }
  }, [form.workgroupId, selectedAsset?.siteId, workgroups]);

  useEffect(() => {
    if (!dialogVisible || editingId) return;
    const aid = form.assetId;
    if (!aid) return;
    const prev = prevCreateAssetIdForDefaultWgRef.current;
    if (prev === aid) return;
    prevCreateAssetIdForDefaultWgRef.current = aid;
    if (!appParameterDefaultWorkgroupId) return;
    const asset = assets.find((a) => a.id === aid);
    if (!asset) return;
    const defWg = workgroups.find((w) => w.id === appParameterDefaultWorkgroupId);
    if (!defWg || defWg.siteId !== asset.siteId) return;
    setForm((cur) => ({ ...cur, workgroupId: appParameterDefaultWorkgroupId }));
  }, [
    appParameterDefaultWorkgroupId,
    assets,
    dialogVisible,
    editingId,
    form.assetId,
    workgroups,
  ]);

  const updateTabInk = useCallback(() => {
    const host = tabHostRef.current;
    if (!host) return;
    const nav = host.querySelector<HTMLElement>(".p-tabview-nav");
    const active = nav?.querySelector<HTMLElement>("li.p-highlight .p-tabview-nav-link");
    if (!nav || !active) return;
    nav.style.setProperty("--app-ink-x", `${active.offsetLeft}px`);
    nav.style.setProperty("--app-ink-w", `${active.offsetWidth}px`);
  }, []);

  useLayoutEffect(() => {
    if (!dialogVisible) return;
    const raf = requestAnimationFrame(updateTabInk);
    return () => cancelAnimationFrame(raf);
  }, [activeTabIndex, dialogVisible, updateTabInk]);

  useEffect(() => {
    if (!dialogVisible) return;
    window.addEventListener("resize", updateTabInk);
    return () => window.removeEventListener("resize", updateTabInk);
  }, [dialogVisible, updateTabInk]);

  const loadDocuments = useCallback(
    async (orderId: string) => {
      setDocumentsLoading(true);
      try {
        const res = await apiFetch(`/api/work-orders/${orderId}/documents`);
        if (!res.ok) throw new Error("load_documents");
        const data = (await res.json()) as WorkOrderDocument[];
        setDocuments(data);
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("workOrders.documentsLoadError"), life: 6000 });
      } finally {
        setDocumentsLoading(false);
      }
    },
    [t],
  );

  const loadAssignments = useCallback(
    async (orderId: string) => {
      setAssignmentsLoading(true);
      try {
        const res = await apiFetch(`/api/work-orders/${orderId}/assignments`);
        if (!res.ok) throw new Error("load_assignments");
        const data = (await res.json()) as WorkOrderAssignment[];
        setAssignments(data);
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("workOrders.assignmentsLoadError"), life: 6000 });
      } finally {
        setAssignmentsLoading(false);
      }
    },
    [t],
  );

  const editingOrder = useMemo(
    () => (editingId ? orders.find((row) => row.id === editingId) ?? null : null),
    [editingId, orders],
  );

  const loadFeedbackTransactions = useCallback(async (orderId: string) => {
    setFeedbackTransactionsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("workOrderId", orderId);
      params.set("page", "1");
      params.set("limit", "200");
      const res = await apiFetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) {
        setFeedbackTransactions([]);
        return;
      }
      const data = (await res.json()) as { rows: TransactionRow[] };
      setFeedbackTransactions(Array.isArray(data.rows) ? data.rows : []);
      setFeedbackTransactionsLoadedOrderId(orderId);
    } catch {
      setFeedbackTransactions([]);
      setFeedbackTransactionsLoadedOrderId(null);
    } finally {
      setFeedbackTransactionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!dialogVisible || !editingId) return;
    void loadFeedbackTransactions(editingId);
  }, [dialogVisible, editingId, loadFeedbackTransactions]);

  useEffect(() => {
    if (dialogVisible) return;
    setFeedbackTransactions([]);
    setFeedbackTransactionsLoading(false);
    setFeedbackTransactionsLoadedOrderId(null);
  }, [dialogVisible]);

  useEffect(() => {
    if (!dialogVisible) return;
    if (activeTabIndex !== orderDialogTabs.Feedback) return;
    if (!workOrderStatusAllowsFeedbackTab(editingOrder?.status)) {
      setActiveTabIndex(orderDialogTabs.General);
    }
  }, [activeTabIndex, dialogVisible, editingOrder?.status]);

  const postAssignmentsForOrder = useCallback(
    async (
      orderId: string,
      employeeIds: string[],
      opts?: { checkFormSavedWorkgroup?: boolean },
    ): Promise<boolean> => {
      const checkSaved = opts?.checkFormSavedWorkgroup !== false;
      if (checkSaved && editingOrder) {
        const savedWg = (editingOrder.workgroupId ?? "").trim();
        const formWg = form.workgroupId.trim();
        if (formWg !== savedWg) {
          toastRef.current?.show({
            severity: "warn",
            summary: t("workOrders.assignmentsSaveWorkgroupFirst"),
            life: 6500,
          });
          return false;
        }
      }
      const ids = Array.from(new Set(employeeIds.filter(Boolean)));
      if (ids.length === 0) return true;
      for (const employeeId of ids) {
        const res = await apiFetch(`/api/work-orders/${orderId}/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId }),
        });
        if (!res.ok) {
          let code: string | undefined;
          try {
            code = ((await res.json()) as { error?: string }).error;
          } catch {
            /* ignore */
          }
          let msg = t("workOrders.assignmentLockedByStatus");
          if (code === "employee_not_in_workgroup") msg = t("workOrders.employeeNotInWorkgroup");
          if (code === "employee_site_mismatch") msg = t("workOrders.assignmentEmployeeSiteMismatch");
          if (code === "invalid_employee") msg = t("workOrders.assignmentInvalidEmployee");
          toastRef.current?.show({ severity: "warn", summary: msg, life: 5000 });
          return false;
        }
      }
      return true;
    },
    [editingOrder, form.workgroupId, t],
  );

  const addAssignments = useCallback(async () => {
    if (!editingId || assignmentEmployeeIds.length === 0) return;
    if (assignmentAddingRef.current) return;
    assignmentAddingRef.current = true;
    setAssignmentAdding(true);
    try {
      const ok = await postAssignmentsForOrder(editingId, assignmentEmployeeIds, { checkFormSavedWorkgroup: true });
      if (ok) {
        setAssignmentEmployeeIds([]);
        await Promise.all([loadAssignments(editingId), loadData()]);
      }
    } finally {
      assignmentAddingRef.current = false;
      setAssignmentAdding(false);
    }
  }, [assignmentEmployeeIds, editingId, loadAssignments, loadData, postAssignmentsForOrder]);

  useEffect(() => {
    if (!dialogVisible) return;
    if (!editingId) {
      setDocuments([]);
      return;
    }
    void loadDocuments(editingId);
  }, [dialogVisible, editingId, loadDocuments]);

  useEffect(() => {
    if (!dialogVisible || !editingId) {
      setAssignments([]);
      return;
    }
    void loadAssignments(editingId);
  }, [dialogVisible, editingId, loadAssignments]);

  useEffect(() => {
    if (!dialogVisible) {
      prevDialogTabRef.current = null;
      return;
    }
    const prev = prevDialogTabRef.current;
    const onPlanning = activeTabIndex === orderDialogTabs.Planning;
    const enteredPlanning = onPlanning && (prev === null || prev !== orderDialogTabs.Planning);
    if (enteredPlanning) {
      setAssignmentsCascadeSeed((s) => s + 1);
    }
    prevDialogTabRef.current = activeTabIndex;
  }, [dialogVisible, activeTabIndex]);

  const uploadDocument = useCallback(async (orderId: string, doc: PendingDocumentUpload): Promise<boolean> => {
    const fd = new FormData();
    fd.append("file", doc.file, doc.file.name);
    fd.append("displayName", doc.displayName.trim());
    fd.append("category", doc.category);
    const res = await apiFetch(`/api/work-orders/${orderId}/documents`, { method: "POST", body: fd });
    return res.ok;
  }, []);

  const saveOrderCore = useCallback(
    async (forceCreate = false): Promise<string | null> => {
      const name = formRef.current.name.trim();
      const description = formRef.current.description.trim();
      if (
        !name ||
        !formRef.current.assetId ||
        !formRef.current.costCenterId ||
        !formRef.current.plannedStart ||
        !formRef.current.workgroupId.trim()
      ) {
        return null;
      }
      const hoursRaw = formRef.current.plannedDurationHours.trim().replace(",", ".");
      const hoursParsed =
        hoursRaw === ""
          ? null
          : Number.isFinite(Number(hoursRaw)) && Number(hoursRaw) >= 0
            ? Number(hoursRaw)
            : NaN;
      if (Number.isNaN(hoursParsed)) return null;
      const plannedDurationMinutes = hoursParsed == null ? null : Math.round(hoursParsed * 60);
      const payload = {
        name,
        description: description || null,
        assetId: formRef.current.assetId,
        costCenterId: formRef.current.costCenterId,
        plannedStart: formRef.current.plannedStart.toISOString(),
        plannedEnd: formRef.current.plannedEnd ? formRef.current.plannedEnd.toISOString() : null,
        plannedDurationMinutes,
        orderType: formRef.current.orderType,
        responsibleEmployeeId: formRef.current.responsibleEmployeeId || null,
        workgroupId: formRef.current.workgroupId.trim(),
        classificationId: formRef.current.classificationId.trim() || null,
      };
      const isUpdate = editingIdRef.current && !forceCreate;
      const url = isUpdate ? `/api/work-orders/${editingIdRef.current}` : "/api/work-orders";
      const res = await apiFetch(url, {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return null;
      const saved = (await res.json()) as WorkOrder;
      setEditingId(saved.id);
      editingIdRef.current = saved.id;
      return saved.id;
    },
    [],
  );

  const ensureOrderIdForDocumentUpload = useCallback(async (): Promise<string | null> => {
    if (editingIdRef.current) return editingIdRef.current;
    if (orderCreateLockRef.current) return orderCreateLockRef.current;
    const promise = (async () => {
      const id = await saveOrderCore(true);
      if (!id) return null;
      await loadData();
      return id;
    })();
    orderCreateLockRef.current = promise;
    try {
      return await promise;
    } finally {
      orderCreateLockRef.current = null;
    }
  }, [loadData, saveOrderCore]);

  const clearPendingAutoTimer = useCallback((localId: string) => {
    const existing = pendingAutoTimersRef.current.get(localId);
    if (existing) window.clearTimeout(existing);
    pendingAutoTimersRef.current.delete(localId);
  }, []);

  const schedulePendingAutoUpload = useCallback(
    (localId: string) => {
      clearPendingAutoTimer(localId);
      const timer = window.setTimeout(async () => {
        const current = pendingFilesRef.current.find((p) => p.localId === localId);
        if (!current) return;
        setPendingRowUploading((m) => ({ ...m, [localId]: true }));
        try {
          const orderId = await ensureOrderIdForDocumentUpload();
          if (!orderId) {
            toastRef.current?.show({
              severity: "warn",
              summary: t("workOrders.documentsAutoUploadNeedsOrder"),
              life: 5000,
            });
            return;
          }
          const ok = await uploadDocument(orderId, current);
          if (!ok) {
            toastRef.current?.show({ severity: "error", summary: t("workOrders.documentsUploadPartialError"), life: 6000 });
            return;
          }
          setPendingFiles((p) => p.filter((x) => x.localId !== localId));
          await loadDocuments(orderId);
          await loadData();
          toastRef.current?.show({ severity: "success", summary: t("workOrders.documentsAutoUploaded"), life: 2500 });
        } finally {
          setPendingRowUploading((m) => {
            const next = { ...m };
            delete next[localId];
            return next;
          });
        }
      }, PENDING_AUTO_UPLOAD_MS);
      pendingAutoTimersRef.current.set(localId, timer);
    },
    [clearPendingAutoTimer, ensureOrderIdForDocumentUpload, loadData, loadDocuments, t, uploadDocument],
  );

  const openDocumentContent = useCallback(
    async (doc: WorkOrderDocument) => {
      try {
        const url =
          doc.source === "asset"
            ? `/api/assets/${doc.assetId}/documents/${doc.id}/content`
            : `/api/work-orders/${doc.workOrderId}/documents/${doc.id}/content`;
        const res = await apiFetch(url);
        if (!res.ok) throw new Error("open");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const popup = window.open(blobUrl, "_blank", "noopener,noreferrer");
        if (!popup) {
          URL.revokeObjectURL(blobUrl);
          toastRef.current?.show({ severity: "warn", summary: t("workOrders.documentsPopupBlocked"), life: 5000 });
          return;
        }
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("workOrders.documentsOpenError"), life: 6000 });
      }
    },
    [t],
  );

  const deleteDocument = useCallback(
    async (orderId: string, documentId: string) => {
      const res = await apiFetch(`/api/work-orders/${orderId}/documents/${documentId}`, { method: "DELETE" });
      if (!res.ok) {
        toastRef.current?.show({ severity: "error", summary: t("workOrders.documentsDeleteError"), life: 6000 });
        return;
      }
      await Promise.all([loadDocuments(orderId), loadData()]);
      toastRef.current?.show({ severity: "success", summary: t("workOrders.documentsDeleted"), life: 3000 });
    },
    [loadData, loadDocuments, t],
  );

  const saveDocumentEdit = useCallback(async () => {
    if (!documentEdit || !editingId) return;
    const name = documentEditDisplayName.trim();
    if (!name) {
      toastRef.current?.show({ severity: "warn", summary: t("workOrders.documentsDisplayNameRequired"), life: 4000 });
      return;
    }
    setDocumentEditSaving(true);
    try {
      const endpoint =
        documentEdit.source === "asset"
          ? `/api/assets/${documentEdit.assetId}/documents/${documentEdit.id}`
          : `/api/work-orders/${editingId}/documents/${documentEdit.id}`;
      const res = await apiFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, category: documentEditCategory }),
      });
      if (!res.ok) {
        toastRef.current?.show({ severity: "error", summary: t("workOrders.documentsUpdateError"), life: 6000 });
        return;
      }
      setDocumentEdit(null);
      await Promise.all([loadDocuments(editingId), loadData()]);
      toastRef.current?.show({ severity: "success", summary: t("workOrders.documentsUpdated"), life: 3000 });
    } finally {
      setDocumentEditSaving(false);
    }
  }, [documentEdit, documentEditCategory, documentEditDisplayName, editingId, loadData, loadDocuments, t]);

  const openCreate = useCallback(() => {
    prevCreateAssetIdForDefaultWgRef.current = null;
    setEditingId(null);
    setForm(emptyForm());
    setDocuments([]);
    setAssignments([]);
    setAssignmentEmployeeIds([]);
    setPendingFiles([]);
    setDocumentsSearchTerm("");
    setActiveTabIndex(orderDialogTabs.General);
    setFeedbackHours("");
    setFeedbackRemark("");
    setFeedbackPauseRemark("");
    setFeedbackStatusAction("none");
    setFeedbackEntryMode("create");
    setFeedbackAdditionalHours([]);
    setFeedbackTransactions([]);
    setDialogVisible(true);
  }, []);

  const openEdit = useCallback((row: WorkOrder) => {
    setEditingId(row.id);
    setForm({
      orderNumber: row.orderNumber,
      name: row.name,
      description: row.description ?? "",
      assetId: row.assetId,
      costCenterId: row.costCenterId,
      plannedStart: parseIsoDate(row.plannedStart),
      plannedEnd: parseIsoDate(row.plannedEnd),
      plannedDurationHours:
        row.plannedDurationMinutes == null
          ? ""
          : Number.isInteger(row.plannedDurationMinutes / 60)
            ? String(row.plannedDurationMinutes / 60)
            : (row.plannedDurationMinutes / 60).toFixed(2),
      orderType: row.orderType,
      responsibleEmployeeId: row.responsibleEmployeeId ?? "",
      workgroupId: row.workgroupId ?? "",
      classificationId: row.classificationId ?? "",
    });
    setPendingFiles([]);
    setAssignmentEmployeeIds([]);
    setDocumentsSearchTerm("");
    setFeedbackHours("");
    setFeedbackRemark("");
    setFeedbackPauseRemark("");
    setFeedbackStatusAction("none");
    setFeedbackEntryMode("create");
    setFeedbackAdditionalHours([]);
    setFeedbackTransactions([]);
    setActiveTabIndex(orderDialogTabs.General);
    setDialogVisible(true);
  }, []);

  const applyFeedbackEntry = useCallback((row: WorkOrder, mode: FeedbackEntryMode) => {
    setFeedbackEntryMode(mode);
    setFeedbackStatusAction(feedbackStatusActionForEntryMode(mode));
    setFeedbackPauseRemark("");
    setFeedbackHours(computeSegmentHours(row.currentSegmentStartedAt));
    setFeedbackRemark("");
    setFeedbackAdditionalHours([]);
  }, []);

  const openPlanningTab = useCallback((row: WorkOrder) => {
    openEdit(row);
    setActiveTabIndex(orderDialogTabs.Planning);
  }, [openEdit]);

  const openFeedbackTab = useCallback(
    (row: WorkOrder, mode: FeedbackEntryMode = "create") => {
      if (!workOrderStatusAllowsFeedbackTab(row.status)) return;
      openEdit(row);
      applyFeedbackEntry(row, mode);
      setActiveTabIndex(orderDialogTabs.Feedback);
    },
    [applyFeedbackEntry, openEdit],
  );

  const openDocumentsTab = useCallback(
    (row: WorkOrder) => {
      openEdit(row);
      setActiveTabIndex(orderDialogTabs.Documents);
    },
    [openEdit],
  );

  const updatePlannedDuration = useCallback((hours: number | null) => {
    setForm((cur) => {
      const plannedStart = cur.plannedStart ?? new Date();
      const plannedEnd =
        hours == null ? cur.plannedEnd : new Date(plannedStart.getTime() + hours * 60 * 60 * 1000);
      return {
        ...cur,
        plannedDurationHours: hours == null ? "" : formatHoursForInput(hours),
        plannedEnd,
      };
    });
  }, []);

  const showSaveError = async (res: Response) => {
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string };
      code = body.error;
    } catch {
      /* ignore */
    }
    let detail = t("workOrders.saveError");
    if (code === "invalid_asset") detail = t("workOrders.invalidAsset");
    if (code === "invalid_cost_center") detail = t("workOrders.invalidCostCenter");
    if (code === "invalid_classification") detail = t("workOrders.invalidClassification");
    if (code === "asset_cost_center_mismatch") detail = t("workOrders.assetCostCenterMismatch");
    if (code === "invalid_responsible_employee") detail = t("workOrders.responsiblePlaceholder");
    if (code === "responsible_employee_site_mismatch") detail = t("workOrders.assignmentEmployeeSiteMismatch");
    if (code === "invalid_workgroup") detail = t("workOrders.invalidWorkgroup");
    if (code === "responsible_employee_not_in_workgroup") {
      detail = t("workOrders.responsibleEmployeeNotInWorkgroup");
    }
    if (code === "employee_not_in_workgroup") detail = t("workOrders.employeeNotInWorkgroup");
    if (code === "assignments_incompatible_with_workgroup") {
      detail = t("workOrders.assignmentsIncompatibleWithWorkgroup");
    }
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const name = form.name.trim();
    const description = form.description.trim();
    if (!name || !form.assetId || !form.costCenterId || !form.plannedStart || !form.workgroupId.trim()) {
      toastRef.current?.show({ severity: "warn", summary: t("workOrders.validationRequired"), life: 4000 });
      return;
    }
    if (name.length > 200 || description.length > 2000) {
      toastRef.current?.show({ severity: "warn", summary: t("workOrders.validationLength"), life: 4000 });
      return;
    }
    const hoursRaw = form.plannedDurationHours.trim().replace(",", ".");
    const hours =
      hoursRaw === ""
        ? null
        : Number.isFinite(Number(hoursRaw)) && Number(hoursRaw) >= 0
          ? Number(hoursRaw)
          : NaN;
    if (Number.isNaN(hours)) {
      toastRef.current?.show({ severity: "warn", summary: t("workOrders.validationDuration"), life: 4000 });
      return;
    }
    const plannedDurationMinutes = hours == null ? null : Math.round(hours * 60);
    setSaving(true);
    try {
      const payload = {
        name,
        description: description || null,
        assetId: form.assetId,
        costCenterId: form.costCenterId,
        plannedStart: form.plannedStart.toISOString(),
        plannedEnd: form.plannedEnd ? form.plannedEnd.toISOString() : null,
        plannedDurationMinutes,
        orderType: form.orderType,
        responsibleEmployeeId: form.responsibleEmployeeId || null,
        workgroupId: form.workgroupId.trim(),
        classificationId: form.classificationId.trim() || null,
      };
      const url = editingId ? `/api/work-orders/${editingId}` : "/api/work-orders";
      const res = await apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        await showSaveError(res);
        return;
      }
      const saved = (await res.json()) as WorkOrder;
      setNewlyCreatedOrderIds((current) => ({ ...current, [saved.id]: Date.now() }));
      const pendingAssignIds = Array.from(new Set(assignmentEmployeeIds.filter(Boolean)));
      if (pendingAssignIds.length > 0) {
        const assignOk = await postAssignmentsForOrder(saved.id, pendingAssignIds, {
          checkFormSavedWorkgroup: false,
        });
        if (!assignOk) {
          return;
        }
        setAssignmentEmployeeIds([]);
        await loadAssignments(saved.id);
      }
      if (pendingFiles.length > 0) {
        setUploading(true);
        try {
          const uploads = await Promise.all(pendingFiles.map((doc) => uploadDocument(saved.id, doc)));
          if (uploads.some((ok) => !ok)) {
            toastRef.current?.show({ severity: "warn", summary: t("workOrders.documentsUploadPartialError"), life: 5000 });
          } else {
            toastRef.current?.show({ severity: "success", summary: t("workOrders.documentsUploaded"), life: 3000 });
          }
        } finally {
          setUploading(false);
        }
      }
      setDialogVisible(false);
      setPendingFiles([]);
      await loadData();
      toastRef.current?.show({
        severity: "success",
        summary: editingId ? t("workOrders.saved") : t("workOrders.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("workOrders.saveError"), life: 6000 });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/work-orders/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedOrder((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({ severity: "success", summary: t("workOrders.deleted"), life: 3000 });
          return;
        }
        toastRef.current?.show({ severity: "error", summary: t("workOrders.deleteError"), life: 6000 });
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("workOrders.deleteError"), life: 6000 });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: WorkOrder) => {
      confirmDialog({
        message: t("workOrders.confirmDelete", { name: row.name }),
        header: t("workOrders.confirmDeleteTitle"),
        icon: <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />,
        acceptClassName: "p-button-danger",
        acceptLabel: t("workOrders.yes"),
        rejectLabel: t("workOrders.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("workOrders.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedOrder}
            onClick={() => {
              if (selectedOrder) openEdit(selectedOrder);
            }}
          >
            <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("workOrders.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedOrder}
            onClick={() => {
              if (selectedOrder) confirmDelete(selectedOrder);
            }}
          >
            <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("workOrders.delete")}</span>
          </button>
        </li>
        <li className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className={primaryActionNavItem}
            onClick={() => {
              setPanelDraft(appliedAdvanced);
              setSearchPanelVisible(true);
            }}
          >
            <Filter className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("workOrders.searchPanel.open")}</span>
          </button>
          {searchPresets.length > 0 ? (
            <Dropdown
              aria-label={t("workOrders.searchPresets.headerLabel")}
              value={headerPresetSelectionId}
              options={headerPresetDropdownOptions}
              optionLabel="label"
              optionValue="value"
              placeholder={t("workOrders.searchPresets.placeholder")}
              showClear
              onChange={(e) => void applyHeaderSearchPreset((e.value as string | null) ?? null)}
              className="app-header-preset-dropdown app-inline-icon-dropdown h-9 min-w-[16rem] w-72 shrink-0 text-sm"
              panelClassName="app-header-preset-dropdown-panel"
              appendTo={overlayAppendTo}
            />
          ) : null}
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("workOrders.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [
    appliedAdvanced,
    applyHeaderSearchPreset,
    confirmDelete,
    headerPresetDropdownOptions,
    headerPresetSelectionId,
    openCreate,
    openEdit,
    searchPresets.length,
    searchTerm,
    selectedOrder,
    setHeaderActions,
    t,
  ]);

  const formatShortDt = useCallback(
    (iso: string) => {
      try {
        return new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
      } catch {
        return iso;
      }
    },
    [i18n.language],
  );

  const typeLabel = useCallback(
    (value: WorkOrderType) => t(`workOrders.typeValues.${value}`),
    [t],
  );
  const calendarDateFormat = i18n.language?.toLowerCase().startsWith("de") ? "dd.mm.yy" : "mm/dd/yy";

  const orderTypeOptions = useMemo(
    () =>
      typeOrder.map((type) => ({
        label: typeLabel(type),
        value: type,
      })),
    [typeLabel],
  );

  const durationBody = (row: WorkOrder) =>
    row.plannedDurationMinutes == null ? (
      <span className="text-on-surface-variant">—</span>
    ) : (
      `${(row.plannedDurationMinutes / 60).toLocaleString(i18n.language, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })} h`
    );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handlePickFiles = (ev: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(ev.target.files ?? []);
    if (incoming.length === 0) return;
    const next = incoming.map((file) => ({
      localId: newPendingLocalId(),
      addedAt: Date.now(),
      file,
      displayName: file.name,
      category: "general" as AssetDocumentCategory,
    }));
    setPendingFiles((cur) => [...cur, ...next]);
    next.forEach((doc) => schedulePendingAutoUpload(doc.localId));
    ev.target.value = "";
  };

  const removePendingFileByLocalId = (localId: string) => {
    clearPendingAutoTimer(localId);
    setPendingFiles((cur) => cur.filter((p) => p.localId !== localId));
  };

  const referencesBody = (row: WorkOrder) => {
    const ownDocuments = row.documentCount;
    const assetDocuments = row.assetDocumentCount;
    const totalDocuments = ownDocuments + assetDocuments;
    const hasDocuments = totalDocuments > 0;
    const isAssetOnly = ownDocuments === 0 && assetDocuments > 0;
    const badgeValue = hasDocuments ? String(totalDocuments) : undefined;
    const badgeClassName = hasDocuments ? "!bg-slate-900 !text-white !shadow-none !min-w-[1.1rem] !h-4 !text-[10px] !leading-4 !p-0" : undefined;
    const assignedCount = row.assignedEmployeeCount ?? 0;
    const hasAssignments = assignedCount > 0;
    const assignmentsBadge = hasAssignments ? String(assignedCount) : undefined;
    const assignmentsBadgeClassName = hasAssignments
      ? "!bg-slate-900 !text-white !shadow-none !min-w-[1.1rem] !h-4 !text-[10px] !leading-4 !p-0"
      : undefined;
    const assignmentsTitle = hasAssignments
      ? t("workOrders.assignmentsReferenceTitle", { count: assignedCount })
      : t("workOrders.assignmentsReference");
    const documentsTitle = hasDocuments
      ? t("workOrders.references")
      : t("workOrders.referencesOpenDocumentsTab");
    return (
      <div className="flex items-center gap-1">
        <Button
          type="button"
          icon={<File className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
          badge={badgeValue}
          badgeClassName={badgeClassName}
          className={`h-7 w-7 !rounded-[0.5rem] !p-0 ${
            hasDocuments
              ? isAssetOnly
                ? "app-ref-button--documents-asset"
                : "app-ref-button--documents"
              : "app-ref-button--documents-inactive"
          }`}
          onClick={() => openDocumentsTab(row)}
          aria-label={documentsTitle}
          title={documentsTitle}
        />
        <Button
          type="button"
          icon={<UserPlus className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
          badge={assignmentsBadge}
          badgeClassName={assignmentsBadgeClassName}
          className={`h-7 w-7 !rounded-[0.5rem] !p-0 ${
            hasAssignments ? "app-ref-button--employees" : "app-ref-button--employees-empty"
          }`}
          onClick={() => openPlanningTab(row)}
          aria-label={assignmentsTitle}
          title={assignmentsTitle}
        />
      </div>
    );
  };

  const statusLabel = useCallback((status: WorkOrderStatus) => t(`workOrders.statusValues.${status}`), [t]);

  const statusBody = useCallback((row: WorkOrder) => statusLabel(row.status), [statusLabel]);

  const statusCellClassName = useCallback((row: WorkOrder) => `app-wo-status-cell app-wo-status-${row.status}`, []);

  const startOrder = useCallback(
    async (row: WorkOrder) => {
      const res = await apiFetch(`/api/work-orders/${row.id}/start`, { method: "POST" });
      if (!res.ok) {
        toastRef.current?.show({ severity: "warn", summary: t("workOrders.cannotStartFromStatus"), life: 4000 });
        return;
      }
      await loadData();
    },
    [loadData, t],
  );

  const cancelWorkOrder = useCallback(
    async (row: WorkOrder) => {
      try {
        const res = await apiFetch(`/api/work-orders/${row.id}/cancel`, { method: "POST" });
        if (!res.ok) {
          let code: string | undefined;
          try {
            code = ((await res.json()) as { error?: string }).error;
          } catch {
            /* ignore */
          }
          const msg =
            code === "cannot_cancel_from_status"
              ? t("workOrders.cannotCancelFromStatus")
              : t("workOrders.cancelError");
          toastRef.current?.show({ severity: "warn", summary: msg, life: 5000 });
          return;
        }
        const updated = (await res.json()) as WorkOrder;
        setSelectedOrder((cur) => (cur?.id === updated.id ? updated : cur));
        await loadData();
        toastRef.current?.show({ severity: "success", summary: t("workOrders.cancelled"), life: 3000 });
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("workOrders.cancelError"), life: 6000 });
      }
    },
    [loadData, t],
  );

  const confirmCancelWorkOrder = useCallback(
    (row: WorkOrder) => {
      confirmDialog({
        message: t("workOrders.confirmCancel", { name: row.name }),
        header: t("workOrders.confirmCancelTitle"),
        icon: <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />,
        acceptClassName: "p-button-danger",
        acceptLabel: t("workOrders.yes"),
        rejectLabel: t("workOrders.no"),
        accept: () => void cancelWorkOrder(row),
      });
    },
    [cancelWorkOrder, t],
  );

  const saveFeedback = useCallback(async () => {
    if (!editingId) return;
    const hoursRaw = feedbackHours.trim().replace(",", ".");
    const hours =
      hoursRaw === "" ? NaN : Number.isFinite(Number(hoursRaw)) && Number(hoursRaw) > 0 ? Number(hoursRaw) : NaN;
    if (Number.isNaN(hours)) {
      toastRef.current?.show({ severity: "warn", summary: t("workOrders.feedbackHoursInvalid"), life: 4000 });
      return;
    }
    if (feedbackRemark.length > 2000) {
      toastRef.current?.show({ severity: "warn", summary: t("workOrders.feedbackRemarkTooLong"), life: 4000 });
      return;
    }
    if (feedbackStatusAction === "pause" && !feedbackPauseRemark.trim()) {
      toastRef.current?.show({ severity: "warn", summary: t("workOrders.feedbackPauseRemarkRequired"), life: 4000 });
      return;
    }
    const additionalHours: { employeeId: string; hours: number }[] = [];
    for (const row of feedbackAdditionalHours) {
      if (!row.employeeId.trim()) continue;
      const raw = row.hours.trim().replace(",", ".");
      const value = raw === "" ? NaN : Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        toastRef.current?.show({ severity: "warn", summary: t("workOrders.feedbackAdditionalHoursInvalid"), life: 4000 });
        return;
      }
      additionalHours.push({ employeeId: row.employeeId, hours: value });
    }
    setFeedbackSaving(true);
    try {
      const res = await apiFetch(`/api/work-orders/${editingId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours,
          remark: feedbackRemark.trim() || null,
          statusAction: feedbackStatusAction,
          pauseRemark: feedbackStatusAction === "pause" ? feedbackPauseRemark.trim() : null,
          additionalHours,
        }),
      });
      if (!res.ok) {
        let code: string | undefined;
        try {
          code = ((await res.json()) as { error?: string }).error;
        } catch {
          /* ignore */
        }
        const msg =
          code === "cannot_feedback_from_status"
            ? t("workOrders.cannotFeedbackFromStatus")
            : code === "pause_remark_required"
              ? t("workOrders.pauseRemarkRequired")
              : code === "duplicate_feedback_employee"
                ? t("workOrders.duplicateFeedbackEmployee")
                : code === "invalid_additional_hours"
                  ? t("workOrders.invalidAdditionalHours")
                  : code === "invalid_body"
                    ? t("workOrders.feedbackInvalidBody")
                    : t("workOrders.feedbackSaveError");
        toastRef.current?.show({ severity: "error", summary: msg, life: 6000 });
        return;
      }
      const updated = (await res.json()) as WorkOrder;
      setSelectedOrder((cur) => (cur?.id === updated.id ? updated : cur));
      await loadData();
      setFeedbackHours("");
      setFeedbackRemark("");
      setFeedbackPauseRemark("");
      setFeedbackStatusAction("none");
      setFeedbackAdditionalHours([]);
      setDialogVisible(false);
      toastRef.current?.show({ severity: "success", summary: t("workOrders.feedbackSaved"), life: 3000 });
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("workOrders.feedbackSaveError"), life: 6000 });
    } finally {
      setFeedbackSaving(false);
    }
  }, [
    editingId,
    feedbackAdditionalHours,
    feedbackHours,
    feedbackPauseRemark,
    feedbackRemark,
    feedbackStatusAction,
    loadData,
    t,
  ]);

  const workOrderContextMenuExtraItems = useCallback(
    (row: WorkOrder | null) => {
      if (!row) return [];
      const canOpenFeedbackTab = workOrderStatusAllowsFeedbackTab(row.status);
      const canCancel = row.status !== "ended" && row.status !== "done" && row.status !== "cancelled";
      return [
        {
          label: t("workOrders.contextMenuAssignEmployees"),
          icon: <UserPlus className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
          disabled: row.status === "ended" || row.status === "done" || row.status === "cancelled",
          command: () => openPlanningTab(row),
        },
        {
          label: t("workOrders.contextMenuCreateFeedback"),
          icon: <Send className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
          disabled: !canOpenFeedbackTab,
          command: () => openFeedbackTab(row, "create"),
        },
        {
          label: t("workOrders.contextMenuCancelOrder"),
          icon: <CircleX className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
          disabled: !canCancel,
          command: () => confirmCancelWorkOrder(row),
        },
      ];
    },
    [confirmCancelWorkOrder, openFeedbackTab, openPlanningTab, t],
  );

  const atheneContextMenuItems = useCallback(
    (row: WorkOrder | null) => [
      {
        label: t("assistant.askAthene"),
        className: "app-context-menu-athene",
        icon: athene.busy ? (
          <LucideSpinner className={lucidePrimeBtnIcon} strokeWidth={1.75} />
        ) : (
          <MessageCircle className={lucidePrimeBtnIcon} strokeWidth={1.75} />
        ),
        disabled: !row || athene.busy,
        command: () => {
          if (!row) return;
          athene.openWithContext({
            type: "workOrder",
            id: row.id,
            label: `#${row.orderNumber} - ${row.name}`,
            data: {
              source: "monitoring",
              orderNumber: row.orderNumber,
              name: row.name,
              status: row.status,
              siteId: row.siteId,
              siteKey: row.siteKey,
              assetId: row.assetId,
              assetKey: row.assetKey,
              documentCount: row.documentCount,
              assetDocumentCount: row.assetDocumentCount,
              documentReferenceSource:
                row.documentCount > 0
                  ? "workOrderDocumentsPresent_blueIcon"
                  : row.assetDocumentCount > 0
                    ? "assetOnlyDocuments_greenIcon"
                    : "noDocuments_inactiveSoftBlueIcon",
            },
          });
        },
      },
    ],
    [athene, t],
  );

  const tableCtx = useTableContextMenu<WorkOrder>({
    labels: { new: t("workOrders.new"), edit: t("workOrders.edit"), delete: t("workOrders.delete") },
    handlers: { onCreate: openCreate, onEdit: openEdit, onDelete: confirmDelete },
    selection: selectedOrder,
    setSelection: setSelectedOrder,
    leadingItems: atheneContextMenuItems,
    extraItems: workOrderContextMenuExtraItems,
  });

  const removeAssignment = useCallback(
    async (employeeId: string) => {
      if (!editingId) return;
      const res = await apiFetch(`/api/work-orders/${editingId}/assignments/${employeeId}`, { method: "DELETE" });
      if (!res.ok) {
        toastRef.current?.show({ severity: "warn", summary: t("workOrders.assignmentLockedByStatus"), life: 5000 });
        return;
      }
      await Promise.all([loadAssignments(editingId), loadData()]);
    },
    [editingId, loadAssignments, loadData, t],
  );

  const startStopBody = useCallback(
    (row: WorkOrder) => {
      if (["open", "assigned", "paused"].includes(row.status)) {
        return (
          <Button
            type="button"
            text
            className="app-wo-start-action !h-7 !min-h-7 !w-7 !min-w-7 !p-0"
            icon={<AppPlayStartIcon />}
            title={t("workOrders.start")}
            aria-label={t("workOrders.start")}
            onClick={() => void startOrder(row)}
          />
        );
      }
      if (row.status === "started" || row.status === "continued") {
        return (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              text
              className="app-wo-stop-action !h-7 !min-h-7 !w-7 !min-w-7 !p-0"
              icon={<AppSquareStopIcon />}
              title={t("workOrders.stop")}
              aria-label={t("workOrders.stop")}
              onClick={() => openFeedbackTab(row, "stop")}
            />
            <Button
              type="button"
              text
              className="!h-7 !min-h-7 !w-7 !min-w-7 !p-0"
              icon={<AppPauseIcon />}
              title={t("workOrders.pause")}
              aria-label={t("workOrders.pause")}
              onClick={() => openFeedbackTab(row, "pause")}
            />
          </div>
        );
      }
      return null;
    },
    [openFeedbackTab, startOrder, t],
  );

  const dialogHeaderIcons = useMemo(() => {
    if (!editingId || !editingOrder) return null;
    const row = editingOrder;
    if (["open", "assigned", "paused"].includes(row.status)) {
      return (
        <div className="mr-1 flex items-center gap-1">
          <Button
            type="button"
            text
            rounded
            className="!h-8 !min-h-8 !w-8 !min-w-8 !p-0"
            icon={<AppPlayStartIcon />}
            title={t("workOrders.start")}
            aria-label={t("workOrders.start")}
            onClick={() => void startOrder(row)}
          />
        </div>
      );
    }
    if (row.status === "started" || row.status === "continued") {
      return (
        <div className="mr-1 flex items-center gap-1">
          <Button
            type="button"
            text
            rounded
            className="app-wo-stop-action !h-8 !min-h-8 !w-8 !min-w-8 !p-0"
            icon={<AppSquareStopIcon />}
            title={t("workOrders.stop")}
            aria-label={t("workOrders.stop")}
            onClick={() => openFeedbackTab(row, "stop")}
          />
          <Button
            type="button"
            text
            rounded
            className="!h-8 !min-h-8 !w-8 !min-w-8 !p-0"
            icon={<AppPauseIcon />}
            title={t("workOrders.pause")}
            aria-label={t("workOrders.pause")}
            onClick={() => openFeedbackTab(row, "pause")}
          />
        </div>
      );
    }
    return null;
  }, [editingId, editingOrder, openFeedbackTab, startOrder, t]);

  const reportingEmployeeLabel = useMemo(() => {
    const parts = [user.employeeKey, user.employeeName]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
    return parts.length ? parts.join(" — ") : t("workOrders.feedbackReportingEmployeeEmpty");
  }, [t, user.employeeKey, user.employeeName]);

  const feedbackAdditionalEmployeeOptions = useMemo(
    () => employeeOptions.filter((opt) => opt.value !== user.employeeId),
    [employeeOptions, user.employeeId],
  );

  const isFeedbackTab = activeTabIndex === orderDialogTabs.Feedback;
  const documentsTabCount = (editingId ? documents.length : 0) + pendingFiles.length;
  const assignmentsTabCount = assignments.length + assignmentEmployeeIds.length;
  const feedbackTabCount = Number(
    Boolean(
      feedbackHours.trim() ||
        feedbackRemark.trim() ||
        feedbackPauseRemark.trim() ||
        feedbackStatusAction !== "none" ||
        feedbackAdditionalHours.length > 0,
    ),
  );
  const transactionsTabCount =
    feedbackTransactionsLoadedOrderId === editingId
      ? feedbackTransactions.length
      : (editingOrder?.transactionCount ?? 0);

  const dialogFooter = useMemo(
    () => (
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          label={t("workOrders.cancel")}
          severity="secondary"
          outlined
          disabled={saving || (isFeedbackTab && feedbackSaving)}
          onClick={() => setDialogVisible(false)}
        />
        <Button
          type="button"
          label={isFeedbackTab ? t("workOrders.reportBackAndSave") : t("workOrders.save")}
          icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
          loading={isFeedbackTab ? feedbackSaving : saving}
          disabled={
            isFeedbackTab
              ? feedbackSaving || !editingId || editingOrder?.status === "done"
              : saving
          }
          onClick={() => void (isFeedbackTab ? saveFeedback() : save())}
        />
      </div>
    ),
    [editingId, editingOrder?.status, feedbackSaving, isFeedbackTab, save, saveFeedback, saving, t],
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />
      <WorkOrderSearchPanel
        visible={searchPanelVisible}
        onHide={() => setSearchPanelVisible(false)}
        value={panelDraft}
        onChange={setPanelDraft}
        onApply={() => {
          setAppliedAdvanced(panelDraft);
          setSearchPanelVisible(false);
        }}
        onReset={() => {
          setAppliedAdvanced(emptyWorkOrderAdvancedSearch());
          setPanelDraft(emptyWorkOrderAdvancedSearch());
        }}
        siteOptions={searchSiteOptions}
        assetOptions={searchAssetOptions}
        costCenterOptions={searchCostCenterOptions}
        classificationOptions={searchClassificationOptions}
        workgroupOptions={searchWorkgroupOptions}
        employeeOptions={searchEmployeeOptions}
        userOptions={searchUserOptions}
        typeOrder={typeOrder}
        typeLabel={(code) => typeLabel(code as WorkOrderType)}
        statusLabel={(code) => statusLabel(code as WorkOrderStatus)}
        calendarDateFormat={calendarDateFormat}
        quickSearchForSave={searchTerm}
        appliedSearchForSave={appliedAdvanced}
        cleverSearchEnabled={cleverSearchEnabled}
        onSaveSearchPreset={async (name, payload) => {
          await createWorkOrderSearchPreset(name, payload);
          toastRef.current?.show({
            severity: "success",
            summary: t("workOrders.searchPresets.saveSuccess"),
            life: 4000,
          });
          await loadSearchPresets();
        }}
      />
      <ConfirmDialog />
      <WorkOrderOverviewOverlay ref={overview.panelRef} order={overviewOrder} onHide={overview.onHide} />
      {!isPreloadMode ? tableCtx.ContextMenuEl : null}

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        onPointerDownCapture={handleTablePointerDownCapture}
        {...(!isPreloadMode ? tableCtx.wrapperProps : {})}
      >
        <DataTable
          className="app-data-table app-work-orders-data-grid w-full"
          value={tableRows}
          loading={loading}
          dataKey="id"
          selection={selectedOrder}
          onSelectionChange={(e) => {
            if (isPreloadMode) return;
            const next = e.value as WorkOrder | null;
            selectedOrderRef.current = next;
            setSelectedOrder(next);
            applyCleverSearchFromOrder(next);
          }}
          onRowDoubleClick={(e) => {
            if (isPreloadMode) return;
            openEdit(e.data as WorkOrder);
          }}
          onRowClick={(e) => {
            if (isPreloadMode) return;
            overview.onRowClick(e);
          }}
          {...(!isPreloadMode ? tableCtx.tableProps : {})}
          selectionMode="single"
          metaKeySelection={false}
          stripedRows
          showGridlines
          scrollable
          resizableColumns
          reorderableColumns
          columnResizeMode="expand"
          scrollHeight="flex"
          tableStyle={{ minWidth: "94rem" }}
          stateStorage="local"
          stateKey="athene-monitoring-table"
          virtualScrollerOptions={virtualScrollerOptions}
          emptyMessage={t("workOrders.empty")}
          rowClassName={(row) =>
            newlyCreatedOrderIds[(row as WorkOrder).id]
              ? "app-monitoring-new-row"
              : updatedOrderIds[(row as WorkOrder).id]
                ? "app-monitoring-updated-row"
                : ""
          }
        >
          <Column
            field="orderNumber"
            header={t("workOrders.orderNumber")}
            sortable={!isPreloadMode}
            body={(row: WorkOrder) => (isPreloadMode ? "…" : row.orderNumber)}
          />
          <Column field="name" header={t("workOrders.name")} sortable={!isPreloadMode} />
          <Column
            field="status"
            header={t("workOrders.status")}
            sortable={!isPreloadMode}
            body={statusBody}
            bodyClassName={statusCellClassName}
          />
          <Column
            field="assetName"
            header={t("workOrders.asset")}
            sortable={!isPreloadMode}
            body={(row: WorkOrder) => `${row.assetKey} - ${row.assetName}`}
          />
          <Column
            field="costCenterName"
            header={t("workOrders.costCenter")}
            sortable={!isPreloadMode}
            body={(row: WorkOrder) => `${row.costCenterKey} - ${row.costCenterName}`}
          />
          <Column
            field="classificationName"
            header={t("workOrders.classification")}
            sortable={!isPreloadMode}
            body={(row: WorkOrder) =>
              row.classificationId ? `${row.classificationKey} - ${row.classificationName ?? ""}` : "—"
            }
          />
          <Column
            field="workgroupKey"
            header={t("workOrders.workgroup")}
            sortable={!isPreloadMode}
            body={(row: WorkOrder) =>
              row.workgroupKey ? `${row.workgroupKey} - ${row.workgroupName ?? ""}` : "—"
            }
          />
          <Column
            field="documentCount"
            header={t("workOrders.references")}
            body={referencesBody}
            sortable={!isPreloadMode}
            style={{ width: "7rem", minWidth: "7rem", maxWidth: "7rem" }}
          />
          <Column
            field="orderType"
            header={t("workOrders.orderType")}
            sortable={!isPreloadMode}
            body={(row: WorkOrder) => typeLabel(row.orderType)}
          />
          <Column
            field="plannedStart"
            header={t("workOrders.plannedStart")}
            sortable={!isPreloadMode}
            body={(row: WorkOrder) => formatShortDt(row.plannedStart)}
            className="whitespace-nowrap"
          />
          <Column
            field="plannedEnd"
            header={t("workOrders.plannedEnd")}
            sortable={!isPreloadMode}
            body={(row: WorkOrder) => formatShortDt(row.plannedEnd)}
            className="whitespace-nowrap"
          />
          <Column columnKey="plannedDuration" header={t("workOrders.plannedDuration")} body={durationBody} />
          <Column
            columnKey="startStop"
            header={t("workOrders.startStop")}
            body={startStopBody}
            style={{ width: "7.5rem", minWidth: "7.5rem" }}
          />
        </DataTable>
      </div>

      <Dialog
        header={
          <WorkOrderDialogTitle
            orderNumber={editingId ? (editingOrder?.orderNumber ?? form.orderNumber) : null}
            status={editingOrder?.status}
            isCreate={!editingId}
          />
        }
        icons={dialogHeaderIcons}
        visible={dialogVisible}
        className="app-big-modal-window app-tabbed-modal-window"
        onHide={() => setDialogVisible(false)}
        onShow={updateTabInk}
        footer={dialogFooter}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        <div ref={tabHostRef} className="app-tabview-with-ink">
          <TabView
            className="app-sticky-tabs"
            activeIndex={activeTabIndex}
            onTabChange={(e) => {
              const idx = e.index;
              if (idx === orderDialogTabs.Feedback && !workOrderStatusAllowsFeedbackTab(editingOrder?.status)) {
                return;
              }
              if (
                idx === orderDialogTabs.General ||
                idx === orderDialogTabs.Planning ||
                idx === orderDialogTabs.Documents ||
                idx === orderDialogTabs.Feedback ||
                idx === orderDialogTabs.Transactions
              ) {
                setActiveTabIndex(idx as OrderDialogTab);
              }
            }}
          >
            <TabPanel header={t("workOrders.tabGeneral")}>
        <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-6" style={{ margin: 0, display: "grid" }}>
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="order-number" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.orderNumber")}
            </label>
            <InputText id="order-number" value={form.orderNumber ? String(form.orderNumber) : t("workOrders.autoNumberHint")} disabled className="w-full" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="order-status" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.status")}
            </label>
            <InputText
              id="order-status"
              disabled
              value={statusLabel(editingOrder?.status ?? "open")}
              className={`w-full app-wo-status-input app-wo-status-${editingOrder?.status ?? "open"}`}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="order-type" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.orderType")}
              <span className="app-required-marker" aria-hidden>*</span>
            </label>
            <Dropdown
              inputId="order-type"
              value={form.orderType}
              options={orderTypeOptions}
              onChange={(e) => setForm((cur) => ({ ...cur, orderType: e.value as WorkOrderType }))}
              className="w-full app-inline-icon-dropdown"
              appendTo={overlayAppendTo}
            />
          </div>

          <div className="space-y-2 md:col-span-6">
            <label htmlFor="order-name" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.name")}
              <span className="app-required-marker" aria-hidden>*</span>
            </label>
            <InputText
              id="order-name"
              value={form.name}
              maxLength={200}
              onChange={(e) => setForm((cur) => ({ ...cur, name: e.target.value }))}
              className="w-full"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2 md:col-span-6">
            <label htmlFor="order-description" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.description")}
            </label>
            <textarea
              id="order-description"
              value={form.description}
              maxLength={2000}
              onChange={(e) => setForm((cur) => ({ ...cur, description: e.target.value }))}
              className="w-full p-inputtext p-component min-h-28 resize-y"
            />
            <div className="text-xs text-on-surface-variant text-right">
              {t("workOrders.descriptionCounter", { count: form.description.length, max: 2000 })}
            </div>
          </div>

          <div className="space-y-2 md:col-span-3">
            <label htmlFor="order-asset" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.asset")}
              <span className="app-required-marker" aria-hidden>*</span>
            </label>
            <Dropdown
              inputId="order-asset"
              value={form.assetId}
              options={assetOptions}
              onChange={(e) => {
                const nextAssetId = String(e.value ?? "");
                setForm((cur) => ({ ...cur, assetId: nextAssetId }));
              }}
              placeholder={t("workOrders.assetPlaceholder")}
              className="w-full app-inline-icon-dropdown"
              filter
              appendTo={overlayAppendTo}
            />
          </div>

          <div className="space-y-2 md:col-span-3">
            <label htmlFor="order-cost-center" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.costCenter")}
              <span className="app-required-marker" aria-hidden>*</span>
            </label>
            <Dropdown
              inputId="order-cost-center"
              value={form.costCenterId}
              options={costCenterOptions}
              onChange={(e) => setForm((cur) => ({ ...cur, costCenterId: String(e.value ?? "") }))}
              placeholder={t("workOrders.costCenterPlaceholder")}
              className="w-full app-inline-icon-dropdown"
              disabled={!form.assetId}
              filter
              appendTo={overlayAppendTo}
            />
          </div>

          <div className="space-y-2 md:col-span-6">
            <label htmlFor="order-classification" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.classification")}
            </label>
            <Dropdown
              inputId="order-classification"
              value={form.classificationId || null}
              options={classificationOptions}
              onChange={(e) => setForm((cur) => ({ ...cur, classificationId: String(e.value ?? "") }))}
              placeholder={t("workOrders.classificationPlaceholder")}
              className="w-full app-inline-icon-dropdown"
              disabled={!form.assetId}
              filter
              showClear
              appendTo={overlayAppendTo}
            />
          </div>

          <div className="space-y-2 md:col-span-6">
            <label htmlFor="order-workgroup" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.workgroup")}
              <span className="app-required-marker" aria-hidden>*</span>
            </label>
            <Dropdown
              inputId="order-workgroup"
              value={form.workgroupId || null}
              options={workgroupOptions}
              onChange={(e) => setForm((cur) => ({ ...cur, workgroupId: String(e.value ?? "") }))}
              placeholder={t("workOrders.workgroupPlaceholder")}
              className="w-full app-inline-icon-dropdown"
              filter
              disabled={!form.assetId}
              appendTo={overlayAppendTo}
            />
          </div>

          <div className="space-y-2 md:col-span-6">
            <label htmlFor="order-responsible" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.responsible")}
            </label>
            <Dropdown
              inputId="order-responsible"
              value={form.responsibleEmployeeId || null}
              options={employeeOptions}
              onChange={(e) => setForm((cur) => ({ ...cur, responsibleEmployeeId: String(e.value ?? "") }))}
              placeholder={t("workOrders.responsiblePlaceholder")}
              className="w-full app-inline-icon-dropdown"
              showClear
              filter
              appendTo={overlayAppendTo}
            />
          </div>
        </div>
            </TabPanel>
            <TabPanel
              header={
                <span className="inline-flex items-center gap-2">
                  <span>{t("workOrders.tabPlandaten")}</span>
                  {assignmentsTabCount > 0 ? <Badge value={assignmentsTabCount} /> : null}
                </span>
              }
            >
              <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2" style={{ margin: 0, display: "grid" }}>
                <div
                  className="grid w-full max-w-full grid-cols-1 gap-4 overflow-hidden md:col-span-2 md:grid-cols-3"
                  style={{ margin: 0, display: "grid" }}
                >
                  <div className="min-w-0 max-w-full space-y-2">
                    <label htmlFor="order-plan-start" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                      {t("workOrders.plannedStart")}
                      <span className="app-required-marker" aria-hidden>*</span>
                    </label>
                    <Calendar
                      inputId="order-plan-start"
                      value={form.plannedStart}
                      onChange={(e) => {
                        const next = e.value instanceof Date ? e.value : null;
                        setForm((cur) => {
                          if (!next) return { ...cur, plannedStart: null };
                          let nextEnd = cur.plannedEnd;
                          const parsedHours = Number(cur.plannedDurationHours.trim().replace(",", "."));
                          if (cur.plannedDurationHours.trim() !== "" && Number.isFinite(parsedHours) && parsedHours >= 0) {
                            nextEnd = new Date(next.getTime() + parsedHours * 60 * 60 * 1000);
                          } else if (!nextEnd) {
                            nextEnd = addHours(next, 24);
                          }
                          return { ...cur, plannedStart: next, plannedEnd: nextEnd };
                        });
                      }}
                      showTime
                      hourFormat="24"
                      dateFormat={calendarDateFormat}
                      className="w-full min-w-0 max-w-full"
                      appendTo={overlayAppendTo}
                    />
                  </div>

                  <div className="min-w-0 max-w-full space-y-2">
                    <label htmlFor="order-plan-end" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                      {t("workOrders.plannedEnd")}
                    </label>
                    <Calendar
                      inputId="order-plan-end"
                      value={form.plannedEnd}
                      onChange={(e) => {
                        const next = e.value instanceof Date ? e.value : null;
                        setForm((cur) => {
                          if (!next) return { ...cur, plannedEnd: null, plannedDurationHours: "" };
                          if (!cur.plannedStart) return { ...cur, plannedEnd: next };
                          const diffMs = next.getTime() - cur.plannedStart.getTime();
                          const hours = Math.max(0, diffMs / (1000 * 60 * 60));
                          return {
                            ...cur,
                            plannedEnd: next,
                            plannedDurationHours: formatHoursForInput(hours),
                          };
                        });
                      }}
                      showTime
                      hourFormat="24"
                      dateFormat={calendarDateFormat}
                      className="w-full min-w-0 max-w-full"
                      appendTo={overlayAppendTo}
                    />
                  </div>

                  <div className="min-w-0 max-w-full space-y-2">
                    <label htmlFor="order-duration" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                      {t("workOrders.plannedDuration")}
                    </label>
                    <InputText
                      id="order-duration"
                      value={form.plannedDurationHours}
                      onChange={(e) => {
                        const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
                        const normalized =
                          raw.split(".").length > 2 ? raw.replace(/\.(?=.*\.)/g, "") : raw;
                        setForm((cur) => ({ ...cur, plannedDurationHours: normalized }));
                        if (normalized === "") {
                          updatePlannedDuration(null);
                        } else {
                          const nextHours = Number(normalized);
                          if (Number.isFinite(nextHours) && nextHours >= 0) {
                            updatePlannedDuration(nextHours);
                          }
                        }
                      }}
                      className="w-full min-w-0 max-w-full"
                      autoComplete="off"
                      placeholder={t("workOrders.plannedDurationPlaceholder")}
                    />
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <div className="text-sm text-on-surface-variant">{t("workOrders.assignmentsTitle")}</div>
                  {!editingId ? (
                    <div className="text-sm text-on-surface-variant">{t("workOrders.assignmentsApplyOnSaveHint")}</div>
                  ) : null}
                  <div className="flex flex-wrap items-start gap-2">
                    <MultiSelect
                      inputId="order-assignments-multiselect"
                      value={assignmentEmployeeIds}
                      options={assignmentEmployeeOptions}
                      optionLabel="label"
                      optionValue="value"
                      display="chip"
                      onChange={(e) => setAssignmentEmployeeIds((e.value as string[] | null | undefined) ?? [])}
                      placeholder={t("workOrders.assignmentsAddPlaceholder")}
                      className="min-w-0 flex-1 app-inline-icon-multiselect"
                      filter
                      showClear
                      maxSelectedLabels={4}
                      disabled={
                        saving ||
                        editingOrder?.status === "ended" ||
                        editingOrder?.status === "done" ||
                        editingOrder?.status === "cancelled"
                      }
                      appendTo={overlayAppendTo}
                    />
                    <Button
                      type="button"
                      icon={<UserPlus className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                      label={t("workOrders.assignmentsAdd")}
                      loading={assignmentAdding}
                      onClick={() => void addAssignments()}
                      disabled={
                        saving ||
                        assignmentEmployeeIds.length === 0 ||
                        editingOrder?.status === "ended" ||
                        editingOrder?.status === "done" ||
                        editingOrder?.status === "cancelled" ||
                        !editingId
                      }
                    />
                  </div>
                  {!editingId ? (
                    assignmentEmployeeIds.length > 0 ? (
                      <div className="text-sm text-on-surface-variant">{t("workOrders.assignmentsPendingHint")}</div>
                    ) : null
                  ) : assignmentsLoading ? (
                    <div className="text-sm text-on-surface-variant">{t("workOrders.documentsLoading")}</div>
                  ) : assignments.length > 0 ? (
                    <div key={assignmentsCascadeSeed} className="flex flex-wrap gap-2">
                      {assignments.map((item, index) => (
                        <span
                          key={item.id}
                          className="app-card-cascade inline-flex items-center gap-2 rounded-sm border border-solid app-wo-detail-outline-border px-2 py-1 text-xs"
                          style={{ ["--app-cascade-index" as string]: index }}
                        >
                          <span>
                            {item.employeeKey} - {item.employeeName}
                          </span>
                          <Button
                            type="button"
                            text
                            severity="danger"
                            className="!h-5 !min-h-5 !w-5 !min-w-5 !p-0"
                            icon={<X className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                            onClick={() => void removeAssignment(item.employeeId)}
                            disabled={
                              editingOrder?.status === "ended" ||
                              editingOrder?.status === "done" ||
                              editingOrder?.status === "cancelled"
                            }
                          />
                        </span>
                      ))}
                    </div>
                  ) : assignmentEmployeeIds.length > 0 ? (
                    <div className="text-sm text-on-surface-variant">{t("workOrders.assignmentsPendingHint")}</div>
                  ) : (
                    <div className="text-sm text-on-surface-variant">{t("workOrders.assignmentsEmpty")}</div>
                  )}
                </div>
              </div>
            </TabPanel>
            <TabPanel
              header={
                <span className="inline-flex items-center gap-2">
                  <span>{t("workOrders.tabDocuments")}</span>
                  {documentsTabCount > 0 ? <Badge value={documentsTabCount} /> : null}
                </span>
              }
            >
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-[8fr_2fr] items-stretch gap-2">
                  <Button
                    type="button"
                    icon={<Upload className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                    label={t("workOrders.documentsUpload")}
                    className="w-full min-w-0 justify-center !h-9 min-h-9 max-h-9 py-0"
                    onClick={() => fileInputRef.current?.click()}
                  />
                  <IconField iconPosition="left" className="min-w-0 w-full !h-9 min-h-9 max-h-9">
                    <LucideInputSearchIcon />
                    <InputText
                      value={documentsSearchTerm}
                      onChange={(e) => setDocumentsSearchTerm(e.target.value)}
                      placeholder={t("workOrders.documentsSearchPlaceholder")}
                      className="app-header-search-input !h-full min-h-0 w-full !rounded-sm text-sm"
                    />
                  </IconField>
                </div>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handlePickFiles} />
                {uploading ? (
                  <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                    <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
                    <span>{t("workOrders.documentsUploading")}</span>
                  </div>
                ) : null}

                {pendingFiles.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm text-on-surface-variant">{t("workOrders.documentsPending")}</div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {filteredPendingFiles.map((doc, index) => (
                        <div
                          key={doc.localId}
                          className="app-card-cascade flex items-center gap-3 rounded-sm border border-solid app-wo-detail-outline-border px-3 py-2"
                          style={{ ["--app-cascade-index" as string]: index }}
                        >
                          {(() => {
                            const spec = documentTypeMimeIcon(
                              doc.file.type || "application/octet-stream",
                              doc.file.name,
                            );
                            const MimeIco = spec.Icon;
                            return (
                              <MimeIco
                                className={`${spec.className} h-5 w-5 shrink-0`}
                                strokeWidth={1.75}
                                aria-hidden
                              />
                            );
                          })()}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">{doc.displayName}</div>
                            <div className="text-xs text-on-surface-variant">
                              <span className={`inline align-middle rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight md:text-xs ${documentCategoryBadgeClass(doc.category)}`}>
                                {t(`workOrders.documentCategories.${doc.category}`)}
                              </span>
                              <span className="text-on-surface-variant"> · </span>
                              {(doc.file.type || "application/octet-stream").split(";")[0]} · {formatFileSize(doc.file.size)}
                            </div>
                          </div>
                          <Button type="button" text disabled className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0 opacity-100">
                            {Boolean(pendingRowUploading[doc.localId]) ? (
                              <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
                            ) : (
                              <span className="text-xs">
                                {Math.max(
                                  0,
                                  Math.ceil(
                                    (PENDING_AUTO_UPLOAD_MS - (Date.now() - doc.addedAt) + pendingUiTick * 0) / 1000,
                                  ),
                                )}
                              </span>
                            )}
                          </Button>
                          <Button
                            type="button"
                            text
                            severity="danger"
                            className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0"
                            icon={<X className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                            aria-label={t("workOrders.documentsRemovePending")}
                            title={t("workOrders.documentsRemovePending")}
                            onClick={() => removePendingFileByLocalId(doc.localId)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {editingId ? (
                  <div className="space-y-2">
                    <div className="text-sm text-on-surface-variant">{t("workOrders.documentsExisting")}</div>
                    {documentsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                        <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
                        <span>{t("workOrders.documentsLoading")}</span>
                      </div>
                    ) : documents.length === 0 ? (
                      <div className="text-sm text-on-surface-variant">{t("workOrders.documentsEmpty")}</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {filteredDocuments.map((doc, index) => (
                          <div
                            key={doc.id}
                            className="app-card-cascade flex cursor-pointer items-center gap-3 rounded-sm border border-solid app-wo-detail-outline-border px-3 py-2"
                            style={{ ["--app-cascade-index" as string]: index }}
                            onClick={() => void openDocumentContent(doc)}
                          >
                          {(() => {
                            const spec = documentTypeMimeIcon(doc.mimeType, doc.fileName);
                            const MimeIco = spec.Icon;
                            return (
                              <MimeIco
                                className={`${spec.className} h-5 w-5 shrink-0`}
                                strokeWidth={1.75}
                                aria-hidden
                              />
                            );
                          })()}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm">{doc.displayName || doc.fileName}</div>
                              <div className="text-xs text-on-surface-variant">
                                <span className={`inline align-middle rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight md:text-xs ${documentCategoryBadgeClass(doc.category)}`}>
                                  {t(`workOrders.documentCategories.${doc.category}`)}
                                </span>
                                <span className="text-on-surface-variant"> · </span>
                                <span
                                  className={`inline align-middle rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight md:text-xs ${
                                    doc.source === "asset" ? "bg-green-200 text-slate-900" : "bg-cyan-200 text-slate-900"
                                  }`}
                                >
                                  {t(`workOrders.documentsSource.${doc.source}`)}
                                </span>
                                <span className="text-on-surface-variant"> · </span>
                                {(doc.mimeType ?? "application/octet-stream").split(";")[0]} · {formatFileSize(doc.fileSize)}
                              </div>
                              <div className="text-xs text-on-surface-variant">
                                {t("workOrders.documentsUploadedBy")}: {doc.createdBy} · {t("workOrders.documentsUploadedAt")}:{" "}
                                {formatShortDt(doc.createdAt)}
                              </div>
                            </div>
                            <Button
                              type="button"
                              text
                              className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0"
                              icon={<Pencil className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDocumentEdit(doc);
                                setDocumentEditDisplayName(doc.displayName || doc.fileName);
                                setDocumentEditCategory(doc.category);
                              }}
                            />
                            {doc.source === "workOrder" && doc.workOrderId ? (
                              <Button
                                type="button"
                                text
                                severity="danger"
                                className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0"
                                icon={<Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void deleteDocument(doc.workOrderId!, doc.id);
                                }}
                              />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-sm border border-solid app-wo-detail-outline-border px-3 py-2 text-sm text-on-surface-variant">
                    {t("workOrders.documentsCreateHint")}
                  </div>
                )}
              </div>
            </TabPanel>
            <TabPanel
              header={
                <span className="inline-flex items-center gap-2">
                  <span>{t("workOrders.tabFeedback")}</span>
                  {feedbackTabCount > 0 ? <Badge value={feedbackTabCount} /> : null}
                </span>
              }
              disabled={!editingId || !workOrderStatusAllowsFeedbackTab(editingOrder?.status)}
            >
              <WorkOrderFeedbackTabContent
                reportingEmployeeLabel={reportingEmployeeLabel}
                feedbackHours={feedbackHours}
                onFeedbackHoursChange={setFeedbackHours}
                feedbackRemark={feedbackRemark}
                onFeedbackRemarkChange={setFeedbackRemark}
                feedbackPauseRemark={feedbackPauseRemark}
                onFeedbackPauseRemarkChange={setFeedbackPauseRemark}
                feedbackStatusAction={feedbackStatusAction}
                onFeedbackStatusActionChange={setFeedbackStatusAction}
                feedbackEntryMode={feedbackEntryMode}
                additionalHoursRows={feedbackAdditionalHours}
                onAdditionalHoursRowsChange={setFeedbackAdditionalHours}
                additionalEmployeeOptions={feedbackAdditionalEmployeeOptions}
                sessionEmployeeId={user.employeeId}
                disabled={feedbackSaving}
                doneOrder={editingOrder?.status === "done"}
              />
            </TabPanel>
            <TabPanel
              header={
                <span className="inline-flex items-center gap-2">
                  <span>{t("workOrders.tabTransactions")}</span>
                  {transactionsTabCount > 0 ? <Badge value={transactionsTabCount} /> : null}
                </span>
              }
              disabled={!editingId}
            >
              <div className="pt-1">
                <WorkOrderFeedbackTransactionsSection rows={feedbackTransactions} loading={feedbackTransactionsLoading} />
              </div>
            </TabPanel>
          </TabView>
        </div>
      </Dialog>

      <Dialog
        header={t("workOrders.documentsEditTitle")}
        visible={documentEdit !== null}
        className="app-modal-window"
        onHide={() => {
          if (!documentEditSaving) setDocumentEdit(null);
        }}
        modal
        dismissableMask={!documentEditSaving}
        closable={!documentEditSaving}
        draggable={false}
        resizable={false}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <label htmlFor="order-document-edit-display-name" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.documentsDisplayName")}
            </label>
            <InputText
              id="order-document-edit-display-name"
              value={documentEditDisplayName}
              onChange={(e) => setDocumentEditDisplayName(e.target.value)}
              className="w-full"
              autoComplete="off"
              disabled={documentEditSaving}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="order-document-edit-category" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.documentsCategory")}
            </label>
            <Dropdown
              inputId="order-document-edit-category"
              value={documentEditCategory}
              options={ASSET_DOCUMENT_CATEGORY_ORDER.map((value) => ({ value, label: t(`workOrders.documentCategories.${value}`) }))}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => {
                const v = String(e.value ?? "general");
                if (isAssetDocumentCategory(v)) setDocumentEditCategory(v);
              }}
              className="w-full app-inline-icon-dropdown"
              disabled={documentEditSaving}
              appendTo={overlayAppendTo}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" label={t("workOrders.cancel")} severity="secondary" outlined disabled={documentEditSaving} onClick={() => setDocumentEdit(null)} />
            <Button
              type="button"
              label={t("workOrders.save")}
              icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
              loading={documentEditSaving}
              disabled={documentEditSaving}
              onClick={() => void saveDocumentEdit()}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}


