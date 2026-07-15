import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import { File, FileText, Image, Video, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Toast } from "primereact/toast";
import { confirmDialog } from "primereact/confirmdialog";
import { useAtheneAssistant } from "../assistant/AtheneAssistantContext";
import { useAuth } from "../auth/AuthContext";
import { PlanningConflictWarning } from "../components/PlanningConflictWarning";
import { apiFetch } from "../lib/api";
import type { WorkOrderPlanningConflict } from "../lib/workOrderApi";
import type { TransactionRow } from "../pages/TransactionsPage";
import { useWorkOrderCopy } from "./useWorkOrderCopy";
import { useWorkOrderSearchReferenceData } from "./useWorkOrderSearchReferenceData";
import {
  computeSegmentHours,
  feedbackStatusActionForEntryMode,
  orderDialogTabs,
  type FeedbackAdditionalHoursRow,
  type FeedbackEntryMode,
  type FeedbackStatusAction,
  type OrderDialogTab,
} from "../lib/workOrderDialog";
import {
  emptyWorkOrderForm,
  workOrderRowToFormState,
  type WorkOrderFormFields,
  type WorkOrderFormSource,
} from "../lib/workOrderForm";
import { workOrderStatusAllowsFeedbackTab } from "../lib/workOrderStatus";
import type {
  WorkOrder,
  WorkOrderAssignment,
  WorkOrderDocument,
  WorkOrderEditMeta,
  WorkOrderSelectOption,
  PendingDocumentUpload,
} from "../lib/workOrderTypes";
import { fetchWorkOrderMessages, sendWorkOrderMessage, type WorkOrderMessage } from "../lib/notificationCenter";
import { workOrderToEditMeta } from "../lib/workOrderTypes";
import type { AssetDocumentCategory } from "../constants/assetDocumentCategory";
import { useWorkOrderSubscriptions } from "../workOrders/WorkOrderSubscriptionContext";

export const PENDING_AUTO_UPLOAD_MS = 5_000;

export type WorkOrderEditOpenSource =
  | WorkOrder
  | (WorkOrderFormSource & { id: string; meta?: WorkOrderEditMeta });

export type UseWorkOrderEditDialogStateOptions = {
  toastRef: RefObject<Toast | null>;
  atheneSource?: "workOrders" | "monitoring";
  onRefresh?: () => void | Promise<void>;
  onOrderUpdated?: (order: WorkOrder) => void;
  onClose?: () => void;
  onVisibleChange?: (visible: boolean, editingId: string | null, activeTab: OrderDialogTab) => void;
};

type FormState = WorkOrderFormFields;

function newPendingLocalId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileExtension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

export function documentTypeMimeIcon(
  mimeType: string,
  fileName: string,
): { Icon: LucideIcon; className: string } {
  const ext = fileExtension(fileName);
  const mt = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (mt.includes("pdf") || ext === "pdf") return { Icon: FileText, className: "text-red-500" };
  if (mt.startsWith("image/")) return { Icon: Image, className: "text-sky-500" };
  if (mt.startsWith("video/")) return { Icon: Video, className: "text-violet-500" };
  return { Icon: File, className: "text-on-surface-variant" };
}

export function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

function formatHoursForInput(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return "";
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

type WorkOrderSavePayload = {
  name: string;
  description: string | null;
  assetId: string;
  costCenterId: string;
  plannedStart: string;
  plannedEnd: string | null;
  plannedDurationMinutes: number | null;
  orderType: WorkOrder["orderType"];
  responsibleEmployeeIds: string[];
  workgroupId: string;
  classificationId: string | null;
  originalWo?: string | null;
};

type WorkOrderAssetConflictPayload = {
  assetKey: string;
  assetName: string;
  conflicts: WorkOrderPlanningConflict[];
  sameDayConflict: boolean;
};

function workOrderRowFromMeta(
  editingId: string,
  meta: WorkOrderEditMeta | null,
  form: FormState,
): WorkOrder | null {
  if (!editingId || !meta) return null;
  return {
    id: editingId,
    orderNumber: meta.orderNumber ?? form.orderNumber ?? 0,
    name: meta.name ?? form.name,
    description: form.description || null,
    siteId: meta.siteId ?? "",
    siteKey: meta.siteKey ?? "",
    siteName: meta.siteName ?? "",
    assetId: meta.assetId ?? form.assetId,
    assetKey: meta.assetKey ?? "",
    assetName: meta.assetName ?? "",
    costCenterId: form.costCenterId,
    costCenterKey: "",
    costCenterName: "",
    classificationId: form.classificationId || null,
    classificationKey: null,
    classificationName: null,
    plannedStart: form.plannedStart?.toISOString() ?? new Date().toISOString(),
    plannedEnd: form.plannedEnd?.toISOString() ?? new Date().toISOString(),
    plannedDurationMinutes: null,
    orderType: form.orderType,
    status: meta.status ?? "open",
    responsibleEmployeeIds: [...form.responsibleEmployeeIds],
    responsibleEmployeeKey: null,
    responsibleEmployeeName: null,
    doneBy: null,
    doneByEmployeeKey: null,
    doneByEmployeeName: null,
    pauseRemark: null,
    currentSegmentStartedAt: meta.currentSegmentStartedAt ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "",
    updatedBy: "",
    documentCount: meta.documentCount ?? 0,
    assetDocumentCount: meta.assetDocumentCount ?? 0,
    assignedEmployeeCount: 0,
    transactionCount: meta.transactionCount ?? 0,
    workgroupId: (meta.workgroupId ?? form.workgroupId) || null,
    workgroupKey: null,
    workgroupName: null,
    originalWo: form.originalWoId || null,
    originalWoOrderNumber: form.copySourceOrderNumber,
    originalWoName: null,
  };
}

export function useWorkOrderEditDialogState(options: UseWorkOrderEditDialogStateOptions) {
  const { toastRef, onRefresh, onOrderUpdated, onClose, onVisibleChange } = options;
  const onVisibleChangeRef = useRef(onVisibleChange);
  onVisibleChangeRef.current = onVisibleChange;
  const { t, i18n } = useTranslation();
  const athene = useAtheneAssistant();
  const { user, appParameterDefaultWorkgroupId } = useAuth();
  const refData = useWorkOrderSearchReferenceData({ autoLoad: false });
  const refDataLoadedRef = useRef(false);

  const {
    accessibleAssets,
    costCenters,
    classifications,
    employees,
    workgroups,
    loaded: refDataLoaded,
    calendarDateFormat,
    typeOrder,
    typeLabel,
    statusLabel: refStatusLabel,
  } = refData;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tabHostRef = useRef<HTMLDivElement | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState<OrderDialogTab>(orderDialogTabs.General);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMeta, setEditingMeta] = useState<WorkOrderEditMeta | null>(null);
  const [form, setForm] = useState<FormState>(emptyWorkOrderForm());
  const prevCreateAssetIdForDefaultWgRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
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
  const [workOrderMessages, setWorkOrderMessages] = useState<WorkOrderMessage[]>([]);
  const [workOrderMessagesLoading, setWorkOrderMessagesLoading] = useState(false);
  const [workOrderMessagesLoadedOrderId, setWorkOrderMessagesLoadedOrderId] = useState<string | null>(null);
  const [workOrderMessageSending, setWorkOrderMessageSending] = useState(false);
  const [assignments, setAssignments] = useState<WorkOrderAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentEmployeeIds, setAssignmentEmployeeIds] = useState<string[]>([]);
  const [assignmentAdding, setAssignmentAdding] = useState(false);
  const [assignmentsCascadeSeed, setAssignmentsCascadeSeed] = useState(0);
  const prevDialogTabRef = useRef<OrderDialogTab | null>(null);
  const assignmentAddingRef = useRef(false);
  const pendingFilesRef = useRef(pendingFiles);
  const pendingAutoTimersRef = useRef(new Map<string, number>());
  const editingIdRef = useRef<string | null>(null);
  const dialogVisibleRef = useRef(false);
  const activeTabIndexRef = useRef<OrderDialogTab>(orderDialogTabs.General);
  const workOrderMessagesLoadedOrderIdRef = useRef<string | null>(null);
  const workOrderMessageIdsRef = useRef(new Set<string>());
  const openSessionRef = useRef(0);
  const formRef = useRef(form);
  const orderCreateLockRef = useRef<Promise<string | null> | null>(null);
  const { onNotificationEvent, onWorkOrderMessageEvent } = useWorkOrderSubscriptions();

  const ensureRefDataLoaded = useCallback(async () => {
    if (!refDataLoadedRef.current) {
      refDataLoadedRef.current = true;
      await refData.reload();
    }
  }, [refData]);

  const closeDialog = useCallback(() => {
    openSessionRef.current += 1;
    setDialogVisible(false);
    onClose?.();
    onVisibleChangeRef.current?.(false, editingIdRef.current, activeTabIndex);
  }, [activeTabIndex, onClose]);

  const refreshExternal = useCallback(async () => {
    await onRefresh?.();
  }, [onRefresh]);

  const editingRow = useMemo(
    () => workOrderRowFromMeta(editingId ?? "", editingMeta, form),
    [editingId, editingMeta, form],
  );

  const assetOptions = useMemo<WorkOrderSelectOption[]>(
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

  const costCenterOptions = useMemo<WorkOrderSelectOption[]>(
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

  const classificationOptions = useMemo<WorkOrderSelectOption[]>(
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

  const responsibleEmployeeOptions = useMemo<WorkOrderSelectOption[]>(
    () =>
      employees
        .filter((emp) => !selectedAsset?.siteId || emp.siteId === selectedAsset.siteId)
        .filter((emp) =>
          form.workgroupId ? (selectedWorkgroup?.leaderEmployeeIds?.includes(emp.id) ?? false) : false,
        )
        .filter((emp) => emp.isActive || form.responsibleEmployeeIds.includes(emp.id))
        .map((emp) => ({ label: `${emp.key} - ${emp.name}`, value: emp.id })),
    [employees, form.responsibleEmployeeIds, form.workgroupId, selectedAsset?.siteId, selectedWorkgroup],
  );

  const employeeOptions = useMemo<WorkOrderSelectOption[]>(
    () =>
      employees
        .filter((emp) => !selectedAsset?.siteId || emp.siteId === selectedAsset.siteId)
        .filter((emp) => !form.workgroupId || (selectedWorkgroup?.employeeIds?.includes(emp.id) ?? false))
        .filter((emp) => emp.isActive || assignments.some((a) => a.employeeId === emp.id))
        .map((emp) => ({ label: `${emp.key} - ${emp.name}`, value: emp.id })),
    [assignments, employees, form.workgroupId, selectedAsset?.siteId, selectedWorkgroup],
  );

  const workgroupOptions = useMemo<WorkOrderSelectOption[]>(
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

  const assignmentEmployeeOptions = useMemo<WorkOrderSelectOption[]>(
    () => employeeOptions.filter((opt) => !assignments.some((a) => a.employeeId === opt.value)),
    [assignments, employeeOptions],
  );

  const orderTypeOptions = useMemo(
    () => typeOrder.map((type) => ({ label: typeLabel(type), value: type })),
    [typeLabel, typeOrder],
  );

  const statusLabel = useCallback(
    (status: WorkOrder["status"]) => refStatusLabel(status),
    [refStatusLabel],
  );

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
    onVisibleChangeRef.current?.(dialogVisible, editingId, activeTabIndex);
  }, [activeTabIndex, dialogVisible, editingId]);

  useEffect(() => {
    if (!dialogVisible || pendingFiles.length === 0) return;
    const id = window.setInterval(() => setPendingUiTick((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, [dialogVisible, pendingFiles.length]);

  useEffect(() => {
    const allowed = new Set(assignmentEmployeeOptions.map((o) => o.value));
    setAssignmentEmployeeIds((cur) => {
      const next = cur.filter((id) => allowed.has(id));
      if (next.length === cur.length && next.every((id, i) => id === cur[i])) return cur;
      return next;
    });
  }, [assignmentEmployeeOptions]);

  useEffect(() => {
    if (!form.workgroupId || form.responsibleEmployeeIds.length === 0) return;
    if (!selectedWorkgroup) return;
    const allowed = new Set(selectedWorkgroup.leaderEmployeeIds ?? []);
    const next = form.responsibleEmployeeIds.filter((id) => allowed.has(id));
    if (next.length === form.responsibleEmployeeIds.length && next.every((id, i) => id === form.responsibleEmployeeIds[i])) {
      return;
    }
    setForm((cur) => ({ ...cur, responsibleEmployeeIds: next }));
    toastRef.current?.show({
      severity: "info",
      summary: t("workOrders.responsibleClearedDueToWorkgroup"),
      life: 5000,
    });
  }, [form.responsibleEmployeeIds, form.workgroupId, selectedWorkgroup, t, toastRef]);

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
    if (!form.workgroupId || !refDataLoaded) return;
    const wg = workgroups.find((w) => w.id === form.workgroupId);
    if (!wg) {
      setForm((cur) => ({ ...cur, workgroupId: "" }));
      return;
    }
    if (!selectedAsset?.siteId) return;
    if (wg.siteId !== selectedAsset.siteId) {
      setForm((cur) => ({ ...cur, workgroupId: "" }));
    }
  }, [form.workgroupId, refDataLoaded, selectedAsset?.siteId, workgroups]);

  useEffect(() => {
    if (!dialogVisible || editingId) return;
    const aid = form.assetId;
    if (!aid) return;
    const prev = prevCreateAssetIdForDefaultWgRef.current;
    if (prev === aid) return;
    prevCreateAssetIdForDefaultWgRef.current = aid;
    if (!appParameterDefaultWorkgroupId) return;
    const asset = refData.assets.find((a) => a.id === aid);
    if (!asset) return;
    const defWg = workgroups.find((w) => w.id === appParameterDefaultWorkgroupId);
    if (!defWg || defWg.siteId !== asset.siteId) return;
    setForm((cur) => ({ ...cur, workgroupId: appParameterDefaultWorkgroupId }));
  }, [
    appParameterDefaultWorkgroupId,
    dialogVisible,
    editingId,
    form.assetId,
    refData.assets,
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
    [t, toastRef],
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
    [t, toastRef],
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

  const loadWorkOrderMessages = useCallback(
    async (orderId: string, options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!silent) setWorkOrderMessagesLoading(true);
      try {
        const rows = await fetchWorkOrderMessages(orderId);
        setWorkOrderMessages(rows);
        setWorkOrderMessagesLoadedOrderId(orderId);
      } catch {
        if (!silent) {
          setWorkOrderMessages([]);
          setWorkOrderMessagesLoadedOrderId(null);
          toastRef.current?.show({ severity: "error", summary: t("workOrders.messagesLoadError"), life: 6000 });
        }
      } finally {
        if (!silent) setWorkOrderMessagesLoading(false);
      }
    },
    [t, toastRef],
  );

  useEffect(() => {
    dialogVisibleRef.current = dialogVisible;
  }, [dialogVisible]);

  useEffect(() => {
    activeTabIndexRef.current = activeTabIndex;
  }, [activeTabIndex]);

  useEffect(() => {
    workOrderMessagesLoadedOrderIdRef.current = workOrderMessagesLoadedOrderId;
  }, [workOrderMessagesLoadedOrderId]);

  useEffect(() => {
    workOrderMessageIdsRef.current = new Set(workOrderMessages.map((row) => row.id));
  }, [workOrderMessages]);

  useEffect(() => {
    if (!dialogVisible || !editingId) return;
    void loadFeedbackTransactions(editingId);
  }, [dialogVisible, editingId, loadFeedbackTransactions]);

  useEffect(() => {
    if (!dialogVisible || !editingId || activeTabIndex !== orderDialogTabs.Messages) return;
    if (workOrderMessagesLoadedOrderId === editingId) return;
    void loadWorkOrderMessages(editingId);
  }, [
    activeTabIndex,
    dialogVisible,
    editingId,
    loadWorkOrderMessages,
    workOrderMessagesLoadedOrderId,
  ]);

  useEffect(
    () =>
      onWorkOrderMessageEvent((event) => {
        if (!dialogVisibleRef.current) return;
        const orderId = editingIdRef.current;
        if (!orderId || event.message.workOrderId !== orderId) return;

        const onMessagesTab = activeTabIndexRef.current === orderDialogTabs.Messages;
        const messagesLoaded = workOrderMessagesLoadedOrderIdRef.current === orderId;
        if (!onMessagesTab && !messagesLoaded) return;

        setWorkOrderMessages((current) => {
          if (current.some((entry) => entry.id === event.message.id)) return current;
          return [...current, event.message];
        });
        setWorkOrderMessagesLoadedOrderId(orderId);
      }),
    [onWorkOrderMessageEvent],
  );

  useEffect(
    () =>
      onNotificationEvent((message) => {
        if (message.type !== "chat_notification") return;
        if (!dialogVisibleRef.current) return;

        const orderId = editingIdRef.current;
        if (!orderId || message.notification.workOrderId !== orderId) return;

        // Prefer thread event for list updates; keep chat_notification for badge suppress + fallback refetch.
        const onMessagesTab = activeTabIndexRef.current === orderDialogTabs.Messages;
        if (onMessagesTab) return true;

        const messagesLoaded = workOrderMessagesLoadedOrderIdRef.current === orderId;
        if (!messagesLoaded) return;

        if (workOrderMessageIdsRef.current.has(message.notification.messageId)) return;

        void loadWorkOrderMessages(orderId, { silent: true });
      }),
    [loadWorkOrderMessages, onNotificationEvent],
  );

  useEffect(() => {
    if (dialogVisible) return;
    setFeedbackTransactions([]);
    setFeedbackTransactionsLoading(false);
    setFeedbackTransactionsLoadedOrderId(null);
    setWorkOrderMessages([]);
    setWorkOrderMessagesLoading(false);
    setWorkOrderMessagesLoadedOrderId(null);
    setWorkOrderMessageSending(false);
  }, [dialogVisible]);

  useEffect(() => {
    if (!dialogVisible) return;
    if (activeTabIndex !== orderDialogTabs.Feedback) return;
    if (!workOrderStatusAllowsFeedbackTab(editingMeta?.status)) {
      setActiveTabIndex(orderDialogTabs.General);
    }
  }, [activeTabIndex, dialogVisible, editingMeta?.status]);

  const postAssignmentsForOrder = useCallback(
    async (
      orderId: string,
      employeeIds: string[],
      opts?: { checkFormSavedWorkgroup?: boolean },
    ): Promise<boolean> => {
      const checkSaved = opts?.checkFormSavedWorkgroup !== false;
      if (checkSaved && editingMeta) {
        const savedWg = (editingMeta.workgroupId ?? "").trim();
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
    [editingMeta, form.workgroupId, t, toastRef],
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
        await Promise.all([loadAssignments(editingId), refreshExternal()]);
      }
    } finally {
      assignmentAddingRef.current = false;
      setAssignmentAdding(false);
    }
  }, [assignmentEmployeeIds, editingId, loadAssignments, postAssignmentsForOrder, refreshExternal]);

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

  const saveOrderCore = useCallback(async (forceCreate = false): Promise<string | null> => {
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
      responsibleEmployeeIds: [...formRef.current.responsibleEmployeeIds],
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
    setEditingMeta(workOrderToEditMeta(saved));
    onOrderUpdated?.(saved);
    return saved.id;
  }, [onOrderUpdated]);

  const ensureOrderIdForDocumentUpload = useCallback(async (): Promise<string | null> => {
    if (editingIdRef.current) return editingIdRef.current;
    if (orderCreateLockRef.current) return orderCreateLockRef.current;
    const promise = (async () => {
      const id = await saveOrderCore(true);
      if (!id) return null;
      await refreshExternal();
      return id;
    })();
    orderCreateLockRef.current = promise;
    try {
      return await promise;
    } finally {
      orderCreateLockRef.current = null;
    }
  }, [refreshExternal, saveOrderCore]);

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
          await refreshExternal();
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
    [clearPendingAutoTimer, ensureOrderIdForDocumentUpload, loadDocuments, refreshExternal, t, toastRef, uploadDocument],
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
    [t, toastRef],
  );

  const deleteDocument = useCallback(
    async (orderId: string, documentId: string) => {
      const res = await apiFetch(`/api/work-orders/${orderId}/documents/${documentId}`, { method: "DELETE" });
      if (!res.ok) {
        toastRef.current?.show({ severity: "error", summary: t("workOrders.documentsDeleteError"), life: 6000 });
        return;
      }
      await Promise.all([loadDocuments(orderId), refreshExternal()]);
      toastRef.current?.show({ severity: "success", summary: t("workOrders.documentsDeleted"), life: 3000 });
    },
    [loadDocuments, refreshExternal, t, toastRef],
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
      await Promise.all([loadDocuments(editingId), refreshExternal()]);
      toastRef.current?.show({ severity: "success", summary: t("workOrders.documentsUpdated"), life: 3000 });
    } finally {
      setDocumentEditSaving(false);
    }
  }, [
    documentEdit,
    documentEditCategory,
    documentEditDisplayName,
    editingId,
    loadDocuments,
    refreshExternal,
    t,
    toastRef,
  ]);

  const resetOrderDialogForCreate = useCallback(() => {
    setDocuments([]);
    setAssignments([]);
    setAssignmentEmployeeIds([]);
    setPendingFiles([]);
    setDocumentsSearchTerm("");
    setFeedbackHours("");
    setFeedbackRemark("");
    setFeedbackPauseRemark("");
    setFeedbackStatusAction("none");
    setFeedbackEntryMode("create");
    setFeedbackAdditionalHours([]);
    setFeedbackTransactions([]);
    setWorkOrderMessages([]);
    setWorkOrderMessagesLoadedOrderId(null);
    setEditingMeta(null);
  }, []);

  const openCreate = useCallback(() => {
    void ensureRefDataLoaded();
    prevCreateAssetIdForDefaultWgRef.current = null;
    setEditingId(null);
    setEditingMeta(null);
    setForm(emptyWorkOrderForm());
    resetOrderDialogForCreate();
    setActiveTabIndex(orderDialogTabs.General);
    setDialogVisible(true);
  }, [ensureRefDataLoaded, resetOrderDialogForCreate]);

  const openCopyAsNew = useCallback(
    (row: WorkOrderFormSource, name: string) => {
      void ensureRefDataLoaded();
      prevCreateAssetIdForDefaultWgRef.current = row.assetId;
      setEditingId(null);
      setEditingMeta(null);
      setForm(workOrderRowToFormState(row, { name, asCopy: true }));
      resetOrderDialogForCreate();
      setActiveTabIndex(orderDialogTabs.General);
      setDialogVisible(true);
    },
    [ensureRefDataLoaded, resetOrderDialogForCreate],
  );

  const copyWorkOrder = useWorkOrderCopy({ t, onOpenCreateForm: openCopyAsNew });

  const openEdit = useCallback(
    async (row: WorkOrderEditOpenSource) => {
      const session = openSessionRef.current;
      await ensureRefDataLoaded();
      if (session !== openSessionRef.current) return;
      setEditingId(row.id);
      const meta =
        "meta" in row && row.meta != null
          ? row.meta
          : workOrderToEditMeta(row as WorkOrder);
      setEditingMeta(meta);
      setForm(workOrderRowToFormState(row));
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
      setWorkOrderMessages([]);
      setWorkOrderMessagesLoadedOrderId(null);
      setActiveTabIndex(orderDialogTabs.General);
      if (session !== openSessionRef.current) return;
      setDialogVisible(true);
    },
    [ensureRefDataLoaded],
  );

  const applyFeedbackEntry = useCallback(
    (row: WorkOrder | WorkOrderEditMeta, mode: FeedbackEntryMode) => {
      setFeedbackEntryMode(mode);
      setFeedbackStatusAction(feedbackStatusActionForEntryMode(mode));
      setFeedbackPauseRemark("");
      setFeedbackHours(computeSegmentHours(row.currentSegmentStartedAt));
      setFeedbackRemark("");
      setFeedbackAdditionalHours([]);
    },
    [],
  );

  const openPlanningTab = useCallback(
    async (row: WorkOrder) => {
      await openEdit(row);
      setActiveTabIndex(orderDialogTabs.Planning);
    },
    [openEdit],
  );

  const openFeedbackTab = useCallback(
    async (row: WorkOrder, mode: FeedbackEntryMode = "create") => {
      if (!workOrderStatusAllowsFeedbackTab(row.status)) return;
      await openEdit(row);
      applyFeedbackEntry(row, mode);
      setActiveTabIndex(orderDialogTabs.Feedback);
    },
    [applyFeedbackEntry, openEdit],
  );

  const openDocumentsTab = useCallback(
    async (row: WorkOrder) => {
      await openEdit(row);
      setActiveTabIndex(orderDialogTabs.Documents);
    },
    [openEdit],
  );

  const openMessagesTab = useCallback(
    async (row: WorkOrder) => {
      await openEdit(row);
      setActiveTabIndex(orderDialogTabs.Messages);
    },
    [openEdit],
  );

  const sendMessage = useCallback(
    async (body: string, replyToMessageId?: string | null) => {
      if (!editingId) return;
      setWorkOrderMessageSending(true);
      try {
        const created = await sendWorkOrderMessage(editingId, { body, replyToMessageId });
        setWorkOrderMessages((current) => {
          if (current.some((entry) => entry.id === created.id)) return current;
          return [...current, created];
        });
        setWorkOrderMessagesLoadedOrderId(editingId);
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("workOrders.messagesSendError"), life: 6000 });
        throw new Error("send_message");
      } finally {
        setWorkOrderMessageSending(false);
      }
    },
    [editingId, t, toastRef],
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

  const showSaveError = useCallback(
    async (res: Response, parsedError?: string) => {
      let code = parsedError;
      if (!code) {
        try {
          const body = (await res.json()) as { error?: string };
          code = body.error;
        } catch {
          /* ignore */
        }
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
      if (code === "responsible_required") detail = t("workOrders.responsibleRequired");
      if (code === "responsible_employee_not_leader") detail = t("workOrders.responsibleEmployeeNotLeader");
      if (code === "employee_not_in_workgroup") detail = t("workOrders.employeeNotInWorkgroup");
      if (code === "assignments_incompatible_with_workgroup") {
        detail = t("workOrders.assignmentsIncompatibleWithWorkgroup");
      }
      if (code === "invalid_original_wo") detail = t("workOrders.invalidOriginalWo");
      toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
    },
    [t, toastRef],
  );

  const finalizeSavedOrder = useCallback(
    async (saved: WorkOrder) => {
      const pendingAssignIds = Array.from(new Set(assignmentEmployeeIds.filter(Boolean)));
      if (pendingAssignIds.length > 0) {
        const assignOk = await postAssignmentsForOrder(saved.id, pendingAssignIds, {
          checkFormSavedWorkgroup: false,
        });
        if (!assignOk) {
          return false;
        }
        setAssignmentEmployeeIds([]);
        await loadAssignments(saved.id);
      }
      if (pendingFiles.length > 0) {
        setUploading(true);
        try {
          const uploads = await Promise.all(pendingFiles.map((doc) => uploadDocument(saved.id, doc)));
          if (uploads.some((ok) => !ok)) {
            toastRef.current?.show({
              severity: "warn",
              summary: t("workOrders.documentsUploadPartialError"),
              life: 5000,
            });
          } else {
            toastRef.current?.show({ severity: "success", summary: t("workOrders.documentsUploaded"), life: 3000 });
          }
        } finally {
          setUploading(false);
        }
      }
      onOrderUpdated?.(saved);
      closeDialog();
      setPendingFiles([]);
      await refreshExternal();
      toastRef.current?.show({
        severity: "success",
        summary: editingId ? t("workOrders.saved") : t("workOrders.created"),
        life: 3000,
      });
      return true;
    },
    [
      assignmentEmployeeIds,
      closeDialog,
      editingId,
      loadAssignments,
      onOrderUpdated,
      pendingFiles,
      postAssignmentsForOrder,
      refreshExternal,
      t,
      toastRef,
      uploadDocument,
    ],
  );

  const submitWorkOrderPayload = useCallback(
    async (
      payload: WorkOrderSavePayload,
      allowAssetOverlap: boolean,
    ): Promise<
      | { ok: true; row: WorkOrder }
      | { ok: false; kind: "asset_conflict"; conflict: WorkOrderAssetConflictPayload }
      | { ok: false; kind: "error" }
    > => {
      const url = editingId ? `/api/work-orders/${editingId}` : "/api/work-orders";
      const res = await apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(allowAssetOverlap ? { ...payload, allowAssetOverlap: true } : payload),
      });
      if (res.status === 409) {
        let data: {
          error?: string;
          assetKey?: string;
          assetName?: string;
          conflicts?: WorkOrderPlanningConflict[];
          sameDayConflict?: boolean;
        } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          /* ignore */
        }
        if (data.error === "asset_conflict" && data.conflicts?.length) {
          return {
            ok: false,
            kind: "asset_conflict",
            conflict: {
              assetKey: data.assetKey ?? "",
              assetName: data.assetName ?? "",
              conflicts: data.conflicts,
              sameDayConflict: data.sameDayConflict ?? true,
            },
          };
        }
        await showSaveError(res, data.error);
        return { ok: false, kind: "error" };
      }
      if (!res.ok) {
        await showSaveError(res);
        return { ok: false, kind: "error" };
      }
      return { ok: true, row: (await res.json()) as WorkOrder };
    },
    [editingId, showSaveError],
  );

  const confirmAssetConflictSave = useCallback(
    (conflict: WorkOrderAssetConflictPayload) =>
      new Promise<boolean>((resolve) => {
        confirmDialog({
          message: createElement(PlanningConflictWarning, {
            assetKey: conflict.assetKey,
            assetName: conflict.assetName,
            conflicts: conflict.conflicts,
            sameDayConflict: conflict.sameDayConflict,
          }),
          header: t("workOrders.assetConflictConfirmTitle"),
          className: "app-planning-conflict-confirm app-dialog-sm",
          acceptLabel: t("workOrders.saveDespiteAssetConflict"),
          rejectLabel: t("workOrders.no"),
          accept: () => resolve(true),
          reject: () => resolve(false),
        });
      }),
    [t],
  );

  const save = useCallback(async () => {
    const name = form.name.trim();
    const description = form.description.trim();
    if (!name || !form.assetId || !form.costCenterId || !form.plannedStart || !form.workgroupId.trim() || form.responsibleEmployeeIds.length === 0) {
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
      const payload: WorkOrderSavePayload = {
        name,
        description: description || null,
        assetId: form.assetId,
        costCenterId: form.costCenterId,
        plannedStart: form.plannedStart.toISOString(),
        plannedEnd: form.plannedEnd ? form.plannedEnd.toISOString() : null,
        plannedDurationMinutes,
        orderType: form.orderType,
        responsibleEmployeeIds: [...form.responsibleEmployeeIds],
        workgroupId: form.workgroupId.trim(),
        classificationId: form.classificationId.trim() || null,
        ...(editingId ? {} : { originalWo: form.originalWoId.trim() || null }),
      };

      let result = await submitWorkOrderPayload(payload, false);
      if (!result.ok && result.kind === "asset_conflict") {
        setSaving(false);
        const confirmed = await confirmAssetConflictSave(result.conflict);
        if (!confirmed) return;
        setSaving(true);
        result = await submitWorkOrderPayload(payload, true);
      }
      if (!result.ok) return;
      await finalizeSavedOrder(result.row);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("workOrders.saveError"), life: 6000 });
    } finally {
      setSaving(false);
    }
  }, [
    confirmAssetConflictSave,
    editingId,
    finalizeSavedOrder,
    form,
    submitWorkOrderPayload,
    t,
    toastRef,
  ]);

  const removeAssignment = useCallback(
    async (employeeId: string) => {
      if (!editingId) return;
      const res = await apiFetch(`/api/work-orders/${editingId}/assignments/${employeeId}`, { method: "DELETE" });
      if (!res.ok) {
        toastRef.current?.show({ severity: "warn", summary: t("workOrders.assignmentLockedByStatus"), life: 5000 });
        return;
      }
      await Promise.all([loadAssignments(editingId), refreshExternal()]);
    },
    [editingId, loadAssignments, refreshExternal, t, toastRef],
  );

  const startOrder = useCallback(
    async (row: WorkOrder) => {
      const res = await apiFetch(`/api/work-orders/${row.id}/start`, { method: "POST" });
      if (!res.ok) {
        toastRef.current?.show({ severity: "warn", summary: t("workOrders.cannotStartFromStatus"), life: 4000 });
        return;
      }
      const updated = (await res.json()) as WorkOrder;
      if (editingId === updated.id) {
        setEditingMeta(workOrderToEditMeta(updated));
      }
      onOrderUpdated?.(updated);
      await refreshExternal();
    },
    [editingId, onOrderUpdated, refreshExternal, t, toastRef],
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
      setEditingMeta(workOrderToEditMeta(updated));
      onOrderUpdated?.(updated);
      await refreshExternal();
      setFeedbackHours("");
      setFeedbackRemark("");
      setFeedbackPauseRemark("");
      setFeedbackStatusAction("none");
      setFeedbackAdditionalHours([]);
      closeDialog();
      toastRef.current?.show({ severity: "success", summary: t("workOrders.feedbackSaved"), life: 3000 });
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("workOrders.feedbackSaveError"), life: 6000 });
    } finally {
      setFeedbackSaving(false);
    }
  }, [
    closeDialog,
    editingId,
    feedbackAdditionalHours,
    feedbackHours,
    feedbackPauseRemark,
    feedbackRemark,
    feedbackStatusAction,
    onOrderUpdated,
    refreshExternal,
    t,
    toastRef,
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

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  const handlePickFiles = useCallback(
    (ev: ChangeEvent<HTMLInputElement>) => {
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
    },
    [schedulePendingAutoUpload],
  );

  const removePendingFileByLocalId = useCallback(
    (localId: string) => {
      clearPendingAutoTimer(localId);
      setPendingFiles((cur) => cur.filter((p) => p.localId !== localId));
    },
    [clearPendingAutoTimer],
  );

  const openFeedbackAthene = useCallback(() => {
    if (!editingRow) return;
    const row = editingRow;
    athene.openForFeedback({
      workOrderId: row.id,
      label: `#${row.orderNumber} - ${row.name}`,
      data: {
        orderNumber: row.orderNumber,
        name: row.name,
        status: row.status,
        siteId: row.siteId,
        siteKey: row.siteKey,
        assetId: row.assetId,
        assetKey: row.assetKey,
        assetName: row.assetName,
      },
      draftRemark: feedbackRemark,
      draftPauseRemark: feedbackPauseRemark,
      onApplyText: (field, text) => {
        if (field === "pauseRemark") setFeedbackPauseRemark(text);
        else setFeedbackRemark(text);
      },
    });
  }, [athene, editingRow, feedbackPauseRemark, feedbackRemark]);

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
      : (editingMeta?.transactionCount ?? 0);
  const messagesTabCount =
    workOrderMessagesLoadedOrderId === editingId ? workOrderMessages.length : 0;

  const orderStatusForUi = editingMeta?.status ?? "open";
  const orderNumberForTitle = editingId ? (editingMeta?.orderNumber ?? form.orderNumber) : null;

  return {
    t,
    dialogVisible,
    closeDialog,
    editingId,
    editingMeta,
    editingRow,
    form,
    setForm,
    activeTabIndex,
    setActiveTabIndex,
    openCreate,
    openCopyAsNew,
    openEdit,
    openPlanningTab,
    openFeedbackTab,
    openDocumentsTab,
    openMessagesTab,
    applyFeedbackEntry,
    copyWorkOrder,
    fileInputRef,
    tabHostRef,
    updateTabInk,
    atheneBusy: athene.busy,
    openFeedbackAthene,
    startOrder,
    save,
    saveFeedback,
    orderNumberForTitle,
    orderStatusForUi,
    statusLabel,
    orderTypeOptions,
    assetOptions,
    costCenterOptions,
    classificationOptions,
    workgroupOptions,
    employeeOptions,
    responsibleEmployeeOptions,
    calendarDateFormat,
    assignments,
    assignmentsLoading,
    assignmentsCascadeSeed,
    assignmentEmployeeIds,
    setAssignmentEmployeeIds,
    assignmentEmployeeOptions,
    assignmentAdding,
    addAssignments,
    removeAssignment,
    saving,
    documents,
    documentsLoading,
    documentsSearchTerm,
    setDocumentsSearchTerm,
    pendingFiles,
    filteredPendingFiles,
    filteredDocuments,
    pendingUiTick,
    pendingRowUploading,
    uploading,
    handlePickFiles,
    removePendingFileByLocalId,
    openDocumentContent,
    deleteDocument,
    formatShortDt,
    formatFileSize,
    documentEdit,
    setDocumentEdit,
    documentEditDisplayName,
    setDocumentEditDisplayName,
    documentEditCategory,
    setDocumentEditCategory,
    documentEditSaving,
    saveDocumentEdit,
    feedbackHours,
    setFeedbackHours,
    feedbackRemark,
    setFeedbackRemark,
    feedbackPauseRemark,
    setFeedbackPauseRemark,
    feedbackStatusAction,
    setFeedbackStatusAction,
    feedbackEntryMode,
    feedbackAdditionalHours,
    setFeedbackAdditionalHours,
    feedbackSaving,
    feedbackTransactions,
    feedbackTransactionsLoading,
    workOrderMessages,
    workOrderMessagesLoading,
    workOrderMessageSending,
    sendMessage,
    reportingEmployeeLabel,
    feedbackAdditionalEmployeeOptions,
    userEmployeeId: user.employeeId,
    currentUserId: user.id,
    isFeedbackTab,
    documentsTabCount,
    assignmentsTabCount,
    feedbackTabCount,
    transactionsTabCount,
    messagesTabCount,
    updatePlannedDuration,
  };
}
