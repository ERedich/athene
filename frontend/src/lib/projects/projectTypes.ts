export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";
export type TaskType = "task" | "milestone";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type DependencyType =
  | "finish_to_start"
  | "start_to_start"
  | "finish_to_finish"
  | "start_to_finish";
export type LinkType = "implements" | "related" | "blocks";

export type Project = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  status: ProjectStatus;
  plannedStart: string;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  responsibleEmployeeId: string | null;
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  costCenterId: string | null;
  costCenterKey: string | null;
  costCenterName: string | null;
  taskCount: number;
  milestoneCount: number;
  completedTaskCount: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type ProjectTask = {
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

export type TaskDependency = {
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

export type TaskWorkOrderLink = {
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

export type GanttTask = ProjectTask & {
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

export type GanttData = {
  project: {
    id: string;
    key: string;
    name: string;
    plannedStart: string;
    plannedEnd: string | null;
    status: string;
  };
  tasks: GanttTask[];
  minDate: string;
  maxDate: string;
};

export type ProjectCreateInput = {
  key: string;
  name: string;
  description?: string | null;
  siteId: string;
  status?: ProjectStatus;
  plannedStart: string;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  responsibleEmployeeId?: string | null;
  costCenterId?: string | null;
};

export type TaskCreateInput = {
  key: string;
  name: string;
  description?: string | null;
  taskType?: TaskType;
  status?: TaskStatus;
  plannedStart: string;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  progress?: number;
  priority?: TaskPriority;
  assignedEmployeeId?: string | null;
  parentTaskId?: string | null;
  sortOrder?: number;
};
