import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { useWorkOrderDialog } from "../workOrders/WorkOrderDialogContext";

const actionNavItem =
  "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-[var(--color-on-surface)] transition-colors";
const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const createActionIcon = "text-green-500/70";

export function OrderCreationPage() {
  const { t } = useTranslation();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const woDialog = useWorkOrderDialog();
  const openCreateRef = useRef(woDialog.openCreate);
  openCreateRef.current = woDialog.openCreate;

  const openCreate = useCallback(() => {
    openCreateRef.current();
  }, []);

  useEffect(() => {
    openCreate();
  }, [openCreate]);

  useEffect(() => {
    setHeaderRowCount(null);
    return () => setHeaderRowCount(null);
  }, [setHeaderRowCount]);

  useEffect(() => {
    setHeaderActions(
      (
        <ul className="m-0 flex w-full list-none items-center gap-1 p-0" aria-label={t("shell.actionsNavAria")}>
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
              <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("workOrders.new")}</span>
            </button>
          </li>
        </ul>
      ) as ReactNode,
    );
    return () => setHeaderActions(null);
  }, [openCreate, setHeaderActions, t]);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="m-0 max-w-md text-sm text-[color-mix(in_srgb,var(--color-on-surface)_72%,transparent)]">
        {t("orderCreation.hint")}
      </p>
      {!woDialog.dialogVisible ? (
        <button type="button" className={createActionNavItem} onClick={openCreate}>
          <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
          <span>{t("workOrders.new")}</span>
        </button>
      ) : null}
    </div>
  );
}
