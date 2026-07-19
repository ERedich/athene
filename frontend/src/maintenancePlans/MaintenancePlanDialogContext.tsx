import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Toast } from "primereact/toast";

import { MaintenancePlanEditDialog } from "../components/maintenancePlans/MaintenancePlanEditDialog";
import {
  useMaintenancePlanEditDialogState,
  type MaintenancePlanEditDialogProps,
} from "../hooks/useMaintenancePlanEditDialogState";
import { fetchMaintenancePlanById } from "../lib/maintenancePlanApi";
import type { MaintenancePlanDialogTab } from "../lib/maintenancePlanDialog";
import type { MaintenancePlan } from "../lib/maintenancePlanTypes";

export type OpenMaintenancePlanOptions = {
  tab?: MaintenancePlanDialogTab;
  onSaved?: (plan: MaintenancePlan | null) => void;
  onClosed?: () => void;
};

type MaintenancePlanDialogContextValue = {
  openEdit: (idOrRow: string | MaintenancePlan, options?: OpenMaintenancePlanOptions) => void;
  openCreate: (options?: OpenMaintenancePlanOptions) => void;
  close: () => void;
  dialogVisible: boolean;
  editingId: string | null;
  editDialogState: MaintenancePlanEditDialogProps | null;
};

const MaintenancePlanDialogContext = createContext<MaintenancePlanDialogContextValue | null>(null);

export function useMaintenancePlanDialog(): MaintenancePlanDialogContextValue {
  const ctx = useContext(MaintenancePlanDialogContext);
  if (!ctx) {
    throw new Error("useMaintenancePlanDialog must be used within MaintenancePlanDialogProvider");
  }
  return ctx;
}

type ProviderProps = {
  children: ReactNode;
};

export function MaintenancePlanDialogProvider({ children }: ProviderProps) {
  const { t } = useTranslation();
  const toastRef = useRef<Toast>(null);
  const openOptionsRef = useRef<OpenMaintenancePlanOptions | null>(null);
  const openRequestGenerationRef = useRef(0);
  const dialogRef = useRef<ReturnType<typeof useMaintenancePlanEditDialogState> | null>(null);

  const handleSaved = useCallback((plan: MaintenancePlan | null) => {
    openOptionsRef.current?.onSaved?.(plan);
  }, []);

  const handleClose = useCallback(() => {
    openOptionsRef.current?.onClosed?.();
    openOptionsRef.current = null;
  }, []);

  const dialog = useMaintenancePlanEditDialogState({
    toastRef,
    onSaved: handleSaved,
    onClose: handleClose,
  });

  dialogRef.current = dialog;

  const applyOpenOptions = useCallback(
    (row: MaintenancePlan, options?: OpenMaintenancePlanOptions) => {
      const d = dialogRef.current;
      if (!d) return;
      d.openEdit(row);
      if (options?.tab != null) {
        d.setActiveTabIndex(options.tab);
      }
    },
    [],
  );

  const openEdit = useCallback(
    (idOrRow: string | MaintenancePlan, options?: OpenMaintenancePlanOptions) => {
      openOptionsRef.current = options ?? null;
      if (typeof idOrRow === "string") {
        const requestGeneration = ++openRequestGenerationRef.current;
        void (async () => {
          try {
            const plan = await fetchMaintenancePlanById(idOrRow);
            if (requestGeneration !== openRequestGenerationRef.current) return;
            if (!plan) {
              toastRef.current?.show({
                severity: "warn",
                summary: t("maintenancePlans.loadError"),
                life: 5000,
              });
              return;
            }
            applyOpenOptions(plan, options);
          } catch {
            if (requestGeneration !== openRequestGenerationRef.current) return;
            toastRef.current?.show({
              severity: "error",
              summary: t("maintenancePlans.loadError"),
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
    (options?: OpenMaintenancePlanOptions) => {
      openOptionsRef.current = options ?? null;
      dialog.openCreate();
      if (options?.tab != null) {
        dialog.setActiveTabIndex(options.tab);
      }
    },
    [dialog],
  );

  const close = useCallback(() => {
    dialog.closeDialog();
  }, [dialog]);

  const value: MaintenancePlanDialogContextValue = {
    openEdit,
    openCreate,
    close,
    dialogVisible: dialog.dialogVisible,
    editingId: dialog.editingId,
    editDialogState: dialog.dialogVisible ? dialog : null,
  };

  return (
    <MaintenancePlanDialogContext.Provider value={value}>
      {children}
      <Toast ref={toastRef} position="top-right" />
      {dialog.dialogVisible ? <MaintenancePlanEditDialog {...dialog} /> : null}
    </MaintenancePlanDialogContext.Provider>
  );
}
