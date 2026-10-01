import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { ProgressBar } from "primereact/progressbar";
import { Tag } from "primereact/tag";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { ProjectDialog } from "../components/projects/ProjectDialog";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import {
  createHeaderActionNavItem,
  deleteHeaderActionNavItem,
} from "../lib/headerActionClasses";
import { fetchProjects, deleteProject } from "../lib/projects/projectApi";
import type { Project, ProjectStatus } from "../lib/projects/projectTypes";
import { readableSiteColor } from "../lib/siteColor";
import { useTableContextMenu } from "../lib/useTableContextMenu";

function statusSeverity(status: ProjectStatus): "info" | "success" | "warning" | "danger" | "secondary" {
  switch (status) {
    case "planning":
      return "info";
    case "active":
      return "success";
    case "on_hold":
      return "warning";
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "secondary";
  }
}

export function ProjectsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toastRef = useRef<Toast>(null);
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProjects();
      setProjects(data);
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
  }, [t]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    if (!searchTerm.trim()) return projects;
    const lower = searchTerm.toLowerCase();
    return projects.filter(
      (p) =>
        p.key.toLowerCase().includes(lower) ||
        p.name.toLowerCase().includes(lower) ||
        p.siteKey.toLowerCase().includes(lower) ||
        p.siteName.toLowerCase().includes(lower),
    );
  }, [projects, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filteredProjects.length);
    return () => setHeaderRowCount(null);
  }, [filteredProjects.length, setHeaderRowCount]);

  const handleNew = useCallback(() => {
    setEditingProject(null);
    setDialogVisible(true);
  }, []);

  const handleEdit = useCallback((project: Project) => {
    setEditingProject(project);
    setDialogVisible(true);
  }, []);

  const handleDelete = useCallback(
    (project: Project) => {
      confirmDialog({
        message: t("projects.deleteConfirm", { name: project.name }),
        header: t("common.confirmDelete"),
        icon: "pi pi-exclamation-triangle",
        acceptClassName: "p-button-danger",
        accept: async () => {
          try {
            await deleteProject(project.id);
            toastRef.current?.show({
              severity: "success",
              summary: t("common.success"),
              detail: t("projects.deleted"),
              life: 3000,
            });
            loadProjects();
          } catch (err) {
            toastRef.current?.show({
              severity: "error",
              summary: t("common.error"),
              detail: t("projects.deleteError"),
              life: 3000,
            });
          }
        },
      });
    },
    [t, loadProjects],
  );

  const handleOpenGantt = useCallback(
    (project: Project) => {
      navigate(`/projects/${project.id}`);
    },
    [navigate],
  );

  const extraMenuItems = useCallback(
    (row: Project | null) => {
      if (!row) return [];
      return [
        {
          label: t("projects.openGantt"),
          icon: "pi pi-chart-bar",
          command: () => handleOpenGantt(row),
        },
      ];
    },
    [t, handleOpenGantt],
  );

  const tableCtx = useTableContextMenu<Project>({
    labels: {
      new: t("common.new"),
      edit: t("common.edit"),
      delete: t("common.delete"),
    },
    handlers: {
      onCreate: handleNew,
      onEdit: handleEdit,
      onDelete: handleDelete,
    },
    selection: selectedProject,
    setSelection: setSelectedProject,
    extraItems: extraMenuItems,
  });

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button
            type="button"
            className={createHeaderActionNavItem}
            onClick={handleNew}
          >
            {t("common.new")}
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteHeaderActionNavItem}
            disabled={!selectedProject}
            onClick={() => selectedProject && handleDelete(selectedProject)}
          >
            {t("common.delete")}
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
  }, [t, searchTerm, selectedProject, handleNew, handleDelete, setHeaderActions]);

  const langDe = i18n.language?.toLowerCase().startsWith("de");

  const formatDate = useCallback(
    (iso: string | null) => {
      if (!iso) return "–";
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, "0");
      if (langDe) {
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
      }
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    },
    [langDe],
  );

  const keyBodyTemplate = (row: Project) => (
    <span className="font-mono text-sm">{row.key}</span>
  );

  const siteBodyTemplate = (row: Project) => (
    <span
      style={{ color: readableSiteColor(row.siteColorHex) }}
      title={`${row.siteKey} - ${row.siteName} (${row.siteColorHex})`}
    >
      {row.siteKey} - {row.siteName}
    </span>
  );

  const statusBodyTemplate = (row: Project) => (
    <Tag severity={statusSeverity(row.status)} value={t(`projects.status.${row.status}`)} />
  );

  const progressBodyTemplate = (row: Project) => (
    <div className="flex items-center gap-2">
      <ProgressBar
        value={row.progress}
        showValue={false}
        style={{ width: "80px", height: "8px" }}
      />
      <span className="text-xs">{row.progress}%</span>
    </div>
  );

  const tasksBodyTemplate = (row: Project) => (
    <span>
      {row.taskCount} / {row.milestoneCount}
    </span>
  );

  const responsibleBodyTemplate = (row: Project) =>
    row.responsibleEmployeeName ?? <span className="text-surface-500">–</span>;

  const plannedStartBodyTemplate = (row: Project) => formatDate(row.plannedStart);
  const plannedEndBodyTemplate = (row: Project) => formatDate(row.plannedEnd);

  const actionsBodyTemplate = (row: Project) => (
    <div className="flex gap-1">
      <Button
        icon="pi pi-chart-bar"
        text
        severity="info"
        size="small"
        tooltip={t("projects.openGantt")}
        tooltipOptions={{ position: "top" }}
        onClick={() => handleOpenGantt(row)}
      />
      <Button
        icon="pi pi-pencil"
        text
        severity="secondary"
        size="small"
        tooltip={t("common.edit")}
        tooltipOptions={{ position: "top" }}
        onClick={() => handleEdit(row)}
      />
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <Toast ref={toastRef} />
      <ConfirmDialog />
      {tableCtx.ContextMenuEl}

      <div className="flex min-h-0 flex-1 flex-col" {...tableCtx.wrapperProps}>
        <DataTable
          value={filteredProjects}
          loading={loading}
          selectionMode="single"
          selection={selectedProject}
          onSelectionChange={(e) => setSelectedProject(e.value as Project)}
          onRowDoubleClick={(e) => handleEdit(e.data as Project)}
          {...tableCtx.tableProps}
          scrollable
          scrollHeight="flex"
          className="app-data-table flex-1"
          emptyMessage={t("common.noResults")}
          dataKey="id"
        >
        <Column field="key" header={t("projects.key")} body={keyBodyTemplate} sortable style={{ width: "120px" }} />
        <Column field="name" header={t("projects.name")} sortable />
        <Column field="siteKey" header={t("common.site")} body={siteBodyTemplate} sortable style={{ width: "180px" }} />
        <Column field="status" header={t("projects.status.label")} body={statusBodyTemplate} sortable style={{ width: "120px" }} />
        <Column header={t("projects.progress")} body={progressBodyTemplate} style={{ width: "140px" }} />
        <Column header={t("projects.tasksLabel")} body={tasksBodyTemplate} style={{ width: "100px" }} />
        <Column field="plannedStart" header={t("projects.plannedStart")} body={plannedStartBodyTemplate} sortable style={{ width: "120px" }} />
        <Column field="plannedEnd" header={t("projects.plannedEnd")} body={plannedEndBodyTemplate} sortable style={{ width: "120px" }} />
        <Column field="responsibleEmployeeName" header={t("projects.responsible")} body={responsibleBodyTemplate} sortable style={{ width: "150px" }} />
        <Column header="" body={actionsBodyTemplate} style={{ width: "100px" }} />
        </DataTable>
      </div>

      <ProjectDialog
        visible={dialogVisible}
        project={editingProject}
        onHide={() => setDialogVisible(false)}
        onSaved={() => {
          setDialogVisible(false);
          loadProjects();
        }}
      />
    </div>
  );
}
