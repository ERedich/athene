import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { Button } from "primereact/button";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { GanttChart } from "../components/gantt/GanttChart";
import { ProjectTaskDialog } from "../components/projects/ProjectTaskDialog";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { APP_HEADER_ACTION_NAV_ITEM, APP_HEADER_ACTION_NAV_ITEM_CREATE } from "../lib/headerActionClasses";
import { fetchGanttData, deleteProjectTask, fetchProject } from "../lib/projects/projectApi";
import type { GanttData, GanttTask, Project, ProjectTask } from "../lib/projects/projectTypes";

export function ProjectDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const toastRef = useRef<Toast>(null);
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();

  const [project, setProject] = useState<Project | null>(null);
  const [ganttData, setGanttData] = useState<GanttData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [taskDialogVisible, setTaskDialogVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [projectData, gantt] = await Promise.all([
        fetchProject(projectId),
        fetchGanttData(projectId),
      ]);
      setProject(projectData);
      setGanttData(gantt);
    } catch (err) {
      toastRef.current?.show({
        severity: "error",
        summary: t("common.error"),
        detail: t("projects.loadError"),
        life: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredTasks = useMemo(() => {
    if (!ganttData) return [];
    if (!searchTerm.trim()) return ganttData.tasks;
    const lower = searchTerm.toLowerCase();
    return ganttData.tasks.filter(
      (task) =>
        task.key.toLowerCase().includes(lower) ||
        task.name.toLowerCase().includes(lower),
    );
  }, [ganttData, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filteredTasks.length);
    return () => setHeaderRowCount(null);
  }, [filteredTasks.length, setHeaderRowCount]);

  const handleNewTask = useCallback(() => {
    setEditingTask(null);
    setTaskDialogVisible(true);
  }, []);

  const handleEditTask = useCallback((task: GanttTask) => {
    setEditingTask(task);
    setTaskDialogVisible(true);
  }, []);

  const handleDeleteTask = useCallback(
    (task: GanttTask) => {
      if (!projectId) return;
      confirmDialog({
        message: t("projects.task.deleteConfirm", { name: task.name }),
        header: t("common.confirmDelete"),
        icon: "pi pi-exclamation-triangle",
        acceptClassName: "p-button-danger",
        accept: async () => {
          try {
            await deleteProjectTask(projectId, task.id);
            toastRef.current?.show({
              severity: "success",
              summary: t("common.success"),
              detail: t("projects.task.deleted"),
              life: 3000,
            });
            loadData();
          } catch (err) {
            toastRef.current?.show({
              severity: "error",
              summary: t("common.error"),
              detail: t("projects.task.deleteError"),
              life: 3000,
            });
          }
        },
      });
    },
    [projectId, t, loadData],
  );

  const handleBack = useCallback(() => {
    navigate("/projects");
  }, [navigate]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button
            type="button"
            className={APP_HEADER_ACTION_NAV_ITEM}
            onClick={handleBack}
          >
            <i className="pi pi-arrow-left mr-1" />
            {t("common.back")}
          </button>
        </li>
        <li>
          <button
            type="button"
            className={`${APP_HEADER_ACTION_NAV_ITEM} ${APP_HEADER_ACTION_NAV_ITEM_CREATE}`}
            onClick={handleNewTask}
          >
            {t("projects.task.new")}
          </button>
        </li>
        <li className="ml-auto">
          <IconField>
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("common.search")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [t, searchTerm, handleBack, handleNewTask, setHeaderActions]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <i className="pi pi-spin pi-spinner text-4xl" />
      </div>
    );
  }

  if (!project || !ganttData) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <i className="pi pi-exclamation-triangle text-4xl text-yellow-500" />
        <p>{t("projects.notFound")}</p>
        <Button label={t("common.back")} onClick={handleBack} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Toast ref={toastRef} />
      <ConfirmDialog />

      <div className="border-b border-surface-200 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="m-0 text-lg font-semibold">
              <span className="font-mono text-primary">{project.key}</span> – {project.name}
            </h2>
            <p className="m-0 mt-1 text-sm text-surface-500">
              {project.siteKey} – {project.siteName}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="block text-xs uppercase text-surface-500">
                {t("projects.progress")}
              </span>
              <span className="text-xl font-semibold">{project.progress}%</span>
            </div>
            <div className="text-right">
              <span className="block text-xs uppercase text-surface-500">
                {t("projects.tasksLabel")}
              </span>
              <span className="text-xl font-semibold">
                {project.taskCount} / {project.milestoneCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <GanttChart
          tasks={filteredTasks}
          minDate={ganttData.minDate}
          maxDate={ganttData.maxDate}
          onTaskClick={handleEditTask}
          onTaskDoubleClick={handleEditTask}
        />
      </div>

      {projectId && (
        <ProjectTaskDialog
          visible={taskDialogVisible}
          projectId={projectId}
          task={editingTask}
          tasks={ganttData.tasks}
          onHide={() => setTaskDialogVisible(false)}
          onSaved={() => {
            setTaskDialogVisible(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}
