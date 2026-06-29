import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { CalendarMoveConfirmPanel } from "../components/calendar/CalendarMoveConfirmPanel";
import { CalendarDayTimeline } from "../components/calendar/CalendarDayTimeline";
import { CalendarGrid } from "../components/calendar/CalendarGrid";
import { CalendarToolbar } from "../components/calendar/CalendarToolbar";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import {
  buildMonthGrid,
  buildWeekGrid,
  eventIntersectsDay,
  formatPeriodTitle,
  getDayRange,
  getVisibleRange,
  shiftAnchorDate,
} from "../lib/calendar/calendarDates";
import {
  buildPendingMove,
  isBeforeToday,
  type PendingCalendarMove,
} from "../lib/calendar/calendarMove";
import type { CalendarViewMode } from "../lib/calendar/calendarTypes";
import {
  calendarWorkOrderToEditSource,
  fetchCalendarWorkOrders,
  filterCalendarEventsBySearch,
  workOrderToCalendarEvent,
  type CalendarWorkOrder,
} from "../lib/calendar/calendarWorkOrders";
import {
  fetchWorkOrderById,
  fetchWorkOrderPlanningConflicts,
  putWorkOrder,
} from "../lib/workOrderApi";
import { useAtheneAssistant } from "../assistant/AtheneAssistantContext";
import { useWorkOrderDialog } from "../workOrders/WorkOrderDialogContext";

export function KalendarPage() {
  const { t, i18n } = useTranslation();
  const woDialog = useWorkOrderDialog();
  const athene = useAtheneAssistant();
  const toastRef = useRef<Toast>(null);
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();

  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [workOrders, setWorkOrders] = useState<CalendarWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingWorkOrderId, setDraggingWorkOrderId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingCalendarMove | null>(null);
  const [moveSaving, setMoveSaving] = useState(false);

  const weeks = useMemo(() => {
    if (viewMode === "month") return buildMonthGrid(anchorDate);
    if (viewMode === "week") return buildWeekGrid(anchorDate);
    return [];
  }, [anchorDate, viewMode]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === "day") return getDayRange(anchorDate);
    if (weeks.length > 0) return getVisibleRange(weeks);
    return getDayRange(anchorDate);
  }, [anchorDate, viewMode, weeks]);

  const periodTitle = useMemo(
    () => formatPeriodTitle(anchorDate, viewMode, i18n.language),
    [anchorDate, viewMode, i18n.language],
  );

  const langDe = i18n.language?.toLowerCase().startsWith("de");

  const formatDateTime = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, "0");
      if (langDe) {
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    [langDe],
  );

  const formatDateOnly = useCallback(
    (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      if (langDe) {
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
      }
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    },
    [langDe],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchCalendarWorkOrders(rangeStart, rangeEnd);
      setWorkOrders(rows);
    } catch {
      setError(t("kalendar.loadError"));
      setWorkOrders([]);
    } finally {
      setLoading(false);
    }
  }, [rangeEnd, rangeStart, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const allEvents = useMemo(() => workOrders.map(workOrderToCalendarEvent), [workOrders]);

  const filteredEvents = useMemo(
    () => filterCalendarEventsBySearch(allEvents, searchTerm),
    [allEvents, searchTerm],
  );

  const displayEventCount = useMemo(() => {
    if (viewMode === "day") {
      return filteredEvents.filter((ev) => eventIntersectsDay(ev.start, ev.end, anchorDate)).length;
    }
    return filteredEvents.length;
  }, [anchorDate, filteredEvents, viewMode]);

  useEffect(() => {
    setHeaderRowCount(displayEventCount);
    return () => {
      setHeaderRowCount(null);
    };
  }, [displayEventCount, setHeaderRowCount]);

  const handlePrev = useCallback(() => {
    setAnchorDate((d) => shiftAnchorDate(d, viewMode, -1));
  }, [viewMode]);

  const handleNext = useCallback(() => {
    setAnchorDate((d) => shiftAnchorDate(d, viewMode, 1));
  }, [viewMode]);

  const handleToday = useCallback(() => {
    setAnchorDate(new Date());
  }, []);

  const handleOverflowWeekClick = useCallback((weekStart: Date) => {
    setAnchorDate(new Date(weekStart));
    setViewMode("week");
  }, []);

  const handleWeekClick = useCallback((weekStart: Date) => {
    setAnchorDate(new Date(weekStart));
    setViewMode("week");
  }, []);

  const handleDayClick = useCallback((day: Date) => {
    setAnchorDate(new Date(day));
    setViewMode("day");
  }, []);

  const handleEventClick = useCallback(
    (wo: CalendarWorkOrder) => {
      woDialog.openEdit(calendarWorkOrderToEditSource(wo), {
        onSaved: () => void loadData(),
      });
    },
    [loadData, woDialog],
  );

  const handleAskAthene = useCallback(
    (wo: CalendarWorkOrder) => {
      athene.openForCalendar({
        workOrderId: wo.id,
        label: `#${wo.orderNumber} ${wo.name}`,
        data: {
          viewMode,
          rangeStart: rangeStart.toISOString(),
          rangeEnd: rangeEnd.toISOString(),
          anchorDate: anchorDate.toISOString(),
        },
        onRescheduleApplied: () => void loadData(),
      });
    },
    [anchorDate, athene, loadData, rangeEnd, rangeStart, viewMode],
  );

  const handleDragStart = useCallback((workOrderId: string) => {
    setDraggingWorkOrderId(workOrderId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingWorkOrderId(null);
  }, []);

  const handleMoveReject = useCallback(() => {
    setPendingMove(null);
  }, []);

  useEffect(() => {
    if (!pendingMove) return;
    let cancelled = false;
    void (async () => {
      try {
        const check = await fetchWorkOrderPlanningConflicts(
          pendingMove.workOrder.id,
          pendingMove.newStart.toISOString(),
          pendingMove.newEnd.toISOString(),
        );
        if (cancelled) return;
        setPendingMove((cur) =>
          cur && cur.workOrder.id === pendingMove.workOrder.id
            ? { ...cur, planningConflict: check }
            : cur,
        );
      } catch {
        if (!cancelled) {
          setPendingMove((cur) =>
            cur && cur.workOrder.id === pendingMove.workOrder.id
              ? { ...cur, planningConflict: null }
              : cur,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingMove?.workOrder.id, pendingMove?.newStart, pendingMove?.newEnd]);

  const handleMoveProposal = useCallback(
    (wo: CalendarWorkOrder, targetDay: Date) => {
      const pending = buildPendingMove(wo, targetDay);
      if (!pending) {
        if (isBeforeToday(targetDay)) {
          toastRef.current?.show({
            severity: "warn",
            summary: t("kalendar.dropPastDenied"),
            life: 4000,
          });
        }
        return;
      }
      setPendingMove(pending);
    },
    [t],
  );

  const handleMoveAccept = useCallback(async () => {
    if (!pendingMove) return;
    setMoveSaving(true);
    try {
      const full = await fetchWorkOrderById(pendingMove.workOrder.id);
      if (!full) throw new Error("not_found");
      const durationMs = pendingMove.newEnd.getTime() - pendingMove.newStart.getTime();
      const plannedDurationMinutes = Math.max(0, Math.round(durationMs / 60_000));
      const hasConflict = (pendingMove.planningConflict?.conflicts.length ?? 0) > 0;
      await putWorkOrder(
        full,
        {
          plannedStart: pendingMove.newStart.toISOString(),
          plannedEnd: pendingMove.newEnd.toISOString(),
          plannedDurationMinutes,
        },
        { allowAssetOverlap: hasConflict },
      );
      toastRef.current?.show({
        severity: "success",
        summary: t("kalendar.moveSuccess"),
        life: 3000,
      });
      handleMoveReject();
      await loadData();
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("kalendar.moveError"),
        life: 6000,
      });
    } finally {
      setMoveSaving(false);
    }
  }, [handleMoveReject, loadData, pendingMove, t]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li className="min-w-0 flex-1">
          <CalendarToolbar
            periodTitle={periodTitle}
            viewMode={viewMode}
            onPrev={handlePrev}
            onNext={handleNext}
            onToday={handleToday}
            onViewModeChange={setViewMode}
          />
        </li>
        <li className="ml-auto shrink-0">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("kalendar.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [handleNext, handlePrev, handleToday, periodTitle, searchTerm, setHeaderActions, t, viewMode]);

  const gridViewMode = viewMode === "week" ? "week" : "month";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
      <Toast ref={toastRef} position="top-right" />
      <CalendarMoveConfirmPanel
        visible={pendingMove != null}
        pending={pendingMove}
        formatDate={formatDateOnly}
        saving={moveSaving}
        onAccept={() => void handleMoveAccept()}
        onReject={handleMoveReject}
      />

      {error ? (
        <div className="mb-3 rounded-lg bg-surface-container-low p-3 text-sm text-on-surface">
          <p>{error}</p>
          <Button
            type="button"
            label={t("kalendar.retry")}
            size="small"
            className="mt-2"
            onClick={() => void loadData()}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-on-surface-variant">…</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-[color-mix(in_srgb,var(--color-on-surface)_10%,transparent)] bg-surface-container-low">
          {!loading && displayEventCount === 0 && workOrders.length === 0 ? (
            <p className="p-4 text-center text-sm text-on-surface-variant">{t("kalendar.noEvents")}</p>
          ) : null}
          {viewMode === "day" ? (
            <CalendarDayTimeline
              anchorDate={anchorDate}
              events={filteredEvents}
              formatDateTime={formatDateTime}
              onEventClick={handleEventClick}
              onAskAthene={handleAskAthene}
            />
          ) : (
            <CalendarGrid
              weeks={weeks}
              events={filteredEvents}
              viewMode={gridViewMode}
              formatDateTime={formatDateTime}
              draggingWorkOrderId={draggingWorkOrderId}
              onEventClick={handleEventClick}
              onAskAthene={handleAskAthene}
              onOverflowWeekClick={handleOverflowWeekClick}
              onWeekClick={handleWeekClick}
              onDayClick={handleDayClick}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onMoveProposal={handleMoveProposal}
            />
          )}
        </div>
      )}
    </div>
  );
}
