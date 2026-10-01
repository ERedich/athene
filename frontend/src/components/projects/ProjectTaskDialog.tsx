import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { SelectButton } from "primereact/selectbutton";
import { Slider } from "primereact/slider";

import { AppDialog } from "../AppDialog";
import { createProjectTask, updateProjectTask } from "../../lib/projects/projectApi";
import type {
  GanttTask,
  ProjectTask,
  TaskType,
  TaskStatus,
  TaskPriority,
  TaskCreateInput,
} from "../../lib/projects/projectTypes";
import { apiFetch } from "../../lib/api";

type Props = {
  visible: boolean;
  projectId: string;
  task: GanttTask | null;
  tasks: GanttTask[];
  onHide: () => void;
  onSaved: () => void;
};

type Employee = { id: string; key: string; name: string };

const TASK_TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: "task", label: "projects.task.typeTask" },
  { value: "milestone", label: "projects.task.typeMilestone" },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "projects.task.status.pending" },
  { value: "in_progress", label: "projects.task.status.in_progress" },
  { value: "completed", label: "projects.task.status.completed" },
  { value: "cancelled", label: "projects.task.status.cancelled" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "projects.task.priority.low" },
  { value: "medium", label: "projects.task.priority.medium" },
  { value: "high", label: "projects.task.priority.high" },
  { value: "critical", label: "projects.task.priority.critical" },
];

export function ProjectTaskDialog({
  visible,
  projectId,
  task,
  tasks,
  onHide,
  onSaved,
}: Props) {
  const { t, i18n } = useTranslation();

  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("task");
  const [status, setStatus] = useState<TaskStatus>("pending");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [plannedStart, setPlannedStart] = useState<Date | null>(null);
  const [plannedEnd, setPlannedEnd] = useState<Date | null>(null);
  const [progress, setProgress] = useState(0);
  const [assignedEmployeeId, setAssignedEmployeeId] = useState<string | null>(null);
  const [parentTaskId, setParentTaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);

  const langDe = i18n.language?.toLowerCase().startsWith("de");

  useEffect(() => {
    if (visible) {
      apiFetch("/api/employees").then((res) => res.ok && res.json().then(setEmployees));
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      if (task) {
        setKey(task.key);
        setName(task.name);
        setDescription(task.description ?? "");
        setTaskType(task.taskType);
        setStatus(task.status);
        setPriority(task.priority);
        setPlannedStart(new Date(task.plannedStart));
        setPlannedEnd(task.plannedEnd ? new Date(task.plannedEnd) : null);
        setProgress(task.progress);
        setAssignedEmployeeId(task.assignedEmployeeId);
        setParentTaskId(task.parentTaskId);
      } else {
        const nextKey = `T${String(tasks.length + 1).padStart(3, "0")}`;
        setKey(nextKey);
        setName("");
        setDescription("");
        setTaskType("task");
        setStatus("pending");
        setPriority("medium");
        setPlannedStart(new Date());
        setPlannedEnd(null);
        setProgress(0);
        setAssignedEmployeeId(null);
        setParentTaskId(null);
      }
      setError(null);
    }
  }, [visible, task, tasks.length]);

  const handleFromDateChange = (d: Date | null) => {
    setPlannedStart(d);
    if (d && taskType !== "milestone") setPlannedEnd(d);
  };

  const parentTaskOptions = tasks
    .filter((t) => t.id !== task?.id && t.taskType === "task")
    .map((t) => ({ id: t.id, label: `${t.key} - ${t.name}` }));

  const handleSave = useCallback(async () => {
    if (!key.trim() || !name.trim() || !plannedStart) {
      setError(t("common.requiredFields"));
      return;
    }

    setSaving(true);
    setError(null);

    const input: TaskCreateInput = {
      key: key.trim(),
      name: name.trim(),
      description: description.trim() || null,
      taskType,
      status,
      priority,
      plannedStart: plannedStart.toISOString(),
      plannedEnd: taskType === "milestone" ? null : (plannedEnd?.toISOString() ?? null),
      progress: taskType === "milestone" ? 0 : progress,
      assignedEmployeeId,
      parentTaskId,
      sortOrder: task?.sortOrder ?? tasks.length,
    };

    try {
      if (task) {
        await updateProjectTask(projectId, task.id, input);
      } else {
        await createProjectTask(projectId, input);
      }
      onSaved();
    } catch (err) {
      const message = (err as Error).message;
      if (message === "duplicate_key") {
        setError(t("projects.task.duplicateKey"));
      } else {
        setError(t("common.saveError"));
      }
    } finally {
      setSaving(false);
    }
  }, [
    key,
    name,
    description,
    taskType,
    status,
    priority,
    plannedStart,
    plannedEnd,
    progress,
    assignedEmployeeId,
    parentTaskId,
    task,
    tasks.length,
    projectId,
    onSaved,
    t,
  ]);

  const footer = (
    <div className="flex justify-end gap-2">
      <Button
        label={t("common.cancel")}
        severity="secondary"
        outlined
        onClick={onHide}
        disabled={saving}
      />
      <Button label={t("common.save")} onClick={handleSave} loading={saving} />
    </div>
  );

  return (
    <AppDialog
      visible={visible}
      onHide={onHide}
      header={task ? t("projects.task.edit") : t("projects.task.new")}
      footer={footer}
      style={{ width: "600px" }}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        {error && (
          <div className="rounded bg-red-100 p-2 text-sm text-red-700 dark:bg-red-900 dark:text-red-100">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t("projects.task.type")}</label>
          <SelectButton
            value={taskType}
            onChange={(e) => setTaskType(e.value)}
            options={TASK_TYPE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
            optionLabel="label"
            optionValue="value"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("projects.task.key")} *</label>
            <InputText
              value={key}
              onChange={(e) => setKey(e.target.value)}
              maxLength={50}
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("projects.task.status")}</label>
            <Dropdown
              value={status}
              onChange={(e) => setStatus(e.value)}
              options={STATUS_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
              optionLabel="label"
              optionValue="value"
              className="w-full"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t("projects.task.name")} *</label>
          <InputText
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t("common.description")}</label>
          <InputTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              {taskType === "milestone" ? t("projects.task.date") : t("projects.task.start")} *
            </label>
            <Calendar
              value={plannedStart}
              onChange={(e) => handleFromDateChange(e.value as Date | null)}
              dateFormat={langDe ? "dd.mm.yy" : "mm/dd/yy"}
              showIcon
              className="w-full"
            />
          </div>
          {taskType !== "milestone" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">{t("projects.task.end")}</label>
              <Calendar
                value={plannedEnd}
                onChange={(e) => setPlannedEnd(e.value as Date | null)}
                dateFormat={langDe ? "dd.mm.yy" : "mm/dd/yy"}
                minDate={plannedStart ?? undefined}
                showIcon
                className="w-full"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("projects.task.priority")}</label>
            <Dropdown
              value={priority}
              onChange={(e) => setPriority(e.value)}
              options={PRIORITY_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
              optionLabel="label"
              optionValue="value"
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("projects.task.assignee")}</label>
            <Dropdown
              value={assignedEmployeeId}
              onChange={(e) => setAssignedEmployeeId(e.value)}
              options={employees}
              optionLabel="name"
              optionValue="id"
              placeholder={t("common.select")}
              showClear
              className="w-full"
            />
          </div>
        </div>

        {taskType !== "milestone" && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              {t("projects.task.progress")}: {progress}%
            </label>
            <Slider
              value={progress}
              onChange={(e) => setProgress(e.value as number)}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
          </div>
        )}

        {parentTaskOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("projects.task.parentTask")}</label>
            <Dropdown
              value={parentTaskId}
              onChange={(e) => setParentTaskId(e.value)}
              options={parentTaskOptions}
              optionLabel="label"
              optionValue="id"
              placeholder={t("common.none")}
              showClear
              className="w-full"
            />
          </div>
        )}
      </form>
    </AppDialog>
  );
}
