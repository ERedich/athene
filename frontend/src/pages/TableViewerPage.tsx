import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { IconField } from "primereact/iconfield";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";

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

type ConstraintMetaRow = {
  name: string;
  type: string;
  columnNames: unknown;
  foreignTableSchema: string | null;
  foreignTableName: string | null;
  foreignColumnNames: unknown;
};

function toDisplayList(values: unknown): string[] {
  if (Array.isArray(values)) {
    return values
      .map((value) => String(value ?? "").trim())
      .filter((value) => value.length > 0);
  }
  if (typeof values === "string") {
    const trimmed = values.trim();
    if (!trimmed) return [];
    // Handle Postgres-style array literal fallback like "{id,name}".
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const inner = trimmed.slice(1, -1).trim();
      if (!inner) return [];
      return inner
        .split(",")
        .map((value) => value.trim().replace(/^"+|"+$/g, ""))
        .filter((value) => value.length > 0);
    }
    return [trimmed];
  }
  if (values && typeof values === "object") {
    return Object.values(values as Record<string, unknown>)
      .map((value) => String(value ?? "").trim())
      .filter((value) => value.length > 0);
  }
  return [];
}

function formatList(values: unknown): string {
  const list = toDisplayList(values);
  if (list.length === 0) return "—";
  return list.join(", ");
}

function formatForeignTarget(row: ConstraintMetaRow): string {
  if (!row.foreignTableSchema || !row.foreignTableName) return "—";
  return `${row.foreignTableSchema}.${row.foreignTableName}`;
}

export function TableViewerPage() {
  const { t } = useTranslation();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);

  const [tables, setTables] = useState<TableMetaRow[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableMetaRow | null>(null);
  const [columns, setColumns] = useState<ColumnMetaRow[]>([]);
  const [constraints, setConstraints] = useState<ConstraintMetaRow[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredTables = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((row) => [row.schema, row.table, row.type].join(" ").toLowerCase().includes(q));
  }, [searchTerm, tables]);

  useEffect(() => {
    setHeaderRowCount(filteredTables.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filteredTables.length, setHeaderRowCount]);

  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    try {
      const res = await apiFetch("/api/db-meta/tables");
      if (!res.ok) throw new Error("load_tables");
      const data = (await res.json()) as { rows: TableMetaRow[] };
      setTables(data.rows ?? []);
      setSelectedTable((current) => {
        if (current) {
          const stillExists = (data.rows ?? []).some((row) => row.schema === current.schema && row.table === current.table);
          if (stillExists) return current;
        }
        return (data.rows ?? [])[0] ?? null;
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("tableViewer.loadTablesError"),
        life: 6000,
      });
    } finally {
      setLoadingTables(false);
    }
  }, [t]);

  const loadDetails = useCallback(
    async (table: TableMetaRow | null) => {
      if (!table) {
        setColumns([]);
        setConstraints([]);
        return;
      }
      setLoadingDetails(true);
      try {
        const [columnsRes, constraintsRes] = await Promise.all([
          apiFetch(`/api/db-meta/tables/${encodeURIComponent(table.schema)}/${encodeURIComponent(table.table)}/columns`),
          apiFetch(`/api/db-meta/tables/${encodeURIComponent(table.schema)}/${encodeURIComponent(table.table)}/constraints`),
        ]);
        if (!columnsRes.ok || !constraintsRes.ok) throw new Error("load_details");
        const [columnsData, constraintsData] = (await Promise.all([columnsRes.json(), constraintsRes.json()])) as [
          { rows: ColumnMetaRow[] },
          { rows: ConstraintMetaRow[] },
        ];
        setColumns(columnsData.rows ?? []);
        setConstraints(constraintsData.rows ?? []);
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("tableViewer.loadDetailsError"),
          life: 6000,
        });
      } finally {
        setLoadingDetails(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  useEffect(() => {
    void loadDetails(selectedTable);
  }, [loadDetails, selectedTable]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("tableViewer.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [searchTerm, setHeaderActions, t]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px xl:grid-cols-[minmax(20rem,28rem)_1fr]">
        <div className="flex min-h-0 flex-col">
          <DataTable
            className="app-data-table w-full"
            value={filteredTables}
            loading={loadingTables}
            dataKey="table"
            selection={selectedTable}
            onSelectionChange={(e) => setSelectedTable((e.value as TableMetaRow | null) ?? null)}
            selectionMode="single"
            metaKeySelection={false}
            stripedRows
            showGridlines
            scrollable
            resizableColumns
            reorderableColumns
            columnResizeMode="expand"
            scrollHeight="flex"
            tableStyle={{ minWidth: "20rem" }}
            stateStorage="local"
            stateKey="athene-table-viewer-tables"
            emptyMessage={t("tableViewer.emptyTables")}
          >
            <Column field="schema" header={t("tableViewer.schema")} sortable />
            <Column field="table" header={t("tableViewer.table")} sortable />
            <Column field="type" header={t("tableViewer.type")} sortable />
          </DataTable>
        </div>

        <div className="grid min-h-0 grid-cols-1 gap-4 2xl:grid-cols-2">
          <div className="flex min-h-0 flex-col">
            <DataTable
              className="app-data-table w-full"
              value={columns}
              loading={loadingDetails}
              dataKey="name"
              stripedRows
              showGridlines
              scrollable
              resizableColumns
              reorderableColumns
              columnResizeMode="expand"
              scrollHeight="flex"
              tableStyle={{ minWidth: "36rem" }}
              stateStorage="local"
              stateKey="athene-table-viewer-columns"
              emptyMessage={t("tableViewer.emptyColumns")}
            >
              <Column field="position" header={t("tableViewer.position")} sortable className="w-24" />
              <Column field="name" header={t("tableViewer.column")} sortable />
              <Column field="dataType" header={t("tableViewer.dataType")} sortable />
              <Column
                field="isNullable"
                header={t("tableViewer.nullable")}
                body={(row: ColumnMetaRow) => (row.isNullable ? t("tableViewer.yes") : t("tableViewer.no"))}
                className="w-28"
              />
              <Column
                field="defaultValue"
                header={t("tableViewer.defaultValue")}
                body={(row: ColumnMetaRow) => row.defaultValue || "—"}
              />
            </DataTable>
          </div>

          <div className="flex min-h-0 flex-col">
            <DataTable
              className="app-data-table w-full"
              value={constraints}
              loading={loadingDetails}
              dataKey="name"
              stripedRows
              showGridlines
              scrollable
              resizableColumns
              reorderableColumns
              columnResizeMode="expand"
              scrollHeight="flex"
              tableStyle={{ minWidth: "36rem" }}
              stateStorage="local"
              stateKey="athene-table-viewer-constraints"
              emptyMessage={t("tableViewer.emptyConstraints")}
            >
              <Column field="name" header={t("tableViewer.constraint")} sortable />
              <Column field="type" header={t("tableViewer.constraintType")} sortable />
              <Column
                field="columnNames"
                header={t("tableViewer.columns")}
                body={(row: ConstraintMetaRow) => formatList(row.columnNames)}
              />
              <Column
                field="foreignTableName"
                header={t("tableViewer.foreignTable")}
                body={(row: ConstraintMetaRow) => formatForeignTarget(row)}
              />
              <Column
                field="foreignColumnNames"
                header={t("tableViewer.foreignColumns")}
                body={(row: ConstraintMetaRow) => formatList(row.foreignColumnNames)}
              />
            </DataTable>
          </div>
        </div>
      </div>
    </div>
  );
}
