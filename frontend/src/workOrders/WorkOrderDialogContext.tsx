import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "primereact/confirmdialog";
import { Toast } from "primereact/toast";

import { WorkOrderEditDialog } from "../components/workOrders/WorkOrderEditDialog";
import type { WorkOrderEditDialogProps } from "../components/workOrders/WorkOrderEditSurface";
import { useWorkOrderEditDialogState, type WorkOrderEditOpenSource } from "../hooks/useWorkOrderEditDialogState";
import { fetchWorkOrderById } from "../lib/workOrderApi";
import {
  applyWorkOrderUrlParams,
  readWorkOrderUrlState,
  WO_URL_PARAM,
} from "../lib/workOrderDialogUrl";
import {
  isWorkOrderFullscreenRoute,
  useWorkOrderUsesModalPresentation,
} from "../lib/workOrderPresentation";
import { orderDialogTabs, type FeedbackEntryMode, type OrderDialogTab } from "../lib/workOrderDialog";
import type { WorkOrderFormSource } from "../lib/workOrderForm";
import type { DescriptionViewMode } from "../lib/todoTypes";
import type { WorkOrder } from "../lib/workOrderTypes";

export type OpenWorkOrderOptions = {
  tab?: OrderDialogTab;
  feedbackMode?: FeedbackEntryMode;
  descriptionView?: DescriptionViewMode;
  onSaved?: (order: WorkOrder) => void;
  onClosed?: () => void;
};

type WorkOrderDialogContextValue = {
  openEdit: (
    idOrRow: string | WorkOrder | (WorkOrderFormSource & { id: string }),
    options?: OpenWorkOrderOptions,
  ) => void;
  openCreate: (options?: OpenWorkOrderOptions) => void;
  openCopy: (row: WorkOrderFormSource, options?: OpenWorkOrderOptions) => void;
  /** Prefill create EP as follow-up (no name dialog); sets originalWo and default Kurztext. */
  openFollowUp: (row: WorkOrderFormSource, options?: OpenWorkOrderOptions) => void;
  close: () => void;
  dialogVisible: boolean;
  editingId: string | null;
  useModalPresentation: boolean;
  editDialogState: WorkOrderEditDialogProps | null;
};

const WorkOrderDialogContext = createContext<WorkOrderDialogContextValue | null>(null);

export function useWorkOrderDialog(): WorkOrderDialogContextValue {
  const ctx = useContext(WorkOrderDialogContext);
  if (!ctx) {
    throw new Error("useWorkOrderDialog must be used within WorkOrderDialogProvider");
  }
  return ctx;
}

type ProviderProps = {
  children: ReactNode;
  atheneSource?: "workOrders" | "monitoring";
  onRefresh?: () => void | Promise<void>;
};

export function WorkOrderDialogProvider({ children, atheneSource, onRefresh }: ProviderProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const useModalPresentation = useWorkOrderUsesModalPresentation();
  const toastRef = useRef<Toast>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const openOptionsRef = useRef<OpenWorkOrderOptions | null>(null);
  const urlSyncFromDialogRef = useRef(false);
  const urlOpenHandledRef = useRef<string | null>(null);
  const openRequestGenerationRef = useRef(0);
  const prevUseModalPresentationRef = useRef(useModalPresentation);
  const dialogRef = useRef<ReturnType<typeof useWorkOrderEditDialogState> | null>(null);

  const invalidatePendingOpens = useCallback(() => {
    openRequestGenerationRef.current += 1;
    urlOpenHandledRef.current = null;
  }, []);

  const dismissOpenWorkOrder = useCallback(() => {
    invalidatePendingOpens();
    urlSyncFromDialogRef.current = true;
    setSearchParams((prev) => applyWorkOrderUrlParams(prev, null), { replace: true });
    dialogRef.current?.closeDialog();
  }, [invalidatePendingOpens, setSearchParams]);

  const handleVisibleChange = useCallback(
    (visible: boolean, editingId: string | null, activeTab: OrderDialogTab) => {
      setSearchParams(
        (prev) => {
          const current = readWorkOrderUrlState(prev);
          const nextWoId = visible ? editingId : null;
          const nextTab = visible ? activeTab : undefined;
          if (
            (current.woId ?? null) === (nextWoId ?? null) &&
            (nextTab == null ? current.tab == null : current.tab === nextTab)
          ) {
            return prev;
          }
          urlSyncFromDialogRef.current = true;
          return applyWorkOrderUrlParams(prev, nextWoId, nextTab);
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleOrderUpdated = useCallback((order: WorkOrder) => {
    openOptionsRef.current?.onSaved?.(order);
  }, []);

  const handleClose = useCallback(() => {
    invalidatePendingOpens();
    openOptionsRef.current?.onClosed?.();
    openOptionsRef.current = null;
  }, [invalidatePendingOpens]);

  const dialog = useWorkOrderEditDialogState({
    toastRef,
    atheneSource,
    onRefresh,
    onOrderUpdated: handleOrderUpdated,
    onClose: handleClose,
    onVisibleChange: handleVisibleChange,
  });

  dialogRef.current = dialog;

  const applyOpenOptions = useCallback(async (row: WorkOrderEditOpenSource, options?: OpenWorkOrderOptions) => {
    const d = dialogRef.current;
    if (!d) return;
    if (options?.descriptionView != null) {
      d.setDescriptionViewOverride(options.descriptionView);
    }
    await d.openEdit(row);
    if (options?.tab != null) {
      d.setActiveTabIndex(options.tab);
      if (options.tab === orderDialogTabs.Feedback && options.feedbackMode && "status" in row) {
        d.applyFeedbackEntry(row as WorkOrder, options.feedbackMode);
      }
    }
  }, []);

  const openEdit = useCallback(
    (
      idOrRow: string | WorkOrder | (WorkOrderFormSource & { id: string }),
      options?: OpenWorkOrderOptions,
    ) => {
      openOptionsRef.current = options ?? null;
      if (typeof idOrRow === "string") {
        const requestGeneration = ++openRequestGenerationRef.current;
        void (async () => {
          try {
            const order = await fetchWorkOrderById(idOrRow);
            if (requestGeneration !== openRequestGenerationRef.current) return;
            if (!order) {
              toastRef.current?.show({
                severity: "warn",
                summary: t("workOrders.loadError"),
                life: 5000,
              });
              return;
            }
            applyOpenOptions(order, options);
          } catch {
            if (requestGeneration !== openRequestGenerationRef.current) return;
            toastRef.current?.show({
              severity: "error",
              summary: t("workOrders.loadError"),
              life: 6000,
            });
          }
        })();
        return;
      }
      applyOpenOptions(idOrRow, options);
    },
    [applyOpenOptions, t],
  );

  const openCreate = useCallback(
    (options?: OpenWorkOrderOptions) => {
      openOptionsRef.current = options ?? null;
      dialog.openCreate();
      if (options?.tab != null) {
        dialog.setActiveTabIndex(options.tab);
      }
    },
    [dialog],
  );

  const openCopy = useCallback(
    (row: WorkOrderFormSource, options?: OpenWorkOrderOptions) => {
      openOptionsRef.current = options ?? null;
      dialog.copyWorkOrder.startCopy(row);
    },
    [dialog.copyWorkOrder],
  );

  const openFollowUp = useCallback(
    (row: WorkOrderFormSource, options?: OpenWorkOrderOptions) => {
      openOptionsRef.current = options ?? null;
      dialog.openCopyAsNew(row, t("workOrders.followUpDefaultName", { name: row.name }));
      if (options?.tab != null) {
        dialog.setActiveTabIndex(options.tab);
      }
    },
    [dialog, t],
  );

  const close = useCallback(() => {
    dialog.closeDialog();
  }, [dialog]);

  useEffect(() => {
    if (urlSyncFromDialogRef.current) {
      urlSyncFromDialogRef.current = false;
      return;
    }
    const d = dialogRef.current;
    if (!d) return;

    const { woId, tab } = readWorkOrderUrlState(searchParams);
    if (!woId) {
      urlOpenHandledRef.current = null;
      if (d.dialogVisible) {
        d.closeDialog();
      }
      return;
    }
    if (d.dialogVisible && d.editingId === woId) {
      if (tab != null && d.activeTabIndex !== tab) {
        d.setActiveTabIndex(tab);
        if (tab === orderDialogTabs.Feedback && d.editingRow) {
          d.applyFeedbackEntry(d.editingRow, "create");
        }
      }
      return;
    }
    if (urlOpenHandledRef.current === woId) return;
    urlOpenHandledRef.current = woId;
    const requestGeneration = ++openRequestGenerationRef.current;

    void (async () => {
      try {
        const order = await fetchWorkOrderById(woId);
        if (requestGeneration !== openRequestGenerationRef.current) return;
        if (!order) {
          toastRef.current?.show({
            severity: "warn",
            summary: t("workOrders.loadError"),
            life: 5000,
          });
          setSearchParams((prev) => applyWorkOrderUrlParams(prev, null), { replace: true });
          urlOpenHandledRef.current = null;
          return;
        }
        applyOpenOptions(order, tab != null ? { tab } : undefined);
      } catch {
        if (requestGeneration !== openRequestGenerationRef.current) return;
        toastRef.current?.show({
          severity: "error",
          summary: t("workOrders.loadError"),
          life: 6000,
        });
        setSearchParams((prev) => applyWorkOrderUrlParams(prev, null), { replace: true });
        urlOpenHandledRef.current = null;
      }
    })();
  }, [applyOpenOptions, searchParams, setSearchParams, t]);

  useEffect(() => {
    if (urlSyncFromDialogRef.current) return;
    if (!dialog.dialogVisible && searchParams.get(WO_URL_PARAM)) {
      urlOpenHandledRef.current = null;
    }
  }, [dialog.dialogVisible, searchParams]);

  useLayoutEffect(() => {
    const prev = prevUseModalPresentationRef.current;
    prevUseModalPresentationRef.current = useModalPresentation;
    const d = dialogRef.current;
    if (!d?.dialogVisible) return;
    if (!prev && useModalPresentation) {
      dismissOpenWorkOrder();
    }
  }, [dismissOpenWorkOrder, useModalPresentation]);

  const prevPathRef = useRef(pathname);
  useLayoutEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (prev === pathname) return;
    const d = dialogRef.current;
    if (!d?.dialogVisible) return;
    const leftFullscreenRoute =
      isWorkOrderFullscreenRoute(prev) && !isWorkOrderFullscreenRoute(pathname);
    if (leftFullscreenRoute) {
      dismissOpenWorkOrder();
    }
  }, [dismissOpenWorkOrder, pathname]);

  const value: WorkOrderDialogContextValue = {
    openEdit,
    openCreate,
    openCopy,
    openFollowUp,
    close,
    dialogVisible: dialog.dialogVisible,
    editingId: dialog.editingId,
    useModalPresentation,
    editDialogState: dialog.dialogVisible ? dialog : null,
  };

  return (
    <WorkOrderDialogContext.Provider value={value}>
      {children}
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />
      {useModalPresentation && dialog.dialogVisible ? <WorkOrderEditDialog {...dialog} /> : null}
      {dialog.copyWorkOrder.CopyDialogEl}
    </WorkOrderDialogContext.Provider>
  );
}
