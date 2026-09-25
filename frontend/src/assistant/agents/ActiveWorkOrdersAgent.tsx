import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sidebar } from "primereact/sidebar";

import { AtheneFieldTip } from "./AtheneFieldTip";
import { apiFetch } from "../../lib/api";
import type { WorkOrderStatus } from "../../lib/workOrderTypes";

export type RecentWorkOrderRow = {
  id: string;
  orderNumber: number;
  name: string;
  description: string | null;
  status: WorkOrderStatus;
  createdAt: string;
  assetKey: string;
  assetName: string;
  workgroupKey: string | null;
  workgroupName: string | null;
};

type RecentForAssetResponse = {
  count: number;
  rows: RecentWorkOrderRow[];
};

type ActiveWorkOrdersAgentProps = {
  /** Selected asset id; empty/null clears the tip. */
  assetId: string | null | undefined;
  /** When false (edit mode), the agent stays inactive. */
  enabled?: boolean;
};

function formatAssetLabel(key: string, name: string): string {
  const k = key.trim();
  const n = name.trim();
  if (k && n) return `${k} - ${n}`;
  return k || n || "—";
}

function formatWorkgroupLabel(key: string | null, name: string | null): string {
  const k = (key ?? "").trim();
  const n = (name ?? "").trim();
  if (k && n) return `${k} - ${n}`;
  if (k || n) return k || n;
  return "—";
}

/**
 * Athene "Aktive Aufträge" agent: after an asset is chosen on create,
 * offers a tip when other work orders were created for that asset in the last 24h.
 */
export function ActiveWorkOrdersAgent({ assetId, enabled = true }: ActiveWorkOrdersAgentProps) {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);
  const [rows, setRows] = useState<RecentWorkOrderRow[]>([]);
  const [tipVisible, setTipVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  /** Asset ids the user dismissed (Nein) or already opened (Ja) in this create session. */
  const [dismissedAssetIds, setDismissedAssetIds] = useState<Set<string>>(() => new Set());

  const activeAssetId = enabled && assetId?.trim() ? assetId.trim() : "";

  useEffect(() => {
    if (!activeAssetId) {
      setTipVisible(false);
      setCount(0);
      setRows([]);
      return;
    }
    if (dismissedAssetIds.has(activeAssetId)) {
      setTipVisible(false);
      return;
    }

    setTipVisible(false);
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch(
          `/api/work-orders/recent-for-asset?assetId=${encodeURIComponent(activeAssetId)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          if (!cancelled) {
            setTipVisible(false);
            setCount(0);
            setRows([]);
          }
          return;
        }
        const data = (await res.json()) as RecentForAssetResponse;
        if (cancelled) return;
        const nextCount = typeof data.count === "number" ? data.count : 0;
        const nextRows = Array.isArray(data.rows) ? data.rows : [];
        setCount(nextCount);
        setRows(nextRows);
        setTipVisible(nextCount > 0);
      } catch {
        if (controller.signal.aborted || cancelled) return;
        setTipVisible(false);
        setCount(0);
        setRows([]);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeAssetId, dismissedAssetIds]);

  const markDismissed = useCallback((id: string) => {
    setDismissedAssetIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleNo = useCallback(() => {
    if (activeAssetId) markDismissed(activeAssetId);
    setTipVisible(false);
  }, [activeAssetId, markDismissed]);

  const handleYes = useCallback(() => {
    if (activeAssetId) markDismissed(activeAssetId);
    setTipVisible(false);
    setDrawerVisible(true);
  }, [activeAssetId, markDismissed]);

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false);
  }, []);

  const tipMessage = useMemo(() => {
    if (count === 1) return t("assistant.agents.activeWorkOrders.tipSingular");
    return t("assistant.agents.activeWorkOrders.tipPlural", { count });
  }, [count, t]);

  if (!enabled) return null;

  return (
    <>
      {tipVisible ? (
        <AtheneFieldTip
          message={tipMessage}
          onYes={handleYes}
          onNo={handleNo}
          onTimeout={handleNo}
          durationMs={10_000}
          yesLabel={t("assistant.agents.yes")}
          noLabel={t("assistant.agents.no")}
        />
      ) : null}

      <Sidebar
        visible={drawerVisible}
        position="right"
        onHide={closeDrawer}
        modal
        dismissable
        className="app-wo-search-sidebar !w-[min(32rem,100vw)] max-w-none"
        appendTo={typeof document !== "undefined" ? document.body : undefined}
        header={t("assistant.agents.activeWorkOrders.drawerTitle")}
        pt={{
          header: { className: "app-wo-search-sidebar-header" },
          content: { className: "app-wo-search-sidebar-content flex min-h-0 flex-1 flex-col p-0" },
        }}
      >
        {drawerVisible ? (
          <div className="flex max-h-[calc(100dvh-4.5rem)] min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 pt-2">
            {rows.length === 0 ? (
              <div className="text-sm text-on-surface-variant">
                {t("assistant.agents.activeWorkOrders.empty")}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {rows.map((row, index) => {
                  const description = (row.description ?? "").trim();
                  return (
                    <div
                      key={row.id}
                      className="app-card-cascade flex flex-col gap-2 rounded-sm border border-solid border-outline-variant px-3 py-2.5"
                      style={{ ["--app-cascade-index" as string]: index }}
                    >
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-on-surface-variant">
                          {t("workOrders.orderNumber")}
                        </div>
                        <div className="text-sm text-on-surface">{row.orderNumber}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-on-surface-variant">
                          {t("workOrders.asset")}
                        </div>
                        <div
                          className="truncate text-sm text-on-surface"
                          title={formatAssetLabel(row.assetKey, row.assetName)}
                        >
                          {formatAssetLabel(row.assetKey, row.assetName)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-on-surface-variant">
                          {t("workOrders.name")}
                        </div>
                        <div className="text-sm text-on-surface" title={row.name}>
                          {row.name.trim() || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-on-surface-variant">
                          {t("workOrders.workgroup")}
                        </div>
                        <div
                          className="truncate text-sm text-on-surface"
                          title={formatWorkgroupLabel(row.workgroupKey, row.workgroupName)}
                        >
                          {formatWorkgroupLabel(row.workgroupKey, row.workgroupName)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-on-surface-variant">
                          {t("workOrders.descriptionMode.text")}
                        </div>
                        <div className="whitespace-pre-wrap text-sm text-on-surface">
                          {description || "—"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {count > rows.length ? (
              <p className="mt-3 text-xs text-on-surface-variant">
                {t("assistant.agents.activeWorkOrders.truncated", {
                  shown: rows.length,
                  total: count,
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </Sidebar>
    </>
  );
}
