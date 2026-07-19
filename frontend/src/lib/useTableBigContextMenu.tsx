import {
  useCallback,
  useMemo,
  useState,
  type MouseEvent,
  type ReactElement,
} from "react";
import { flushSync } from "react-dom";
import type { DataTableContextMenuSingleSelectionChangeEvent, DataTableRowEvent } from "primereact/datatable";

import { BigContextMenu } from "../components/contextMenu/BigContextMenu";
import type { BigMenuAnchor, BigMenuItem, BigMenuSection } from "../components/contextMenu/bigMenuTypes";
import { isPrimeTableBodyRowTarget } from "./useTableContextMenu";

type DataTableBigContextMenuOptions<T extends object> = {
  selection: T | null;
  setSelection: (row: T | null) => void;
  sections: BigMenuSection[];
  header?: string | null;
  cornerAction?: BigMenuItem | null;
};

function eventAnchor(e: { clientX: number; clientY: number }): BigMenuAnchor {
  return { x: e.clientX, y: e.clientY };
}

/**
 * DataTable right-click → horizontal BigContextMenu (no PrimeReact ContextMenu).
 * Use `wrapperProps` on a div wrapping the table so empty-area right-clicks still open the menu.
 */
export function useTableBigContextMenu<T extends object>(opts: DataTableBigContextMenuOptions<T>) {
  const { selection, setSelection, sections, header, cornerAction } = opts;
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<BigMenuAnchor | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setAnchor(null);
  }, []);

  const openAt = useCallback((a: BigMenuAnchor) => {
    setAnchor(a);
    setOpen(true);
  }, []);

  const onContextMenuSelectionChange = useCallback(
    (e: DataTableContextMenuSingleSelectionChangeEvent<T[]>) => {
      setSelection((e.value as T | null) ?? null);
    },
    [setSelection],
  );

  const onContextMenu = useCallback(
    (e: DataTableRowEvent) => {
      e.originalEvent.preventDefault();
      flushSync(() => {
        setSelection(e.data as T);
      });
      const oe = e.originalEvent as MouseEvent;
      openAt(eventAnchor(oe));
    },
    [openAt, setSelection],
  );

  const wrapperProps = useMemo(
    () => ({
      onContextMenuCapture: (e: MouseEvent) => {
        if (isPrimeTableBodyRowTarget(e.target)) return;
        e.preventDefault();
        flushSync(() => {
          setSelection(null);
        });
        openAt(eventAnchor(e));
      },
    }),
    [openAt, setSelection],
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

  const BigContextMenuEl: ReactElement = (
    <BigContextMenu
      open={open}
      anchor={anchor}
      sections={sections}
      header={header}
      cornerAction={cornerAction}
      onClose={close}
    />
  );

  return { BigContextMenuEl, tableProps, wrapperProps, close, open };
}
