import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Columns3, Pencil, RectangleHorizontal, Rows3, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "primereact/checkbox";
import { Calendar } from "primereact/calendar";
import { ContextMenu } from "primereact/contextmenu";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import type { MenuItem } from "primereact/menuitem";

import { lucidePrimeBtnIcon } from "../../icons/lucide";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../../lib/siteColor";
import {
  DYNAMIC_FIELD_WIDGETS,
  getFieldCatalog,
  isDynamicFieldKey,
  newId,
  resolveColumnWidget,
  type AppFieldDef,
  type AppLayoutAppKey,
  type FieldWidget,
  type ModalColumnDef,
  type ModalColumnKind,
  type ModalLayoutPayload,
  type ModalRowDef,
} from "../../lib/layoutEditor/types";

const DND_FIELD = "application/x-athene-field";
const DND_COLUMN = "application/x-athene-column";

type MenuTarget =
  | { type: "row"; rowIndex: number }
  | { type: "column"; rowIndex: number; colIndex: number; columnId: string };

type SiteOption = { id: string; key: string; name: string; colorHex: string };

type Props = {
  appKey: string;
  value: ModalLayoutPayload;
  onChange: (next: ModalLayoutPayload) => void;
  selectedColumnId: string | null;
  onSelectColumn: (id: string | null) => void;
  sites?: SiteOption[];
  readOnly?: boolean;
};

/** Equal-ish spans summing to 12 (remainder on the first columns). */
function distributeSpans(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [12];
  const n = Math.min(count, 12);
  const base = Math.floor(12 / n);
  const rem = 12 % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

function findColumn(
  rows: ModalRowDef[],
  columnId: string,
): { rowIndex: number; colIndex: number; column: ModalColumnDef } | null {
  for (let ri = 0; ri < rows.length; ri++) {
    const ci = rows[ri]!.columns.findIndex((c) => c.id === columnId);
    if (ci >= 0) return { rowIndex: ri, colIndex: ci, column: rows[ri]!.columns[ci]! };
  }
  return null;
}

function mapColumn(
  rows: ModalRowDef[],
  columnId: string,
  mapFn: (col: ModalColumnDef) => ModalColumnDef,
): ModalRowDef[] {
  return rows.map((row) => ({
    ...row,
    columns: row.columns.map((col) => (col.id === columnId ? mapFn(col) : col)),
  }));
}

function columnKind(col: ModalColumnDef): ModalColumnKind {
  return col.kind === "spacer" ? "spacer" : "field";
}

export function ModalFormBuilder({
  appKey,
  value,
  onChange,
  selectedColumnId,
  onSelectColumn,
  sites = [],
  readOnly = false,
}: Props) {
  const { t } = useTranslation();
  const catalog = useMemo(() => getFieldCatalog(appKey as AppLayoutAppKey), [appKey]);
  const [targetRowId, setTargetRowId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const cmRef = useRef<ContextMenu>(null);
  const menuTargetRef = useRef<MenuTarget | null>(null);

  const usedFields = useMemo(() => {
    const set = new Set<string>();
    for (const row of value.rows) {
      for (const col of row.columns) {
        if (col.fieldKey) set.add(col.fieldKey);
      }
    }
    return set;
  }, [value.rows]);

  const availableFields = useMemo(
    () => catalog.filter((f) => f.allowedIn.includes("modal") && !usedFields.has(f.fieldKey)),
    [catalog, usedFields],
  );

  const selected = selectedColumnId ? findColumn(value.rows, selectedColumnId) : null;

  const effectiveTargetRowId = useMemo(() => {
    if (targetRowId && value.rows.some((r) => r.id === targetRowId)) return targetRowId;
    return value.rows[value.rows.length - 1]?.id ?? null;
  }, [value.rows, targetRowId]);

  useEffect(() => {
    if (value.rows.length === 0) {
      if (targetRowId !== null) setTargetRowId(null);
      return;
    }
    if (targetRowId && !value.rows.some((r) => r.id === targetRowId)) {
      setTargetRowId(value.rows[value.rows.length - 1]!.id);
    }
  }, [value.rows, targetRowId]);

  const updateRows = (rows: ModalRowDef[]) => onChange({ version: 1, rows });

  const ensureTargetRow = (): { rows: ModalRowDef[]; rowIndex: number; rowId: string } => {
    let rows = value.rows;
    let rowIndex = effectiveTargetRowId
      ? rows.findIndex((r) => r.id === effectiveTargetRowId)
      : -1;
    if (rowIndex < 0) {
      const id = newId("r");
      rows = [...rows, { id, columns: [] }];
      rowIndex = rows.length - 1;
      setTargetRowId(id);
      return { rows, rowIndex, rowId: id };
    }
    return { rows, rowIndex, rowId: rows[rowIndex]!.id };
  };

  const appendCell = (kind: ModalColumnKind, fieldKey: string | null = null) => {
    if (readOnly) return;
    const { rows, rowIndex, rowId } = ensureTargetRow();
    setTargetRowId(rowId);
    const row = rows[rowIndex]!;
    if (row.columns.length >= 12) return;

    updateRows(
      rows.map((r, i) => {
        if (i !== rowIndex) return r;
        const nextColumns: ModalColumnDef[] = [
          ...r.columns,
          {
            id: newId("c"),
            fieldKey: kind === "spacer" ? null : fieldKey,
            kind,
            label: null,
            widget: null,
            span: 1,
            required: false,
            readonly: false,
            visible: true,
          },
        ];
        const spans = distributeSpans(nextColumns.length);
        return {
          ...r,
          columns: nextColumns.map((col, ci) => ({ ...col, span: spans[ci]! })),
        };
      }),
    );
  };

  const addRow = () => {
    if (readOnly) return;
    const id = newId("r");
    updateRows([...value.rows, { id, columns: [] }]);
    setTargetRowId(id);
  };

  const addColumn = () => appendCell("field", null);
  const addSpacer = () => appendCell("spacer", null);

  const removeRow = (rowIndex: number) => {
    if (readOnly) return;
    const row = value.rows[rowIndex];
    if (!row) return;
    if (selectedColumnId && row.columns.some((c) => c.id === selectedColumnId)) {
      onSelectColumn(null);
    }
    const next = value.rows.filter((_, i) => i !== rowIndex);
    updateRows(next);
    if (targetRowId === row.id) {
      setTargetRowId(next[next.length - 1]?.id ?? null);
    }
  };

  const assignFieldToColumn = (columnId: string, fieldKey: string) => {
    if (readOnly) return;
    const existing = findColumn(value.rows, columnId);
    if (!existing || columnKind(existing.column) === "spacer") return;
    if (usedFields.has(fieldKey) && existing.column.fieldKey !== fieldKey) return;
    updateRows(
      mapColumn(value.rows, columnId, (col) => ({
        ...col,
        kind: "field",
        fieldKey,
        label: null,
        widget: null,
      })),
    );
  };

  const unassignColumn = (columnId: string) => {
    if (readOnly) return;
    const existing = findColumn(value.rows, columnId);
    if (!existing || columnKind(existing.column) === "spacer") return;
    updateRows(
      mapColumn(value.rows, columnId, (col) => ({
        ...col,
        fieldKey: null,
        label: null,
        widget: null,
      })),
    );
  };

  const swapOrMoveField = (fromColumnId: string, toColumnId: string) => {
    if (readOnly || fromColumnId === toColumnId) return;
    const from = findColumn(value.rows, fromColumnId);
    const to = findColumn(value.rows, toColumnId);
    if (!from || !to) return;
    if (columnKind(from.column) === "spacer" || columnKind(to.column) === "spacer") return;
    const fromKey = from.column.fieldKey;
    const toKey = to.column.fieldKey;
    const fromLabel = from.column.label;
    const toLabel = to.column.label;
    const fromWidget = from.column.widget;
    const toWidget = to.column.widget;
    updateRows(
      value.rows.map((row) => ({
        ...row,
        columns: row.columns.map((col) => {
          if (col.id === fromColumnId) {
            return { ...col, fieldKey: toKey, label: toLabel, widget: toWidget };
          }
          if (col.id === toColumnId) {
            return { ...col, fieldKey: fromKey, label: fromLabel, widget: fromWidget };
          }
          return col;
        }),
      })),
    );
  };

  const dropFieldOnRow = (rowId: string, fieldKey: string) => {
    if (readOnly || usedFields.has(fieldKey)) return;
    const rows = value.rows;
    const rowIndex = rows.findIndex((r) => r.id === rowId);
    if (rowIndex < 0) return;
    setTargetRowId(rowId);

    const emptyIdx = rows[rowIndex]!.columns.findIndex(
      (c) => columnKind(c) === "field" && !c.fieldKey,
    );
    if (emptyIdx >= 0) {
      const colId = rows[rowIndex]!.columns[emptyIdx]!.id;
      updateRows(
        mapColumn(rows, colId, (col) => ({ ...col, fieldKey, label: null, widget: null })),
      );
      return;
    }

    if (rows[rowIndex]!.columns.length >= 12) return;
    updateRows(
      rows.map((r, i) => {
        if (i !== rowIndex) return r;
        const nextColumns: ModalColumnDef[] = [
          ...r.columns,
          {
            id: newId("c"),
            fieldKey,
            kind: "field",
            label: null,
            widget: null,
            span: 1,
            required: false,
            readonly: false,
            visible: true,
          },
        ];
        const spans = distributeSpans(nextColumns.length);
        return {
          ...r,
          columns: nextColumns.map((col, ci) => ({ ...col, span: spans[ci]! })),
        };
      }),
    );
  };

  const removeColumn = (rowIndex: number, colIndex: number) => {
    if (readOnly) return;
    const col = value.rows[rowIndex]?.columns[colIndex];
    if (col && selectedColumnId === col.id) onSelectColumn(null);
    updateRows(
      value.rows.map((row, i) =>
        i === rowIndex ? { ...row, columns: row.columns.filter((_, ci) => ci !== colIndex) } : row,
      ),
    );
  };

  const openElementMenu = (e: MouseEvent, target: MenuTarget) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    flushSync(() => {
      menuTargetRef.current = target;
      if (target.type === "column") {
        const row = value.rows[target.rowIndex];
        if (row) {
          setTargetRowId(row.id);
          onSelectColumn(target.columnId);
        }
      } else {
        const row = value.rows[target.rowIndex];
        if (row) setTargetRowId(row.id);
        onSelectColumn(null);
      }
    });
    cmRef.current?.show(e);
  };

  const contextMenuModel: MenuItem[] = readOnly
    ? []
    : [
        {
          label: t("layoutEditor.contextProperties"),
          icon: <Pencil className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
          command: () => {
            const target = menuTargetRef.current;
            if (!target) return;
            if (target.type === "column") {
              const row = value.rows[target.rowIndex];
              if (row) {
                setTargetRowId(row.id);
                onSelectColumn(target.columnId);
              }
            } else {
              const row = value.rows[target.rowIndex];
              if (row) setTargetRowId(row.id);
              onSelectColumn(null);
            }
          },
        },
        {
          label: t("layoutEditor.contextDeleteElement"),
          icon: <Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
          command: () => {
            const target = menuTargetRef.current;
            if (!target) return;
            if (target.type === "column") {
              removeColumn(target.rowIndex, target.colIndex);
            } else {
              removeRow(target.rowIndex);
            }
          },
        },
      ];

  const patchSelected = (patch: Partial<ModalColumnDef>) => {
    if (readOnly || !selected) return;
    updateRows(
      value.rows.map((row, ri) => {
        if (ri !== selected.rowIndex) return row;
        return {
          ...row,
          columns: row.columns.map((col, ci) =>
            ci === selected.colIndex ? { ...col, ...patch } : col,
          ),
        };
      }),
    );
  };

  const fieldLabel = (fieldKey: string) => {
    const def = catalog.find((f) => f.fieldKey === fieldKey);
    return def ? t(def.labelKey) : fieldKey;
  };

  const displayLabel = (col: ModalColumnDef) => {
    const custom = col.label?.trim();
    if (custom) return custom;
    if (col.fieldKey) return fieldLabel(col.fieldKey);
    return "";
  };

  const siteOptions = useMemo(
    () => sites.map((s) => ({ label: `${s.key} - ${s.name}`, value: s.id })),
    [sites],
  );

  const renderCanvasField = (col: ModalColumnDef) => {
    if (!col.fieldKey) return null;
    const widget = resolveColumnWidget(col, catalog);
    const label = displayLabel(col);

    if (widget === "checkbox") {
      return (
        <label className="flex w-full cursor-inherit items-center gap-3 rounded-sm border border-outline-variant/35 bg-surface-container-lowest px-2 py-2 shadow-sm">
          <Checkbox checked={false} disabled readOnly />
          <span className="text-[11px] uppercase tracking-wide text-on-surface-variant">
            {label}
            {col.required ? <span className="app-required-marker">*</span> : null}
          </span>
        </label>
      );
    }

    if (widget === "siteDropdown") {
      return (
        <div className="w-full space-y-1.5 rounded-sm border border-outline-variant/35 bg-surface-container-lowest px-2 py-1.5 shadow-sm">
          <label className="block text-[11px] uppercase tracking-wide text-outline">
            {label}
            {col.required ? <span className="app-required-marker">*</span> : null}
          </label>
          <Dropdown
            value={siteOptions[0]?.value ?? null}
            options={siteOptions}
            disabled
            className="w-full app-inline-icon-dropdown"
            appendTo={overlayAppendTo}
            itemTemplate={(option: { label: string; value: string }) => {
              const site = sites.find((s) => s.id === option.value);
              const hex = site?.colorHex || DEFAULT_SITE_COLOR_HEX;
              return (
                <span style={{ color: readableSiteColor(hex) }}>{option.label}</span>
              );
            }}
          />
        </div>
      );
    }

    if (widget === "datetime") {
      return (
        <div className="w-full space-y-1.5 rounded-sm border border-outline-variant/35 bg-surface-container-lowest px-2 py-1.5 shadow-sm">
          <label className="block text-[11px] uppercase tracking-wide text-outline">
            {label}
            {col.required ? <span className="app-required-marker">*</span> : null}
          </label>
          <Calendar
            value={null}
            disabled
            showTime
            hourFormat="24"
            className="w-full"
            inputClassName="w-full"
            appendTo={overlayAppendTo}
          />
        </div>
      );
    }

    return (
      <div className="w-full space-y-1.5 rounded-sm border border-outline-variant/35 bg-surface-container-lowest px-2 py-1.5 shadow-sm">
        <label className="block text-[11px] uppercase tracking-wide text-outline">
          {label}
          {col.required ? <span className="app-required-marker">*</span> : null}
        </label>
        <InputText
          value=""
          className="w-full"
          disabled
          readOnly
          type={widget === "email" ? "email" : "text"}
        />
      </div>
    );
  };

  const allowDrop = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onPoolFieldDragStart = (e: DragEvent, fieldKey: string) => {
    e.dataTransfer.setData(DND_FIELD, fieldKey);
    e.dataTransfer.effectAllowed = "move";
  };

  const onColumnDragStart = (e: DragEvent, columnId: string, fieldKey: string | null) => {
    if (!fieldKey) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(DND_COLUMN, columnId);
    e.dataTransfer.setData(DND_FIELD, fieldKey);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDropOnColumn = (e: DragEvent, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
    if (readOnly) return;

    const target = findColumn(value.rows, columnId);
    if (!target || columnKind(target.column) === "spacer") return;

    const fromColumnId = e.dataTransfer.getData(DND_COLUMN);
    const fieldKey = e.dataTransfer.getData(DND_FIELD);
    if (fromColumnId) {
      swapOrMoveField(fromColumnId, columnId);
      return;
    }
    if (fieldKey) assignFieldToColumn(columnId, fieldKey);
  };

  const onDropOnRow = (e: DragEvent, rowId: string) => {
    e.preventDefault();
    setDragOverId(null);
    if (readOnly) return;
    const fromColumnId = e.dataTransfer.getData(DND_COLUMN);
    const fieldKey = e.dataTransfer.getData(DND_FIELD);
    if (fromColumnId) {
      const row = value.rows.find((r) => r.id === rowId);
      if (!row || !fieldKey) return;
      const empty = row.columns.find((c) => columnKind(c) === "field" && !c.fieldKey);
      if (empty) {
        updateRows(
          value.rows.map((r) => ({
            ...r,
            columns: r.columns.map((col) => {
              if (col.id === fromColumnId) return { ...col, fieldKey: null, label: null, widget: null };
              if (col.id === empty.id) {
                const from = findColumn(value.rows, fromColumnId);
                return {
                  ...col,
                  fieldKey,
                  label: from?.column.label ?? null,
                  widget: from?.column.widget ?? null,
                };
              }
              return col;
            }),
          })),
        );
      }
      return;
    }
    if (fieldKey) dropFieldOnRow(rowId, fieldKey);
  };

  const onDropOnPool = (e: DragEvent) => {
    e.preventDefault();
    setDragOverId(null);
    if (readOnly) return;
    const fromColumnId = e.dataTransfer.getData(DND_COLUMN);
    if (fromColumnId) unassignColumn(fromColumnId);
  };

  const gridManagerBtnClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-sm border border-outline-variant/40 text-on-surface-variant transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:cursor-default disabled:opacity-50";

  return (
    <div className="grid h-full min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_minmax(14rem,16rem)]">
      {!readOnly && (
        <ContextMenu
          ref={cmRef}
          className="app-table-context-menu"
          model={contextMenuModel}
          appendTo={overlayAppendTo}
          breakpoint="0px"
        />
      )}
      <aside
        className={`flex min-h-0 min-w-0 flex-col gap-2 overflow-auto rounded-sm border bg-surface-container-lowest p-3 transition-colors ${
          dragOverId === "pool"
            ? "border-primary bg-primary/5"
            : "border-outline-variant/40"
        }`}
        onDragOver={(e) => {
          if (readOnly) return;
          allowDrop(e);
          setDragOverId("pool");
        }}
        onDragLeave={() => setDragOverId((id) => (id === "pool" ? null : id))}
        onDrop={onDropOnPool}
      >
        <h3 className="m-0 text-sm font-medium text-on-surface">{t("layoutEditor.fieldPool")}</h3>
        {!readOnly && (
          <p className="m-0 text-[11px] text-on-surface-variant">{t("layoutEditor.dragFieldHint")}</p>
        )}
        {availableFields.length === 0 ? (
          <p className="m-0 text-xs text-on-surface-variant">{t("layoutEditor.fieldPoolEmpty")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {availableFields.map((f: AppFieldDef) => (
              <li key={f.fieldKey}>
                <button
                  type="button"
                  draggable={!readOnly}
                  disabled={readOnly}
                  className="w-full cursor-grab rounded-sm border border-outline-variant/40 bg-surface px-2 py-1.5 text-left text-xs text-on-surface transition-colors hover:border-primary/40 hover:bg-primary/5 active:cursor-grabbing disabled:cursor-default disabled:opacity-60"
                  onDragStart={(e) => onPoolFieldDragStart(e, f.fieldKey)}
                  onDragEnd={() => setDragOverId(null)}
                >
                  {t(f.labelKey)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto rounded-sm border border-outline-variant/40 bg-surface-container-lowest p-3">
        <h3 className="m-0 text-sm font-medium text-on-surface">{t("layoutEditor.modalBuilder")}</h3>

        {value.rows.length === 0 ? (
          <p className="m-0 text-sm text-on-surface-variant">{t("layoutEditor.modalEmpty")}</p>
        ) : (
          <>
            {!readOnly && (
              <p className="m-0 text-[11px] text-on-surface-variant">{t("layoutEditor.selectRowHint")}</p>
            )}
            {value.rows.map((row, rowIndex) => {
              const isTarget = effectiveTargetRowId === row.id;
              const rowDragOver = dragOverId === `row:${row.id}`;
              const isEmptyRow = row.columns.length === 0;

              return (
                <div
                  key={row.id}
                  role="presentation"
                  className={`rounded-sm border border-dashed p-2 transition-colors ${
                    isEmptyRow
                      ? `bg-amber-200/50 ${rowDragOver || isTarget ? "border-primary" : "border-outline-variant/50"}`
                      : rowDragOver
                        ? "border-primary bg-primary/10"
                        : isTarget
                          ? "border-primary bg-primary/5"
                          : "border-outline-variant/50 bg-surface"
                  }`}
                  onClick={() => {
                    if (!readOnly) setTargetRowId(row.id);
                  }}
                  onContextMenu={(e) =>
                    openElementMenu(e, { type: "row", rowIndex })
                  }
                  onDragOver={(e) => {
                    if (readOnly) return;
                    allowDrop(e);
                    setDragOverId(`row:${row.id}`);
                  }}
                  onDragLeave={() =>
                    setDragOverId((id) => (id === `row:${row.id}` ? null : id))
                  }
                  onDrop={(e) => onDropOnRow(e, row.id)}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-outline">
                      {t("layoutEditor.row")} {rowIndex + 1}
                      {isTarget && !readOnly ? (
                        <span className="ml-2 normal-case tracking-normal text-primary">
                          · {t("layoutEditor.targetRow")}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {row.columns.length === 0 ? (
                    <p className="m-0 text-xs text-on-surface-variant">{t("layoutEditor.rowEmpty")}</p>
                  ) : (
                    <div className="grid grid-cols-12 gap-3">
                      {row.columns.map((col, colIndex) => {
                        const colDragOver = dragOverId === `col:${col.id}`;
                        const isSpacer = columnKind(col) === "spacer";
                        const isEmpty = !isSpacer && !col.fieldKey;
                        return (
                          <div
                            key={col.id}
                            draggable={!readOnly && !isEmpty && !isSpacer}
                            className={`relative flex min-h-16 flex-col justify-center rounded-sm border-2 p-2.5 text-left transition-colors ${
                              isSpacer
                                ? selectedColumnId === col.id
                                  ? "border-primary text-on-surface-variant ring-1 ring-primary/40"
                                  : "border-outline-variant/60 text-on-surface-variant"
                                : colDragOver
                                  ? "border-primary bg-primary/10"
                                  : selectedColumnId === col.id
                                    ? "border-primary bg-primary/5"
                                    : isEmpty
                                      ? "border-dashed border-outline-variant/70 bg-surface-container-high/30"
                                      : "border-outline-variant/55 bg-surface-container-high/40 hover:border-primary/50"
                            } ${!isEmpty && !isSpacer && !readOnly ? "cursor-grab active:cursor-grabbing" : ""}`}
                            style={{
                              gridColumn: `span ${Math.min(12, Math.max(1, col.span))} / span ${Math.min(12, Math.max(1, col.span))}`,
                              ...(isSpacer
                                ? {
                                    backgroundImage:
                                      "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-outline-variant) 35%, transparent) 0 2px, transparent 2px 8px)",
                                    backgroundColor:
                                      "color-mix(in srgb, var(--color-surface-container-high) 55%, transparent)",
                                  }
                                : {}),
                            }}
                            onDragStart={(e) => onColumnDragStart(e, col.id, col.fieldKey)}
                            onDragEnd={() => setDragOverId(null)}
                            onDragOver={(e) => {
                              if (readOnly || isSpacer) return;
                              e.stopPropagation();
                              allowDrop(e);
                              setDragOverId(`col:${col.id}`);
                            }}
                            onDragLeave={(e) => {
                              e.stopPropagation();
                              setDragOverId((id) => (id === `col:${col.id}` ? null : id));
                            }}
                            onDrop={(e) => onDropOnColumn(e, col.id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTargetRowId(row.id);
                              onSelectColumn(col.id);
                            }}
                            onContextMenu={(e) =>
                              openElementMenu(e, {
                                type: "column",
                                rowIndex,
                                colIndex,
                                columnId: col.id,
                              })
                            }
                          >
                            {isSpacer ? (
                              <span className="text-[11px] font-medium text-on-surface-variant">
                                {t("layoutEditor.spacer")}
                              </span>
                            ) : isEmpty ? (
                              <div className="flex min-h-10 items-center rounded-sm border border-dashed border-outline-variant/40 bg-surface-container-lowest/80 px-2 py-1.5">
                                <span className="text-[11px] text-on-surface-variant">
                                  {t("layoutEditor.dropFieldHere")}
                                </span>
                              </div>
                            ) : (
                              <div className="w-full min-w-0 pointer-events-none">
                                {renderCanvasField(col)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto rounded-sm border border-outline-variant/40 bg-surface-container-lowest p-3">
        <div className="flex flex-col gap-2 border-b border-outline-variant/30 pb-3">
          <h3 className="m-0 text-sm font-medium text-on-surface">{t("layoutEditor.gridManager")}</h3>
          {!readOnly && (
            <p className="m-0 text-[11px] text-on-surface-variant">{t("layoutEditor.gridManagerHint")}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={gridManagerBtnClass}
              disabled={readOnly}
              onClick={addRow}
              title={t("layoutEditor.addRow")}
              aria-label={t("layoutEditor.addRow")}
            >
              <Rows3 className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={gridManagerBtnClass}
              disabled={readOnly}
              onClick={addColumn}
              title={t("layoutEditor.addColumnToRow")}
              aria-label={t("layoutEditor.addColumnToRow")}
            >
              <Columns3 className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={gridManagerBtnClass}
              disabled={readOnly}
              onClick={addSpacer}
              title={t("layoutEditor.addSpacer")}
              aria-label={t("layoutEditor.addSpacer")}
            >
              <RectangleHorizontal className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <h3 className="m-0 text-sm font-medium text-on-surface">{t("layoutEditor.fieldProperties")}</h3>
        {!selected ? (
          <p className="m-0 text-sm text-on-surface-variant">{t("layoutEditor.selectFieldHint")}</p>
        ) : columnKind(selected.column) === "spacer" ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm text-on-surface">{t("layoutEditor.spacer")}</p>
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wide text-outline">
                {t("layoutEditor.span")}
              </label>
              <InputNumber
                value={selected.column.span}
                onValueChange={(e) => {
                  const n = typeof e.value === "number" ? e.value : 2;
                  patchSelected({ span: Math.min(12, Math.max(1, Math.round(n))) });
                }}
                min={1}
                max={12}
                showButtons
                disabled={readOnly}
                className="w-full"
                inputClassName="w-full"
              />
            </div>
          </div>
        ) : !selected.column.fieldKey ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm text-on-surface-variant">{t("layoutEditor.emptyColumn")}</p>
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wide text-outline">
                {t("layoutEditor.span")}
              </label>
              <InputNumber
                value={selected.column.span}
                onValueChange={(e) => {
                  const n = typeof e.value === "number" ? e.value : 12;
                  patchSelected({ span: Math.min(12, Math.max(1, Math.round(n))) });
                }}
                min={1}
                max={12}
                showButtons
                disabled={readOnly}
                className="w-full"
                inputClassName="w-full"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wide text-outline">
                {t("layoutEditor.field")}
              </label>
              <p className="m-0 text-sm text-on-surface">{fieldLabel(selected.column.fieldKey)}</p>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wide text-outline">
                {t("layoutEditor.fieldLabel")}
              </label>
              <InputText
                value={selected.column.label ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  patchSelected({ label: raw.trim().length > 0 ? raw : null });
                }}
                placeholder={fieldLabel(selected.column.fieldKey)}
                disabled={readOnly}
                className="w-full"
              />
            </div>
            {isDynamicFieldKey(selected.column.fieldKey) ? (
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wide text-outline">
                  {t("layoutEditor.fieldWidget")}
                </label>
                <Dropdown
                  value={resolveColumnWidget(selected.column, catalog)}
                  options={DYNAMIC_FIELD_WIDGETS.map((w) => ({
                    label: t(`layoutEditor.widget.${w}`),
                    value: w,
                  }))}
                  onChange={(e) => {
                    const next = e.value as FieldWidget;
                    patchSelected({ widget: next });
                  }}
                  disabled={readOnly}
                  className="w-full"
                  appendTo={overlayAppendTo}
                />
              </div>
            ) : null}
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wide text-outline">
                {t("layoutEditor.span")}
              </label>
              <InputNumber
                value={selected.column.span}
                onValueChange={(e) => {
                  const n = typeof e.value === "number" ? e.value : 12;
                  patchSelected({ span: Math.min(12, Math.max(1, Math.round(n))) });
                }}
                min={1}
                max={12}
                showButtons
                disabled={readOnly}
                className="w-full"
                inputClassName="w-full"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={selected.column.required}
                onChange={(e) => patchSelected({ required: Boolean(e.checked) })}
                disabled={readOnly}
              />
              <span className="text-sm text-on-surface">{t("layoutEditor.required")}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={selected.column.readonly}
                onChange={(e) => patchSelected({ readonly: Boolean(e.checked) })}
                disabled={readOnly}
              />
              <span className="text-sm text-on-surface">{t("layoutEditor.readonly")}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={selected.column.visible}
                onChange={(e) => patchSelected({ visible: Boolean(e.checked) })}
                disabled={readOnly}
              />
              <span className="text-sm text-on-surface">{t("layoutEditor.visible")}</span>
            </label>
          </div>
        )}
      </aside>
    </div>
  );
}
