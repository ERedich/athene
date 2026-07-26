import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
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
import { orderDialogTabs, type FeedbackEntryMode } from "../lib/workOrderDialog";
import { mergeWorkOrderIntoAdvancedSearch } from "../lib/workOrderCleverSearch";
import {
  buildWorkOrderListQueryString,
  coerceWorkOrderAdvancedSearch,
  emptyWorkOrderAdvancedSearch,
  type WorkOrderAdvancedSearchState,
} from "../lib/workOrderApiFilters";
import { appendWorkOrderPage, fetchRemainingWorkOrderPages, fetchWorkOrderList } from "../lib/workOrderListApi";
import { ordersTableVirtualScrollerOptions } from "../lib/ordersTableVirtualScroller";
import {
  createWorkOrderSearchPreset,
  fetchWorkOrderSearchPresetDefaults,
  fetchWorkOrderSearchPresetDetail,
  fetchWorkOrderSearchPresets,
  isSamePresetId,
} from "../lib/workOrderSearchPresetApi";
import { workOrderStatusAllowsFeedbackTab } from "../lib/workOrderStatus";
import { formatOriginalWoCell, type WorkOrder, WorkOrderStatus, WorkOrderType } from "../lib/workOrderTypes";
import { useWorkOrderDialog } from "../workOrders/WorkOrderDialogContext";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import {
  AppPauseIcon,
  AppPlayStartIcon,
  AppSquareStopIcon,
  lucidePrimeBtnIcon,
} from "../icons/lucide";

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const deleteActionIcon = "text-red-500";

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

export function WorkOrdersPage() {
  const { t, i18n } = useTranslation();
  const athene = useAtheneAssistant();
  const { appParameterBooleans, appParameterDefaultWorkgroupId } = useAuth();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const { openPrintDialog, PrintDialogEl } = useWorkOrderReportPrint(toastRef);
  const overview = useWorkOrderOverviewPanel();
  const woDialog = useWorkOrderDialog();
  const refData = useWorkOrderSearchReferenceData({ includeAssets: false });

  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [appliedAdvanced, setAppliedAdvanced] = useState<WorkOrderAdvancedSearchState>(() => emptyWorkOrderAdvancedSearch());
  const [panelDraft, setPanelDraft] = useState<WorkOrderAdvancedSearchState>(() => emptyWorkOrderAdvancedSearch());
  const [searchPanelVisible, setSearchPanelVisible] = useState(false);
  const [searchPresets, setSearchPresets] = useState<{ id: string; name: string; isOwner: boolean }[]>([]);
  const [headerPresetSelectionId, setHeaderPresetSelectionId] = useState<string | null>(null);
  const [searchBootstrapDone, setSearchBootstrapDone] = useState(false);
  const [dummyCreating, setDummyCreating] = useState(false);

  const cleverSearchEnabled = Boolean(appParameterBooleans[APP_PARAM_KEY_ENABLE_CLEVER_SEARCH]);
  const virtualScrollerOptions = useMemo(() => ordersTableVirtualScrollerOptions(), []);
  const dummyOrderInFlightRef = useRef(false);
  const selectedOrderRef = useRef<WorkOrder | null>(null);
  selectedOrderRef.current = selectedOrder;

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

  const bootstrapSearchPresets = useCallback(async () => {
    try {
      const defaultsPromise = fetchWorkOrderSearchPresetDefaults();
      const presetsPromise = fetchWorkOrderSearchPresets();
      const [defaultsResult, presetsResult] = await Promise.allSettled([defaultsPromise, presetsPromise]);
      const rows = presetsResult.status === "fulfilled" ? presetsResult.value : [];
      setSearchPresets(rows);
      const defaults = defaultsResult.status === "fulfilled" ? defaultsResult.value : null;
      const defaultId = defaults?.workOrdersPresetId ?? null;
      const match = defaultId ? rows.find((p) => isSamePresetId(p.id, defaultId)) : undefined;
      if (!match || !defaultId) return;
      try {
        const d = await fetchWorkOrderSearchPresetDetail(defaultId);
        const q = d.payload.quickSearch ?? "";
        setSearchTerm(q);
        setDebouncedSearch(q.trim());
        setAppliedAdvanced(coerceWorkOrderAdvancedSearch(d.payload.advanced));
        setPanelDraft(coerceWorkOrderAdvancedSearch(d.payload.advanced));
        setHeaderPresetSelectionId(match.id);
      } catch {
        // Keep the preset list even if the default detail fails to load.
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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildWorkOrderListQueryString(debouncedSearch, appliedAdvanced);
      const page = await fetchWorkOrderList({ queryString: qs, offset: 0 });
      setOrders(page.rows);
      setHasMoreOrders(page.hasMore);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("workOrders.loadError"), life: 6000 });
    } finally {
      setLoading(false);
    }
  }, [appliedAdvanced, debouncedSearch, t]);

  const loadMoreOrders = useCallback(async () => {
    if (loadingMoreOrders || !hasMoreOrders || loading) return;
    setLoadingMoreOrders(true);
    try {
      const qs = buildWorkOrderListQueryString(debouncedSearch, appliedAdvanced);
      const page = await fetchWorkOrderList({ queryString: qs, offset: orders.length });
      setOrders((current) => appendWorkOrderPage(current, page.rows));
      setHasMoreOrders(page.hasMore);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("workOrders.loadMoreError"), life: 6000 });
    } finally {
      setLoadingMoreOrders(false);
    }
  }, [appliedAdvanced, debouncedSearch, hasMoreOrders, loading, loadingMoreOrders, orders.length, t]);

  const loadAllOrders = useCallback(async () => {
    if (loadingMoreOrders || !hasMoreOrders || loading) return;
    setLoadingMoreOrders(true);
    try {
      const qs = buildWorkOrderListQueryString(debouncedSearch, appliedAdvanced);
      await fetchRemainingWorkOrderPages({
        queryString: qs,
        offset: orders.length,
        onPage: (page) => {
          setOrders((current) => appendWorkOrderPage(current, page.rows));
          setHasMoreOrders(page.hasMore);
        },
      });
      setHasMoreOrders(false);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("workOrders.loadAllError"), life: 6000 });
    } finally {
      setLoadingMoreOrders(false);
    }
  }, [appliedAdvanced, debouncedSearch, hasMoreOrders, loading, loadingMoreOrders, orders.length, t]);

  useEffect(() => {
    if (!searchBootstrapDone) return;
    void loadData();
  }, [loadData, searchBootstrapDone]);

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

  const showSaveError = useCallback(async (res: Response) => {
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
    if (code === "invalid_original_wo") detail = t("workOrders.invalidOriginalWo");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  }, [t]);

  const createDummyWorkOrder = useCallback(async () => {
    if (loading || dummyOrderInFlightRef.current) return;

    const assetList = [...refData.accessibleAssets].sort((a, b) => a.key.localeCompare(b.key));
    const asset = assetList[0];
    if (!asset) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("workOrders.dummyOrderNoAsset"),
        life: 5000,
      });
      return;
    }

    const activeCostCenters = refData.costCenters
      .filter((cc) => cc.siteId === asset.siteId && cc.isActive)
      .sort((a, b) => a.key.localeCompare(b.key));
    let costCenterId = "";
    if (asset.costCenterId && activeCostCenters.some((cc) => cc.id === asset.costCenterId)) {
      costCenterId = asset.costCenterId;
    } else if (activeCostCenters[0]) {
      costCenterId = activeCostCenters[0].id;
    }
    if (!costCenterId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("workOrders.dummyOrderNoCostCenter"),
        life: 5000,
      });
      return;
    }

    const activeWorkgroups = refData.workgroups
      .filter((wg) => wg.siteId === asset.siteId && wg.isActive)
      .sort((a, b) => a.key.localeCompare(b.key));
    let workgroupId = "";
    if (appParameterDefaultWorkgroupId && activeWorkgroups.some((w) => w.id === appParameterDefaultWorkgroupId)) {
      workgroupId = appParameterDefaultWorkgroupId;
    } else if (activeWorkgroups[0]) {
      workgroupId = activeWorkgroups[0].id;
    }
    if (!workgroupId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("workOrders.dummyOrderNoWorkgroup"),
        life: 5000,
      });
      return;
    }

    const classCandidates = refData.classifications
      .filter((cl) => cl.siteId === asset.siteId && cl.appliesToWorkOrder)
      .sort((a, b) => a.key.localeCompare(b.key));
    const classificationId = classCandidates[0]?.id ?? null;

    const selectedWorkgroup = activeWorkgroups.find((wg) => wg.id === workgroupId);
    const responsibleEmployeeIds = selectedWorkgroup?.leaderEmployeeIds?.length
      ? [selectedWorkgroup.leaderEmployeeIds[0]!]
      : [];
    if (responsibleEmployeeIds.length === 0) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("workOrders.dummyOrderNoLeadership"),
        life: 5000,
      });
      return;
    }

    const plannedStart = new Date();
    const plannedEnd = addHours(plannedStart, 24);
    const plannedDurationMinutes = 24 * 60;

    const name = t("workOrders.dummyOrderName", {
      date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(plannedStart),
    });
    const description = t("workOrders.dummyOrderDescription").trim();
    if (name.length > 200 || description.length > 2000) {
      toastRef.current?.show({ severity: "warn", summary: t("workOrders.validationLength"), life: 4000 });
      return;
    }

    setDummyCreating(true);
    dummyOrderInFlightRef.current = true;
    try {
      const payload = {
        name,
        description: description.length ? description : null,
        assetId: asset.id,
        costCenterId,
        plannedStart: plannedStart.toISOString(),
        plannedEnd: plannedEnd.toISOString(),
        plannedDurationMinutes,
        orderType: "maintenance" as const,
        responsibleEmployeeIds,
        workgroupId,
        classificationId,
      };
      const res = await apiFetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        await showSaveError(res);
        return;
      }
      await loadData();
      toastRef.current?.show({
        severity: "success",
        summary: t("workOrders.dummyOrderCreated"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("workOrders.saveError"), life: 6000 });
    } finally {
      dummyOrderInFlightRef.current = false;
      setDummyCreating(false);
    }
  }, [
    appParameterDefaultWorkgroupId,
    i18n.language,
    loadData,
    loading,
    refData.accessibleAssets,
    refData.classifications,
    refData.costCenters,
    refData.workgroups,
    showSaveError,
    t,
  ]);

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
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("workOrders.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={loading || dummyCreating}
            onClick={() => void createDummyWorkOrder()}
          >
            <Zap className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("workOrders.dummyOrder")}</span>
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
            className={primaryActionNavItem}
            onClick={() => {
              setPanelDraft(appliedAdvanced);
              setSearchPanelVisible(true);
            }}
          >
            <Search className={`${primaryActionIcon} !h-4 !w-4 shrink-0`} size={16} strokeWidth={1.75} aria-hidden />
            <span>{t("workOrders.searchPanel.open")}</span>
          </button>
        </li>
        <li className="ml-auto flex items-center gap-2">
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
    createDummyWorkOrder,
    dummyCreating,
    headerPresetDropdownOptions,
    headerPresetSelectionId,
    loading,
    openCreate,
    openEdit,
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
        emptyBadgePlaceholder={false}
      />
    ),
    [openDocumentsTab, openInspectionPointsTab, openPlanningTab],
  );

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
        onCreate: openCreate,
        onCopy: openCopy,
        onFollowUpOrder: openFollowUpOrder,
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

  if (!woDialog.useModalPresentation && woDialog.dialogVisible && woDialog.editDialogState) {
    return <WorkOrderEditPageView {...woDialog.editDialogState} />;
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
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
          stateKey="athene-work-orders-table-v3"
          virtualScrollerOptions={virtualScrollerOptions}
          emptyMessage={t("workOrders.empty")}
        >
          <Column
            field="orderNumber"
            header={t("workOrders.orderNumber")}
            sortable={!isPreloadMode}
            body={(row: WorkOrder) => (isPreloadMode ? "…" : row.orderNumber)}
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
            style={{ width: "10rem", minWidth: "10rem", maxWidth: "10rem" }}
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
            <Button
              type="button"
              label={t("workOrders.loadAll")}
              loading={loadingMoreOrders}
              disabled={loadingMoreOrders}
              onClick={() => void loadAllOrders()}
              className="p-button-outlined p-button-sm"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
