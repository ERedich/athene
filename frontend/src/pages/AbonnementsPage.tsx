import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import type { WorkOrder } from "../lib/workOrderTypes";
import { useWorkOrderDialog } from "../workOrders/WorkOrderDialogContext";
import { useWorkOrderSubscriptions, type WorkOrderSubscriptionNotification } from "../workOrders/WorkOrderSubscriptionContext";

type NotificationsResponse = {
  rows: WorkOrderSubscriptionNotification[];
};

export function AbonnementsPage() {
  const { t } = useTranslation();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const { refreshUnreadCount } = useWorkOrderSubscriptions();
  const woDialog = useWorkOrderDialog();
  const toastRef = useRef<Toast>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<WorkOrderSubscriptionNotification[]>([]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/work-order-subscriptions/notifications?page=0&limit=500");
      if (!res.ok) throw new Error("load");
      const body = (await res.json()) as NotificationsResponse;
      setRows(Array.isArray(body.rows) ? body.rows : []);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("abonnements.loadError"), life: 6000 });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void (async () => {
      try {
        await apiFetch("/api/work-order-subscriptions/mark-read", { method: "POST" });
      } catch {
        /* ignore */
      }
      await refreshUnreadCount().catch(() => {});
      await loadRows();
    })();
  }, [loadRows, refreshUnreadCount]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const text = `${row.orderNumber} ${row.workOrderName} ${row.siteKey} ${row.siteName}`.toLowerCase();
      return text.includes(q);
    });
  }, [rows, search]);

  useEffect(() => {
    setHeaderRowCount(filteredRows.length);
    return () => setHeaderRowCount(null);
  }, [filteredRows.length, setHeaderRowCount]);

  const openEdit = useCallback(
    async (row: WorkOrderSubscriptionNotification) => {
      try {
        const res = await apiFetch(`/api/work-orders/${row.workOrderId}`);
        if (!res.ok) throw new Error("load_order");
        const full = (await res.json()) as WorkOrder;
        woDialog.openEdit(full);
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("abonnements.openWorkOrderError"), life: 6000 });
      }
    },
    [t, woDialog],
  );

  const changeKindsBody = useCallback(
    (row: WorkOrderSubscriptionNotification) => (
      <div className="flex flex-wrap gap-1">
        {row.changeKinds.map((kind) => (
          <span
            key={`${row.id}-${kind}`}
            className="inline-flex h-5 items-center rounded-sm bg-surface-container-high px-2 text-[11px] uppercase tracking-wide text-on-surface-variant"
          >
            {t(`abonnements.changeKind.${kind}`)}
          </span>
        ))}
      </div>
    ),
    [t],
  );

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("abonnements.searchPlaceholder")}
              className="app-header-search-input h-9 w-56"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [search, setHeaderActions, t]);

  return (
    <div className="h-full min-h-0 p-4">
      <Toast ref={toastRef} position="bottom-right" />
      <DataTable
        className="app-data-table h-full min-h-0"
        value={filteredRows}
        loading={loading}
        dataKey="id"
        onRowDoubleClick={(event) => {
          void openEdit(event.data as WorkOrderSubscriptionNotification);
        }}
        emptyMessage={t("abonnements.empty")}
      >
        <Column
          header={t("abonnements.createdAt")}
          sortable
          field="createdAt"
          style={{ width: "13rem" }}
          body={(row: WorkOrderSubscriptionNotification) => (
            <span className="font-mono text-xs text-on-surface-variant">
              {new Date(row.createdAt).toLocaleString()}
            </span>
          )}
        />
        <Column
          header={t("abonnements.order")}
          body={(row: WorkOrderSubscriptionNotification) => (
            <span className="font-medium">#{row.orderNumber} - {row.workOrderName}</span>
          )}
        />
        <Column
          header={t("abonnements.site")}
          body={(row: WorkOrderSubscriptionNotification) => `${row.siteKey} - ${row.siteName}`}
        />
        <Column header={t("abonnements.changeKinds")} body={changeKindsBody} />
        <Column
          header=""
          body={(row: WorkOrderSubscriptionNotification) => (
            <Button
              type="button"
              text
              icon={<Pencil className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
              onClick={() => {
                void openEdit(row);
              }}
              aria-label={t("abonnements.openOrder")}
            />
          )}
          style={{ width: "4rem" }}
        />
      </DataTable>
    </div>
  );
}
