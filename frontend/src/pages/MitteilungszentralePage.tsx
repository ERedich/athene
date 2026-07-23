import { useCallback, useEffect, useMemo, useRef, useState, type TransitionEvent } from "react";
import { Bell, History, Inbox, MessageSquare, Package, Pencil, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { useAuth } from "../auth/AuthContext";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { WorkOrderMessagesTabContent } from "../components/workOrders/WorkOrderMessagesTabContent";
import { lucidePrimeBtnIcon } from "../icons/lucide";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import {
  fetchWorkOrderMessages,
  inboxItemFromChatNotification,
  inboxItemFromStockNotification,
  inboxItemFromSubscriptionNotification,
  markNotificationsRead,
  sendWorkOrderMessage,
  type NotificationInboxItem,
  type WorkOrderMessage,
} from "../lib/notificationCenter";
import { sparePartDialogTabs } from "../lib/sparePartDialog";
import { applySparePartUrlParams } from "../lib/sparePartDialogUrl";
import { orderDialogTabs } from "../lib/workOrderDialog";
import type { WorkOrder } from "../lib/workOrderTypes";
import { useWorkOrderDialog } from "../workOrders/WorkOrderDialogContext";
import { useWorkOrderSubscriptions } from "../workOrders/WorkOrderSubscriptionContext";

type InboxResponse = {
  rows: NotificationInboxItem[];
};

type KindFilter = "all" | "subscription" | "chat" | "stock";

type HistoryDrawerState = {
  workOrderId: string;
  orderNumber: number;
  workOrderName: string;
};

const HISTORY_DRAWER_MS = 280;
const NOTIFICATION_HIGHLIGHT_MS = 10_000;
const NOTIFICATION_HIGHLIGHT_FADE_MS = 1_000;

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const selectedActionNavItem = `${actionNavItem} bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]`;
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const selectedActionIcon = "text-[var(--color-primary)]";

function parseKindFilter(raw: string | null): KindFilter {
  if (raw === "subscription" || raw === "chat" || raw === "stock") return raw;
  return "all";
}

function eventKind(messageType: string): KindFilter | null {
  if (messageType === "subscription_notification") return "subscription";
  if (messageType === "chat_notification") return "chat";
  if (messageType === "stock_notification") return "stock";
  return null;
}

export function MitteilungszentralePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const { refreshUnreadCount, onNotificationEvent, onWorkOrderMessageEvent } = useWorkOrderSubscriptions();
  const woDialog = useWorkOrderDialog();
  const toastRef = useRef<Toast>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<NotificationInboxItem[]>([]);
  const [historyDrawer, setHistoryDrawer] = useState<HistoryDrawerState | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPanelMounted, setHistoryPanelMounted] = useState(false);
  const [historyPanelIn, setHistoryPanelIn] = useState(false);
  const historyOpenRef = useRef(false);
  const [historyMessages, setHistoryMessages] = useState<WorkOrderMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySending, setHistorySending] = useState(false);
  const [newlyArrivedIds, setNewlyArrivedIds] = useState<Record<string, number>>({});
  const kindFilter = parseKindFilter(searchParams.get("kind"));
  const kindFilterRef = useRef(kindFilter);
  const historyDrawerRef = useRef(historyDrawer);
  const loadHistoryMessagesRef = useRef<(workOrderId: string) => Promise<void>>(async () => {});

  historyOpenRef.current = historyOpen;
  kindFilterRef.current = kindFilter;
  historyDrawerRef.current = historyDrawer;

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

  const setKindFilter = useCallback(
    (next: KindFilter) => {
      const params = new URLSearchParams(searchParams);
      if (next === "all") params.delete("kind");
      else params.set("kind", next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
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
        await markNotificationsRead();
      } catch {
        /* ignore */
      }
      await refreshUnreadCount().catch(() => {});
      await loadRows();
    })();
  }, [loadRows, refreshUnreadCount]);

  const loadHistoryMessages = useCallback(
    async (workOrderId: string) => {
      setHistoryLoading(true);
      try {
        const messages = await fetchWorkOrderMessages(workOrderId);
        setHistoryMessages(messages);
      } catch {
        setHistoryMessages([]);
        toastRef.current?.show({
          severity: "error",
          summary: t("mitteilungszentrale.historyLoadError"),
          life: 6000,
        });
      } finally {
        setHistoryLoading(false);
      }
    },
    [t],
  );

  loadHistoryMessagesRef.current = loadHistoryMessages;

  useEffect(
    () =>
      onNotificationEvent((message) => {
        const kind = eventKind(message.type);
        if (!kind) return;
        const filter = kindFilterRef.current;
        const matchesFilter = filter === "all" || filter === kind;
        const readAt = new Date().toISOString();
        const item =
          message.type === "subscription_notification"
            ? inboxItemFromSubscriptionNotification(message.notification, { readAt })
            : message.type === "chat_notification"
              ? inboxItemFromChatNotification(message.notification, { readAt })
              : inboxItemFromStockNotification(message.notification, { readAt });

        if (matchesFilter) {
          let added = false;
          setRows((current) => {
            if (current.some((row) => row.id === item.id)) return current;
            added = true;
            return [item, ...current];
          });
          if (added) {
            setNewlyArrivedIds((current) => ({ ...current, [item.id]: Date.now() }));
          }
        }

        void markNotificationsRead()
          .then(() => refreshUnreadCount())
          .catch(() => {});

        return true;
      }),
    [onNotificationEvent, refreshUnreadCount],
  );

  useEffect(
    () =>
      onWorkOrderMessageEvent((event) => {
        if (!historyOpenRef.current) return;
        if (historyDrawerRef.current?.workOrderId !== event.message.workOrderId) return;
        setHistoryMessages((current) => {
          if (current.some((entry) => entry.id === event.message.id)) return current;
          return [...current, event.message];
        });
      }),
    [onWorkOrderMessageEvent],
  );

  useEffect(() => {
    const totalHighlightMs = NOTIFICATION_HIGHLIGHT_MS + NOTIFICATION_HIGHLIGHT_FADE_MS;
    const id = window.setInterval(() => {
      const now = Date.now();
      setNewlyArrivedIds((current) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const [notificationId, arrivedAt] of Object.entries(current)) {
          if (now - arrivedAt <= totalHighlightMs) {
            next[notificationId] = arrivedAt;
          } else {
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const content =
        row.kind === "chat"
          ? `${row.messagePreview ?? ""} ${row.authorUserName ?? ""}`
          : row.kind === "stock"
            ? `${row.sparePartKey ?? ""} ${row.sparePartName ?? ""} ${row.scopeType ?? ""} ${row.warehouseKey ?? ""} ${row.storageLocationKey ?? ""} ${row.onHandQuantity ?? ""} ${row.reorderLevel ?? ""}`
            : (row.changeKinds ?? []).join(" ");
      const subject =
        row.kind === "stock"
          ? `${row.sparePartKey ?? ""} ${row.sparePartName ?? ""}`
          : `${row.orderNumber ?? ""} ${row.workOrderName ?? ""}`;
      const text = `${subject} ${row.siteKey} ${row.siteName} ${content}`.toLowerCase();
      return text.includes(q);
    });
  }, [rows, search]);

  useEffect(() => {
    setHeaderRowCount(filteredRows.length);
    return () => setHeaderRowCount(null);
  }, [filteredRows.length, setHeaderRowCount]);

  const resetHistoryContent = useCallback(() => {
    setHistoryDrawer(null);
    setHistoryMessages([]);
    setHistoryLoading(false);
    setHistorySending(false);
  }, []);

  const openHistory = useCallback(
    (row: NotificationInboxItem) => {
      if (row.kind === "stock" || !row.workOrderId || row.orderNumber == null || !row.workOrderName) return;
      setHistoryDrawer({
        workOrderId: row.workOrderId,
        orderNumber: row.orderNumber,
        workOrderName: row.workOrderName,
      });
      setHistoryOpen(true);
      void loadHistoryMessages(row.workOrderId);
    },
    [loadHistoryMessages],
  );

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
  }, []);

  useEffect(() => {
    if (historyOpen) {
      setHistoryPanelMounted(true);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setHistoryPanelIn(true));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setHistoryPanelIn(false);
  }, [historyOpen]);

  const onHistoryPanelTransitionEnd = useCallback(
    (event: TransitionEvent<HTMLElement>) => {
      if (event.propertyName !== "transform") return;
      if (!historyOpenRef.current) {
        setHistoryPanelMounted(false);
        resetHistoryContent();
      }
    },
    [resetHistoryContent],
  );

  useEffect(() => {
    if (!historyOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHistory();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeHistory, historyOpen]);

  const sendHistoryMessage = useCallback(
    async (body: string, replyToMessageId?: string | null) => {
      if (!historyDrawer) return;
      setHistorySending(true);
      try {
        const created = await sendWorkOrderMessage(historyDrawer.workOrderId, { body, replyToMessageId });
        setHistoryMessages((current) => {
          if (current.some((entry) => entry.id === created.id)) return current;
          return [...current, created];
        });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("workOrders.messagesSendError"),
          life: 6000,
        });
        throw new Error("send_message");
      } finally {
        setHistorySending(false);
      }
    },
    [historyDrawer, t],
  );

  const openItem = useCallback(
    async (row: NotificationInboxItem) => {
      if (row.kind === "stock") {
        if (!row.sparePartId) {
          toastRef.current?.show({
            severity: "error",
            summary: t("mitteilungszentrale.openSparePartError"),
            life: 6000,
          });
          return;
        }
        const params = applySparePartUrlParams(
          new URLSearchParams(),
          row.sparePartId,
          sparePartDialogTabs.StockPlanning,
        );
        navigate(`/spare-parts?${params.toString()}`);
        return;
      }
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
    [navigate, t, woDialog],
  );

  const kindBody = useCallback(
    (row: NotificationInboxItem) => (
      <span className="inline-flex h-5 items-center rounded-sm bg-surface-container-high px-2 text-[11px] uppercase tracking-wide text-on-surface-variant">
        {row.kind === "chat"
          ? t("mitteilungszentrale.kindChat")
          : row.kind === "stock"
            ? t("mitteilungszentrale.kindStock")
            : t("mitteilungszentrale.kindSubscription")}
      </span>
    ),
    [t],
  );

  const subjectBody = useCallback(
    (row: NotificationInboxItem) => {
      if (row.kind === "stock") {
        return (
          <span className="font-medium">
            {row.sparePartKey}
            {row.sparePartName ? ` - ${row.sparePartName}` : ""}
          </span>
        );
      }
      return (
        <span className="font-medium">
          #{row.orderNumber} - {row.workOrderName}
        </span>
      );
    },
    [],
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
      if (row.kind === "stock") {
        const scopeLabel =
          row.scopeType === "WAREHOUSE"
            ? t("mitteilungszentrale.stockScopeWarehouse", { key: row.warehouseKey ?? "—" })
            : row.scopeType === "STORAGE_LOCATION"
              ? t("mitteilungszentrale.stockScopeStorageLocation", {
                  warehouse: row.warehouseKey ?? "—",
                  location: row.storageLocationKey ?? "—",
                })
              : t("mitteilungszentrale.stockScopeSite");
        return (
          <div className="text-sm">
            <div>
              {t("mitteilungszentrale.stockLevels", {
                onHand: row.onHandQuantity ?? "—",
                reorder: row.reorderLevel ?? "—",
              })}
            </div>
            <div className="text-on-surface-variant">{scopeLabel}</div>
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
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button
            type="button"
            className={kindFilter === "all" ? selectedActionNavItem : primaryActionNavItem}
            aria-pressed={kindFilter === "all"}
            onClick={() => setKindFilter("all")}
          >
            <Inbox
              className={`${kindFilter === "all" ? selectedActionIcon : primaryActionIcon} h-4 w-4`}
              strokeWidth={1.75}
              aria-hidden
            />
            <span>{t("mitteilungszentrale.filterAll")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={kindFilter === "subscription" ? selectedActionNavItem : primaryActionNavItem}
            aria-pressed={kindFilter === "subscription"}
            onClick={() => setKindFilter("subscription")}
          >
            <Bell
              className={`${kindFilter === "subscription" ? selectedActionIcon : primaryActionIcon} h-4 w-4`}
              strokeWidth={1.75}
              aria-hidden
            />
            <span>{t("mitteilungszentrale.filterSubscription")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={kindFilter === "chat" ? selectedActionNavItem : primaryActionNavItem}
            aria-pressed={kindFilter === "chat"}
            onClick={() => setKindFilter("chat")}
          >
            <MessageSquare
              className={`${kindFilter === "chat" ? selectedActionIcon : primaryActionIcon} h-4 w-4`}
              strokeWidth={1.75}
              aria-hidden
            />
            <span>{t("mitteilungszentrale.filterChat")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={kindFilter === "stock" ? selectedActionNavItem : primaryActionNavItem}
            aria-pressed={kindFilter === "stock"}
            onClick={() => setKindFilter("stock")}
          >
            <Package
              className={`${kindFilter === "stock" ? selectedActionIcon : primaryActionIcon} h-4 w-4`}
              strokeWidth={1.75}
              aria-hidden
            />
            <span>{t("mitteilungszentrale.filterStock")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("mitteilungszentrale.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [kindFilter, search, setHeaderActions, setKindFilter, t]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <Toast ref={toastRef} position="bottom-right" />
      <DataTable
        className="app-data-table w-full h-full min-h-0"
        value={filteredRows}
        loading={loading}
        dataKey="id"
        onRowDoubleClick={(event) => {
          void openItem(event.data as NotificationInboxItem);
        }}
        rowClassName={(row) =>
          newlyArrivedIds[(row as NotificationInboxItem).id] ? "app-monitoring-new-row" : ""
        }
        emptyMessage={t("mitteilungszentrale.empty")}
      >
        <Column
          header={t("mitteilungszentrale.createdAt")}
          sortable
          field="createdAt"
          style={{ width: "13rem" }}
          body={(row: NotificationInboxItem) => formatShortDt(row.createdAt)}
        />
        <Column header={t("mitteilungszentrale.kind")} body={kindBody} style={{ width: "9rem" }} />
        <Column header={t("mitteilungszentrale.order")} body={subjectBody} />
        <Column header={t("mitteilungszentrale.content")} body={contentBody} style={{ width: "40%" }} />
        <Column
          header={t("mitteilungszentrale.history")}
          body={(row: NotificationInboxItem) =>
            row.kind === "stock" ? null : (
              <Button
                type="button"
                text
                icon={<History className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                onClick={(e) => {
                  e.stopPropagation();
                  openHistory(row);
                }}
                aria-label={t("mitteilungszentrale.openHistory")}
                title={t("mitteilungszentrale.openHistory")}
              />
            )
          }
          style={{ width: "5.5rem" }}
        />
        <Column
          header={t("mitteilungszentrale.open")}
          body={(row: NotificationInboxItem) => (
            <Button
              type="button"
              text
              icon={<Pencil className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
              onClick={() => {
                void openItem(row);
              }}
              aria-label={
                row.kind === "stock"
                  ? t("mitteilungszentrale.openSparePart")
                  : t("mitteilungszentrale.openOrder")
              }
              title={
                row.kind === "stock"
                  ? t("mitteilungszentrale.openSparePart")
                  : t("mitteilungszentrale.openOrder")
              }
            />
          )}
          style={{ width: "5.5rem" }}
        />
      </DataTable>

      {historyPanelMounted && historyDrawer ? (
        <div className="fixed inset-0 z-[1000] flex justify-end" role="presentation">
          <div
            className={`absolute inset-0 bg-black/35 transition-opacity ease-out ${
              historyPanelIn ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDuration: `${HISTORY_DRAWER_MS}ms` }}
            aria-hidden
            onMouseDown={closeHistory}
          />
          <section
            className={`relative z-10 ml-auto flex h-full w-[60vw] max-w-[60vw] shrink-0 flex-col bg-surface-container-low shadow-2xl transition-transform ease-out ${
              historyPanelIn ? "translate-x-0" : "translate-x-full"
            }`}
            style={{ transitionDuration: `${HISTORY_DRAWER_MS}ms` }}
            aria-label={t("mitteilungszentrale.history")}
            onMouseDown={(event) => event.stopPropagation()}
            onTransitionEnd={onHistoryPanelTransitionEnd}
          >
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="m-0 font-mono text-base font-semibold text-on-surface">
                  {t("mitteilungszentrale.history")}
                </h2>
                <p className="m-0 truncate text-xs text-on-surface-variant">
                  <strong className="font-bold text-on-surface">#{historyDrawer.orderNumber}</strong>
                  <span>: {historyDrawer.workOrderName}</span>
                </p>
              </div>
              <button
                type="button"
                className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-on-surface-variant hover:text-[var(--color-primary)]"
                aria-label={t("mitteilungszentrale.closeHistory")}
                title={t("mitteilungszentrale.closeHistory")}
                onClick={closeHistory}
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
              <div className="flex h-full min-h-0 flex-1 flex-col">
                <WorkOrderMessagesTabContent
                  messages={historyMessages}
                  loading={historyLoading}
                  sending={historySending}
                  currentUserId={user.id}
                  onSend={sendHistoryMessage}
                />
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
