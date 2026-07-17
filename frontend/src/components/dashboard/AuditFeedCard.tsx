import { useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { GripVertical, Settings } from "lucide-react";
import { OverlayPanel } from "primereact/overlaypanel";
import { PanelMenu } from "primereact/panelmenu";

import {
  useDashboardAuditFeed,
  type DashboardAuditFeedItem,
} from "../../hooks/useDashboardAuditFeed";
import type { DashboardSlotId } from "../../hooks/useDashboardLayout";
import { buildDashboardKpiMenuModel } from "../../lib/dashboardKpiMenu";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import { lucidePrimeBtnIcon } from "../../icons/lucide";
import type { CustomKpi } from "../../lib/kpiBuilderApi";
import type { WorkOrderStatus } from "../../lib/workOrderTypes";
import { useWorkOrderDialog } from "../../workOrders/WorkOrderDialogContext";

type Props = {
  slotIndex: number;
  kpiId: DashboardSlotId;
  customCatalog: CustomKpi[];
  onSelectKpi: (kpiId: DashboardSlotId) => void;
  onArm: () => void;
};

type FeedRow =
  | { type: "day"; key: string; label: string }
  | { type: "item"; key: string; item: DashboardAuditFeedItem };

const PUSH_MS = 320;
const PUSH_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dayKeyFromIso(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function formatAuditTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatQuantity(raw: string | null, locale: string): string {
  if (raw == null || raw === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    }).format(n);
  } catch {
    return String(n);
  }
}

function isWorkOrderStatus(value: string): value is WorkOrderStatus {
  return (
    value === "open" ||
    value === "assigned" ||
    value === "started" ||
    value === "paused" ||
    value === "continued" ||
    value === "ended" ||
    value === "done" ||
    value === "cancelled"
  );
}

function AuditLineMessage({
  item,
  locale,
  onOpenWorkOrder,
}: {
  item: DashboardAuditFeedItem;
  locale: string;
  onOpenWorkOrder: (workOrderId: string) => void;
}) {
  const { t } = useTranslation();
  const canOpen = Boolean(item.workOrderId && item.orderNumber != null);
  const woLink = canOpen ? (
    <button
      type="button"
      className="app-dashboard-audit-card__wo-link"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (item.workOrderId) onOpenWorkOrder(item.workOrderId);
      }}
    />
  ) : (
    <span />
  );

  if (item.kind === "work_order_status") {
    const statusKey =
      item.status && isWorkOrderStatus(item.status)
        ? `workOrders.statusValues.${item.status}`
        : null;
    const statusLabel = statusKey ? t(statusKey) : (item.status ?? "—");
    return (
      <Trans
        i18nKey="dashboard.auditStatusUpdated"
        values={{ orderNumber: item.orderNumber ?? "—", status: statusLabel }}
        components={{ woLink }}
      />
    );
  }

  const unit =
    item.transactionType === "IN" || item.transactionType === "EX"
      ? t("dashboard.auditUnitHours")
      : "";
  return (
    <Trans
      i18nKey="dashboard.auditTransactionCreated"
      values={{
        type: item.transactionType ?? "—",
        quantity: formatQuantity(item.quantity, locale),
        unit,
        orderNumber: item.orderNumber ?? "—",
      }}
      components={{ woLink }}
    />
  );
}

function AuditLineContent({
  item,
  locale,
  onOpenWorkOrder,
}: {
  item: DashboardAuditFeedItem;
  locale: string;
  onOpenWorkOrder: (workOrderId: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const when = formatAuditTimestamp(item.occurredAt);
  const who = item.actorLogin?.trim() || t("dashboard.auditUnknownUser");
  return (
    <>
      {when} - {who}:{" "}
      <AuditLineMessage item={item} locale={locale} onOpenWorkOrder={onOpenWorkOrder} />
    </>
  );
}

function buildFeedRows(items: DashboardAuditFeedItem[]): FeedRow[] {
  const rows: FeedRow[] = [];
  let lastDay: string | null = null;
  for (const item of items) {
    const day = dayKeyFromIso(item.occurredAt);
    if (day && day !== lastDay) {
      rows.push({ type: "day", key: `day-${day}`, label: formatDayLabel(item.occurredAt) });
      lastDay = day;
    }
    rows.push({ type: "item", key: item.id, item });
  }
  return rows;
}

export function AuditFeedCard({
  slotIndex,
  kpiId,
  customCatalog,
  onSelectKpi,
  onArm,
}: Props) {
  const { t, i18n } = useTranslation();
  const woDialog = useWorkOrderDialog();
  const panelRef = useRef<OverlayPanel>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const prevTopsRef = useRef<Map<string, number>>(new Map());
  const skipFlipRef = useRef(true);
  const { items, freshIds, loading, error, refetch } = useDashboardAuditFeed(true);
  const locale = i18n.language?.toLowerCase().startsWith("en") ? "en" : "de";

  const feedRows = useMemo(() => buildFeedRows(items), [items]);

  const openWorkOrder = useCallback(
    (workOrderId: string) => {
      woDialog.openEdit(workOrderId);
    },
    [woDialog],
  );

  useLayoutEffect(() => {
    const list = listRef.current;
    const body = bodyRef.current;
    if (!list || loading) return;

    const nodes = [...list.querySelectorAll<HTMLElement>("[data-audit-key]")];
    const prevTops = prevTopsRef.current;
    const nextTops = new Map<string, number>();
    const shouldFlip = !skipFlipRef.current && prevTops.size > 0;

    if (shouldFlip) {
      for (const el of nodes) {
        const key = el.dataset.auditKey;
        if (!key) continue;
        const prevTop = prevTops.get(key);
        const nextTop = el.offsetTop;
        nextTops.set(key, nextTop);
        if (prevTop == null) continue;
        const dy = prevTop - nextTop;
        if (Math.abs(dy) < 0.5) continue;
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], {
          duration: PUSH_MS,
          easing: PUSH_EASING,
        });
      }
    } else {
      for (const el of nodes) {
        const key = el.dataset.auditKey;
        if (key) nextTops.set(key, el.offsetTop);
      }
    }

    prevTopsRef.current = nextTops;

    if (body && items.length > 0) {
      if (shouldFlip) {
        body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
      } else {
        body.scrollTop = body.scrollHeight;
      }
    }

    if (!loading) skipFlipRef.current = false;
  }, [feedRows, loading, items.length]);

  const menuModel = useMemo(
    () =>
      buildDashboardKpiMenuModel(
        kpiId,
        (id) => {
          onSelectKpi(id);
          panelRef.current?.hide();
        },
        t,
        customCatalog,
      ),
    [kpiId, onSelectKpi, t, customCatalog],
  );

  return (
    <article className="app-dashboard-audit-card app-dashboard-spark-card--teal">
      <header className="app-dashboard-audit-card__header">
        <div className="app-dashboard-audit-card__header-left">
          <h2 className="app-dashboard-audit-card__title">{t("dashboard.kpiAudit")}</h2>
        </div>
        <div className="app-dashboard-audit-card__header-right">
          <button
            type="button"
            className="app-dashboard-kpi-drag-handle"
            aria-label={t("dashboard.dragKpiAria", { slot: slotIndex + 1 })}
            onPointerDown={onArm}
          >
            <GripVertical className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            className="app-dashboard-kpi-config-btn"
            aria-label={t("dashboard.configureKpiAria", { slot: slotIndex + 1 })}
            title={t("dashboard.configureKpi")}
            onClick={(e) => panelRef.current?.toggle(e)}
          >
            <Settings className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
          </button>
          <OverlayPanel
            ref={panelRef}
            appendTo={overlayAppendTo}
            className="app-dashboard-kpi-big-menu"
          >
            <PanelMenu model={menuModel} multiple className="app-dashboard-kpi-panel-menu" />
          </OverlayPanel>
        </div>
      </header>

      <div ref={bodyRef} className="app-dashboard-audit-card__body">
        {loading ? (
          <div className="app-dashboard-audit-card__skeleton" aria-busy="true" aria-live="polite">
            <div className="app-dashboard-audit-card__skeleton-line" />
            <div className="app-dashboard-audit-card__skeleton-line app-dashboard-audit-card__skeleton-line--short" />
            <div className="app-dashboard-audit-card__skeleton-line" />
            <div className="app-dashboard-audit-card__skeleton-line app-dashboard-audit-card__skeleton-line--short" />
          </div>
        ) : error ? (
          <div className="app-dashboard-audit-card__error">
            <p>{t("dashboard.auditLoadError")}</p>
            <button type="button" className="app-dashboard-audit-card__retry" onClick={() => void refetch()}>
              {t("dashboard.retry")}
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="app-dashboard-audit-card__empty">{t("dashboard.auditEmpty")}</p>
        ) : (
          <ul ref={listRef} className="app-dashboard-audit-card__list">
            {feedRows.map((row) =>
              row.type === "day" ? (
                <li
                  key={row.key}
                  data-audit-key={row.key}
                  className="app-dashboard-audit-card__day"
                  aria-label={row.label}
                >
                  <span className="app-dashboard-audit-card__day-line" aria-hidden />
                  <span className="app-dashboard-audit-card__day-label">{row.label}</span>
                  <span className="app-dashboard-audit-card__day-line" aria-hidden />
                </li>
              ) : (
                <li
                  key={row.key}
                  data-audit-key={row.key}
                  className={[
                    "app-dashboard-audit-card__line",
                    freshIds[row.item.id] ? "app-dashboard-audit-card__line--fresh" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <AuditLineContent
                    item={row.item}
                    locale={locale}
                    onOpenWorkOrder={openWorkOrder}
                  />
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </article>
  );
}
