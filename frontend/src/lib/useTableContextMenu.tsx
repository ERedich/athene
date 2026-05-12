import {
  useCallback,
  useMemo,
  useRef,
  type MouseEvent,
  type ReactElement,
  type RefObject,
  type SyntheticEvent,
} from "react";
import { flushSync } from "react-dom";
import { ContextMenu } from "primereact/contextmenu";
import type { DataTableContextMenuSingleSelectionChangeEvent, DataTableRowEvent } from "primereact/datatable";
import type { MenuItem } from "primereact/menuitem";

import { overlayAppendTo } from "./overlayAppendTo";

export type CrudHandlers<T> = {
  onCreate?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
};

/** True when the event target sits on a PrimeReact DataTable body row (not header / empty chrome). */
export function isPrimeTableBodyRowTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('tr[data-pc-section="bodyrow"]')) return true;
  if (target.closest("tbody.p-datatable-tbody > tr")) return true;
  return false;
}

function showContextMenu(cmRef: RefObject<ContextMenu | null>, originalEvent: SyntheticEvent) {
  cmRef.current?.show(originalEvent);
}

type DataTableContextMenuOptions<T extends object> = {
  labels: { new: string; edit: string; delete: string };
  handlers: CrudHandlers<T>;
  selection: T | null;
  setSelection: (row: T | null) => void;
  leadingItems?: (row: T | null) => MenuItem[];
  extraItems?: (row: T | null) => MenuItem[];
};

/**
 * PrimeReact DataTable + ContextMenu: CRUD entries and optional per-table extras.
 * Use `wrapperProps` on a div wrapping the table so empty-area right-clicks still open the menu (Neu only).
 */
export function useTableContextMenu<T extends object>(opts: DataTableContextMenuOptions<T>) {
  const { labels, handlers, selection, setSelection, leadingItems, extraItems } = opts;
  const cmRef = useRef<ContextMenu>(null);

  const model = useMemo((): MenuItem[] => {
    const hasRow = selection != null;
    const leading = leadingItems?.(selection) ?? [];
    const base: MenuItem[] = [
      {
        label: labels.new,
        icon: "pi pi-plus",
        command: () => handlers.onCreate?.(),
      },
      {
        label: labels.edit,
        icon: "pi pi-pencil",
        disabled: !hasRow,
        command: () => {
          if (selection != null) handlers.onEdit?.(selection);
        },
      },
      {
        label: labels.delete,
        icon: "pi pi-trash",
        disabled: !hasRow,
        command: () => {
          if (selection != null) handlers.onDelete?.(selection);
        },
      },
    ];
    const extra = extraItems?.(selection) ?? [];
    return [
      ...leading,
      ...(leading.length > 0 ? [{ separator: true }] : []),
      ...base,
      ...(extra.length > 0 ? [{ separator: true }, ...extra] : []),
    ];
  }, [extraItems, handlers, labels.delete, labels.edit, labels.new, leadingItems, selection]);

  const onContextMenuSelectionChange = useCallback(
    (e: DataTableContextMenuSingleSelectionChangeEvent<T[]>) => {
      setSelection((e.value as T | null) ?? null);
    },
    [setSelection],
  );

  const onContextMenu = useCallback(
    (e: DataTableRowEvent) => {
      flushSync(() => {
        setSelection(e.data as T);
      });
      showContextMenu(cmRef, e.originalEvent);
    },
    [setSelection],
  );

  const wrapperProps = useMemo(
    () => ({
      onContextMenuCapture: (e: MouseEvent) => {
        if (isPrimeTableBodyRowTarget(e.target)) return;
        e.preventDefault();
        flushSync(() => {
          setSelection(null);
        });
        cmRef.current?.show(e);
      },
    }),
    [setSelection],
  );

  const tableProps = useMemo(
    () => ({
      cellSelection: false as const,
      contextMenuSelection: selection ?? undefined,
      onContextMenuSelectionChange,
      onContextMenu,
    }),
    [onContextMenu, onContextMenuSelectionChange, selection],
  );

  const ContextMenuEl: ReactElement = (
    <ContextMenu
      ref={cmRef}
      className="app-table-context-menu"
      model={model}
      appendTo={overlayAppendTo}
      breakpoint="0px"
    />
  );

  return { cmRef, ContextMenuEl, tableProps, wrapperProps };
}
