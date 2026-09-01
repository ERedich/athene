import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

import { List } from "lucide-react";
import { Checkbox } from "primereact/checkbox";
import { OverlayPanel } from "primereact/overlaypanel";
import { useTranslation } from "react-i18next";

import { LucideSpinner, lucidePrimeBtnIcon } from "../../icons/lucide";
import { apiFetch } from "../../lib/api";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import type { TodoRecord } from "../../lib/todoTypes";
import type { WorkOrder } from "../../lib/workOrderTypes";

type Props = {
  row: WorkOrder;
  emptyBadgePlaceholder?: boolean;
  onCountsChange?: (workOrderId: string, uncheckedTodoCount: number) => void;
};

export function WorkOrderInstructionsPopover({
  row,
  emptyBadgePlaceholder = true,
  onCountsChange,
}: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<OverlayPanel>(null);
  const [rows, setRows] = useState<TodoRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const todoCount = row.todoCount ?? 0;
  const hasTodos = todoCount > 0;
  const [uncheckedCount, setUncheckedCount] = useState(
    row.uncheckedTodoCount ?? row.todoCount ?? 0,
  );

  useEffect(() => {
    setUncheckedCount(row.uncheckedTodoCount ?? row.todoCount ?? 0);
  }, [row.id, row.uncheckedTodoCount, row.todoCount]);

  const instructionsTitle = t("workOrders.instructionsReferenceTitle", { count: uncheckedCount });

  const loadTodos = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await apiFetch(`/api/work-orders/${row.id}/todos`);
      if (!res.ok) {
        setLoadError(true);
        setRows([]);
        return;
      }
      const data = (await res.json()) as TodoRecord[];
      setRows(data);
      const open = data.filter((item) => !item.checked).length;
      setUncheckedCount(open);
      onCountsChange?.(row.id, open);
    } catch {
      setLoadError(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [onCountsChange, row.id]);

  const handleToggle = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!hasTodos) return;
    panelRef.current?.toggle(e);
  }, [hasTodos]);

  const handlePanelShow = useCallback(() => {
    void loadTodos();
  }, [loadTodos]);

  const handleCheck = useCallback(
    async (todo: TodoRecord, checked: boolean) => {
      setTogglingId(todo.id);
      const prevRows = rows;
      const nextRows = rows.map((item) => (item.id === todo.id ? { ...item, checked } : item));
      setRows(nextRows);
      const nextUnchecked = nextRows.filter((item) => !item.checked).length;
      setUncheckedCount(nextUnchecked);
      onCountsChange?.(row.id, nextUnchecked);
      try {
        const res = await apiFetch(`/api/work-orders/${row.id}/todos/${todo.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checked }),
        });
        if (!res.ok) throw new Error("patch_failed");
        const updated = (await res.json()) as TodoRecord;
        setRows((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } catch {
        setRows(prevRows);
        const restored = prevRows.filter((item) => !item.checked).length;
        setUncheckedCount(restored);
        onCountsChange?.(row.id, restored);
      } finally {
        setTogglingId(null);
      }
    },
    [onCountsChange, row.id, rows],
  );

  if (!hasTodos) return null;

  const badge =
    emptyBadgePlaceholder || uncheckedCount > 0 ? String(uncheckedCount) : undefined;

  return (
    <>
      <button
        type="button"
        className="p-button p-component p-button-icon-only h-7 w-7 !rounded-[0.5rem] !p-0 app-ref-button--todos"
        onClick={handleToggle}
        aria-label={instructionsTitle}
        title={instructionsTitle}
      >
        <span className="p-button-icon p-c">
          <List className={lucidePrimeBtnIcon} strokeWidth={1.75} />
        </span>
        {badge != null ? (
          <span className="p-badge p-component !bg-slate-900 !text-white !shadow-none !min-w-[1.1rem] !h-4 !text-[10px] !leading-4 !px-1 !py-0">
            {badge}
          </span>
        ) : null}
      </button>
      <OverlayPanel
        ref={panelRef}
        appendTo={overlayAppendTo}
        className="app-instructions-popover w-[min(24rem,calc(100vw-2rem))]"
        onShow={handlePanelShow}
      >
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-on-surface">{t("workOrders.instructionsPopoverTitle")}</h3>
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-on-surface-variant">
              <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
              <span>{t("workOrders.instructionsLoading")}</span>
            </div>
          ) : loadError ? (
            <p className="text-sm text-on-surface-variant">{t("workOrders.instructionsLoadError")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t("workOrders.instructionsEmpty")}</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {rows.map((todo, index) => (
                <label
                  key={todo.id}
                  className="app-card-cascade flex cursor-pointer items-start gap-3 rounded-sm border border-solid border-outline-variant px-3 py-2"
                  style={{ ["--app-cascade-index" as string]: index }}
                >
                  <Checkbox
                    checked={Boolean(todo.checked)}
                    disabled={togglingId === todo.id}
                    onChange={(e) => void handleCheck(todo, e.checked === true)}
                    inputId={`wo-instruction-${todo.id}`}
                  />
                  <span
                    className={`min-w-0 flex-1 text-sm ${
                      todo.checked ? "text-on-surface-variant line-through" : "text-on-surface"
                    }`}
                  >
                    {todo.text}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </OverlayPanel>
    </>
  );
}
