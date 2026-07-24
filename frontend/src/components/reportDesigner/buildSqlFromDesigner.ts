export type DesignerJoinType = "inner" | "left";

export type DesignerTable = {
  id: string;
  schema: string;
  table: string;
  alias: string;
};

export type DesignerJoin = {
  id: string;
  type: DesignerJoinType;
  leftTableId: string;
  leftColumn: string;
  rightTableId: string;
  rightColumn: string;
};

export type DesignerSelect = {
  id: string;
  tableId: string;
  column: string;
  alias?: string;
};

export type DesignerWhereOp =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "contains"
  | "empty"
  | "notEmpty";

export type DesignerWhere = {
  id: string;
  tableId: string;
  column: string;
  op: DesignerWhereOp;
  value: string;
};

export type DesignerOrder = {
  id: string;
  tableId: string;
  column: string;
  dir: "asc" | "desc";
};

export type QueryDesignerState = {
  tables: DesignerTable[];
  joins: DesignerJoin[];
  selects: DesignerSelect[];
  wheres: DesignerWhere[];
  orders: DesignerOrder[];
};

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, "")}"`;
}

export function isSafeIdent(name: string): boolean {
  return IDENT_RE.test(name);
}

function tableRef(table: DesignerTable): string {
  return quoteIdent(table.alias || table.table);
}

function columnRef(table: DesignerTable, column: string): string {
  return `${tableRef(table)}.${quoteIdent(column)}`;
}

function escapeLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function findTable(tables: DesignerTable[], id: string): DesignerTable | undefined {
  return tables.find((table) => table.id === id);
}

export type BuildSqlError =
  | "no_table"
  | "no_select"
  | "invalid_ident"
  | "incomplete_join"
  | "incomplete_where"
  | "orphan_table"
  | "invalid_ref";

export function validateDesignerState(state: QueryDesignerState): BuildSqlError | null {
  if (state.tables.length === 0) return "no_table";
  if (state.selects.length === 0) return "no_select";

  for (const table of state.tables) {
    if (!isSafeIdent(table.table) || !isSafeIdent(table.alias)) return "invalid_ident";
    if (table.schema && !isSafeIdent(table.schema)) return "invalid_ident";
  }

  const baseId = state.tables[0]?.id;
  for (let i = 1; i < state.tables.length; i += 1) {
    const table = state.tables[i];
    const join = state.joins.find(
      (entry) => entry.rightTableId === table.id || entry.leftTableId === table.id,
    );
    if (!join) return "orphan_table";
    if (
      !join.leftTableId ||
      !join.rightTableId ||
      !join.leftColumn ||
      !join.rightColumn ||
      !isSafeIdent(join.leftColumn) ||
      !isSafeIdent(join.rightColumn)
    ) {
      return "incomplete_join";
    }
    const left = findTable(state.tables, join.leftTableId);
    const right = findTable(state.tables, join.rightTableId);
    if (!left || !right) return "invalid_ref";
    if (join.leftTableId !== table.id && join.rightTableId !== table.id) return "incomplete_join";
    // Join must connect the new table to an already-included table (base or earlier).
    const otherId = join.leftTableId === table.id ? join.rightTableId : join.leftTableId;
    const earlier = state.tables.slice(0, i).some((t) => t.id === otherId);
    if (!earlier && otherId !== baseId) {
      const otherIndex = state.tables.findIndex((t) => t.id === otherId);
      if (otherIndex < 0 || otherIndex >= i) return "incomplete_join";
    }
  }

  for (const select of state.selects) {
    if (!isSafeIdent(select.column)) return "invalid_ident";
    if (select.alias && !isSafeIdent(select.alias)) return "invalid_ident";
    if (!findTable(state.tables, select.tableId)) return "invalid_ref";
  }

  for (const where of state.wheres) {
    if (!where.column || !isSafeIdent(where.column)) return "invalid_ident";
    if (!findTable(state.tables, where.tableId)) return "invalid_ref";
    if (where.op !== "empty" && where.op !== "notEmpty" && where.value.trim() === "") {
      return "incomplete_where";
    }
  }

  for (const order of state.orders) {
    if (!order.column || !isSafeIdent(order.column)) return "invalid_ident";
    if (!findTable(state.tables, order.tableId)) return "invalid_ref";
  }

  return null;
}

function whereClause(table: DesignerTable, where: DesignerWhere): string {
  const col = columnRef(table, where.column);
  switch (where.op) {
    case "empty":
      return `${col} IS NULL`;
    case "notEmpty":
      return `${col} IS NOT NULL`;
    case "contains":
      return `${col} ILIKE ${escapeLiteral(`%${where.value}%`)}`;
    case "neq":
      return where.value === "{{recordId}}"
        ? `${col} <> {{recordId}}`
        : `${col} <> ${escapeLiteral(where.value)}`;
    case "gt":
      return `${col} > ${escapeLiteral(where.value)}`;
    case "lt":
      return `${col} < ${escapeLiteral(where.value)}`;
    case "gte":
      return `${col} >= ${escapeLiteral(where.value)}`;
    case "lte":
      return `${col} <= ${escapeLiteral(where.value)}`;
    case "eq":
    default:
      return where.value === "{{recordId}}"
        ? `${col} = {{recordId}}`
        : `${col} = ${escapeLiteral(where.value)}`;
  }
}

export function buildSqlFromDesigner(state: QueryDesignerState): { sql: string } | { error: BuildSqlError } {
  const error = validateDesignerState(state);
  if (error) return { error };

  const base = state.tables[0];
  const selectParts = state.selects.map((select) => {
    const table = findTable(state.tables, select.tableId)!;
    const ref = columnRef(table, select.column);
    return select.alias ? `${ref} AS ${quoteIdent(select.alias)}` : ref;
  });

  const fromParts: string[] = [
    `FROM ${quoteIdent(base.table)}${base.alias !== base.table ? ` AS ${quoteIdent(base.alias)}` : ""}`,
  ];

  for (let i = 1; i < state.tables.length; i += 1) {
    const table = state.tables[i];
    const join = state.joins.find(
      (entry) => entry.rightTableId === table.id || entry.leftTableId === table.id,
    )!;
    const left = findTable(state.tables, join.leftTableId)!;
    const right = findTable(state.tables, join.rightTableId)!;
    const joinKw = join.type === "left" ? "LEFT JOIN" : "INNER JOIN";
    const tableSql = `${quoteIdent(table.table)}${
      table.alias !== table.table ? ` AS ${quoteIdent(table.alias)}` : ""
    }`;
    fromParts.push(
      `${joinKw} ${tableSql} ON ${columnRef(left, join.leftColumn)} = ${columnRef(right, join.rightColumn)}`,
    );
  }

  const lines = [`SELECT ${selectParts.join(", ")}`, ...fromParts];

  if (state.wheres.length > 0) {
    const whereParts = state.wheres.map((where) => {
      const table = findTable(state.tables, where.tableId)!;
      return whereClause(table, where);
    });
    lines.push(`WHERE ${whereParts.join(" AND ")}`);
  }

  if (state.orders.length > 0) {
    const orderParts = state.orders.map((order) => {
      const table = findTable(state.tables, order.tableId)!;
      return `${columnRef(table, order.column)} ${order.dir === "desc" ? "DESC" : "ASC"}`;
    });
    lines.push(`ORDER BY ${orderParts.join(", ")}`);
  }

  return { sql: lines.join("\n") };
}

export function nextTableAlias(tableName: string, existing: DesignerTable[]): string {
  const base = isSafeIdent(tableName) ? tableName : "t";
  const used = new Set(existing.map((t) => t.alias));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}${i}`)) i += 1;
  return `${base}${i}`;
}
