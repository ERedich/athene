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
import type { TreeTableEvent, TreeTableSelectionEvent } from "primereact/treetable";

import { overlayAppendTo } from "./overlayAppendTo";

export type CrudHandlers<T> = {
  onCreate?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
};

/** True when the event target sits on a PrimeReact DataTable / TreeTable body row (not header / empty chrome). */
export function isPrimeTableBodyRowTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('tr[data-pc-section="bodyrow"]')) return true;
  if (target.closest(".p-treetable-tbody tr")) return true;
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
  extraItems?: (row: T | null) => MenuItem[];
};

/**
 * PrimeReact DataTable + ContextMenu: CRUD entries and optional per-table extras.
 * Use `wrapperProps` on a div wrapping the table so empty-area right-clicks still open the menu (Neu only).
 */
export function useTableContextMenu<T extends object>(opts: DataTableContextMenuOptions<T>) {
  const { labels, handlers, selection, setSelection, extraItems } = opts;
  const cmRef = useRef<ContextMenu>(null);

  const model = useMemo((): MenuItem[] => {
    const hasRow = selection != null;
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
    if (extra.length > 0) {
      return [...base, { separator: true }, ...extra];
    }
    return base;
  }, [extraItems, handlers, labels.delete, labels.edit, labels.new, selection]);

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

function treeSelectionEventToKey(e: TreeTableSelectionEvent): string | null {
  const val = e.value as string | Record<string, boolean> | null | undefined;
  if (val == null) return null;
  if (typeof val === "string") return val;
  const id = Object.keys(val).find((k) => val[k] === true);
  return id ?? null;
}

type TreeTableContextMenuOptions<T extends { id: string }> = {
  labels: { new: string; edit: string; delete: string };
  handlers: CrudHandlers<T>;
  selection: T | null;
  setSelection: (row: T | null) => void;
  /** Rows used to resolve a node key to a record (e.g. flat `assets` list). */
  rows: T[];
  extraItems?: (row: T | null) => MenuItem[];
};

/**
 * PrimeReact TreeTable + ContextMenu (uses `contextMenuSelectionKey` + row key resolution).
 */
export function useTreeTableContextMenu<T extends { id: string }>(opts: TreeTableContextMenuOptions<T>) {
  const { labels, handlers, selection, setSelection, rows, extraItems } = opts;
  const cmRef = useRef<ContextMenu>(null);

  const model = useMemo((): MenuItem[] => {
    const hasRow = selection != null;
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
    if (extra.length > 0) {
      return [...base, { separator: true }, ...extra];
    }
    return base;
  }, [extraItems, handlers, labels.delete, labels.edit, labels.new, selection]);

  const resolveByKey = useCallback(
    (key: string | null) => {
      if (!key) return null;
      return rows.find((r) => r.id === key) ?? null;
    },
    [rows],
  );

  const onContextMenuSelectionChange = useCallback(
    (e: TreeTableSelectionEvent) => {
      const key = treeSelectionEventToKey(e);
      setSelection(resolveByKey(key));
    },
    [resolveByKey, setSelection],
  );

  const onContextMenu = useCallback(
    (e: TreeTableEvent) => {
      const row = e.node?.data as T | undefined;
      flushSync(() => {
        if (row?.id) setSelection(row);
      });
      showContextMenu(cmRef, e.originalEvent);
    },
    [setSelection],
  );

  const wrapperProps = useMemo(
    () => ({
      onContextMenuCapture: (ev: MouseEvent) => {
        if (isPrimeTableBodyRowTarget(ev.target)) return;
        ev.preventDefault();
        flushSync(() => {
          setSelection(null);
        });
        cmRef.current?.show(ev);
      },
    }),
    [setSelection],
  );

  const treeTableProps = useMemo(
    () => ({
      contextMenuSelectionKey: selection?.id,
      onContextMenuSelectionChange,
      onContextMenu,
    }),
    [onContextMenu, onContextMenuSelectionChange, selection?.id],
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

  return { cmRef, ContextMenuEl, treeTableProps, wrapperProps };
}
