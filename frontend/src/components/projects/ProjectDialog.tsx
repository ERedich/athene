import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";

import { AppDialog } from "../AppDialog";
import { createProject, updateProject } from "../../lib/projects/projectApi";
import type { Project, ProjectStatus, ProjectCreateInput } from "../../lib/projects/projectTypes";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../lib/api";

type Props = {
  visible: boolean;
  project: Project | null;
  onHide: () => void;
  onSaved: () => void;
};

type Site = { id: string; key: string; name: string };
type Employee = { id: string; key: string; name: string; siteId: string };
type CostCenter = { id: string; key: string; name: string; siteId: string };

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: "projects.status.planning" },
  { value: "active", label: "projects.status.active" },
  { value: "on_hold", label: "projects.status.on_hold" },
  { value: "completed", label: "projects.status.completed" },
  { value: "cancelled", label: "projects.status.cancelled" },
];

export function ProjectDialog({ visible, project, onHide, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const { workingSiteId } = useAuth();

  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [siteId, setSiteId] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [plannedStart, setPlannedStart] = useState<Date | null>(null);
  const [plannedEnd, setPlannedEnd] = useState<Date | null>(null);
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState<string | null>(null);
  const [costCenterId, setCostCenterId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);

  const langDe = i18n.language?.toLowerCase().startsWith("de");

  useEffect(() => {
    if (visible) {
      apiFetch("/api/sites").then((res) => res.ok && res.json().then(setSites));
      apiFetch("/api/employees").then((res) => res.ok && res.json().then(setEmployees));
      apiFetch("/api/cost-centers").then((res) => res.ok && res.json().then(setCostCenters));
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      if (project) {
        setKey(project.key);
        setName(project.name);
        setDescription(project.description ?? "");
        setSiteId(project.siteId);
        setStatus(project.status);
        setPlannedStart(new Date(project.plannedStart));
        setPlannedEnd(project.plannedEnd ? new Date(project.plannedEnd) : null);
        setResponsibleEmployeeId(project.responsibleEmployeeId);
        setCostCenterId(project.costCenterId);
      } else {
        setKey("");
        setName("");
        setDescription("");
        setSiteId(workingSiteId ?? "");
        setStatus("planning");
        setPlannedStart(new Date());
        setPlannedEnd(null);
        setResponsibleEmployeeId(null);
        setCostCenterId(null);
      }
      setError(null);
    }
  }, [visible, project, workingSiteId]);

  const handleFromDateChange = (d: Date | null) => {
    setPlannedStart(d);
    if (d) setPlannedEnd(d);
  };

  const filteredEmployees = siteId
    ? employees.filter((e) => e.siteId === siteId)
    : employees;

  const filteredCostCenters = siteId
    ? costCenters.filter((cc) => cc.siteId === siteId)
    : costCenters;

  const handleSave = useCallback(async () => {
    if (!key.trim() || !name.trim() || !siteId || !plannedStart) {
      setError(t("common.requiredFields"));
      return;
    }

    setSaving(true);
    setError(null);

    const input: ProjectCreateInput = {
      key: key.trim(),
      name: name.trim(),
      description: description.trim() || null,
      siteId,
      status,
      plannedStart: plannedStart.toISOString(),
      plannedEnd: plannedEnd?.toISOString() ?? null,
      responsibleEmployeeId,
      costCenterId,
    };

    try {
      if (project) {
        await updateProject(project.id, input);
      } else {
        await createProject(input);
      }
      onSaved();
    } catch (err) {
      const message = (err as Error).message;
      if (message === "duplicate_key") {
        setError(t("projects.duplicateKey"));
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
    siteId,
    status,
    plannedStart,
    plannedEnd,
    responsibleEmployeeId,
    costCenterId,
    project,
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
      header={project ? t("projects.edit") : t("projects.new")}
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

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("projects.key")} *</label>
            <InputText
              value={key}
              onChange={(e) => setKey(e.target.value)}
              maxLength={50}
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("common.site")} *</label>
            <Dropdown
              value={siteId}
              onChange={(e) => {
                setSiteId(e.value);
                setResponsibleEmployeeId(null);
                setCostCenterId(null);
              }}
              options={sites}
              optionLabel="name"
              optionValue="id"
              placeholder={t("common.select")}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t("projects.name")} *</label>
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
            rows={3}
            maxLength={2000}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("projects.status.label")}</label>
            <Dropdown
              value={status}
              onChange={(e) => setStatus(e.value)}
              options={STATUS_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
              optionLabel="label"
              optionValue="value"
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("projects.responsible")}</label>
            <Dropdown
              value={responsibleEmployeeId}
              onChange={(e) => setResponsibleEmployeeId(e.value)}
              options={filteredEmployees}
              optionLabel="name"
              optionValue="id"
              placeholder={t("common.select")}
              showClear
              className="w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("projects.plannedStart")} *</label>
            <Calendar
              value={plannedStart}
              onChange={(e) => handleFromDateChange(e.value as Date | null)}
              dateFormat={langDe ? "dd.mm.yy" : "mm/dd/yy"}
              showIcon
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t("projects.plannedEnd")}</label>
            <Calendar
              value={plannedEnd}
              onChange={(e) => setPlannedEnd(e.value as Date | null)}
              dateFormat={langDe ? "dd.mm.yy" : "mm/dd/yy"}
              minDate={plannedStart ?? undefined}
              showIcon
              className="w-full"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t("common.costCenter")}</label>
          <Dropdown
            value={costCenterId}
            onChange={(e) => setCostCenterId(e.value)}
            options={filteredCostCenters}
            optionLabel="name"
            optionValue="id"
            placeholder={t("common.select")}
            showClear
            className="w-full"
          />
        </div>
      </form>
    </AppDialog>
  );
}
