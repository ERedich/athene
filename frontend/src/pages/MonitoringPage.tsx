import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  CircleHelp,
  Pencil,
  Plus,
  Search,
  Timer,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { useAtheneAssistant } from "../assistant/AtheneAssistantContext";
import { useAuth } from "../auth/AuthContext";
import { APP_PARAM_KEY_ENABLE_CLEVER_SEARCH } from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { useTableBigContextMenu } from "../lib/useTableBigContextMenu";
import { useWorkOrderReportPrint } from "../lib/useWorkOrderReportPrint";
import { buildWorkOrderBigMenuModel } from "../lib/workOrderBigContextMenu";
import { WorkOrderOverviewOverlay } from "../components/workOrders/WorkOrderOverviewOverlay";
import { WorkOrderEditPageView } from "../components/workOrders/WorkOrderEditPageView";
import { WorkOrderReferencesCell } from "../components/workOrders/WorkOrderReferencesCell";
import { WorkOrderSearchPanel } from "../components/workOrders/WorkOrderSearchPanel";
import { useWorkOrderOverviewPanel } from "../hooks/useWorkOrderOverviewPanel";
import { useWorkOrderSearchReferenceData } from "../hooks/useWorkOrderSearchReferenceData";
import { MONITORING_HELP_STEPS } from "../onboarding/monitoringHelpSteps";
import { useAtheneTour } from "../onboarding/useAtheneTour";
import { orderDialogTabs, type FeedbackEntryMode } from "../lib/workOrderDialog";
import { mergeWorkOrderIntoAdvancedSearch } from "../lib/workOrderCleverSearch";
import {
  buildWorkOrderListQueryString,
  coerceWorkOrderAdvancedSearch,
  emptyWorkOrderAdvancedSearch,
  hasActiveWorkOrderAdvancedSearch,
  parseWorkOrderDeeplinkParams,
  type WorkOrderAdvancedSearchState,
} from "../lib/workOrderApiFilters";
import { fetchWorkOrderList } from "../lib/workOrderListApi";
import { ordersTableVirtualScrollerOptions } from "../lib/ordersTableVirtualScroller";
import {
  createWorkOrderSearchPreset,
  fetchWorkOrderSearchPresetDefaults,
  fetchWorkOrderSearchPresetDetail,
  fetchWorkOrderSearchPresets,
  isSamePresetId,
} from "../lib/workOrderSearchPresetApi";
import {
  clearLegacyMonitoringTableStateStorage,
  MONITORING_TABLE_STATE_STORAGE_KEY,
} from "../lib/monitoringTableState";
import { workOrderStatusAllowsFeedbackTab } from "../lib/workOrderStatus";
import { formatOriginalWoCell, type WorkOrder, WorkOrderStatus, WorkOrderType } from "../lib/workOrderTypes";
import { useWorkOrderDialog } from "../workOrders/WorkOrderDialogContext";
import { useWorkOrderSubscriptions } from "../workOrders/WorkOrderSubscriptionContext";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import {
  AppPauseIcon,
  AppPlayStartIcon,
  AppSquareStopIcon,
  lucidePrimeBtnIcon,
} from "../icons/lucide";

const MONITOR_HIGHLIGHT_MS = 10_000;
const MONITOR_HIGHLIGHT_FADE_MS = 1_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days past planned end; negative / zero means not yet overdue by a full day. */
function daysPastPlannedEnd(plannedEnd: string, nowMs = Date.now()): number {
  const endMs = new Date(plannedEnd).getTime();
  if (!Number.isFinite(endMs)) return 0;
  return Math.floor((nowMs - endMs) / MS_PER_DAY);
}

/** Orange stopwatch: 1–7 days past end; red: more than 7. Closed/cancelled orders are ignored. */
function monitoringOverdueSeverity(row: WorkOrder): "warning" | "critical" | null {
  if (row.status === "done" || row.status === "cancelled") return null;
  const days = daysPastPlannedEnd(row.plannedEnd);
  if (days > 7) return "critical";
  if (days >= 1) return "warning";
  return null;
}

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const deleteActionIcon = "text-red-500";

export function MonitoringPage() {
  const { t, i18n } = useTranslation();
  const athene = useAtheneAssistant();
  const { appParameterBooleans } = useAuth();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const { openPrintDialog, PrintDialogEl } = useWorkOrderReportPrint(toastRef);
  const overview = useWorkOrderOverviewPanel();
  const woDialog = useWorkOrderDialog();
  const subscriptions = useWorkOrderSubscriptions();
  /** Reference data only needed for the search panel — defer so the table shell can open immediately. */
  const refData = useWorkOrderSearchReferenceData({ autoLoad: false, includeAssets: false });
  const [searchParams, setSearchParams] = useSearchParams();
  const helpTour = useAtheneTour({
    steps: MONITORING_HELP_STEPS,
    labels: {
      stepOfKey: "monitoring.helpTour.stepOf",
      skipKey: "monitoring.helpTour.skip",
      backKey: "monitoring.helpTour.back",
      nextKey: "monitoring.helpTour.next",
      finishKey: "monitoring.helpTour.finish",
    },
  });

  /** Deeplink filters (e.g. dashboard KPI links) captured once on mount; takes precedence over the default preset. */
  const initialDeeplinkRef = useRef<ReturnType<typeof parseWorkOrderDeeplinkParams> | undefined>(undefined);
  if (initialDeeplinkRef.current === undefined) {
    initialDeeplinkRef.current = parseWorkOrderDeeplinkParams(searchParams);
  }
  const initialDeeplink = initialDeeplinkRef.current;

  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [newlyCreatedOrderIds, setNewlyCreatedOrderIds] = useState<Record<string, number>>({});
  const [updatedOrderIds, setUpdatedOrderIds] = useState<Record<string, number>>({});
  const [deletedOrderIds, setDeletedOrderIds] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState(() => initialDeeplink?.quickSearch ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => initialDeeplink?.quickSearch.trim() ?? "");
  const [appliedAdvanced, setAppliedAdvanced] = useState<WorkOrderAdvancedSearchState>(() =>
    initialDeeplink ? coerceWorkOrderAdvancedSearch(initialDeeplink.advanced) : emptyWorkOrderAdvancedSearch(),
  );
  const [panelDraft, setPanelDraft] = useState<WorkOrderAdvancedSearchState>(() =>
    initialDeeplink ? coerceWorkOrderAdvancedSearch(initialDeeplink.advanced) : emptyWorkOrderAdvancedSearch(),
  );
  const [searchPanelVisible, setSearchPanelVisible] = useState(false);
  const [searchPresets, setSearchPresets] = useState<{ id: string; name: string; isOwner: boolean }[]>([]);
  const [headerPresetSelectionId, setHeaderPresetSelectionId] = useState<string | null>(null);
  /** With a deeplink, orders can load immediately; otherwise wait for default-preset bootstrap. */
  const [searchBootstrapDone, setSearchBootstrapDone] = useState(() => Boolean(initialDeeplink));

  const cleverSearchEnabled = Boolean(appParameterBooleans[APP_PARAM_KEY_ENABLE_CLEVER_SEARCH]);
  const virtualScrollerOptions = useMemo(() => ordersTableVirtualScrollerOptions(), []);
  const selectedOrderRef = useRef<WorkOrder | null>(null);
  selectedOrderRef.current = selectedOrder;
  const searchBootstrapDoneRef = useRef(false);

  const userIdByLoginName = useMemo(() => {
    const byLoginName = new Map(refData.directoryUsers.map((u) => [u.loginName.trim().toLowerCase(), u.id]));
    return (loginName: string) => byLoginName.get(loginName.trim().toLowerCase()) ?? null;
  }, [refData.directoryUsers]);

  const headerPresetDropdownOptions = useMemo(
    () => searchPresets.map((p) => ({ label: p.name, value: p.id })),
    [searchPresets],
  );

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
            orderType: "maintenance" as const,
            status: "open" as const,
            responsibleEmployeeIds: [],
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
            originalWo: null,
            originalWoOrderNumber: null,
            originalWoName: null,
            maintenancePlanId: null,
            maintenancePlanKey: null,
            maintenancePlanName: null,
            inspectionRoundId: null,
            inspectionRoundKey: null,
            inspectionRoundName: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: "…",
            updatedBy: "…",
            documentCount: 0,
            assetDocumentCount: 0,
            assignedEmployeeCount: 0,
            transactionCount: 0,
            inspectionPointCount: 0,
            checkedInspectionPointCount: 0,
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
    if (!woDialog.useModalPresentation && woDialog.dialogVisible) {
      setHeaderRowCount(null);
      return () => setHeaderRowCount(null);
    }
    setHeaderRowCount(orders.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [orders.length, setHeaderRowCount, woDialog.dialogVisible, woDialog.useModalPresentation]);

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

  const openSearchPanel = useCallback(() => {
    setPanelDraft(appliedAdvanced);
    setSearchPanelVisible(true);
  }, [appliedAdvanced]);

  /** Load sites/assets/… only when the advanced search panel is opened. */
  useEffect(() => {
    if (!searchPanelVisible || refData.loaded) return;
    void refData.reload();
  }, [refData.loaded, refData.reload, searchPanelVisible]);

  const bootstrapSearchPresets = useCallback(async () => {
    const deeplink = initialDeeplinkRef.current;
    try {
      // Overlap defaults → detail with presets list to save one Neon RTT when a default exists.
      const defaultsPromise = fetchWorkOrderSearchPresetDefaults();
      const presetsPromise = fetchWorkOrderSearchPresets();
      const defaults = await defaultsPromise;
      const defaultId = defaults.monitoringPresetId;
      const detailPromise =
        !deeplink && defaultId ? fetchWorkOrderSearchPresetDetail(defaultId) : null;
      const rows = await presetsPromise;
      setSearchPresets(rows);
      if (deeplink) return;
      const match = defaultId ? rows.find((p) => isSamePresetId(p.id, defaultId)) : undefined;
      if (match && detailPromise) {
        const d = await detailPromise;
        const q = d.payload.quickSearch ?? "";
        setSearchTerm(q);
        setDebouncedSearch(q.trim());
        setAppliedAdvanced(coerceWorkOrderAdvancedSearch(d.payload.advanced));
        setPanelDraft(coerceWorkOrderAdvancedSearch(d.payload.advanced));
        setHeaderPresetSelectionId(match.id);
      }
    } catch {
      setSearchPresets([]);
    } finally {
      setSearchBootstrapDone(true);
    }
  }, []);

  useEffect(() => {
    if (initialDeeplinkRef.current) {
      setSearchParams({}, { replace: true });
    }
  }, [setSearchParams]);

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
        setAppliedAdvanced(coerceWorkOrderAdvancedSearch(d.payload.advanced));
        setPanelDraft(coerceWorkOrderAdvancedSearch(d.payload.advanced));
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

  const loadDataGenRef = useRef(0);
  const loadData = useCallback(async () => {
    const gen = ++loadDataGenRef.current;
    setLoading(true);
    try {
      const qs = buildWorkOrderListQueryString(debouncedSearch, appliedAdvanced);
      const page = await fetchWorkOrderList({ queryString: qs, offset: 0 });
      if (gen !== loadDataGenRef.current) return;
      setOrders(page.rows);
      setHasMoreOrders(page.hasMore);
    } catch {
      if (gen !== loadDataGenRef.current) return;
      toastRef.current?.show({ severity: "error", summary: t("workOrders.loadError"), life: 6000 });
    } finally {
      if (gen === loadDataGenRef.current) setLoading(false);
    }
  }, [appliedAdvanced, debouncedSearch, t]);

  const loadMoreOrders = useCallback(async () => {
    if (loadingMoreOrders || !hasMoreOrders || loading) return;
    setLoadingMoreOrders(true);
    try {
      const qs = buildWorkOrderListQueryString(debouncedSearch, appliedAdvanced);
      const page = await fetchWorkOrderList({ queryString: qs, offset: orders.length });
      setOrders((current) => {
        const seen = new Set(current.map((row) => row.id));
        const merged = [...current];
        for (const row of page.rows) {
          if (!seen.has(row.id)) merged.push(row);
        }
        return merged;
      });
      setHasMoreOrders(page.hasMore);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("workOrders.loadMoreError"), life: 6000 });
    } finally {
      setLoadingMoreOrders(false);
    }
  }, [appliedAdvanced, debouncedSearch, hasMoreOrders, loading, loadingMoreOrders, orders.length, t]);

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
      setDeletedOrderIds((current) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const [orderId, deletedAt] of Object.entries(current)) {
          if (now - deletedAt <= totalHighlightMs) {
            next[orderId] = deletedAt;
          } else {
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const liveDemoRanRef = useRef(false);

  /** Help tour live step: demo create/update/delete row flashes on the first four visible rows. */
  useEffect(() => {
    if (!helpTour.active || helpTour.currentStepId !== "live") {
      liveDemoRanRef.current = false;
      return;
    }
    if (liveDemoRanRef.current) return;
    const ids = orders.slice(0, 4).map((row) => row.id);
    if (ids.length === 0) return;
    liveDemoRanRef.current = true;
    const now = Date.now();
    // create (green), update (blue), delete (red), update (blue)
    setNewlyCreatedOrderIds((current) => (ids[0] ? { ...current, [ids[0]]: now } : current));
    setUpdatedOrderIds((current) => {
      const next = { ...current };
      if (ids[1]) next[ids[1]] = now;
      if (ids[3]) next[ids[3]] = now;
      return next;
    });
    setDeletedOrderIds((current) => (ids[2] ? { ...current, [ids[2]]: now } : current));
  }, [helpTour.active, helpTour.currentStepId, orders]);

  useEffect(
    () =>
      subscriptions.onWorkOrderEvent((message) => {
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
      }),
    [subscriptions],
  );

  const onDialogSaved = useCallback(() => {
    void loadData();
  }, [loadData]);

  const openCreate = useCallback(() => {
    woDialog.openCreate({ onSaved: onDialogSaved });
  }, [onDialogSaved, woDialog]);

  const openCopy = useCallback(
    (row: WorkOrder) => {
      woDialog.openCopy(row, { onSaved: onDialogSaved });
    },
    [onDialogSaved, woDialog],
  );

  const openFollowUpOrder = useCallback(
    (row: WorkOrder) => {
      woDialog.openFollowUp(row, { onSaved: onDialogSaved });
    },
    [onDialogSaved, woDialog],
  );

  const openEdit = useCallback(
    (row: WorkOrder) => {
      woDialog.openEdit(row, { onSaved: onDialogSaved });
    },
    [onDialogSaved, woDialog],
  );

  const openPlanningTab = useCallback(
    (row: WorkOrder) => {
      woDialog.openEdit(row, { tab: orderDialogTabs.Planning, onSaved: onDialogSaved });
    },
    [onDialogSaved, woDialog],
  );

  const openFeedbackTab = useCallback(
    (row: WorkOrder, mode: FeedbackEntryMode = "create") => {
      if (!workOrderStatusAllowsFeedbackTab(row.status)) return;
      woDialog.openEdit(row, {
        tab: orderDialogTabs.Feedback,
        feedbackMode: mode,
        onSaved: onDialogSaved,
      });
    },
    [onDialogSaved, woDialog],
  );

  const openDocumentsTab = useCallback(
    (row: WorkOrder) => {
      woDialog.openEdit(row, { tab: orderDialogTabs.Documents, onSaved: onDialogSaved });
    },
    [onDialogSaved, woDialog],
  );

  const openInspectionPointsTab = useCallback(
    (row: WorkOrder) => {
      woDialog.openEdit(row, { tab: orderDialogTabs.InspectionPoints, onSaved: onDialogSaved });
    },
    [onDialogSaved, woDialog],
  );

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
    if (!woDialog.useModalPresentation && woDialog.dialogVisible) {
      setHeaderActions(null);
      return () => setHeaderActions(null);
    }
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button
            type="button"
            data-onboarding="mon-create"
            className={createActionNavItem}
            onClick={openCreate}
          >
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
        <li
          aria-hidden
          className="mx-1 h-6 w-px shrink-0 bg-[color-mix(in_srgb,var(--color-on-surface)_20%,transparent)]"
        />
        <li>
          <button
            type="button"
            data-onboarding="mon-filter"
            className={primaryActionNavItem}
            onClick={openSearchPanel}
          >
            <Search className={`${primaryActionIcon} !h-4 !w-4 shrink-0`} size={16} strokeWidth={1.75} aria-hidden />
            <span>{t("workOrders.searchPanel.open")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            data-onboarding="monitoring-help"
            className={primaryActionNavItem}
            onClick={helpTour.start}
          >
            <CircleHelp className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("monitoring.help")}</span>
          </button>
        </li>
        <li className="ml-auto flex items-center gap-2" data-onboarding="mon-presets">
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
    applyHeaderSearchPreset,
    confirmDelete,
    headerPresetDropdownOptions,
    headerPresetSelectionId,
    helpTour.start,
    openCreate,
    openEdit,
    openSearchPanel,
    searchPresets.length,
    searchTerm,
    selectedOrder,
    setHeaderActions,
    t,
    woDialog.dialogVisible,
    woDialog.useModalPresentation,
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
    (value: WorkOrderType) => refData.typeLabel(value),
    [refData],
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

  const referencesBody = useCallback(
    (row: WorkOrder) => (
      <WorkOrderReferencesCell
        row={row}
        onOpenDocuments={openDocumentsTab}
        onOpenPlanning={openPlanningTab}
        onOpenInspectionPoints={openInspectionPointsTab}
        emptyBadgePlaceholder
      />
    ),
    [openDocumentsTab, openInspectionPointsTab, openPlanningTab],
  );

  const statusLabel = useCallback((status: WorkOrderStatus) => t(`workOrders.statusValues.${status}`), [t]);

  const statusBody = useCallback((row: WorkOrder) => statusLabel(row.status), [statusLabel]);

  const orderNumberBody = useCallback(
    (row: WorkOrder) => {
      if (isPreloadMode) return "…";
      const severity = monitoringOverdueSeverity(row);
      const overdueTitle =
        severity === "critical"
          ? t("monitoring.overdueMoreThan7Days")
          : severity === "warning"
            ? t("monitoring.overdue1To7Days")
            : undefined;
      return (
        <span className="inline-flex items-center gap-1.5">
          <span>{row.orderNumber}</span>
          {severity ? (
            <span title={overdueTitle} className="inline-flex">
              <Timer
                className={`h-3.5 w-3.5 shrink-0 ${
                  severity === "critical" ? "text-red-500" : "text-orange-500"
                }`}
                strokeWidth={2}
                aria-label={overdueTitle}
              />
            </span>
          ) : null}
        </span>
      );
    },
    [isPreloadMode, t],
  );

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

  const closeWorkOrder = useCallback(
    async (row: WorkOrder) => {
      try {
        const res = await apiFetch(`/api/work-orders/${row.id}/done`, { method: "POST" });
        if (!res.ok) {
          let code: string | undefined;
          try {
            code = ((await res.json()) as { error?: string }).error;
          } catch {
            /* ignore */
          }
          const msg =
            code === "cannot_done_from_status"
              ? t("workOrders.cannotCloseFromStatus")
              : t("workOrders.closeError");
          toastRef.current?.show({ severity: "warn", summary: msg, life: 5000 });
          return;
        }
        const updated = (await res.json()) as WorkOrder;
        setSelectedOrder((cur) => (cur?.id === updated.id ? updated : cur));
        await loadData();
        toastRef.current?.show({ severity: "success", summary: t("workOrders.closed"), life: 3000 });
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("workOrders.closeError"), life: 6000 });
      }
    },
    [loadData, t],
  );

  const confirmCloseWorkOrder = useCallback(
    (row: WorkOrder) => {
      confirmDialog({
        message: t("workOrders.confirmClose", { name: row.name }),
        header: t("workOrders.confirmCloseTitle"),
        icon: <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />,
        acceptLabel: t("workOrders.yes"),
        rejectLabel: t("workOrders.no"),
        accept: () => void closeWorkOrder(row),
      });
    },
    [closeWorkOrder, t],
  );

  const bigMenuModel = useMemo(
    () =>
      buildWorkOrderBigMenuModel(selectedOrder, t, {
        atheneBusy: athene.busy,
        onAskAthene: (row) => {
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
        onFollowUpOrder: openFollowUpOrder,
        onCreate: openCreate,
        onCopy: openCopy,
        onEdit: openEdit,
        onDelete: confirmDelete,
        onStart: (row) => void startOrder(row),
        onStop: (row) => openFeedbackTab(row, "stop"),
        onPause: (row) => openFeedbackTab(row, "pause"),
        onAssignEmployees: openPlanningTab,
        onCreateFeedback: (row) => openFeedbackTab(row, "create"),
        onCloseOrder: confirmCloseWorkOrder,
        onCancelOrder: confirmCancelWorkOrder,
        onPrint: (row) => {
          void openPrintDialog(row);
        },
        subscription: {
          isSubscribed: (id) => subscriptions.isSubscribed(id),
          onToggle: (row) => {
            void (async () => {
              try {
                if (subscriptions.isSubscribed(row.id)) {
                  await subscriptions.unsubscribe(row.id);
                } else {
                  await subscriptions.subscribe(row.id);
                }
              } catch {
                toastRef.current?.show({
                  severity: "error",
                  summary: t("abonnements.subscriptionActionError"),
                  life: 6000,
                });
              }
            })();
          },
        },
      }),
    [
      athene,
      confirmCancelWorkOrder,
      confirmCloseWorkOrder,
      confirmDelete,
      openCreate,
      openCopy,
      openEdit,
      openFeedbackTab,
      openFollowUpOrder,
      openPlanningTab,
      openPrintDialog,
      selectedOrder,
      startOrder,
      subscriptions,
      t,
    ],
  );

  const tableCtx = useTableBigContextMenu<WorkOrder>({
    selection: selectedOrder,
    setSelection: setSelectedOrder,
    sections: bigMenuModel.sections,
    header: bigMenuModel.header,
    cornerAction: bigMenuModel.cornerAction,
  });

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

  useEffect(() => {
    clearLegacyMonitoringTableStateStorage();
  }, []);

  if (!woDialog.useModalPresentation && woDialog.dialogVisible && woDialog.editDialogState) {
    return <WorkOrderEditPageView {...woDialog.editDialogState} />;
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      {helpTour.coachmark}
      <Toast ref={toastRef} position="top-right" />
      {PrintDialogEl}
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
        siteOptions={refData.searchSiteOptions}
        assetOptions={refData.searchAssetOptions}
        assetSuggestMode
        costCenterOptions={refData.searchCostCenterOptions}
        classificationOptions={refData.searchClassificationOptions}
        workgroupOptions={refData.searchWorkgroupOptions}
        employeeOptions={refData.searchEmployeeOptions}
        maintenancePlanOptions={refData.searchMaintenancePlanOptions}
        userOptions={refData.searchUserOptions}
        typeOrder={refData.typeOrder}
        typeLabel={refData.typeLabel}
        statusLabel={refData.statusLabel}
        calendarDateFormat={refData.calendarDateFormat}
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
      <WorkOrderOverviewOverlay order={overviewOrder} onHide={overview.onHide} />
      {!isPreloadMode ? tableCtx.BigContextMenuEl : null}

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        data-onboarding="mon-table"
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
          stateKey={MONITORING_TABLE_STATE_STORAGE_KEY}
          virtualScrollerOptions={virtualScrollerOptions}
          emptyMessage={t("workOrders.empty")}
          rowClassName={(row) => {
            const id = (row as WorkOrder).id;
            if (deletedOrderIds[id]) return "app-monitoring-deleted-row";
            if (newlyCreatedOrderIds[id]) return "app-monitoring-new-row";
            if (updatedOrderIds[id]) return "app-monitoring-updated-row";
            return "";
          }}
        >
          <Column
            field="orderNumber"
            header={t("workOrders.orderNumber")}
            sortable={!isPreloadMode}
            body={orderNumberBody}
          />
          <Column
            field="originalWoOrderNumber"
            header={t("workOrders.originalWo")}
            sortable={!isPreloadMode}
            body={(row: WorkOrder) => (isPreloadMode ? "…" : formatOriginalWoCell(row))}
            style={{ width: "7rem", minWidth: "7rem", maxWidth: "7rem" }}
          />
          <Column
            field="maintenancePlanKey"
            header={t("workOrders.maintenancePlan")}
            sortable={!isPreloadMode}
            body={(row: WorkOrder) =>
              isPreloadMode
                ? "…"
                : row.maintenancePlanKey
                  ? `${row.maintenancePlanKey}${row.maintenancePlanName ? ` — ${row.maintenancePlanName}` : ""}`
                  : "—"
            }
            style={{ minWidth: "10rem" }}
          />
          <Column
            field="name"
            header={t("workOrders.name")}
            sortable={!isPreloadMode}
          />
          <Column
            field="status"
            header={<span data-onboarding="mon-status">{t("workOrders.status")}</span>}
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
            header={<span data-onboarding="mon-references">{t("workOrders.references")}</span>}
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
          <Column
            columnKey="plannedDuration"
            header={t("workOrders.plannedDuration")}
            body={durationBody}
          />
          <Column
            columnKey="startStop"
            header={<span data-onboarding="mon-start-stop">{t("workOrders.startStop")}</span>}
            body={startStopBody}
            style={{ width: "7.5rem", minWidth: "7.5rem" }}
          />
        </DataTable>
        {hasMoreOrders && !isPreloadMode ? (
          <div className="flex shrink-0 items-center justify-center gap-3 border-t border-[var(--color-outline-variant)]/40 px-3 py-2">
            <span className="text-sm text-on-surface-variant">
              {t("workOrders.listTruncated", { count: orders.length })}
            </span>
            <Button
              type="button"
              label={t("workOrders.loadMore")}
              loading={loadingMoreOrders}
              disabled={loadingMoreOrders}
              onClick={() => void loadMoreOrders()}
              className="p-button-outlined p-button-sm"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
