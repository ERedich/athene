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
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ContextMenu } from "primereact/contextmenu";
import type {
  DataTableContextMenuMultipleSelectionChangeEvent,
  DataTableContextMenuSingleSelectionChangeEvent,
  DataTableRowEvent,
  DataTableValueArray,
} from "primereact/datatable";
import type { MenuItem } from "primereact/menuitem";

import { lucidePrimeBtnIcon } from "../icons/lucide";
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

function rowKey<T extends object>(row: T): unknown {
  return (row as { id?: unknown }).id ?? row;
}

type ContextMenuSharedOptions<T extends object> = {
  labels: { new: string; edit: string; delete: string };
  handlers: CrudHandlers<T>;
  leadingItems?: (row: T | null) => MenuItem[];
  extraItems?: (row: T | null) => MenuItem[];
};

type SingleSelectionOptions<T extends object> = ContextMenuSharedOptions<T> & {
  selectionMode?: "single";
  selection: T | null;
  setSelection: (row: T | null) => void;
};

type MultipleSelectionOptions<T extends object> = ContextMenuSharedOptions<T> & {
  selectionMode: "multiple";
  selection: T[];
  setSelection: (rows: T[]) => void;
};

export type DataTableContextMenuOptions<T extends object> =
  | SingleSelectionOptions<T>
  | MultipleSelectionOptions<T>;

/**
 * PrimeReact DataTable + ContextMenu: CRUD entries and optional per-table extras.
 * Use `wrapperProps` on a div wrapping the table so empty-area right-clicks still open the menu (Neu only).
 *
 * With `selectionMode: "multiple"`, Edit/Delete require exactly one selected row.
 * Right-click keeps the multi-selection when the clicked row is already selected.
 */
export function useTableContextMenu<T extends object>(opts: DataTableContextMenuOptions<T>) {
  const { labels, handlers, leadingItems, extraItems } = opts;
  const selectionMode = opts.selectionMode ?? "single";
  const isMultiple = selectionMode === "multiple";
  const cmRef = useRef<ContextMenu>(null);

  const selectionRef = useRef(opts.selection);
  selectionRef.current = opts.selection;

  const selectedRows = useMemo((): T[] => {
    if (isMultiple) {
      return opts.selection as T[];
    }
    const single = opts.selection as T | null;
    return single != null ? [single] : [];
  }, [isMultiple, opts.selection]);

  /** Edit/Delete only when exactly one row is selected. */
  const exactlyOne = selectedRows.length === 1;
  const primaryRow: T | null = exactlyOne ? selectedRows[0]! : null;
  /** Extras that need “any selection” (e.g. Print) still get a primary row when length >= 1. */
  const menuPrimary: T | null = selectedRows[0] ?? null;

  const model = useMemo((): MenuItem[] => {
    // Leading (e.g. Athene): only when exactly one row — same rule as Edit/Delete.
    const leading = leadingItems?.(exactlyOne ? primaryRow : null) ?? [];
    const base: MenuItem[] = [
      {
        label: labels.new,
        icon: <Plus className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        command: () => handlers.onCreate?.(),
      },
      {
        label: labels.edit,
        icon: <Pencil className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !exactlyOne,
        command: () => {
          if (exactlyOne && primaryRow != null) handlers.onEdit?.(primaryRow);
        },
      },
      {
        label: labels.delete,
        icon: <Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !exactlyOne,
        command: () => {
          if (exactlyOne && primaryRow != null) handlers.onDelete?.(primaryRow);
        },
      },
    ];
    // Extras (e.g. Print): any non-empty selection.
    const extra = extraItems?.(menuPrimary) ?? [];
    return [
      ...leading,
      ...(leading.length > 0
        ? [{ separator: true as const, className: "app-context-menu-after-athene-sep" }]
        : []),
      ...base,
      ...(extra.length > 0 ? [{ separator: true }, ...extra] : []),
    ];
  }, [
    exactlyOne,
    extraItems,
    handlers,
    labels.delete,
    labels.edit,
    labels.new,
    leadingItems,
    menuPrimary,
    primaryRow,
  ]);

  const setSingle = (opts as SingleSelectionOptions<T>).setSelection;
  const setMultiple = (opts as MultipleSelectionOptions<T>).setSelection;

  const onContextMenuSelectionChange = useCallback(
    (
      e:
        | DataTableContextMenuSingleSelectionChangeEvent<DataTableValueArray>
        | DataTableContextMenuMultipleSelectionChangeEvent<DataTableValueArray>,
    ) => {
      // Multi: PrimeReact reports only the right-clicked row — never collapse selection here.
      // Selection updates for context menu happen in onContextMenu instead.
      if (isMultiple) return;

      const value = e.value;
      setSingle(
        (Array.isArray(value) ? (value[0] as T | undefined) : (value as T | null)) ?? null,
      );
    },
    [isMultiple, setSingle],
  );

  const onContextMenu = useCallback(
    (e: DataTableRowEvent) => {
      const row = e.data as T;
      flushSync(() => {
        if (isMultiple) {
          const current = selectionRef.current as T[];
          const alreadySelected = current.some((r) => rowKey(r) === rowKey(row));
          // Keep multi-selection when right-clicking an already selected row.
          if (!alreadySelected) {
            setMultiple([row]);
          }
        } else {
          setSingle(row);
        }
      });
      showContextMenu(cmRef, e.originalEvent);
    },
    [isMultiple, setMultiple, setSingle],
  );

  const wrapperProps = useMemo(
    () => ({
      onContextMenuCapture: (e: MouseEvent) => {
        if (isPrimeTableBodyRowTarget(e.target)) return;
        e.preventDefault();
        flushSync(() => {
          if (isMultiple) {
            setMultiple([]);
          } else {
            setSingle(null);
          }
        });
        cmRef.current?.show(e);
      },
    }),
    [isMultiple, setMultiple, setSingle],
  );

  const tableProps = useMemo(() => {
    if (isMultiple) {
      return {
        cellSelection: false as const,
        // Do not bind contextMenuSelection to the row selection: PrimeReact always
        // reports a single right-clicked row and would collapse multi-select.
        onContextMenuSelectionChange,
        onContextMenu,
      };
    }
    return {
      cellSelection: false as const,
      contextMenuSelection: (opts.selection as T | null) ?? undefined,
      onContextMenuSelectionChange,
      onContextMenu,
    };
  }, [isMultiple, onContextMenu, onContextMenuSelectionChange, opts.selection]);

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
