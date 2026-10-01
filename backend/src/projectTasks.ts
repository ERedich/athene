import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { QueryResult, QueryResultRow } from "pg";

import { withAuditContext } from "./auditContext.js";
import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";

export type TaskType = "task" | "milestone";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type DependencyType =
  | "finish_to_start"
  | "start_to_start"
  | "finish_to_finish"
  | "start_to_finish";
export type LinkType = "implements" | "related" | "blocks";

export type ProjectTaskRow = {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description: string | null;
  taskType: TaskType;
  status: TaskStatus;
  plannedStart: string;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  progress: number;
  priority: TaskPriority;
  assignedEmployeeId: string | null;
  assignedEmployeeKey: string | null;
  assignedEmployeeName: string | null;
  parentTaskId: string | null;
  parentTaskKey: string | null;
  sortOrder: number;
  workOrderCount: number;
  predecessorCount: number;
  successorCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type TaskDependencyRow = {
  id: string;
  predecessorTaskId: string;
  predecessorTaskKey: string;
  predecessorTaskName: string;
  successorTaskId: string;
  successorTaskKey: string;
  successorTaskName: string;
  dependencyType: DependencyType;
  lagDays: number;
  createdAt: string;
  createdBy: string;
};

export type TaskWorkOrderLinkRow = {
  id: string;
  projectTaskId: string;
  workOrderId: string;
  workOrderNumber: number;
  workOrderName: string;
  workOrderStatus: string;
  linkType: LinkType;
  createdAt: string;
  createdBy: string;
};

type ParsedTaskBody = {
  key: string;
  name: string;
  description: string | null;
  taskType: TaskType;
  status: TaskStatus;
  plannedStart: string;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  progress: number;
  priority: TaskPriority;
  assignedEmployeeId: string | null;
  parentTaskId: string | null;
  sortOrder: number;
};

const router = Router({ mergeParams: true });

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedTaskTypes: TaskType[] = ["task", "milestone"];
const allowedStatuses: TaskStatus[] = ["pending", "in_progress", "completed", "cancelled"];
const allowedPriorities: TaskPriority[] = ["low", "medium", "high", "critical"];
const allowedDependencyTypes: DependencyType[] = [
  "finish_to_start",
  "start_to_start",
  "finish_to_finish",
  "start_to_finish",
];
const allowedLinkTypes: LinkType[] = ["implements", "related", "blocks"];

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && (allowedTaskTypes as string[]).includes(value);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (allowedStatuses as string[]).includes(value);
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && (allowedPriorities as string[]).includes(value);
}

function isDependencyType(value: unknown): value is DependencyType {
  return typeof value === "string" && (allowedDependencyTypes as string[]).includes(value);
}

function isLinkType(value: unknown): value is LinkType {
  return typeof value === "string" && (allowedLinkTypes as string[]).includes(value);
}

function readTrimmedOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseIsoDatetime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseTaskBody(body: unknown): ParsedTaskBody | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;

  const key = typeof o.key === "string" ? o.key.trim() : "";
  if (!key || key.length > 50) return null;

  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name || name.length > 200) return null;

  const descriptionRaw = readTrimmedOptionalString(o.description);
  if (descriptionRaw !== null && descriptionRaw.length > 2000) return null;

  const taskTypeRaw = o.taskType ?? "task";
  if (!isTaskType(taskTypeRaw)) return null;

  const statusRaw = o.status ?? "pending";
  if (!isTaskStatus(statusRaw)) return null;

  const plannedStart = parseIsoDatetime(o.plannedStart);
  if (!plannedStart) return null;

  const plannedEnd =
    o.plannedEnd === null || o.plannedEnd === undefined
      ? null
      : parseIsoDatetime(o.plannedEnd);
  if (o.plannedEnd !== null && o.plannedEnd !== undefined && !plannedEnd) return null;

  const actualStart =
    o.actualStart === null || o.actualStart === undefined
      ? null
      : parseIsoDatetime(o.actualStart);
  if (o.actualStart !== null && o.actualStart !== undefined && !actualStart) return null;

  const actualEnd =
    o.actualEnd === null || o.actualEnd === undefined
      ? null
      : parseIsoDatetime(o.actualEnd);
  if (o.actualEnd !== null && o.actualEnd !== undefined && !actualEnd) return null;

  let progress = 0;
  if (o.progress !== undefined && o.progress !== null) {
    if (typeof o.progress !== "number" || !Number.isInteger(o.progress)) return null;
    if (o.progress < 0 || o.progress > 100) return null;
    progress = o.progress;
  }

  const priorityRaw = o.priority ?? "medium";
  if (!isTaskPriority(priorityRaw)) return null;

  const assignedEmployeeIdRaw = readTrimmedOptionalString(o.assignedEmployeeId);
  if (assignedEmployeeIdRaw !== null && !isUuid(assignedEmployeeIdRaw)) return null;

  const parentTaskIdRaw = readTrimmedOptionalString(o.parentTaskId);
  if (parentTaskIdRaw !== null && !isUuid(parentTaskIdRaw)) return null;

  let sortOrder = 0;
  if (o.sortOrder !== undefined && o.sortOrder !== null) {
    if (typeof o.sortOrder !== "number" || !Number.isInteger(o.sortOrder)) return null;
    sortOrder = o.sortOrder;
  }

  return {
    key,
    name,
    description: descriptionRaw,
    taskType: taskTypeRaw,
    status: statusRaw,
    plannedStart,
    plannedEnd,
    actualStart,
    actualEnd,
    progress,
    priority: priorityRaw,
    assignedEmployeeId: assignedEmployeeIdRaw,
    parentTaskId: parentTaskIdRaw,
    sortOrder,
  };
}

function sendPgError(res: Response, err: unknown) {
  const e = err as { code?: string; detail?: string; message?: string };
  if (e.code === "23505") {
    res.status(409).json({ error: "duplicate_key", message: e.detail ?? e.message });
    return;
  }
  if (e.code === "23503") {
    res.status(409).json({ error: "foreign_key_violation", message: e.detail ?? e.message });
    return;
  }
  if (e.code === "23514") {
    res.status(400).json({ error: "check_violation", message: e.detail ?? e.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

function auditMeta(req: Request) {
  const userId = req.session.userId;
  if (!userId) {
    throw new Error("missing_session_user");
  }
  return {
    userId,
    requestId: randomUUID(),
    reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
    source: "api",
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? "",
  };
}

async function getAccessibleProject(
  userId: string,
  projectId: string,
): Promise<{ id: string; siteId: string } | null> {
  const result = await pool.query<QueryResultRow & { id: string; siteId: string }>(
    `
    SELECT "id", "siteId"::text AS "siteId"
    FROM "project"
    WHERE "id" = $1::uuid
      AND ${siteAccessSql('"siteId"', "$2")}
    `,
    [projectId, userId],
  );
  return result.rows[0] ?? null;
}

const selectTasksSql = `
  SELECT
    t."id",
    t."projectId",
    t."key",
    t."name",
    t."description",
    t."taskType",
    t."status",
    t."plannedStart",
    t."plannedEnd",
    t."actualStart",
    t."actualEnd",
    t."progress",
    t."priority",
    t."assignedEmployeeId",
    e."key" AS "assignedEmployeeKey",
    e."name" AS "assignedEmployeeName",
    t."parentTaskId",
    pt."key" AS "parentTaskKey",
    t."sortOrder",
    COALESCE(wo_counts."workOrderCount", 0)::int AS "workOrderCount",
    COALESCE(pred_counts."predecessorCount", 0)::int AS "predecessorCount",
    COALESCE(succ_counts."successorCount", 0)::int AS "successorCount",
    t."createdAt",
    t."updatedAt",
    COALESCE(created_by."loginName", t."createdBy"::text) AS "createdBy",
    COALESCE(updated_by."loginName", t."updatedBy"::text) AS "updatedBy"
  FROM "projectTask" t
  LEFT JOIN "employee" e ON e."id" = t."assignedEmployeeId"
  LEFT JOIN "projectTask" pt ON pt."id" = t."parentTaskId"
  LEFT JOIN "users" created_by ON created_by."id" = t."createdBy"
  LEFT JOIN "users" updated_by ON updated_by."id" = t."updatedBy"
  LEFT JOIN (
    SELECT "projectTaskId", COUNT(*)::int AS "workOrderCount"
    FROM "projectTaskWorkOrder"
    GROUP BY "projectTaskId"
  ) wo_counts ON wo_counts."projectTaskId" = t."id"
  LEFT JOIN (
    SELECT "successorTaskId", COUNT(*)::int AS "predecessorCount"
    FROM "projectTaskDependency"
    GROUP BY "successorTaskId"
  ) pred_counts ON pred_counts."successorTaskId" = t."id"
  LEFT JOIN (
    SELECT "predecessorTaskId", COUNT(*)::int AS "successorCount"
    FROM "projectTaskDependency"
    GROUP BY "predecessorTaskId"
  ) succ_counts ON succ_counts."predecessorTaskId" = t."id"
`;

router.get("/", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { projectId } = req.params;
  if (!isUuid(projectId)) {
    res.status(400).json({ error: "invalid_project_id" });
    return;
  }
  try {
    const project = await getAccessibleProject(userId, projectId);
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }
    const { rows } = await pool.query<ProjectTaskRow>(
      `
      ${selectTasksSql}
      WHERE t."projectId" = $1::uuid
      ORDER BY t."sortOrder" ASC, t."plannedStart" ASC
      `,
      [projectId],
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.get("/:taskId", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { projectId, taskId } = req.params;
  if (!isUuid(projectId) || !isUuid(taskId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const project = await getAccessibleProject(userId, projectId);
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }
    const { rows } = await pool.query<ProjectTaskRow>(
      `
      ${selectTasksSql}
      WHERE t."id" = $1::uuid AND t."projectId" = $2::uuid
      LIMIT 1
      `,
      [taskId, projectId],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  if (!isUuid(projectId)) {
    res.status(400).json({ error: "invalid_project_id" });
    return;
  }
  const parsed = parseTaskBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const project = await client.query<{ id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "project"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [projectId, meta.userId],
      );
      if (!project.rows[0]) return null;
      const projectSiteId = project.rows[0].siteId;

      if (parsed.assignedEmployeeId) {
        const emp = await client.query<{ id: string }>(
          `
          SELECT "id" FROM "employee"
          WHERE "id" = $1::uuid AND "siteId" = $2::uuid
          LIMIT 1
          `,
          [parsed.assignedEmployeeId, projectSiteId],
        );
        if (!emp.rows[0]) throw new Error("invalid_assigned_employee");
      }

      if (parsed.parentTaskId) {
        const parent = await client.query<{ id: string }>(
          `
          SELECT "id" FROM "projectTask"
          WHERE "id" = $1::uuid AND "projectId" = $2::uuid
          LIMIT 1
          `,
          [parsed.parentTaskId, projectId],
        );
        if (!parent.rows[0]) throw new Error("invalid_parent_task");
      }

      const id = randomUUID();
      await client.query(
        `
        INSERT INTO "projectTask" (
          "id", "projectId", "key", "name", "description", "taskType", "status",
          "plannedStart", "plannedEnd", "actualStart", "actualEnd",
          "progress", "priority", "assignedEmployeeId", "parentTaskId", "sortOrder"
        )
        VALUES (
          $1::uuid, $2::uuid, $3, $4, $5, $6, $7,
          $8::timestamptz, $9::timestamptz, $10::timestamptz, $11::timestamptz,
          $12, $13, $14::uuid, $15::uuid, $16
        )
        `,
        [
          id,
          projectId,
          parsed.key,
          parsed.name,
          parsed.description,
          parsed.taskType,
          parsed.status,
          parsed.plannedStart,
          parsed.plannedEnd,
          parsed.actualStart,
          parsed.actualEnd,
          parsed.progress,
          parsed.priority,
          parsed.assignedEmployeeId,
          parsed.parentTaskId,
          parsed.sortOrder,
        ],
      );

      const { rows } = await client.query<ProjectTaskRow>(
        `
        ${selectTasksSql}
        WHERE t."id" = $1::uuid
        LIMIT 1
        `,
        [id],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "invalid_assigned_employee") {
      res.status(400).json({ error: "invalid_assigned_employee" });
      return;
    }
    if (message === "invalid_parent_task") {
      res.status(400).json({ error: "invalid_parent_task" });
      return;
    }
    sendPgError(res, err);
  }
});

router.put("/:taskId", async (req: Request, res: Response) => {
  const { projectId, taskId } = req.params;
  if (!isUuid(projectId) || !isUuid(taskId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = parseTaskBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const project = await client.query<{ id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId"
        FROM "project"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [projectId, meta.userId],
      );
      if (!project.rows[0]) return null;
      const projectSiteId = project.rows[0].siteId;

      const existing = await client.query<{ id: string }>(
        `
        SELECT "id" FROM "projectTask"
        WHERE "id" = $1::uuid AND "projectId" = $2::uuid
        LIMIT 1
        `,
        [taskId, projectId],
      );
      if (!existing.rows[0]) throw new Error("not_found");

      if (parsed.assignedEmployeeId) {
        const emp = await client.query<{ id: string }>(
          `
          SELECT "id" FROM "employee"
          WHERE "id" = $1::uuid AND "siteId" = $2::uuid
          LIMIT 1
          `,
          [parsed.assignedEmployeeId, projectSiteId],
        );
        if (!emp.rows[0]) throw new Error("invalid_assigned_employee");
      }

      if (parsed.parentTaskId) {
        if (parsed.parentTaskId === taskId) throw new Error("invalid_parent_task");
        const parent = await client.query<{ id: string }>(
          `
          SELECT "id" FROM "projectTask"
          WHERE "id" = $1::uuid AND "projectId" = $2::uuid
          LIMIT 1
          `,
          [parsed.parentTaskId, projectId],
        );
        if (!parent.rows[0]) throw new Error("invalid_parent_task");
      }

      await client.query(
        `
        UPDATE "projectTask"
        SET
          "key" = $1,
          "name" = $2,
          "description" = $3,
          "taskType" = $4,
          "status" = $5,
          "plannedStart" = $6::timestamptz,
          "plannedEnd" = $7::timestamptz,
          "actualStart" = $8::timestamptz,
          "actualEnd" = $9::timestamptz,
          "progress" = $10,
          "priority" = $11,
          "assignedEmployeeId" = $12::uuid,
          "parentTaskId" = $13::uuid,
          "sortOrder" = $14
        WHERE "id" = $15::uuid
        `,
        [
          parsed.key,
          parsed.name,
          parsed.description,
          parsed.taskType,
          parsed.status,
          parsed.plannedStart,
          parsed.plannedEnd,
          parsed.actualStart,
          parsed.actualEnd,
          parsed.progress,
          parsed.priority,
          parsed.assignedEmployeeId,
          parsed.parentTaskId,
          parsed.sortOrder,
          taskId,
        ],
      );

      const { rows } = await client.query<ProjectTaskRow>(
        `
        ${selectTasksSql}
        WHERE t."id" = $1::uuid
        LIMIT 1
        `,
        [taskId],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (message === "invalid_assigned_employee") {
      res.status(400).json({ error: "invalid_assigned_employee" });
      return;
    }
    if (message === "invalid_parent_task") {
      res.status(400).json({ error: "invalid_parent_task" });
      return;
    }
    sendPgError(res, err);
  }
});

router.patch("/:taskId/progress", async (req: Request, res: Response) => {
  const { projectId, taskId } = req.params;
  if (!isUuid(projectId) || !isUuid(taskId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const progress = req.body?.progress;
  if (typeof progress !== "number" || !Number.isInteger(progress) || progress < 0 || progress > 100) {
    res.status(400).json({ error: "invalid_progress" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const project = await client.query<{ id: string }>(
        `
        SELECT "id" FROM "project"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [projectId, meta.userId],
      );
      if (!project.rows[0]) return null;

      await client.query(
        `
        UPDATE "projectTask"
        SET "progress" = $1
        WHERE "id" = $2::uuid AND "projectId" = $3::uuid
        `,
        [progress, taskId, projectId],
      );

      const { rows } = await client.query<ProjectTaskRow>(
        `
        ${selectTasksSql}
        WHERE t."id" = $1::uuid
        LIMIT 1
        `,
        [taskId],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(row);
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

router.delete("/:taskId", async (req: Request, res: Response) => {
  const { projectId, taskId } = req.params;
  if (!isUuid(projectId) || !isUuid(taskId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const deleted = await withAuditContext(meta, async (client) => {
      const project = await client.query<{ id: string }>(
        `
        SELECT "id" FROM "project"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [projectId, meta.userId],
      );
      if (!project.rows[0]) return 0;

      const result: QueryResult = await client.query(
        `
        DELETE FROM "projectTask"
        WHERE "id" = $1::uuid AND "projectId" = $2::uuid
        `,
        [taskId, projectId],
      );
      return result.rowCount ?? 0;
    });
    if (deleted === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

router.get("/:taskId/dependencies", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { projectId, taskId } = req.params;
  if (!isUuid(projectId) || !isUuid(taskId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const project = await getAccessibleProject(userId, projectId);
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }
    const { rows } = await pool.query<TaskDependencyRow>(
      `
      SELECT
        d."id",
        d."predecessorTaskId",
        pred."key" AS "predecessorTaskKey",
        pred."name" AS "predecessorTaskName",
        d."successorTaskId",
        succ."key" AS "successorTaskKey",
        succ."name" AS "successorTaskName",
        d."dependencyType",
        d."lagDays",
        d."createdAt",
        COALESCE(u."loginName", d."createdBy"::text) AS "createdBy"
      FROM "projectTaskDependency" d
      JOIN "projectTask" pred ON pred."id" = d."predecessorTaskId"
      JOIN "projectTask" succ ON succ."id" = d."successorTaskId"
      LEFT JOIN "users" u ON u."id" = d."createdBy"
      WHERE (d."predecessorTaskId" = $1::uuid OR d."successorTaskId" = $1::uuid)
        AND pred."projectId" = $2::uuid
      ORDER BY d."createdAt" ASC
      `,
      [taskId, projectId],
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/:taskId/dependencies", async (req: Request, res: Response) => {
  const { projectId, taskId } = req.params;
  if (!isUuid(projectId) || !isUuid(taskId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const predecessorTaskId = req.body?.predecessorTaskId;
  const dependencyTypeRaw = req.body?.dependencyType ?? "finish_to_start";
  const lagDaysRaw = req.body?.lagDays ?? 0;

  if (!isUuid(predecessorTaskId)) {
    res.status(400).json({ error: "invalid_predecessor_task_id" });
    return;
  }
  if (!isDependencyType(dependencyTypeRaw)) {
    res.status(400).json({ error: "invalid_dependency_type" });
    return;
  }
  if (typeof lagDaysRaw !== "number" || !Number.isInteger(lagDaysRaw)) {
    res.status(400).json({ error: "invalid_lag_days" });
    return;
  }
  if (predecessorTaskId === taskId) {
    res.status(400).json({ error: "self_dependency_not_allowed" });
    return;
  }

  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const project = await client.query<{ id: string }>(
        `
        SELECT "id" FROM "project"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [projectId, meta.userId],
      );
      if (!project.rows[0]) return null;

      const predecessor = await client.query<{ id: string }>(
        `
        SELECT "id" FROM "projectTask"
        WHERE "id" = $1::uuid AND "projectId" = $2::uuid
        LIMIT 1
        `,
        [predecessorTaskId, projectId],
      );
      if (!predecessor.rows[0]) throw new Error("invalid_predecessor_task");

      const successor = await client.query<{ id: string }>(
        `
        SELECT "id" FROM "projectTask"
        WHERE "id" = $1::uuid AND "projectId" = $2::uuid
        LIMIT 1
        `,
        [taskId, projectId],
      );
      if (!successor.rows[0]) throw new Error("invalid_successor_task");

      const id = randomUUID();
      await client.query(
        `
        INSERT INTO "projectTaskDependency" (
          "id", "predecessorTaskId", "successorTaskId", "dependencyType", "lagDays"
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
        `,
        [id, predecessorTaskId, taskId, dependencyTypeRaw, lagDaysRaw],
      );

      const { rows } = await client.query<TaskDependencyRow>(
        `
        SELECT
          d."id",
          d."predecessorTaskId",
          pred."key" AS "predecessorTaskKey",
          pred."name" AS "predecessorTaskName",
          d."successorTaskId",
          succ."key" AS "successorTaskKey",
          succ."name" AS "successorTaskName",
          d."dependencyType",
          d."lagDays",
          d."createdAt",
          COALESCE(u."loginName", d."createdBy"::text) AS "createdBy"
        FROM "projectTaskDependency" d
        JOIN "projectTask" pred ON pred."id" = d."predecessorTaskId"
        JOIN "projectTask" succ ON succ."id" = d."successorTaskId"
        LEFT JOIN "users" u ON u."id" = d."createdBy"
        WHERE d."id" = $1::uuid
        LIMIT 1
        `,
        [id],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "invalid_predecessor_task" || message === "invalid_successor_task") {
      res.status(400).json({ error: message });
      return;
    }
    sendPgError(res, err);
  }
});

router.delete("/:taskId/dependencies/:depId", async (req: Request, res: Response) => {
  const { projectId, taskId, depId } = req.params;
  if (!isUuid(projectId) || !isUuid(taskId) || !isUuid(depId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const deleted = await withAuditContext(meta, async (client) => {
      const project = await client.query<{ id: string }>(
        `
        SELECT "id" FROM "project"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [projectId, meta.userId],
      );
      if (!project.rows[0]) return 0;

      const result: QueryResult = await client.query(
        `
        DELETE FROM "projectTaskDependency"
        WHERE "id" = $1::uuid
          AND ("predecessorTaskId" = $2::uuid OR "successorTaskId" = $2::uuid)
        `,
        [depId, taskId],
      );
      return result.rowCount ?? 0;
    });
    if (deleted === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

router.get("/:taskId/work-orders", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { projectId, taskId } = req.params;
  if (!isUuid(projectId) || !isUuid(taskId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const project = await getAccessibleProject(userId, projectId);
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }
    const { rows } = await pool.query<TaskWorkOrderLinkRow>(
      `
      SELECT
        l."id",
        l."projectTaskId",
        l."workOrderId",
        w."orderNumber" AS "workOrderNumber",
        w."name" AS "workOrderName",
        w."status" AS "workOrderStatus",
        l."linkType",
        l."createdAt",
        COALESCE(u."loginName", l."createdBy"::text) AS "createdBy"
      FROM "projectTaskWorkOrder" l
      JOIN "workOrder" w ON w."id" = l."workOrderId"
      JOIN "projectTask" t ON t."id" = l."projectTaskId"
      LEFT JOIN "users" u ON u."id" = l."createdBy"
      WHERE l."projectTaskId" = $1::uuid
        AND t."projectId" = $2::uuid
      ORDER BY w."orderNumber" ASC
      `,
      [taskId, projectId],
    );
    res.json(rows);
  } catch (err) {
    sendPgError(res, err);
  }
});

router.post("/:taskId/work-orders", async (req: Request, res: Response) => {
  const { projectId, taskId } = req.params;
  if (!isUuid(projectId) || !isUuid(taskId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const workOrderId = req.body?.workOrderId;
  const linkTypeRaw = req.body?.linkType ?? "implements";

  if (!isUuid(workOrderId)) {
    res.status(400).json({ error: "invalid_work_order_id" });
    return;
  }
  if (!isLinkType(linkTypeRaw)) {
    res.status(400).json({ error: "invalid_link_type" });
    return;
  }

  try {
    const meta = auditMeta(req);
    const row = await withAuditContext(meta, async (client) => {
      const project = await client.query<{ id: string; siteId: string }>(
        `
        SELECT "id", "siteId"::text AS "siteId" FROM "project"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [projectId, meta.userId],
      );
      if (!project.rows[0]) return null;

      const task = await client.query<{ id: string }>(
        `
        SELECT "id" FROM "projectTask"
        WHERE "id" = $1::uuid AND "projectId" = $2::uuid
        LIMIT 1
        `,
        [taskId, projectId],
      );
      if (!task.rows[0]) throw new Error("task_not_found");

      const workOrder = await client.query<{ id: string }>(
        `
        SELECT "id" FROM "workOrder"
        WHERE "id" = $1::uuid AND "siteId" = $2::uuid
        LIMIT 1
        `,
        [workOrderId, project.rows[0].siteId],
      );
      if (!workOrder.rows[0]) throw new Error("work_order_not_found");

      const id = randomUUID();
      await client.query(
        `
        INSERT INTO "projectTaskWorkOrder" (
          "id", "projectTaskId", "workOrderId", "linkType"
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
        `,
        [id, taskId, workOrderId, linkTypeRaw],
      );

      const { rows } = await client.query<TaskWorkOrderLinkRow>(
        `
        SELECT
          l."id",
          l."projectTaskId",
          l."workOrderId",
          w."orderNumber" AS "workOrderNumber",
          w."name" AS "workOrderName",
          w."status" AS "workOrderStatus",
          l."linkType",
          l."createdAt",
          COALESCE(u."loginName", l."createdBy"::text) AS "createdBy"
        FROM "projectTaskWorkOrder" l
        JOIN "workOrder" w ON w."id" = l."workOrderId"
        LEFT JOIN "users" u ON u."id" = l."createdBy"
        WHERE l."id" = $1::uuid
        LIMIT 1
        `,
        [id],
      );
      return rows[0] ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(201).json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (message === "task_not_found" || message === "work_order_not_found") {
      res.status(404).json({ error: message });
      return;
    }
    sendPgError(res, err);
  }
});

router.delete("/:taskId/work-orders/:linkId", async (req: Request, res: Response) => {
  const { projectId, taskId, linkId } = req.params;
  if (!isUuid(projectId) || !isUuid(taskId) || !isUuid(linkId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const meta = auditMeta(req);
    const deleted = await withAuditContext(meta, async (client) => {
      const project = await client.query<{ id: string }>(
        `
        SELECT "id" FROM "project"
        WHERE "id" = $1::uuid
          AND ${siteAccessSql('"siteId"', "$2")}
        `,
        [projectId, meta.userId],
      );
      if (!project.rows[0]) return 0;

      const result: QueryResult = await client.query(
        `
        DELETE FROM "projectTaskWorkOrder"
        WHERE "id" = $1::uuid AND "projectTaskId" = $2::uuid
        `,
        [linkId, taskId],
      );
      return result.rowCount ?? 0;
    });
    if (deleted === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    if ((err as Error).message === "missing_session_user") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    sendPgError(res, err);
  }
});

export const projectTasksRouter = router;
