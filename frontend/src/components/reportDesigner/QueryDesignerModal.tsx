import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { sql } from "@codemirror/lang-sql";
import CodeMirror from "@uiw/react-codemirror";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";

import { AppDialog } from "../AppDialog";
import { apiFetch } from "../../lib/api";
import { useThemeSwitcher } from "../../theme";
import {
  buildSqlFromDesigner,
  nextTableAlias,
  type BuildSqlError,
  type DesignerJoin,
  type DesignerJoinType,
  type DesignerOrder,
  type DesignerSelect,
  type DesignerTable,
  type DesignerWhere,
  type DesignerWhereOp,
  type QueryDesignerState,
} from "./buildSqlFromDesigner";

type TableMetaRow = {
  schema: string;
  table: string;
  type: string;
};

type ColumnMetaRow = {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue: string | null;
  position: number;
};

type QueryDesignerModalProps = {
  visible: boolean;
  onHide: () => void;
  onApply: (sqlText: string) => void;
};

const TABLE_MIME = "application/x-qd-table";
const COLUMN_MIME = "application/x-qd-column";
const SELECT_MIME = "application/x-qd-select";

const WHERE_OPS: DesignerWhereOp[] = [
  "eq",
  "neq",
  "contains",
  "gt",
  "lt",
  "gte",
  "lte",
  "empty",
  "notEmpty",
];

const emptyState = (): QueryDesignerState => ({
  tables: [],
  joins: [],
  selects: [],
  wheres: [],
  orders: [],
});

function newId(): string {
  return crypto.randomUUID();
}

export function QueryDesignerModal({ visible, onHide, onApply }: QueryDesignerModalProps) {
  const { t } = useTranslation();
  const { dark } = useThemeSwitcher();

  const [catalog, setCatalog] = useState<TableMetaRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [tableFilter, setTableFilter] = useState("");
  const [activeCatalogTable, setActiveCatalogTable] = useState<TableMetaRow | null>(null);
  const [columnsByKey, setColumnsByKey] = useState<Record<string, ColumnMetaRow[]>>({});
  const [columnsLoading, setColumnsLoading] = useState(false);
  const columnsByKeyRef = useRef(columnsByKey);
  columnsByKeyRef.current = columnsByKey;

  const [state, setState] = useState<QueryDesignerState>(emptyState);
  const [applyError, setApplyError] = useState<BuildSqlError | null>(null);
  const [dropHighlight, setDropHighlight] = useState<"tables" | "select" | null>(null);

  const tableKey = (schema: string, table: string) => `${schema}.${table}`;

  const loadTables = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(false);
    try {
      const res = await apiFetch("/api/db-meta/tables");
      if (!res.ok) throw new Error("tables");
      const data = (await res.json()) as { rows?: TableMetaRow[] };
      setCatalog(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      setCatalogError(true);
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const ensureColumns = useCallback(async (schema: string, table: string) => {
    const key = tableKey(schema, table);
    const cached = columnsByKeyRef.current[key];
    if (cached) return cached;
    setColumnsLoading(true);
    try {
      const res = await apiFetch(
        `/api/db-meta/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/columns`,
      );
      if (!res.ok) throw new Error("columns");
      const data = (await res.json()) as { rows?: ColumnMetaRow[] };
      const rows = Array.isArray(data.rows) ? data.rows : [];
      setColumnsByKey((current) => ({ ...current, [key]: rows }));
      return rows;
    } catch {
      setColumnsByKey((current) => ({ ...current, [key]: [] }));
      return [];
    } finally {
      setColumnsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setState(emptyState());
    setApplyError(null);
    setActiveCatalogTable(null);
    setTableFilter("");
    void loadTables();
  }, [visible, loadTables]);

  useEffect(() => {
    if (!visible || !activeCatalogTable) return;
    void ensureColumns(activeCatalogTable.schema, activeCatalogTable.table);
  }, [visible, activeCatalogTable, ensureColumns]);

  const filteredCatalog = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (row) =>
        row.table.toLowerCase().includes(q) ||
        row.schema.toLowerCase().includes(q),
    );
  }, [catalog, tableFilter]);

  const activeColumns = useMemo(() => {
    if (!activeCatalogTable) return [];
    return columnsByKey[tableKey(activeCatalogTable.schema, activeCatalogTable.table)] ?? [];
  }, [activeCatalogTable, columnsByKey]);

  const columnsForDesignerTable = useCallback(
    (table: DesignerTable): ColumnMetaRow[] => {
      return columnsByKey[tableKey(table.schema, table.table)] ?? [];
    },
    [columnsByKey],
  );

  const preview = useMemo(() => buildSqlFromDesigner(state), [state]);
  const previewSql = "sql" in preview ? preview.sql : "";

  const errorMessage = (error: BuildSqlError | null) => {
    if (!error) return "";
    return t(`reportDesigner.queryDesignerError_${error}`);
  };

  const addTable = (schema: string, table: string) => {
    setState((current) => {
      if (current.tables.some((entry) => entry.schema === schema && entry.table === table)) {
        return current;
      }
      const alias = nextTableAlias(table, current.tables);
      const id = newId();
      const nextTables: DesignerTable[] = [
        ...current.tables,
        { id, schema, table, alias },
      ];
      let nextJoins = current.joins;
      if (current.tables.length > 0) {
        const join: DesignerJoin = {
          id: newId(),
          type: "inner",
          leftTableId: current.tables[0].id,
          leftColumn: "",
          rightTableId: id,
          rightColumn: "",
        };
        nextJoins = [...current.joins, join];
      }
      return { ...current, tables: nextTables, joins: nextJoins };
    });
    void ensureColumns(schema, table);
  };

  const removeTable = (tableId: string) => {
    setState((current) => {
      const nextTables = current.tables.filter((table) => table.id !== tableId);
      return {
        tables: nextTables,
        joins: current.joins.filter(
          (join) => join.leftTableId !== tableId && join.rightTableId !== tableId,
        ),
        selects: current.selects.filter((select) => select.tableId !== tableId),
        wheres: current.wheres.filter((where) => where.tableId !== tableId),
        orders: current.orders.filter((order) => order.tableId !== tableId),
      };
    });
  };

  const addSelect = (tableId: string, column: string) => {
    setState((current) => {
      if (!current.tables.some((table) => table.id === tableId)) return current;
      if (current.selects.some((select) => select.tableId === tableId && select.column === column)) {
        return current;
      }
      const select: DesignerSelect = { id: newId(), tableId, column };
      return { ...current, selects: [...current.selects, select] };
    });
  };

  const addColumnFromCatalog = (schema: string, tableName: string, column: string) => {
    void ensureColumns(schema, tableName);
    setState((current) => {
      let tables = current.tables;
      let joins = current.joins;
      let table = tables.find((entry) => entry.schema === schema && entry.table === tableName);
      if (!table) {
        const id = newId();
        const alias = nextTableAlias(tableName, tables);
        table = { id, schema, table: tableName, alias };
        tables = [...tables, table];
        if (current.tables.length > 0) {
          joins = [
            ...joins,
            {
              id: newId(),
              type: "inner",
              leftTableId: current.tables[0].id,
              leftColumn: "",
              rightTableId: id,
              rightColumn: "",
            },
          ];
        }
      }
      if (current.selects.some((select) => select.tableId === table!.id && select.column === column)) {
        return { ...current, tables, joins };
      }
      return {
        ...current,
        tables,
        joins,
        selects: [...current.selects, { id: newId(), tableId: table.id, column }],
      };
    });
  };

  const removeSelect = (id: string) => {
    setState((current) => ({
      ...current,
      selects: current.selects.filter((select) => select.id !== id),
    }));
  };

  const reorderSelect = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setState((current) => {
      const fromIndex = current.selects.findIndex((select) => select.id === fromId);
      const toIndex = current.selects.findIndex((select) => select.id === toId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current.selects];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...current, selects: next };
    });
  };

  const updateJoin = (id: string, patch: Partial<DesignerJoin>) => {
    setState((current) => ({
      ...current,
      joins: current.joins.map((join) => (join.id === id ? { ...join, ...patch } : join)),
    }));
  };

  const addWhere = () => {
    setState((current) => {
      const base = current.tables[0];
      if (!base) return current;
      const where: DesignerWhere = {
        id: newId(),
        tableId: base.id,
        column: "",
        op: "eq",
        value: "",
      };
      return { ...current, wheres: [...current.wheres, where] };
    });
  };

  const updateWhere = (id: string, patch: Partial<DesignerWhere>) => {
    setState((current) => ({
      ...current,
      wheres: current.wheres.map((where) => (where.id === id ? { ...where, ...patch } : where)),
    }));
  };

  const removeWhere = (id: string) => {
    setState((current) => ({
      ...current,
      wheres: current.wheres.filter((where) => where.id !== id),
    }));
  };

  const addRecordIdFilter = () => {
    setState((current) => {
      const base = current.tables[0];
      if (!base) return current;
      const cols = columnsByKey[tableKey(base.schema, base.table)] ?? [];
      const column = cols.some((col) => col.name === "id") ? "id" : cols[0]?.name ?? "id";
      if (
        current.wheres.some(
          (where) =>
            where.tableId === base.id &&
            where.column === column &&
            where.op === "eq" &&
            where.value === "{{recordId}}",
        )
      ) {
        return current;
      }
      const where: DesignerWhere = {
        id: newId(),
        tableId: base.id,
        column,
        op: "eq",
        value: "{{recordId}}",
      };
      return { ...current, wheres: [...current.wheres, where] };
    });
  };

  const addOrder = () => {
    setState((current) => {
      const base = current.tables[0];
      if (!base) return current;
      const order: DesignerOrder = {
        id: newId(),
        tableId: base.id,
        column: "",
        dir: "asc",
      };
      return { ...current, orders: [...current.orders, order] };
    });
  };

  const updateOrder = (id: string, patch: Partial<DesignerOrder>) => {
    setState((current) => ({
      ...current,
      orders: current.orders.map((order) => (order.id === id ? { ...order, ...patch } : order)),
    }));
  };

  const removeOrder = (id: string) => {
    setState((current) => ({
      ...current,
      orders: current.orders.filter((order) => order.id !== id),
    }));
  };

  const onTablesDragOver = (event: ReactDragEvent) => {
    if (![TABLE_MIME, "text/plain"].some((type) => event.dataTransfer.types.includes(type))) return;
    event.preventDefault();
    setDropHighlight("tables");
  };

  const onSelectDragOver = (event: ReactDragEvent) => {
    if (
      ![COLUMN_MIME, SELECT_MIME, "text/plain"].some((type) =>
        event.dataTransfer.types.includes(type),
      )
    ) {
      return;
    }
    event.preventDefault();
    setDropHighlight("select");
  };

  const onTablesDrop = (event: ReactDragEvent) => {
    event.preventDefault();
    setDropHighlight(null);
    const raw =
      event.dataTransfer.getData(TABLE_MIME) || event.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { schema: string; table: string };
      if (payload.schema && payload.table) addTable(payload.schema, payload.table);
    } catch {
      /* ignore */
    }
  };

  const onSelectDrop = (event: ReactDragEvent) => {
    event.preventDefault();
    setDropHighlight(null);
    const selectId = event.dataTransfer.getData(SELECT_MIME);
    const targetId = (event.target as HTMLElement | null)
      ?.closest("[data-select-id]")
      ?.getAttribute("data-select-id");
    if (selectId && targetId) {
      reorderSelect(selectId, targetId);
      return;
    }
    const raw =
      event.dataTransfer.getData(COLUMN_MIME) || event.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as {
        schema: string;
        table: string;
        column: string;
      };
      const designerTable = state.tables.find(
        (entry) => entry.schema === payload.schema && entry.table === payload.table,
      );
      if (!designerTable || !payload.column) return;
      addSelect(designerTable.id, payload.column);
    } catch {
      /* ignore */
    }
  };

  const handleApply = () => {
    const result = buildSqlFromDesigner(state);
    if ("error" in result) {
      setApplyError(result.error);
      return;
    }
    setApplyError(null);
    onApply(result.sql);
  };

  const fieldSelect =
    "h-8 w-full rounded-sm border border-outline-variant bg-surface px-1.5 text-xs text-on-surface outline-none focus-visible:border-primary";

  const footer = (
    <div className="flex items-center justify-end gap-2">
      {applyError ? (
        <span className="mr-auto text-xs text-red-400">{errorMessage(applyError)}</span>
      ) : null}
      <Button
        type="button"
        label={t("reportDesigner.queryDesignerCancel")}
        severity="secondary"
        outlined
        onClick={onHide}
      />
      <Button
        type="button"
        label={t("reportDesigner.queryDesignerApply")}
        onClick={handleApply}
      />
    </div>
  );

  return (
    <AppDialog
      header={t("reportDesigner.queryDesignerTitle")}
      visible={visible}
      onHide={onHide}
      footer={footer}
      maximizable
      style={{ width: "min(90vw, 1200px)" }}
      contentStyle={{ height: "min(85vh, 780px)", padding: 0 }}
      className="query-designer-dialog"
    >
      <div className="grid h-full min-h-0 grid-cols-1 gap-0 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        {/* Catalog */}
        <div className="flex min-h-0 flex-col border-b border-outline-variant lg:border-b-0 lg:border-r">
          <div className="border-b border-outline-variant px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {t("reportDesigner.queryDesignerCatalog")}
          </div>
          <div className="border-b border-outline-variant p-2">
            <input
              type="search"
              className={fieldSelect}
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder={t("reportDesigner.queryDesignerSearchTables")}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1">
            {catalogLoading ? (
              <div className="px-2 py-3 text-xs text-on-surface-variant">
                {t("reportDesigner.loading")}
              </div>
            ) : catalogError ? (
              <div className="px-2 py-3 text-xs text-red-400">
                {t("reportDesigner.queryDesignerCatalogError")}
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="px-2 py-3 text-xs text-on-surface-variant">
                {t("reportDesigner.queryDesignerNoTables")}
              </div>
            ) : (
              filteredCatalog.map((row) => {
                const active =
                  activeCatalogTable?.schema === row.schema &&
                  activeCatalogTable?.table === row.table;
                return (
                  <button
                    key={`${row.schema}.${row.table}`}
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      const payload = JSON.stringify({ schema: row.schema, table: row.table });
                      event.dataTransfer.setData(TABLE_MIME, payload);
                      event.dataTransfer.setData("text/plain", payload);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => setActiveCatalogTable(row)}
                    onDoubleClick={() => addTable(row.schema, row.table)}
                    className={`mb-0.5 flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-left text-xs ${
                      active
                        ? "bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]"
                        : "text-on-surface hover:bg-surface"
                    }`}
                  >
                    <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-50" strokeWidth={2} />
                    <span className="truncate font-mono">{row.table}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="max-h-40 min-h-0 overflow-auto border-t border-outline-variant p-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              {t("reportDesigner.queryDesignerColumns")}
            </div>
            {!activeCatalogTable ? (
              <div className="text-[11px] text-on-surface-variant">
                {t("reportDesigner.queryDesignerPickTable")}
              </div>
            ) : columnsLoading && activeColumns.length === 0 ? (
              <div className="text-[11px] text-on-surface-variant">{t("reportDesigner.loading")}</div>
            ) : activeColumns.length === 0 ? (
              <div className="text-[11px] text-on-surface-variant">
                {t("reportDesigner.queryDesignerNoColumns")}
              </div>
            ) : (
              activeColumns.map((col) => (
                <div
                  key={col.name}
                  className="mb-0.5 flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] text-on-surface hover:bg-surface"
                  title={col.dataType}
                >
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      if (!activeCatalogTable) return;
                      const payload = JSON.stringify({
                        schema: activeCatalogTable.schema,
                        table: activeCatalogTable.table,
                        column: col.name,
                      });
                      event.dataTransfer.setData(COLUMN_MIME, payload);
                      event.dataTransfer.setData("text/plain", payload);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onDoubleClick={() => {
                      if (!activeCatalogTable) return;
                      addColumnFromCatalog(
                        activeCatalogTable.schema,
                        activeCatalogTable.table,
                        col.name,
                      );
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1 py-1 text-left"
                  >
                    <GripVertical className="h-3 w-3 shrink-0 opacity-50" strokeWidth={2} />
                    <span className="truncate font-mono">{col.name}</span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-on-surface-variant hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-primary"
                    title={t("reportDesigner.queryDesignerSelect")}
                    onClick={() => {
                      if (!activeCatalogTable) return;
                      addColumnFromCatalog(
                        activeCatalogTable.schema,
                        activeCatalogTable.table,
                        col.name,
                      );
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex min-h-0 flex-col gap-3 overflow-auto border-b border-outline-variant p-3 lg:border-b-0 lg:border-r">
          <section>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              {t("reportDesigner.queryDesignerFrom")}
            </div>
            <div
              className={`min-h-[4.5rem] rounded-sm border border-dashed p-2 ${
                dropHighlight === "tables"
                  ? "border-primary bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
                  : "border-outline-variant"
              }`}
              onDragOver={onTablesDragOver}
              onDragLeave={() => setDropHighlight(null)}
              onDrop={onTablesDrop}
            >
              {state.tables.length === 0 ? (
                <div className="px-1 py-3 text-center text-[11px] text-on-surface-variant">
                  {t("reportDesigner.queryDesignerDropTables")}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {state.tables.map((table, index) => (
                    <div
                      key={table.id}
                      className="flex items-center gap-2 rounded-sm border border-outline-variant bg-surface px-2 py-1.5 text-xs"
                    >
                      <span className="text-[10px] uppercase text-on-surface-variant">
                        {index === 0 ? "FROM" : "JOIN"}
                      </span>
                      <span className="font-mono font-semibold">{table.alias}</span>
                      <span className="truncate text-on-surface-variant">
                        ({table.schema}.{table.table})
                      </span>
                      <button
                        type="button"
                        className="ml-auto text-on-surface-variant hover:text-red-400"
                        onClick={() => removeTable(table.id)}
                        aria-label={t("reportDesigner.queryDesignerRemove")}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {state.tables.length > 1 ? (
            <section>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                {t("reportDesigner.queryDesignerJoins")}
              </div>
              <div className="flex flex-col gap-2">
                {state.joins.map((join) => {
                  const left = state.tables.find((table) => table.id === join.leftTableId);
                  const right = state.tables.find((table) => table.id === join.rightTableId);
                  const leftCols = left ? columnsForDesignerTable(left) : [];
                  const rightCols = right ? columnsForDesignerTable(right) : [];
                  return (
                    <div
                      key={join.id}
                      className="grid grid-cols-1 gap-1.5 rounded-sm border border-outline-variant bg-surface p-2 sm:grid-cols-[5rem_1fr_1fr_1fr_1fr]"
                    >
                      <select
                        className={fieldSelect}
                        value={join.type}
                        onChange={(e) =>
                          updateJoin(join.id, { type: e.target.value as DesignerJoinType })
                        }
                      >
                        <option value="inner">INNER</option>
                        <option value="left">LEFT</option>
                      </select>
                      <select
                        className={fieldSelect}
                        value={join.leftTableId}
                        onChange={(e) =>
                          updateJoin(join.id, { leftTableId: e.target.value, leftColumn: "" })
                        }
                      >
                        {state.tables.map((table) => (
                          <option key={table.id} value={table.id}>
                            {table.alias}
                          </option>
                        ))}
                      </select>
                      <select
                        className={fieldSelect}
                        value={join.leftColumn}
                        onChange={(e) => updateJoin(join.id, { leftColumn: e.target.value })}
                      >
                        <option value="">{t("reportDesigner.queryDesignerPickColumn")}</option>
                        {leftCols.map((col) => (
                          <option key={col.name} value={col.name}>
                            {col.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className={fieldSelect}
                        value={join.rightTableId}
                        onChange={(e) =>
                          updateJoin(join.id, { rightTableId: e.target.value, rightColumn: "" })
                        }
                      >
                        {state.tables.map((table) => (
                          <option key={table.id} value={table.id}>
                            {table.alias}
                          </option>
                        ))}
                      </select>
                      <select
                        className={fieldSelect}
                        value={join.rightColumn}
                        onChange={(e) => updateJoin(join.id, { rightColumn: e.target.value })}
                      >
                        <option value="">{t("reportDesigner.queryDesignerPickColumn")}</option>
                        {rightCols.map((col) => (
                          <option key={col.name} value={col.name}>
                            {col.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1 text-[10px] text-on-surface-variant">
                {t("reportDesigner.queryDesignerJoinHint")}
              </p>
            </section>
          ) : null}

          <section>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              {t("reportDesigner.queryDesignerSelect")}
            </div>
            <div
              className={`min-h-[4.5rem] rounded-sm border border-dashed p-2 ${
                dropHighlight === "select"
                  ? "border-primary bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
                  : "border-outline-variant"
              }`}
              onDragOver={onSelectDragOver}
              onDragLeave={() => setDropHighlight(null)}
              onDrop={onSelectDrop}
            >
              {state.selects.length === 0 ? (
                <div className="px-1 py-3 text-center text-[11px] text-on-surface-variant">
                  {t("reportDesigner.queryDesignerDropColumns")}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {state.selects.map((select) => {
                    const table = state.tables.find((entry) => entry.id === select.tableId);
                    return (
                      <div
                        key={select.id}
                        data-select-id={select.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(SELECT_MIME, select.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        className="flex items-center gap-2 rounded-sm border border-outline-variant bg-surface px-2 py-1.5 text-xs"
                      >
                        <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-50" strokeWidth={2} />
                        <span className="font-mono">
                          {table?.alias ?? "?"}.{select.column}
                        </span>
                        <button
                          type="button"
                          className="ml-auto text-on-surface-variant hover:text-red-400"
                          onClick={() => removeSelect(select.id)}
                          aria-label={t("reportDesigner.queryDesignerRemove")}
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                {t("reportDesigner.queryDesignerWhere")}
              </span>
              <button
                type="button"
                className="inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-[11px] text-on-surface-variant hover:bg-surface"
                onClick={addWhere}
                disabled={state.tables.length === 0}
              >
                <Plus className="h-3 w-3" strokeWidth={2} />
                {t("reportDesigner.queryDesignerAddWhere")}
              </button>
              <button
                type="button"
                className="inline-flex h-6 items-center rounded-sm px-1.5 text-[11px] text-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
                onClick={addRecordIdFilter}
                disabled={state.tables.length === 0}
              >
                {t("reportDesigner.queryDesignerAddRecordId")}
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {state.wheres.map((where) => {
                const table = state.tables.find((entry) => entry.id === where.tableId);
                const cols = table ? columnsForDesignerTable(table) : [];
                const needsValue = where.op !== "empty" && where.op !== "notEmpty";
                return (
                  <div
                    key={where.id}
                    className="grid grid-cols-1 gap-1.5 rounded-sm border border-outline-variant bg-surface p-2 sm:grid-cols-[1fr_1fr_7rem_1fr_auto]"
                  >
                    <select
                      className={fieldSelect}
                      value={where.tableId}
                      onChange={(e) =>
                        updateWhere(where.id, { tableId: e.target.value, column: "" })
                      }
                    >
                      {state.tables.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.alias}
                        </option>
                      ))}
                    </select>
                    <select
                      className={fieldSelect}
                      value={where.column}
                      onChange={(e) => updateWhere(where.id, { column: e.target.value })}
                    >
                      <option value="">{t("reportDesigner.queryDesignerPickColumn")}</option>
                      {cols.map((col) => (
                        <option key={col.name} value={col.name}>
                          {col.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className={fieldSelect}
                      value={where.op}
                      onChange={(e) =>
                        updateWhere(where.id, { op: e.target.value as DesignerWhereOp })
                      }
                    >
                      {WHERE_OPS.map((op) => (
                        <option key={op} value={op}>
                          {t(`reportDesigner.queryDesignerOp_${op}`)}
                        </option>
                      ))}
                    </select>
                    <input
                      className={fieldSelect}
                      value={where.value}
                      disabled={!needsValue}
                      onChange={(e) => updateWhere(where.id, { value: e.target.value })}
                      placeholder={needsValue ? "value / {{recordId}}" : "—"}
                    />
                    <button
                      type="button"
                      className="text-on-surface-variant hover:text-red-400"
                      onClick={() => removeWhere(where.id)}
                      aria-label={t("reportDesigner.queryDesignerRemove")}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                {t("reportDesigner.queryDesignerOrder")}
              </span>
              <button
                type="button"
                className="inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-[11px] text-on-surface-variant hover:bg-surface"
                onClick={addOrder}
                disabled={state.tables.length === 0}
              >
                <Plus className="h-3 w-3" strokeWidth={2} />
                {t("reportDesigner.queryDesignerAddOrder")}
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {state.orders.map((order) => {
                const table = state.tables.find((entry) => entry.id === order.tableId);
                const cols = table ? columnsForDesignerTable(table) : [];
                return (
                  <div
                    key={order.id}
                    className="grid grid-cols-1 gap-1.5 rounded-sm border border-outline-variant bg-surface p-2 sm:grid-cols-[1fr_1fr_5rem_auto]"
                  >
                    <select
                      className={fieldSelect}
                      value={order.tableId}
                      onChange={(e) =>
                        updateOrder(order.id, { tableId: e.target.value, column: "" })
                      }
                    >
                      {state.tables.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.alias}
                        </option>
                      ))}
                    </select>
                    <select
                      className={fieldSelect}
                      value={order.column}
                      onChange={(e) => updateOrder(order.id, { column: e.target.value })}
                    >
                      <option value="">{t("reportDesigner.queryDesignerPickColumn")}</option>
                      {cols.map((col) => (
                        <option key={col.name} value={col.name}>
                          {col.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className={fieldSelect}
                      value={order.dir}
                      onChange={(e) =>
                        updateOrder(order.id, { dir: e.target.value as "asc" | "desc" })
                      }
                    >
                      <option value="asc">ASC</option>
                      <option value="desc">DESC</option>
                    </select>
                    <button
                      type="button"
                      className="text-on-surface-variant hover:text-red-400"
                      onClick={() => removeOrder(order.id)}
                      aria-label={t("reportDesigner.queryDesignerRemove")}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Live SQL */}
        <div className="flex min-h-0 flex-col">
          <div className="border-b border-outline-variant px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {t("reportDesigner.queryDesignerPreview")}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CodeMirror
              value={
                previewSql ||
                ("error" in preview ? `-- ${errorMessage(preview.error)}` : "--")
              }
              height="420px"
              minHeight="420px"
              theme={dark ? "dark" : "light"}
              extensions={[sql()]}
              editable={false}
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: false,
              }}
              className="text-xs"
            />
          </div>
        </div>
      </div>
    </AppDialog>
  );
}
