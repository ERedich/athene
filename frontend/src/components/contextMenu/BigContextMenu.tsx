import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";

import { overlayAppendTo } from "../../lib/overlayAppendTo";
import type { BigMenuAnchor, BigMenuItem, BigMenuSection } from "./bigMenuTypes";

const VIEWPORT_PAD = 8;

type BigContextMenuProps = {
  open: boolean;
  anchor: BigMenuAnchor | null;
  sections: BigMenuSection[];
  header?: string | null;
  /** Top-right corner action (e.g. Ask Athene star). */
  cornerAction?: BigMenuItem | null;
  onClose: () => void;
};

function expandItem(item: BigMenuItem): BigMenuItem[] {
  return item.siblings?.length ? [item, ...item.siblings] : [item];
}

function flattenEnabledItems(sections: BigMenuSection[], corner?: BigMenuItem | null): BigMenuItem[] {
  const fromSections = sections.flatMap((s) => s.items.flatMap(expandItem)).filter((item) => !item.disabled);
  if (corner && !corner.disabled) return [...fromSections, corner];
  return fromSections;
}

/** Each primary section is a keyboard row; split cells expand left-to-right. */
function buildNavGrid(sections: BigMenuSection[], corner?: BigMenuItem | null): BigMenuItem[][] {
  const rows: BigMenuItem[][] = sections
    .filter((s) => s.variant === "primary")
    .map((s) => s.items.flatMap(expandItem));

  const columns = sections.filter((s) => s.variant === "column");
  const maxColLen = Math.max(0, ...columns.map((c) => c.items.length));
  for (let r = 0; r < maxColLen; r++) {
    const row: BigMenuItem[] = [];
    for (const col of columns) {
      if (col.items[r]) row.push(col.items[r]!);
    }
    if (row.length > 0) rows.push(row);
  }

  if (corner) {
    rows.push([corner]);
  }
  return rows;
}

function findItemCoords(grid: BigMenuItem[][], id: string): { row: number; col: number } | null {
  for (let r = 0; r < grid.length; r++) {
    const c = grid[r]!.findIndex((item) => item.id === id);
    if (c >= 0) return { row: r, col: c };
  }
  return null;
}

function nextEnabledInRow(row: BigMenuItem[], fromCol: number, dir: 1 | -1): BigMenuItem | null {
  let c = fromCol + dir;
  while (c >= 0 && c < row.length) {
    const item = row[c]!;
    if (!item.disabled) return item;
    c += dir;
  }
  return null;
}

function nextEnabledVertical(
  grid: BigMenuItem[][],
  fromRow: number,
  preferredCol: number,
  dir: 1 | -1,
): BigMenuItem | null {
  let r = fromRow + dir;
  while (r >= 0 && r < grid.length) {
    const row = grid[r]!;
    const col = Math.min(preferredCol, row.length - 1);
    for (const offset of [0, 1, -1, 2, -2, 3, -3]) {
      const idx = col + offset;
      if (idx >= 0 && idx < row.length && !row[idx]!.disabled) return row[idx]!;
    }
    r += dir;
  }
  return null;
}

function PrimaryCell({
  item,
  focusedId,
  onMouseEnter,
  onClick,
}: {
  item: BigMenuItem;
  focusedId: string | null;
  onMouseEnter: (item: BigMenuItem) => void;
  onClick: (e: ReactMouseEvent, item: BigMenuItem) => void;
}) {
  const siblings = item.siblings ?? [];
  if (siblings.length === 0) {
    return (
      <button
        type="button"
        role="menuitem"
        className={[
          "app-big-context-menu__primary-item",
          item.className,
          item.danger ? "app-big-context-menu__item--danger" : "",
          focusedId === item.id ? "is-focused" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={item.disabled}
        aria-disabled={item.disabled || undefined}
        tabIndex={focusedId === item.id ? 0 : -1}
        onMouseEnter={() => onMouseEnter(item)}
        onClick={(e) => onClick(e, item)}
      >
        <span className="app-big-context-menu__icon" aria-hidden>
          {item.icon}
        </span>
        <span className="app-big-context-menu__label">{item.label}</span>
      </button>
    );
  }

  const all = [item, ...siblings];
  const allDisabled = all.every((a) => a.disabled);
  return (
    <div
      className={[
        "app-big-context-menu__primary-item",
        "app-big-context-menu__primary-item--split",
        allDisabled ? "is-disabled" : "",
        all.some((a) => focusedId === a.id) ? "is-focused" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="group"
      aria-label={item.label}
    >
      <div className="app-big-context-menu__split-actions">
        {all.map((action) => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            className={[
              "app-big-context-menu__split-btn",
              action.className,
              focusedId === action.id ? "is-focused" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={action.disabled}
            aria-disabled={action.disabled || undefined}
            aria-label={action.label}
            title={action.label}
            tabIndex={focusedId === action.id ? 0 : -1}
            onMouseEnter={() => onMouseEnter(action)}
            onClick={(e) => onClick(e, action)}
          >
            <span className="app-big-context-menu__icon" aria-hidden>
              {action.icon}
            </span>
          </button>
        ))}
      </div>
      <span className="app-big-context-menu__label">{item.label}</span>
    </div>
  );
}

export function BigContextMenu({
  open,
  anchor,
  sections,
  header,
  cornerAction,
  onClose,
}: BigContextMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>(() =>
    anchor ? { left: anchor.x, top: anchor.y } : { left: 0, top: 0 },
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const enabledItems = flattenEnabledItems(sections, cornerAction);
  const navGrid = buildNavGrid(sections, cornerAction);

  useLayoutEffect(() => {
    if (!open || !anchor || !panelRef.current) return;
    const el = panelRef.current;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.x;
    let top = anchor.y;
    if (left + rect.width > vw - VIEWPORT_PAD) {
      left = Math.max(VIEWPORT_PAD, anchor.x - rect.width);
    }
    if (top + rect.height > vh - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, anchor.y - rect.height);
    }
    left = Math.min(Math.max(VIEWPORT_PAD, left), Math.max(VIEWPORT_PAD, vw - rect.width - VIEWPORT_PAD));
    top = Math.min(Math.max(VIEWPORT_PAD, top), Math.max(VIEWPORT_PAD, vh - rect.height - VIEWPORT_PAD));
    setPos({ left, top });
  }, [open, anchor, sections, header, cornerAction]);

  useEffect(() => {
    if (!open) {
      setFocusedId(null);
      return;
    }
    const first = enabledItems[0];
    setFocusedId(first?.id ?? null);
    const id = requestAnimationFrame(() => {
      panelRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, sections, cornerAction]); // eslint-disable-line react-hooks/exhaustive-deps -- reset focus when menu opens / model changes

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onScrollOrResize = () => onClose();

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, onClose]);

  const activate = useCallback(
    (item: BigMenuItem) => {
      if (item.disabled) return;
      onClose();
      item.onSelect();
    },
    [onClose],
  );

  const onPanelKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!focusedId) {
        if ((e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "Home") && enabledItems[0]) {
          e.preventDefault();
          setFocusedId(enabledItems[0].id);
        }
        return;
      }

      const coords = findItemCoords(navGrid, focusedId);
      if (!coords) return;
      const row = navGrid[coords.row]!;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const item = row[coords.col];
        if (item && !item.disabled) activate(item);
        return;
      }

      if (e.key === "Home") {
        e.preventDefault();
        const first = enabledItems[0];
        if (first) setFocusedId(first.id);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        const last = enabledItems[enabledItems.length - 1];
        if (last) setFocusedId(last.id);
        return;
      }

      let next: BigMenuItem | null = null;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next = nextEnabledInRow(row, coords.col, 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        next = nextEnabledInRow(row, coords.col, -1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        next = nextEnabledVertical(navGrid, coords.row, coords.col, 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        next = nextEnabledVertical(navGrid, coords.row, coords.col, -1);
      }
      if (next) setFocusedId(next.id);
    },
    [activate, enabledItems, focusedId, navGrid],
  );

  const onItemMouseEnter = useCallback((item: BigMenuItem) => {
    if (!item.disabled) setFocusedId(item.id);
  }, []);

  const onItemClick = useCallback(
    (e: ReactMouseEvent, item: BigMenuItem) => {
      e.preventDefault();
      e.stopPropagation();
      activate(item);
    },
    [activate],
  );

  if (!open || !anchor) return null;

  const mount = overlayAppendTo ?? document.body;
  const primaryRows = sections.filter((s) => s.variant === "primary");
  const columns = sections.filter((s) => s.variant === "column");

  return createPortal(
    <div
      ref={panelRef}
      className="app-big-context-menu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      tabIndex={-1}
      aria-label={header ?? undefined}
      onKeyDown={onPanelKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="app-big-context-menu__header-row">
        {header ? <div className="app-big-context-menu__header">{header}</div> : <div className="app-big-context-menu__header" />}
        {cornerAction ? (
          <button
            type="button"
            role="menuitem"
            className={[
              "app-big-context-menu__corner",
              "app-context-menu-athene",
              cornerAction.className,
              focusedId === cornerAction.id ? "is-focused" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={cornerAction.disabled}
            aria-disabled={cornerAction.disabled || undefined}
            aria-label={cornerAction.label}
            title={cornerAction.label}
            tabIndex={focusedId === cornerAction.id ? 0 : -1}
            onMouseEnter={() => onItemMouseEnter(cornerAction)}
            onClick={(e) => onItemClick(e, cornerAction)}
          >
            <span className="app-big-context-menu__icon" aria-hidden>
              {cornerAction.icon}
            </span>
          </button>
        ) : null}
      </div>

      {primaryRows.map((row) => (
        <div key={row.id} className="app-big-context-menu__primary" role="group">
          {row.items.map((item) => (
            <PrimaryCell
              key={item.id}
              item={item}
              focusedId={focusedId}
              onMouseEnter={onItemMouseEnter}
              onClick={onItemClick}
            />
          ))}
        </div>
      ))}

      {columns.length > 0 ? (
        <div className="app-big-context-menu__columns">
          {columns.map((col) => (
            <div key={col.id} className="app-big-context-menu__column" role="group" aria-label={col.title}>
              {col.title ? <div className="app-big-context-menu__column-title">{col.title}</div> : null}
              <ul className="app-big-context-menu__column-list">
                {col.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="menuitem"
                      className={[
                        "app-big-context-menu__column-item",
                        item.className,
                        item.danger ? "app-big-context-menu__item--danger" : "",
                        focusedId === item.id ? "is-focused" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={item.disabled}
                      aria-disabled={item.disabled || undefined}
                      tabIndex={focusedId === item.id ? 0 : -1}
                      onMouseEnter={() => onItemMouseEnter(item)}
                      onClick={(e) => onItemClick(e, item)}
                    >
                      <span className="app-big-context-menu__icon" aria-hidden>
                        {item.icon}
                      </span>
                      <span className="app-big-context-menu__label">{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>,
    mount,
  );
}
