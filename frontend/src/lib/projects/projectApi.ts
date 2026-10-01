import { apiFetch } from "../api";
import type {
  Project,
  ProjectTask,
  TaskDependency,
  TaskWorkOrderLink,
  GanttData,
  ProjectCreateInput,
  TaskCreateInput,
  DependencyType,
  LinkType,
} from "./projectTypes";

export async function fetchProjects(): Promise<Project[]> {
  const res = await apiFetch("/api/projects");
  if (!res.ok) throw new Error("fetch_projects_failed");
  return res.json();
}

export async function fetchProject(id: string): Promise<Project> {
  const res = await apiFetch(`/api/projects/${id}`);
  if (!res.ok) throw new Error("fetch_project_failed");
  return res.json();
}

export async function createProject(input: ProjectCreateInput): Promise<Project> {
  const res = await apiFetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "unknown" }));
    throw new Error(error.error ?? "create_project_failed");
  }
  return res.json();
}

export async function updateProject(id: string, input: ProjectCreateInput): Promise<Project> {
  const res = await apiFetch(`/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "unknown" }));
    throw new Error(error.error ?? "update_project_failed");
  }
  return res.json();
}

export async function deleteProject(id: string): Promise<void> {
  const res = await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("delete_project_failed");
}

export async function fetchProjectTasks(projectId: string): Promise<ProjectTask[]> {
  const res = await apiFetch(`/api/projects/${projectId}/tasks`);
  if (!res.ok) throw new Error("fetch_tasks_failed");
  return res.json();
}

export async function fetchProjectTask(projectId: string, taskId: string): Promise<ProjectTask> {
  const res = await apiFetch(`/api/projects/${projectId}/tasks/${taskId}`);
  if (!res.ok) throw new Error("fetch_task_failed");
  return res.json();
}

export async function createProjectTask(
  projectId: string,
  input: TaskCreateInput,
): Promise<ProjectTask> {
  const res = await apiFetch(`/api/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "unknown" }));
    throw new Error(error.error ?? "create_task_failed");
  }
  return res.json();
}

export async function updateProjectTask(
  projectId: string,
  taskId: string,
  input: TaskCreateInput,
): Promise<ProjectTask> {
  const res = await apiFetch(`/api/projects/${projectId}/tasks/${taskId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "unknown" }));
    throw new Error(error.error ?? "update_task_failed");
  }
  return res.json();
}

export async function updateTaskProgress(
  projectId: string,
  taskId: string,
  progress: number,
): Promise<ProjectTask> {
  const res = await apiFetch(`/api/projects/${projectId}/tasks/${taskId}/progress`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ progress }),
  });
  if (!res.ok) throw new Error("update_progress_failed");
  return res.json();
}

export async function deleteProjectTask(projectId: string, taskId: string): Promise<void> {
  const res = await apiFetch(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("delete_task_failed");
}

export async function fetchTaskDependencies(
  projectId: string,
  taskId: string,
): Promise<TaskDependency[]> {
  const res = await apiFetch(`/api/projects/${projectId}/tasks/${taskId}/dependencies`);
  if (!res.ok) throw new Error("fetch_dependencies_failed");
  return res.json();
}

export async function createTaskDependency(
  projectId: string,
  taskId: string,
  predecessorTaskId: string,
  dependencyType: DependencyType = "finish_to_start",
  lagDays: number = 0,
): Promise<TaskDependency> {
  const res = await apiFetch(`/api/projects/${projectId}/tasks/${taskId}/dependencies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ predecessorTaskId, dependencyType, lagDays }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "unknown" }));
    throw new Error(error.error ?? "create_dependency_failed");
  }
  return res.json();
}

export async function deleteTaskDependency(
  projectId: string,
  taskId: string,
  depId: string,
): Promise<void> {
  const res = await apiFetch(`/api/projects/${projectId}/tasks/${taskId}/dependencies/${depId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("delete_dependency_failed");
}

export async function fetchTaskWorkOrders(
  projectId: string,
  taskId: string,
): Promise<TaskWorkOrderLink[]> {
  const res = await apiFetch(`/api/projects/${projectId}/tasks/${taskId}/work-orders`);
  if (!res.ok) throw new Error("fetch_work_orders_failed");
  return res.json();
}

export async function linkTaskWorkOrder(
  projectId: string,
  taskId: string,
  workOrderId: string,
  linkType: LinkType = "implements",
): Promise<TaskWorkOrderLink> {
  const res = await apiFetch(`/api/projects/${projectId}/tasks/${taskId}/work-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workOrderId, linkType }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "unknown" }));
    throw new Error(error.error ?? "link_work_order_failed");
  }
  return res.json();
}

export async function unlinkTaskWorkOrder(
  projectId: string,
  taskId: string,
  linkId: string,
): Promise<void> {
  const res = await apiFetch(`/api/projects/${projectId}/tasks/${taskId}/work-orders/${linkId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("unlink_work_order_failed");
}

export async function fetchGanttData(projectId: string): Promise<GanttData> {
  const res = await apiFetch(`/api/projects/${projectId}/gantt`);
  if (!res.ok) throw new Error("fetch_gantt_failed");
  return res.json();
}
