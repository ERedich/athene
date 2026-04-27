import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";

type TableMetaRow = {
  schema: string;
  table: string;
  type: "BASE TABLE" | "VIEW" | string;
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
  columnNames: string[];
  foreignTableSchema: string | null;
  foreignTableName: string | null;
  foreignColumnNames: string[] | null;
};

const router = Router();

const DEFAULT_SCHEMA = "public";
const identifierRe = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function readSchemaQuery(req: Request): string {
  const raw = typeof req.query.schema === "string" ? req.query.schema.trim() : "";
  return raw || DEFAULT_SCHEMA;
}

function readPathPart(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidIdentifier(value: string): boolean {
  return identifierRe.test(value);
}

function rejectInvalidIdentifier(res: Response, kind: "schema" | "table"): boolean {
  res.status(400).json({ error: `invalid_${kind}` });
  return true;
}

router.get("/tables", async (req: Request, res: Response) => {
  const schema = readSchemaQuery(req);
  if (!isValidIdentifier(schema)) {
    rejectInvalidIdentifier(res, "schema");
    return;
  }

  try {
    const { rows } = await pool.query<TableMetaRow>(
      `
      SELECT
        t.table_schema AS "schema",
        t.table_name AS "table",
        t.table_type AS "type"
      FROM information_schema.tables t
      WHERE t.table_schema = $1
      ORDER BY t.table_name ASC
      `,
      [schema],
    );
    res.json({ rows, schema });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/tables/:schema/:table/columns", async (req: Request, res: Response) => {
  const schema = readPathPart(req.params.schema);
  const table = readPathPart(req.params.table);
  if (!isValidIdentifier(schema)) {
    rejectInvalidIdentifier(res, "schema");
    return;
  }
  if (!isValidIdentifier(table)) {
    rejectInvalidIdentifier(res, "table");
    return;
  }

  try {
    const { rows } = await pool.query<ColumnMetaRow>(
      `
      SELECT
        c.column_name AS "name",
        c.data_type AS "dataType",
        (c.is_nullable = 'YES') AS "isNullable",
        c.column_default AS "defaultValue",
        c.ordinal_position AS "position"
      FROM information_schema.columns c
      WHERE c.table_schema = $1
        AND c.table_name = $2
      ORDER BY c.ordinal_position ASC
      `,
      [schema, table],
    );
    res.json({ rows, schema, table });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/tables/:schema/:table/constraints", async (req: Request, res: Response) => {
  const schema = readPathPart(req.params.schema);
  const table = readPathPart(req.params.table);
  if (!isValidIdentifier(schema)) {
    rejectInvalidIdentifier(res, "schema");
    return;
  }
  if (!isValidIdentifier(table)) {
    rejectInvalidIdentifier(res, "table");
    return;
  }

  try {
    const { rows } = await pool.query<ConstraintMetaRow>(
      `
      SELECT
        tc.constraint_name AS "name",
        tc.constraint_type AS "type",
        COALESCE(
          array_agg(kcu.column_name ORDER BY kcu.ordinal_position)
            FILTER (WHERE kcu.column_name IS NOT NULL),
          ARRAY[]::text[]
        ) AS "columnNames",
        ccu.table_schema AS "foreignTableSchema",
        ccu.table_name AS "foreignTableName",
        CASE
          WHEN tc.constraint_type = 'FOREIGN KEY' THEN
            COALESCE(
              array_agg(ccu.column_name ORDER BY kcu.ordinal_position)
                FILTER (WHERE ccu.column_name IS NOT NULL),
              ARRAY[]::text[]
            )
          ELSE NULL
        END AS "foreignColumnNames"
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_schema = kcu.constraint_schema
       AND tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
       AND tc.table_name = kcu.table_name
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_schema = ccu.constraint_schema
       AND tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = $1
        AND tc.table_name = $2
      GROUP BY
        tc.constraint_name,
        tc.constraint_type,
        ccu.table_schema,
        ccu.table_name
      ORDER BY tc.constraint_type ASC, tc.constraint_name ASC
      `,
      [schema, table],
    );
    res.json({ rows, schema, table });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export const dbMetaRouter = router;
