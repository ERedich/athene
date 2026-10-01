import { Router, type Request, type Response } from "express";

import { pool } from "./db.js";
import { siteAccessSql } from "./siteAccess.js";
import type { ProjectTaskRow, TaskDependencyRow, TaskWorkOrderLinkRow } from "./projectTasks.js";

export type GanttTaskRow = ProjectTaskRow & {
  dependencies: {
    id: string;
    predecessorTaskId: string;
    predecessorTaskKey: string;
    dependencyType: string;
    lagDays: number;
  }[];
  workOrders: {
    id: string;
    workOrderId: string;
    workOrderNumber: number;
    workOrderName: string;
    workOrderStatus: string;
    linkType: string;
  }[];
};

export type GanttDataResponse = {
  project: {
    id: string;
    key: string;
    name: string;
    plannedStart: string;
    plannedEnd: string | null;
    status: string;
  };
  tasks: GanttTaskRow[];
  minDate: string;
  maxDate: string;
};

const router = Router({ mergeParams: true });

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRe.test(value);
}

function sendPgError(res: Response, err: unknown) {
  const e = err as { code?: string; detail?: string; message?: string };
  console.error(err);
  res.status(500).json({ error: "internal_error" });
}

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
    const projectResult = await pool.query<{
      id: string;
      key: string;
      name: string;
      plannedStart: string;
      plannedEnd: string | null;
      status: string;
    }>(
      `
      SELECT
        p."id",
        p."key",
        p."name",
        p."plannedStart",
        p."plannedEnd",
        p."status"
      FROM "project" p
      WHERE p."id" = $1::uuid
        AND ${siteAccessSql('p."siteId"', "$2")}
      LIMIT 1
      `,
      [projectId, userId],
    );
    const project = projectResult.rows[0];
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }

    const tasksResult = await pool.query<ProjectTaskRow>(
      `
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
      WHERE t."projectId" = $1::uuid
      ORDER BY t."sortOrder" ASC, t."plannedStart" ASC
      `,
      [projectId],
    );

    const dependenciesResult = await pool.query<{
      id: string;
      predecessorTaskId: string;
      predecessorTaskKey: string;
      successorTaskId: string;
      dependencyType: string;
      lagDays: number;
    }>(
      `
      SELECT
        d."id",
        d."predecessorTaskId",
        pred."key" AS "predecessorTaskKey",
        d."successorTaskId",
        d."dependencyType",
        d."lagDays"
      FROM "projectTaskDependency" d
      JOIN "projectTask" pred ON pred."id" = d."predecessorTaskId"
      JOIN "projectTask" succ ON succ."id" = d."successorTaskId"
      WHERE pred."projectId" = $1::uuid
      `,
      [projectId],
    );

    const workOrderLinksResult = await pool.query<{
      projectTaskId: string;
      id: string;
      workOrderId: string;
      workOrderNumber: number;
      workOrderName: string;
      workOrderStatus: string;
      linkType: string;
    }>(
      `
      SELECT
        l."projectTaskId",
        l."id",
        l."workOrderId",
        w."orderNumber" AS "workOrderNumber",
        w."name" AS "workOrderName",
        w."status" AS "workOrderStatus",
        l."linkType"
      FROM "projectTaskWorkOrder" l
      JOIN "workOrder" w ON w."id" = l."workOrderId"
      JOIN "projectTask" t ON t."id" = l."projectTaskId"
      WHERE t."projectId" = $1::uuid
      ORDER BY w."orderNumber" ASC
      `,
      [projectId],
    );

    const dependencyMap = new Map<string, typeof dependenciesResult.rows>();
    for (const dep of dependenciesResult.rows) {
      const existing = dependencyMap.get(dep.successorTaskId) ?? [];
      existing.push(dep);
      dependencyMap.set(dep.successorTaskId, existing);
    }

    const workOrderMap = new Map<string, typeof workOrderLinksResult.rows>();
    for (const wo of workOrderLinksResult.rows) {
      const existing = workOrderMap.get(wo.projectTaskId) ?? [];
      existing.push(wo);
      workOrderMap.set(wo.projectTaskId, existing);
    }

    const ganttTasks: GanttTaskRow[] = tasksResult.rows.map((task) => ({
      ...task,
      dependencies: (dependencyMap.get(task.id) ?? []).map((d) => ({
        id: d.id,
        predecessorTaskId: d.predecessorTaskId,
        predecessorTaskKey: d.predecessorTaskKey,
        dependencyType: d.dependencyType,
        lagDays: d.lagDays,
      })),
      workOrders: (workOrderMap.get(task.id) ?? []).map((wo) => ({
        id: wo.id,
        workOrderId: wo.workOrderId,
        workOrderNumber: wo.workOrderNumber,
        workOrderName: wo.workOrderName,
        workOrderStatus: wo.workOrderStatus,
        linkType: wo.linkType,
      })),
    }));

    let minDate = project.plannedStart;
    let maxDate = project.plannedEnd ?? project.plannedStart;

    for (const task of ganttTasks) {
      if (task.plannedStart < minDate) minDate = task.plannedStart;
      if (task.plannedEnd && task.plannedEnd > maxDate) maxDate = task.plannedEnd;
      if (task.actualStart && task.actualStart < minDate) minDate = task.actualStart;
      if (task.actualEnd && task.actualEnd > maxDate) maxDate = task.actualEnd;
    }

    const response: GanttDataResponse = {
      project,
      tasks: ganttTasks,
      minDate,
      maxDate,
    };

    res.json(response);
  } catch (err) {
    sendPgError(res, err);
  }
});

export const projectGanttRouter = router;
