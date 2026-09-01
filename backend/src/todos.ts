import type { QueryResult, QueryResultRow } from "pg";

import { pool } from "./db.js";

export const MAX_TODO_ITEMS = 50;
export const MAX_TODO_TEXT_LENGTH = 500;

export type TodoInput = { text: string };

export type TodoRow = {
  id: string;
  pos: number;
  text: string;
  checked?: boolean;
  checkedAt?: string | null;
  checkedBy?: string | null;
  checkedByLoginName?: string | null;
};

export const selectWoTodoSql = `
  SELECT
    t."id",
    t."pos",
    t."text",
    t."checked",
    t."checkedAt",
    t."checkedBy",
    u."loginName" AS "checkedByLoginName"
  FROM "workOrderTodo" t
  LEFT JOIN "users" u ON u."id" = t."checkedBy"
`;

export type TodoDbClient = {
  query: <T extends QueryResultRow>(
    queryText: string,
    values?: unknown[],
  ) => Promise<QueryResult<T>>;
};

export function parseTodoItems(value: unknown): TodoInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_TODO_ITEMS) return null;
  const items: TodoInput[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object") return null;
    const raw = (item as { text?: unknown }).text;
    if (typeof raw !== "string") return null;
    const text = raw.trim();
    if (!text || text.length > MAX_TODO_TEXT_LENGTH) return null;
    items.push({ text });
  }
  return items;
}

export async function loadWorkOrderTodos(client: TodoDbClient, workOrderId: string): Promise<TodoRow[]> {
  const { rows } = await client.query<TodoRow>(
    `
    ${selectWoTodoSql}
    WHERE t."workOrderId" = $1::uuid
    ORDER BY t."pos" ASC
    `,
    [workOrderId],
  );
  return rows;
}

export async function loadMaintenancePlanTodos(client: TodoDbClient, planId: string): Promise<TodoRow[]> {
  const { rows } = await client.query<TodoRow>(
    `
    SELECT "id", "pos", "text"
    FROM "maintenancePlanTodo"
    WHERE "maintenancePlanId" = $1::uuid
    ORDER BY "pos" ASC
    `,
    [planId],
  );
  return rows;
}

async function replaceTodosInTable(
  client: TodoDbClient,
  table: "workOrderTodo" | "maintenancePlanTodo",
  parentColumn: "workOrderId" | "maintenancePlanId",
  parentId: string,
  items: TodoInput[],
): Promise<void> {
  await client.query(`DELETE FROM "${table}" WHERE "${parentColumn}" = $1::uuid`, [parentId]);
  if (items.length === 0) return;
  const values: unknown[] = [parentId];
  const placeholders = items
    .map((item, idx) => {
      const posParam = idx * 2 + 2;
      const textParam = posParam + 1;
      values.push(idx + 1, item.text);
      return `($1::uuid, $${posParam}::integer, $${textParam})`;
    })
    .join(", ");
  await client.query(
    `
    INSERT INTO "${table}" ("${parentColumn}", "pos", "text")
    VALUES ${placeholders}
    `,
    values,
  );
}

export async function replaceWorkOrderTodos(
  client: TodoDbClient,
  workOrderId: string,
  items: TodoInput[],
): Promise<void> {
  await replaceTodosInTable(client, "workOrderTodo", "workOrderId", workOrderId, items);
}

export async function replaceMaintenancePlanTodos(
  client: TodoDbClient,
  planId: string,
  items: TodoInput[],
): Promise<void> {
  await replaceTodosInTable(client, "maintenancePlanTodo", "maintenancePlanId", planId, items);
}

export async function copyWorkOrderTodos(
  client: TodoDbClient,
  fromWorkOrderId: string,
  toWorkOrderId: string,
): Promise<void> {
  await client.query(
    `
    INSERT INTO "workOrderTodo" ("workOrderId", "pos", "text", "checked")
    SELECT $2::uuid, t."pos", t."text", false
    FROM "workOrderTodo" t
    WHERE t."workOrderId" = $1::uuid
    ORDER BY t."pos" ASC
    `,
    [fromWorkOrderId, toWorkOrderId],
  );
}

export async function copyMaintenancePlanTodosToWorkOrder(
  client: TodoDbClient,
  planId: string,
  workOrderId: string,
): Promise<void> {
  await client.query(
    `
    INSERT INTO "workOrderTodo" ("workOrderId", "pos", "text", "checked")
    SELECT $2::uuid, t."pos", t."text", false
    FROM "maintenancePlanTodo" t
    WHERE t."maintenancePlanId" = $1::uuid
    ORDER BY t."pos" ASC
    `,
    [planId, workOrderId],
  );
}

export async function loadWorkOrderTodoTextsForEmbedding(workOrderId: string): Promise<string[]> {
  const { rows } = await pool.query<QueryResultRow & { text: string }>(
    `
    SELECT "text"
    FROM "workOrderTodo"
    WHERE "workOrderId" = $1::uuid
    ORDER BY "pos" ASC
    `,
    [workOrderId],
  );
  return rows.map((r) => r.text);
}
