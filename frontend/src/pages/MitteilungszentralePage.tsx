import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { SelectButton } from "primereact/selectbutton";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import { orderDialogTabs } from "../lib/workOrderDialog";
import type { NotificationInboxItem } from "../lib/notificationCenter";
import type { WorkOrder } from "../lib/workOrderTypes";
import { useWorkOrderDialog } from "../workOrders/WorkOrderDialogContext";
import { useWorkOrderSubscriptions } from "../workOrders/WorkOrderSubscriptionContext";

type InboxResponse = {
  rows: NotificationInboxItem[];
};

type KindFilter = "all" | "subscription" | "chat";

function parseKindFilter(raw: string | null): KindFilter {
  if (raw === "subscription" || raw === "chat") return raw;
  return "all";
}

export function MitteilungszentralePage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const { refreshUnreadCount } = useWorkOrderSubscriptions();
  const woDialog = useWorkOrderDialog();
  const toastRef = useRef<Toast>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<NotificationInboxItem[]>([]);
  const kindFilter = parseKindFilter(searchParams.get("kind"));

  const kindOptions = useMemo(
    () => [
      { label: t("mitteilungszentrale.filterAll"), value: "all" as const },
      { label: t("mitteilungszentrale.filterSubscription"), value: "subscription" as const },
      { label: t("mitteilungszentrale.filterChat"), value: "chat" as const },
    ],
    [t],
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const kindQuery = kindFilter === "all" ? "" : `&kind=${kindFilter}`;
      const res = await apiFetch(`/api/notification-center/inbox?page=0&limit=500${kindQuery}`);
      if (!res.ok) throw new Error("load");
      const body = (await res.json()) as InboxResponse;
      setRows(Array.isArray(body.rows) ? body.rows : []);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("mitteilungszentrale.loadError"), life: 6000 });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [kindFilter, t]);

  useEffect(() => {
    void (async () => {
      try {
        await apiFetch("/api/notification-center/mark-read", { method: "POST" });
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
      const content =
        row.kind === "chat"
          ? `${row.messagePreview ?? ""} ${row.authorUserName ?? ""}`
          : (row.changeKinds ?? []).join(" ");
      const text = `${row.orderNumber} ${row.workOrderName} ${row.siteKey} ${row.siteName} ${content}`.toLowerCase();
      return text.includes(q);
    });
  }, [rows, search]);

  useEffect(() => {
    setHeaderRowCount(filteredRows.length);
    return () => setHeaderRowCount(null);
  }, [filteredRows.length, setHeaderRowCount]);

  const openItem = useCallback(
    async (row: NotificationInboxItem) => {
      try {
        const res = await apiFetch(`/api/work-orders/${row.workOrderId}`);
        if (!res.ok) throw new Error("load_order");
        const full = (await res.json()) as WorkOrder;
        if (row.kind === "chat") {
          woDialog.openEdit(full, { tab: orderDialogTabs.Messages });
        } else {
          woDialog.openEdit(full);
        }
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("mitteilungszentrale.openWorkOrderError"),
          life: 6000,
        });
      }
    },
    [t, woDialog],
  );

  const kindBody = useCallback(
    (row: NotificationInboxItem) => (
      <span className="inline-flex h-5 items-center rounded-sm bg-surface-container-high px-2 text-[11px] uppercase tracking-wide text-on-surface-variant">
        {row.kind === "chat" ? t("mitteilungszentrale.kindChat") : t("mitteilungszentrale.kindSubscription")}
      </span>
    ),
    [t],
  );

  const contentBody = useCallback(
    (row: NotificationInboxItem) => {
      if (row.kind === "chat") {
        return (
          <div className="text-sm">
            <span className="font-medium">{row.authorUserName}</span>
            {row.isReply ? (
              <span className="ml-2 text-[11px] uppercase tracking-wide text-on-surface-variant">
                ({t("mitteilungszentrale.reply")})
              </span>
            ) : null}
            <div className="text-on-surface-variant">{row.messagePreview}</div>
          </div>
        );
      }
      return (
        <div className="flex flex-wrap gap-1">
          {(row.changeKinds ?? []).map((kind) => (
            <span
              key={`${row.id}-${kind}`}
              className="inline-flex h-5 items-center rounded-sm bg-surface-container-high px-2 text-[11px] uppercase tracking-wide text-on-surface-variant"
            >
              {t(`abonnements.changeKind.${kind}`)}
            </span>
          ))}
        </div>
      );
    },
    [t],
  );

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-2 p-0">
        <li>
          <SelectButton
            value={kindFilter}
            options={kindOptions}
            onChange={(e) => {
              const next = e.value as KindFilter | null;
              if (!next) return;
              const params = new URLSearchParams(searchParams);
              if (next === "all") params.delete("kind");
              else params.set("kind", next);
              setSearchParams(params, { replace: true });
            }}
            className="app-selectbutton-compact"
          />
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("mitteilungszentrale.searchPlaceholder")}
              className="app-header-search-input h-9 w-56"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [kindFilter, kindOptions, search, searchParams, setHeaderActions, setSearchParams, t]);

  return (
    <div className="h-full min-h-0 p-4">
      <Toast ref={toastRef} position="bottom-right" />
      <DataTable
        className="app-data-table h-full min-h-0"
        value={filteredRows}
        loading={loading}
        dataKey="id"
        onRowDoubleClick={(event) => {
          void openItem(event.data as NotificationInboxItem);
        }}
        emptyMessage={t("mitteilungszentrale.empty")}
      >
        <Column
          header={t("mitteilungszentrale.createdAt")}
          sortable
          field="createdAt"
          style={{ width: "13rem" }}
          body={(row: NotificationInboxItem) => (
            <span className="font-mono text-xs text-on-surface-variant">
              {new Date(row.createdAt).toLocaleString()}
            </span>
          )}
        />
        <Column header={t("mitteilungszentrale.kind")} body={kindBody} style={{ width: "9rem" }} />
        <Column
          header={t("mitteilungszentrale.order")}
          body={(row: NotificationInboxItem) => (
            <span className="font-medium">
              #{row.orderNumber} - {row.workOrderName}
            </span>
          )}
        />
        <Column
          header={t("mitteilungszentrale.site")}
          body={(row: NotificationInboxItem) => `${row.siteKey} - ${row.siteName}`}
        />
        <Column header={t("mitteilungszentrale.content")} body={contentBody} />
        <Column
          header=""
          body={(row: NotificationInboxItem) => (
            <Button
              type="button"
              text
              icon={<Pencil className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
              onClick={() => {
                void openItem(row);
              }}
              aria-label={t("mitteilungszentrale.openOrder")}
            />
          )}
          style={{ width: "4rem" }}
        />
      </DataTable>
    </div>
  );
}
