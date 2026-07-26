import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { Toast } from "primereact/toast";

import { lucidePrimeBtnIcon } from "../icons/lucide";
import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { useWorkOrderDialog } from "../workOrders/WorkOrderDialogContext";

type DispatchWorkOrder = {
  id: string;
  orderNumber: number;
  name: string;
  status: string;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationMinutes: number | null;
  customerId: string | null;
  customerName: string | null;
};

type DispatchTechnician = {
  employeeId: string;
  employeeKey: string;
  employeeName: string;
  workgroupId: string | null;
  workgroupKey: string | null;
  workgroupName: string | null;
  plannedMinutes: number;
  workOrders: DispatchWorkOrder[];
};

type DispatchBoardResponse = {
  from: string;
  to: string;
  technicians: DispatchTechnician[];
  unassigned: DispatchWorkOrder[];
};

type WorkgroupOption = { id: string; key: string; name: string; siteId: string };
type SiteOption = { id: string; key: string; name: string };

/** Nominal weekly capacity for the load bar (40h). */
const WEEK_CAPACITY_MINUTES = 40 * 60;

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function capacityRatio(plannedMinutes: number): number {
  if (plannedMinutes <= 0) return 0;
  return Math.min(1, plannedMinutes / WEEK_CAPACITY_MINUTES);
}

export function DispositionPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const woDialog = useWorkOrderDialog();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [board, setBoard] = useState<DispatchBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [workgroups, setWorkgroups] = useState<WorkgroupOption[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [workgroupId, setWorkgroupId] = useState<string>("");
  const [siteId, setSiteId] = useState<string>(user.workingSiteId ?? "");
  const [assigningWoId, setAssigningWoId] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const weekLabel = useMemo(() => {
    const from = weekStart.toLocaleDateString(i18n.language);
    const to = addDays(weekStart, 6).toLocaleDateString(i18n.language);
    return t("disposition.weekRange", { from, to });
  }, [i18n.language, t, weekStart]);

  const workgroupOptions = useMemo(
    () => [
      { label: t("disposition.allWorkgroups"), value: "" },
      ...workgroups
        .filter((wg) => !siteId || wg.siteId === siteId)
        .map((wg) => ({ label: `${wg.key} - ${wg.name}`, value: wg.id })),
    ],
    [siteId, t, workgroups],
  );

  const siteOptions = useMemo(
    () => sites.map((s) => ({ label: `${s.key} - ${s.name}`, value: s.id })),
    [sites],
  );

  const technicianOptions = useMemo(() => {
    if (!board) return [];
    return board.technicians.map((tech) => ({
      label: `${tech.employeeKey} - ${tech.employeeName}`,
      value: tech.employeeId,
    }));
  }, [board]);

  const boardWoCount = useMemo(() => {
    if (!board) return 0;
    const ids = new Set<string>();
    for (const tech of board.technicians) {
      for (const wo of tech.workOrders) ids.add(wo.id);
    }
    for (const wo of board.unassigned) ids.add(wo.id);
    return ids.size;
  }, [board]);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
      });
      if (workgroupId) params.set("workgroupId", workgroupId);
      if (siteId) params.set("siteId", siteId);
      const res = await apiFetch(`/api/dispatch-board?${params.toString()}`);
      if (!res.ok) throw new Error("load");
      setBoard((await res.json()) as DispatchBoardResponse);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("disposition.loadError"), life: 6000 });
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, [siteId, t, weekEnd, weekStart, workgroupId]);

  const loadFilters = useCallback(async () => {
    try {
      const [wgRes, sitesRes] = await Promise.all([apiFetch("/api/workgroups"), apiFetch("/api/sites")]);
      if (wgRes.ok) setWorkgroups((await wgRes.json()) as WorkgroupOption[]);
      if (sitesRes.ok) setSites((await sitesRes.json()) as SiteOption[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    setHeaderRowCount(boardWoCount);
    return () => setHeaderRowCount(null);
  }, [boardWoCount, setHeaderRowCount]);

  const assignToTechnician = async (workOrderId: string, employeeId: string) => {
    if (!employeeId) return;
    setAssigningWoId(workOrderId);
    try {
      const res = await apiFetch(`/api/work-orders/${workOrderId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId }),
      });
      if (!res.ok) {
        toastRef.current?.show({ severity: "error", summary: t("disposition.assignError"), life: 6000 });
        return;
      }
      await loadBoard();
      toastRef.current?.show({ severity: "success", summary: t("disposition.assigned"), life: 3000 });
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("disposition.assignError"), life: 6000 });
    } finally {
      setAssigningWoId(null);
    }
  };

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-2 p-0">
        <li>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1 rounded-sm px-2 text-sm text-on-surface-variant hover:bg-surface-container-high"
            onClick={() => setWeekStart((cur) => addDays(cur, -7))}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            <span>{t("disposition.prevWeek")}</span>
          </button>
        </li>
        <li className="text-sm font-medium">{weekLabel}</li>
        <li>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1 rounded-sm px-2 text-sm text-on-surface-variant hover:bg-surface-container-high"
            onClick={() => setWeekStart((cur) => addDays(cur, 7))}
          >
            <span>{t("disposition.nextWeek")}</span>
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </li>
        <li>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1 rounded-sm px-2 text-sm text-on-surface-variant hover:bg-surface-container-high"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
          >
            {t("disposition.currentWeek")}
          </button>
        </li>
        <li className="ml-auto">
          <Button
            type="button"
            text
            icon={<RefreshCw className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
            label={t("disposition.refresh")}
            loading={loading}
            onClick={() => void loadBoard()}
          />
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [loadBoard, loading, setHeaderActions, t, weekLabel]);

  const renderWoCard = (wo: DispatchWorkOrder, assignable: boolean) => (
    <div
      key={wo.id}
      className="rounded-sm border border-solid border-outline-variant/50 bg-surface-container-lowest px-2.5 py-2 text-sm"
    >
      <button
        type="button"
        className="block w-full text-left font-medium leading-snug hover:text-primary"
        onClick={() => woDialog.openEdit(wo.id)}
      >
        #{wo.orderNumber} — {wo.name}
      </button>
      <div className="mt-1 text-[11px] leading-snug text-on-surface-variant">
        {new Date(wo.plannedStart).toLocaleString(i18n.language, {
          dateStyle: "short",
          timeStyle: "short",
        })}{" "}
        –{" "}
        {new Date(wo.plannedEnd).toLocaleString(i18n.language, {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </div>
      {wo.customerName ? (
        <div className="mt-1 truncate text-[11px] text-on-surface-variant">{wo.customerName}</div>
      ) : null}
      {assignable ? (
        <div className="mt-2">
          <Dropdown
            placeholder={t("disposition.assignPlaceholder")}
            options={technicianOptions}
            optionLabel="label"
            optionValue="value"
            className="w-full text-sm"
            disabled={assigningWoId === wo.id || technicianOptions.length === 0}
            appendTo={overlayAppendTo}
            onChange={(e) => void assignToTechnician(wo.id, String(e.value ?? ""))}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden p-4">
      <Toast ref={toastRef} position="top-right" />

      <div className="flex shrink-0 flex-wrap items-end gap-3">
        <div className="min-w-[14rem] space-y-1">
          <label className="block text-[11px] uppercase tracking-[0.1em] text-outline">
            {t("disposition.filterSite")}
          </label>
          <Dropdown
            value={siteId || null}
            options={siteOptions}
            optionLabel="label"
            optionValue="value"
            onChange={(e) => {
              setSiteId(String(e.value ?? ""));
              setWorkgroupId("");
            }}
            className="w-full"
            filter
            appendTo={overlayAppendTo}
          />
        </div>
        <div className="min-w-[14rem] space-y-1">
          <label className="block text-[11px] uppercase tracking-[0.1em] text-outline">
            {t("disposition.filterWorkgroup")}
          </label>
          <Dropdown
            value={workgroupId || null}
            options={workgroupOptions}
            optionLabel="label"
            optionValue="value"
            onChange={(e) => setWorkgroupId(String(e.value ?? ""))}
            className="w-full"
            filter
            appendTo={overlayAppendTo}
          />
        </div>
      </div>

      {loading && !board ? (
        <div className="text-sm text-on-surface-variant">{t("disposition.loading")}</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-sm border border-solid border-outline-variant/40 bg-surface-container-low/40">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-solid border-outline-variant/40 px-3 py-2">
              <h2 className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                {t("disposition.techniciansTitle")}
              </h2>
              <span className="text-xs text-on-surface-variant">
                {board?.technicians.length ?? 0}
              </span>
            </div>
            {board?.technicians.length ? (
              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
                <div className="flex h-full w-max min-h-0 gap-3 p-3">
                  {board.technicians.map((tech) => {
                    const ratio = capacityRatio(tech.plannedMinutes);
                    return (
                      <div
                        key={tech.employeeId}
                        className="flex h-full w-[17.5rem] shrink-0 flex-col overflow-hidden rounded-sm border border-solid border-outline-variant/50 bg-surface"
                      >
                        <div className="shrink-0 space-y-2 border-b border-solid border-outline-variant/40 px-3 py-2.5">
                          <div className="min-w-0">
                            <div className="font-medium leading-snug">
                              {tech.employeeKey} — {tech.employeeName}
                            </div>
                            {tech.workgroupName ? (
                              <div className="mt-0.5 text-[11px] leading-snug text-on-surface-variant">
                                {tech.workgroupName}
                              </div>
                            ) : null}
                          </div>
                          <div>
                            <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-on-surface-variant">
                              <span>{t("disposition.plannedMinutes", { count: tech.plannedMinutes })}</span>
                              <span>{Math.round(ratio * 100)}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                              <div
                                className={`h-full rounded-full ${
                                  ratio >= 1
                                    ? "bg-error"
                                    : ratio >= 0.75
                                      ? "bg-tertiary"
                                      : "bg-primary"
                                }`}
                                style={{ width: `${Math.max(4, ratio * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                          {tech.workOrders.map((wo) => renderWoCard(wo, false))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-4 text-sm text-on-surface-variant">{t("disposition.noTechnicians")}</div>
            )}
          </section>

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-sm border border-solid border-outline-variant/40 bg-surface-container-low/40">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-solid border-outline-variant/40 px-3 py-2">
              <h2 className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                {t("disposition.unassignedTitle")}
              </h2>
              <span className="text-xs text-on-surface-variant">{board?.unassigned.length ?? 0}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
              {board?.unassigned.length ? (
                board.unassigned.map((wo) => renderWoCard(wo, true))
              ) : (
                <div className="p-2 text-sm text-on-surface-variant">{t("disposition.noUnassigned")}</div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
