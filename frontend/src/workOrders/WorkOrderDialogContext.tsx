import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "primereact/confirmdialog";
import { Toast } from "primereact/toast";

import { WorkOrderEditDialog } from "../components/workOrders/WorkOrderEditDialog";
import { useWorkOrderEditDialogState, type WorkOrderEditOpenSource } from "../hooks/useWorkOrderEditDialogState";
import { fetchWorkOrderById } from "../lib/workOrderApi";
import {
  applyWorkOrderUrlParams,
  readWorkOrderUrlState,
  WO_URL_PARAM,
} from "../lib/workOrderDialogUrl";
import { orderDialogTabs, type FeedbackEntryMode, type OrderDialogTab } from "../lib/workOrderDialog";
import type { WorkOrderFormSource } from "../lib/workOrderForm";
import type { WorkOrder } from "../lib/workOrderTypes";

export type OpenWorkOrderOptions = {
  tab?: OrderDialogTab;
  feedbackMode?: FeedbackEntryMode;
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
  close: () => void;
  dialogVisible: boolean;
  editingId: string | null;
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
  const toastRef = useRef<Toast>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const openOptionsRef = useRef<OpenWorkOrderOptions | null>(null);
  const urlSyncFromDialogRef = useRef(false);
  const urlOpenHandledRef = useRef<string | null>(null);
  const dialogRef = useRef<ReturnType<typeof useWorkOrderEditDialogState> | null>(null);

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
    openOptionsRef.current?.onClosed?.();
    openOptionsRef.current = null;
  }, []);

  const dialog = useWorkOrderEditDialogState({
    toastRef,
    atheneSource,
    onRefresh,
    onOrderUpdated: handleOrderUpdated,
    onClose: handleClose,
    onVisibleChange: handleVisibleChange,
  });

  dialogRef.current = dialog;

  const applyOpenOptions = useCallback((row: WorkOrderEditOpenSource, options?: OpenWorkOrderOptions) => {
    const d = dialogRef.current;
    if (!d) return;
    d.openEdit(row);
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
        void (async () => {
          try {
            const order = await fetchWorkOrderById(idOrRow);
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

    void (async () => {
      try {
        const order = await fetchWorkOrderById(woId);
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
    if (!dialog.dialogVisible && searchParams.get(WO_URL_PARAM)) {
      urlOpenHandledRef.current = null;
    }
  }, [dialog.dialogVisible, searchParams]);

  const value: WorkOrderDialogContextValue = {
    openEdit,
    openCreate,
    openCopy,
    close,
    dialogVisible: dialog.dialogVisible,
    editingId: dialog.editingId,
  };

  return (
    <WorkOrderDialogContext.Provider value={value}>
      {children}
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />
      <WorkOrderEditDialog {...dialog} />
      {dialog.copyWorkOrder.CopyDialogEl}
    </WorkOrderDialogContext.Provider>
  );
}
