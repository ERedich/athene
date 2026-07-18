import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, Pencil, Plus, RefreshCw, Trash2, TriangleAlert, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
import { TabPanel, TabView } from "primereact/tabview";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";

import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";
import { maintenancePlanDialogTabs } from "../lib/maintenancePlanDialog";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";
import { useTableContextMenu } from "../lib/useTableContextMenu";
import { useWorkOrderSearchReferenceData } from "../hooks/useWorkOrderSearchReferenceData";

type IntervalUnit = "day" | "week" | "month" | "year";
type PlanStatus = "active" | "paused" | "ended";

type MaintenancePlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  assetId: string;
  assetKey: string;
  assetName: string;
  costCenterId: string;
  costCenterKey: string;
  costCenterName: string;
  workgroupId: string;
  workgroupKey: string;
  workgroupName: string;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  plannedDurationMinutes: number | null;
  intervalUnit: IntervalUnit;
  intervalValue: number;
  anchorDate: string;
  nextDueAt: string;
  leadTimeDays: number;
  status: PlanStatus;
  executionCount: number;
  responsibleEmployeeIds: string[];
  responsibleEmployeeKey: string | null;
  responsibleEmployeeName: string | null;
  hasOpenWorkOrder: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type FormState = {
  key: string;
  name: string;
  description: string;
  siteId: string;
  assetId: string;
  costCenterId: string;
  workgroupId: string;
  classificationId: string;
  plannedDurationMinutes: number | null;
  intervalUnit: IntervalUnit;
  intervalValue: number;
  nextDueAt: Date | null;
  leadTimeDays: number;
  isActive: boolean;
  responsibleEmployeeIds: string[];
};

type SelectOption = { label: string; value: string };

const emptyForm = (siteId = ""): FormState => ({
  key: "",
  name: "",
  description: "",
  siteId,
  assetId: "",
  costCenterId: "",
  workgroupId: "",
  classificationId: "",
  plannedDurationMinutes: null,
  intervalUnit: "week",
  intervalValue: 4,
  nextDueAt: new Date(),
  leadTimeDays: 7,
  isActive: true,
  responsibleEmployeeIds: [],
});

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const deleteActionIcon = "text-red-500";

const fieldLabelClass = "block text-[11px] text-outline uppercase tracking-[0.1em]";

export function MaintenancePlansPage() {
  const { t } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const tabHostRef = useRef<HTMLDivElement>(null);
  const refData = useWorkOrderSearchReferenceData({ autoLoad: true });

  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<MaintenancePlan | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(maintenancePlanDialogTabs.General);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const updateTabInk = useCallback(() => {
    const host = tabHostRef.current;
    if (!host) return;
    const nav = host.querySelector<HTMLElement>(".p-tabview-nav");
    const active = nav?.querySelector<HTMLElement>("li.p-highlight .p-tabview-nav-link");
    if (!nav || !active) return;
    nav.style.setProperty("--app-ink-x", `${active.offsetLeft}px`);
    nav.style.setProperty("--app-ink-w", `${active.offsetWidth}px`);
  }, []);

  useLayoutEffect(() => {
    if (!dialogVisible) return;
    const raf = requestAnimationFrame(() => {
      updateTabInk();
      requestAnimationFrame(updateTabInk);
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTabIndex, dialogVisible, updateTabInk]);

  useEffect(() => {
    if (!dialogVisible) return;
    window.addEventListener("resize", updateTabInk);
    return () => window.removeEventListener("resize", updateTabInk);
  }, [dialogVisible, updateTabInk]);

  const intervalUnitOptions = useMemo<SelectOption[]>(
    () => [
      { label: t("maintenancePlans.intervalDay"), value: "day" },
      { label: t("maintenancePlans.intervalWeek"), value: "week" },
      { label: t("maintenancePlans.intervalMonth"), value: "month" },
      { label: t("maintenancePlans.intervalYear"), value: "year" },
    ],
    [t],
  );

  const siteDropdownOptions = useMemo<SelectOption[]>(
    () => refData.sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
    [refData.sites],
  );

  const selectedAsset = useMemo(
    () => refData.accessibleAssets.find((a) => a.id === form.assetId) ?? null,
    [form.assetId, refData.accessibleAssets],
  );

  const assetOptions = useMemo<SelectOption[]>(
    () =>
      refData.accessibleAssets
        .filter((a) => !form.siteId || a.siteId === form.siteId)
        .map((a) => ({ label: `${a.key} - ${a.name}`, value: a.id })),
    [form.siteId, refData.accessibleAssets],
  );

  const costCenterOptions = useMemo<SelectOption[]>(
    () =>
      refData.costCenters
        .filter((cc) => selectedAsset?.siteId && cc.siteId === selectedAsset.siteId)
        .filter((cc) => cc.isActive || cc.id === form.costCenterId)
        .map((cc) => ({
          label: `${cc.key} - ${cc.name}${cc.isActive ? "" : ` (${t("costCenters.inactive")})`}`,
          value: cc.id,
        })),
    [form.costCenterId, refData.costCenters, selectedAsset?.siteId, t],
  );

  const classificationOptions = useMemo<SelectOption[]>(
    () =>
      refData.classifications
        .filter((cl) => selectedAsset?.siteId && cl.siteId === selectedAsset.siteId && cl.appliesToWorkOrder)
        .map((cl) => ({ label: `${cl.key} - ${cl.name}`, value: cl.id })),
    [refData.classifications, selectedAsset?.siteId],
  );

  const workgroupOptions = useMemo<SelectOption[]>(
    () =>
      refData.workgroups
        .filter((wg) => selectedAsset?.siteId && wg.siteId === selectedAsset.siteId)
        .filter((wg) => wg.isActive || wg.id === form.workgroupId)
        .map((wg) => ({
          label: `${wg.key} - ${wg.name}${wg.isActive ? "" : ` (${t("workgroups.inactive")})`}`,
          value: wg.id,
        })),
    [form.workgroupId, refData.workgroups, selectedAsset?.siteId, t],
  );

  const selectedWorkgroup = useMemo(
    () => (form.workgroupId ? refData.workgroups.find((w) => w.id === form.workgroupId) ?? null : null),
    [form.workgroupId, refData.workgroups],
  );

  const responsibleEmployeeOptions = useMemo<SelectOption[]>(
    () =>
      refData.employees
        .filter((emp) => !selectedAsset?.siteId || emp.siteId === selectedAsset.siteId)
        .filter((emp) =>
          form.workgroupId ? (selectedWorkgroup?.leaderEmployeeIds?.includes(emp.id) ?? false) : false,
        )
        .filter((emp) => emp.isActive || form.responsibleEmployeeIds.includes(emp.id))
        .map((emp) => ({ label: `${emp.key} - ${emp.name}`, value: emp.id })),
    [
      form.responsibleEmployeeIds,
      form.workgroupId,
      refData.employees,
      selectedAsset?.siteId,
      selectedWorkgroup,
    ],
  );

  const filteredPlans = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter((row) =>
      [
        row.key,
        row.name,
        row.assetKey,
        row.assetName,
        row.siteKey,
        row.siteName,
        row.workgroupKey,
        row.status === "active" ? t("maintenancePlans.active") : t("maintenancePlans.inactive"),
        String(row.executionCount),
        row.responsibleEmployeeKey,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [plans, searchTerm, t]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/maintenance-plans");
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as MaintenancePlan[];
      setPlans(Array.isArray(data) ? data : []);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("maintenancePlans.loadError"),
        life: 4000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    setHeaderRowCount(filteredPlans.length);
    return () => setHeaderRowCount(null);
  }, [filteredPlans.length, setHeaderRowCount]);

  const openCreate = useCallback(() => {
    const defaultSiteId = siteFieldLocked ? (user?.workingSiteId ?? "") : "";
    setEditingId(null);
    setActiveTabIndex(maintenancePlanDialogTabs.General);
    setForm(emptyForm(defaultSiteId));
    setDialogVisible(true);
  }, [siteFieldLocked, user?.workingSiteId]);

  const openEdit = useCallback((row: MaintenancePlan) => {
    setEditingId(row.id);
    setActiveTabIndex(maintenancePlanDialogTabs.General);
    const due = new Date(row.nextDueAt);
    setForm({
      key: row.key,
      name: row.name,
      description: row.description ?? "",
      siteId: row.siteId,
      assetId: row.assetId,
      costCenterId: row.costCenterId,
      workgroupId: row.workgroupId,
      classificationId: row.classificationId ?? "",
      plannedDurationMinutes: row.plannedDurationMinutes,
      intervalUnit: row.intervalUnit,
      intervalValue: row.intervalValue,
      nextDueAt: Number.isNaN(due.getTime()) ? new Date() : due,
      leadTimeDays: row.leadTimeDays,
      isActive: row.status === "active",
      responsibleEmployeeIds: [...(row.responsibleEmployeeIds ?? [])],
    });
    setDialogVisible(true);
  }, []);

  const generateOne = useCallback(
    async (row: MaintenancePlan, force = false) => {
      setGenerating(true);
      try {
        const res = await apiFetch(`/api/maintenance-plans/${row.id}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        if (!res.ok) throw new Error("generate");
        const result = (await res.json()) as { status: string; reason?: string; orderNumber?: number };
        if (result.status === "created") {
          toastRef.current?.show({
            severity: "success",
            summary: t("maintenancePlans.generated", { orderNumber: result.orderNumber ?? "" }),
            life: 3500,
          });
        } else {
          toastRef.current?.show({
            severity: "warn",
            summary: t("maintenancePlans.generateSkipped", {
              reason: result.reason ?? "skipped",
            }),
            life: 4000,
          });
        }
        await loadPlans();
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("maintenancePlans.generateError"),
          life: 4000,
        });
      } finally {
        setGenerating(false);
      }
    },
    [loadPlans, t],
  );

  const generateDue = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await apiFetch("/api/maintenance-plans/generate-due", { method: "POST" });
      if (!res.ok) throw new Error("generate-due");
      const data = (await res.json()) as {
        results: Array<{ status: string }>;
      };
      const created = (data.results ?? []).filter((r) => r.status === "created").length;
      toastRef.current?.show({
        severity: "success",
        summary: t("maintenancePlans.generateDueDone", { count: created }),
        life: 3500,
      });
      await loadPlans();
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("maintenancePlans.generateError"),
        life: 4000,
      });
    } finally {
      setGenerating(false);
    }
  }, [loadPlans, t]);

  const deletePlan = useCallback(
    (row: MaintenancePlan) => {
      confirmDialog({
        header: t("maintenancePlans.confirmDeleteTitle"),
        message: t("maintenancePlans.confirmDelete", { name: row.name }),
        icon: "pi pi-exclamation-triangle",
        acceptLabel: t("maintenancePlans.yes"),
        rejectLabel: t("maintenancePlans.no"),
        acceptClassName: "p-button-danger",
        accept: () => {
          void (async () => {
            try {
              const res = await apiFetch(`/api/maintenance-plans/${row.id}`, { method: "DELETE" });
              if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { error?: string };
                if (
                  body.error === "delete_requires_inactive" ||
                  body.error === "delete_requires_paused_or_ended"
                ) {
                  throw new Error("inactive");
                }
                if (body.error === "delete_blocked_open_work_order") {
                  throw new Error("open_wo");
                }
                throw new Error("delete");
              }
              toastRef.current?.show({
                severity: "success",
                summary: t("maintenancePlans.deleted"),
                life: 2500,
              });
              if (selectedPlan?.id === row.id) setSelectedPlan(null);
              await loadPlans();
            } catch (err) {
              const code = (err as Error).message;
              toastRef.current?.show({
                severity: "error",
                summary:
                  code === "inactive"
                    ? t("maintenancePlans.deleteRequiresInactive")
                    : code === "open_wo"
                      ? t("maintenancePlans.deleteBlockedOpenWo")
                      : t("maintenancePlans.deleteError"),
                life: 4500,
              });
            }
          })();
        },
      });
    },
    [loadPlans, selectedPlan?.id, t],
  );

  const save = useCallback(async () => {
    if (
      !form.key.trim() ||
      !form.name.trim() ||
      !form.siteId ||
      !form.assetId ||
      !form.costCenterId ||
      !form.workgroupId ||
      !form.nextDueAt ||
      form.responsibleEmployeeIds.length === 0 ||
      form.intervalValue < 1
    ) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("maintenancePlans.validationRequired"),
        life: 4000,
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        key: form.key.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        siteId: form.siteId,
        assetId: form.assetId,
        costCenterId: form.costCenterId,
        workgroupId: form.workgroupId,
        classificationId: form.classificationId || null,
        plannedDurationMinutes: form.plannedDurationMinutes,
        intervalUnit: form.intervalUnit,
        intervalValue: form.intervalValue,
        nextDueAt: form.nextDueAt.toISOString(),
        leadTimeDays: form.leadTimeDays,
        isActive: form.isActive,
        responsibleEmployeeIds: form.responsibleEmployeeIds,
      };
      const res = await apiFetch(editingId ? `/api/maintenance-plans/${editingId}` : "/api/maintenance-plans", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (body.error === "duplicate_key") throw new Error("duplicate");
        throw new Error(body.error ?? "save");
      }
      toastRef.current?.show({
        severity: "success",
        summary: editingId ? t("maintenancePlans.saved") : t("maintenancePlans.created"),
        life: 2500,
      });
      setDialogVisible(false);
      await loadPlans();
    } catch (err) {
      const code = (err as Error).message;
      toastRef.current?.show({
        severity: "error",
        summary: code === "duplicate" ? t("maintenancePlans.duplicateKey") : t("maintenancePlans.saveError"),
        life: 4500,
      });
    } finally {
      setSaving(false);
    }
  }, [editingId, form, loadPlans, t]);

  useEffect(() => {
    if (!form.assetId || !selectedAsset) return;
    if (form.siteId && form.siteId !== selectedAsset.siteId) {
      setForm((cur) => ({
        ...cur,
        siteId: selectedAsset.siteId,
        costCenterId: "",
        workgroupId: "",
        classificationId: "",
        responsibleEmployeeIds: [],
      }));
    } else if (!form.siteId) {
      setForm((cur) => ({ ...cur, siteId: selectedAsset.siteId }));
    }
  }, [form.assetId, form.siteId, selectedAsset]);

  useEffect(() => {
    if (!form.workgroupId || !selectedWorkgroup) return;
    const allowed = new Set(selectedWorkgroup.leaderEmployeeIds ?? []);
    setForm((cur) => {
      const next = cur.responsibleEmployeeIds.filter((id) => allowed.has(id));
      if (next.length === cur.responsibleEmployeeIds.length) return cur;
      return { ...cur, responsibleEmployeeIds: next };
    });
  }, [form.workgroupId, selectedWorkgroup]);

  const tableCtx = useTableContextMenu<MaintenancePlan>({
    labels: {
      new: t("maintenancePlans.new"),
      edit: t("maintenancePlans.edit"),
      delete: t("maintenancePlans.delete"),
    },
    handlers: {
      onCreate: openCreate,
      onEdit: openEdit,
      onDelete: deletePlan,
    },
    selection: selectedPlan,
    setSelection: setSelectedPlan,
    extraItems: (row) => {
      if (!row) return [];
      const items: { label: string; icon: ReactNode; command: () => void }[] = [
        {
          label: t("maintenancePlans.generate"),
          icon: <WandSparkles className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
          command: () => void generateOne(row, true),
        },
      ];
      return items;
    },
  });

  useEffect(() => {
    if (selectedPlan && !plans.some((p) => p.id === selectedPlan.id)) {
      setSelectedPlan(null);
    }
  }, [plans, selectedPlan]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("maintenancePlans.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedPlan}
            onClick={() => {
              if (selectedPlan) openEdit(selectedPlan);
            }}
          >
            <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("maintenancePlans.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedPlan}
            onClick={() => {
              if (selectedPlan) deletePlan(selectedPlan);
            }}
          >
            <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("maintenancePlans.delete")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={generating}
            onClick={() => void generateDue()}
          >
            <WandSparkles className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("maintenancePlans.generateDue")}</span>
          </button>
        </li>
        <li>
          <button type="button" className={primaryActionNavItem} onClick={() => void loadPlans()}>
            <RefreshCw className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("maintenancePlans.refresh")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("maintenancePlans.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [
    deletePlan,
    generateDue,
    generating,
    loadPlans,
    openCreate,
    openEdit,
    searchTerm,
    selectedPlan,
    setHeaderActions,
    t,
  ]);

  const formatDateTime = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(d);
    },
    [],
  );

  const intervalLabel = useCallback(
    (unit: IntervalUnit) => {
      switch (unit) {
        case "day":
          return t("maintenancePlans.intervalDay");
        case "week":
          return t("maintenancePlans.intervalWeek");
        case "month":
          return t("maintenancePlans.intervalMonth");
        case "year":
          return t("maintenancePlans.intervalYear");
      }
    },
    [t],
  );

  const siteColumnBody = useCallback((row: MaintenancePlan) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }}>
        {row.siteName}
      </span>
    );
  }, []);

  const activeBody = useCallback(
    (row: MaintenancePlan) =>
      row.status === "active" ? (
        <Check className="h-4 w-4 text-on-surface" strokeWidth={1.75} aria-label={t("maintenancePlans.active")} />
      ) : (
        <span className="text-on-surface-variant">{t("maintenancePlans.inactive")}</span>
      ),
    [t],
  );

  const dialogFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("maintenancePlans.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("maintenancePlans.save")}
        icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        loading={saving}
        onClick={() => void save()}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />
      {tableCtx.ContextMenuEl}

      <div className="flex min-h-0 flex-1 flex-col" {...tableCtx.wrapperProps}>
        <DataTable
          className="app-data-table w-full"
          value={filteredPlans}
          loading={loading || refData.loading}
          dataKey="id"
          selection={selectedPlan}
          onSelectionChange={(e) => setSelectedPlan(e.value as MaintenancePlan | null)}
          onRowDoubleClick={(e) => openEdit(e.data as MaintenancePlan)}
          {...tableCtx.tableProps}
          selectionMode="single"
          metaKeySelection={false}
          stripedRows
          showGridlines
          scrollable
          resizableColumns
          reorderableColumns
          columnResizeMode="expand"
          scrollHeight="flex"
          tableStyle={{ minWidth: "72rem" }}
          stateStorage="local"
          stateKey="athene-maintenance-plans-table"
          emptyMessage={t("maintenancePlans.empty")}
        >
          <Column field="key" header={t("maintenancePlans.key")} sortable />
          <Column field="name" header={t("workOrders.name")} sortable />
          <Column
            field="assetKey"
            header={t("workOrders.asset")}
            body={(row: MaintenancePlan) => `${row.assetKey} — ${row.assetName}`}
            sortable
          />
          <Column field="siteName" header={t("maintenancePlans.site")} sortable body={siteColumnBody} />
          <Column
            field="intervalValue"
            header={t("maintenancePlans.interval")}
            body={(row: MaintenancePlan) => `${row.intervalValue} ${intervalLabel(row.intervalUnit)}`}
          />
          <Column
            field="nextDueAt"
            header={t("maintenancePlans.nextDueAt")}
            body={(row: MaintenancePlan) => formatDateTime(row.nextDueAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            columnKey="active"
            header={t("maintenancePlans.active")}
            body={activeBody}
            className="w-28 text-center"
          />
          <Column
            field="executionCount"
            header={t("maintenancePlans.executionCount")}
            sortable
            className="w-28 text-center tabular-nums"
          />
          <Column
            field="hasOpenWorkOrder"
            header={t("maintenancePlans.openWo")}
            body={(row: MaintenancePlan) =>
              row.hasOpenWorkOrder ? (
                <Check
                  className="h-4 w-4 text-on-surface"
                  strokeWidth={1.75}
                  aria-label={t("maintenancePlans.openWoYes")}
                />
              ) : (
                <span className="text-on-surface-variant">—</span>
              )
            }
            className="w-28 text-center"
          />
        </DataTable>
      </div>

      <Dialog
        header={editingId ? t("maintenancePlans.editTitle") : t("maintenancePlans.createTitle")}
        visible={dialogVisible}
        className="app-big-modal-window app-tabbed-modal-window"
        onShow={updateTabInk}
        onHide={() => setDialogVisible(false)}
        footer={dialogFooter}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
        appendTo={overlayAppendTo}
      >
        <div ref={tabHostRef} className="app-tabview-with-ink app-wo-edit-tab-host">
          <TabView
            className="app-sticky-tabs"
            activeIndex={activeTabIndex}
            onTabChange={(e) => setActiveTabIndex(e.index)}
          >
            <TabPanel header={t("workOrders.tabGeneral")}>
              <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-6" style={{ margin: 0, display: "grid" }}>
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="mp-key" className={fieldLabelClass}>
                    {t("maintenancePlans.key")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <InputText
                    id="mp-key"
                    value={form.key}
                    onChange={(e) => setForm((c) => ({ ...c, key: e.target.value }))}
                    className="w-full"
                    autoComplete="off"
                  />
                </div>

                <div
                  className={`space-y-2 flex flex-col justify-end ${
                    !form.siteId && siteFieldLocked ? "md:col-span-4" : "md:col-span-2"
                  }`}
                >
                  <div className="flex items-center gap-2 pb-2">
                    <Checkbox
                      inputId="mp-isActive"
                      checked={form.isActive}
                      onChange={(e) => setForm((c) => ({ ...c, isActive: Boolean(e.checked) }))}
                    />
                    <label htmlFor="mp-isActive" className="text-sm">
                      {t("maintenancePlans.active")}
                    </label>
                  </div>
                </div>

                {!form.siteId && siteFieldLocked ? null : (
                  <div className="space-y-2 md:col-span-2">
                    <label htmlFor="mp-site" className={fieldLabelClass}>
                      {t("maintenancePlans.site")}
                      <span className="app-required-marker" aria-hidden>
                        *
                      </span>
                    </label>
                    <Dropdown
                      inputId="mp-site"
                      value={form.siteId}
                      options={siteDropdownOptions}
                      onChange={(e) =>
                        setForm((c) => ({
                          ...c,
                          siteId: String(e.value ?? ""),
                          assetId: "",
                          costCenterId: "",
                          workgroupId: "",
                          classificationId: "",
                          responsibleEmployeeIds: [],
                        }))
                      }
                      placeholder={t("maintenancePlans.sitePlaceholder")}
                      disabled={siteFieldLocked}
                      className="w-full app-inline-icon-dropdown"
                      appendTo={overlayAppendTo}
                    />
                  </div>
                )}

                <div className="space-y-2 md:col-span-6">
                  <label htmlFor="mp-name" className={fieldLabelClass}>
                    {t("workOrders.name")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <InputText
                    id="mp-name"
                    value={form.name}
                    onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                    className="w-full"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2 md:col-span-6">
                  <label htmlFor="mp-description" className={fieldLabelClass}>
                    {t("workOrders.description")}
                  </label>
                  <textarea
                    id="mp-description"
                    value={form.description}
                    maxLength={2000}
                    onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
                    className="w-full p-inputtext p-component min-h-28 resize-y"
                  />
                  <div className="text-xs text-on-surface-variant text-right">
                    {t("workOrders.descriptionCounter", { count: form.description.length, max: 2000 })}
                  </div>
                </div>

                <div className="space-y-2 md:col-span-3">
                  <label htmlFor="mp-asset" className={fieldLabelClass}>
                    {t("workOrders.asset")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <Dropdown
                    inputId="mp-asset"
                    value={form.assetId}
                    options={assetOptions}
                    onChange={(e) => {
                      const assetId = String(e.value ?? "");
                      const asset = refData.accessibleAssets.find((a) => a.id === assetId);
                      setForm((c) => ({
                        ...c,
                        assetId,
                        siteId: asset?.siteId ?? c.siteId,
                        costCenterId: asset?.costCenterId ?? "",
                        workgroupId: "",
                        classificationId: "",
                        responsibleEmployeeIds: [],
                      }));
                    }}
                    placeholder={t("workOrders.assetPlaceholder")}
                    className="w-full app-inline-icon-dropdown"
                    filter
                    appendTo={overlayAppendTo}
                  />
                </div>

                <div className="space-y-2 md:col-span-3">
                  <label htmlFor="mp-cost-center" className={fieldLabelClass}>
                    {t("workOrders.costCenter")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <Dropdown
                    inputId="mp-cost-center"
                    value={form.costCenterId}
                    options={costCenterOptions}
                    onChange={(e) => setForm((c) => ({ ...c, costCenterId: String(e.value ?? "") }))}
                    placeholder={t("workOrders.costCenterPlaceholder")}
                    className="w-full app-inline-icon-dropdown"
                    disabled={!form.assetId}
                    filter
                    appendTo={overlayAppendTo}
                  />
                </div>

                <div className="space-y-2 md:col-span-6">
                  <label htmlFor="mp-classification" className={fieldLabelClass}>
                    {t("workOrders.classification")}
                  </label>
                  <Dropdown
                    inputId="mp-classification"
                    value={form.classificationId || null}
                    options={classificationOptions}
                    onChange={(e) => setForm((c) => ({ ...c, classificationId: String(e.value ?? "") }))}
                    placeholder={t("workOrders.classificationPlaceholder")}
                    className="w-full app-inline-icon-dropdown"
                    disabled={!form.assetId}
                    filter
                    showClear
                    appendTo={overlayAppendTo}
                  />
                </div>

                <div className="space-y-2 md:col-span-3">
                  <label htmlFor="mp-workgroup" className={fieldLabelClass}>
                    {t("workOrders.workgroup")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <Dropdown
                    inputId="mp-workgroup"
                    value={form.workgroupId}
                    options={workgroupOptions}
                    onChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        workgroupId: String(e.value ?? ""),
                        responsibleEmployeeIds: [],
                      }))
                    }
                    placeholder={t("workOrders.workgroupPlaceholder")}
                    className="w-full app-inline-icon-dropdown"
                    disabled={!form.assetId}
                    filter
                    appendTo={overlayAppendTo}
                  />
                </div>

                <div className="space-y-2 md:col-span-3">
                  <label htmlFor="mp-responsible" className={fieldLabelClass}>
                    {t("workOrders.responsible")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <MultiSelect
                    inputId="mp-responsible"
                    value={form.responsibleEmployeeIds}
                    options={responsibleEmployeeOptions}
                    onChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        responsibleEmployeeIds: (Array.isArray(e.value) ? e.value : []).map(String),
                      }))
                    }
                    placeholder={t("workOrders.responsiblePlaceholder")}
                    disabled={!form.workgroupId || responsibleEmployeeOptions.length === 0}
                    display="chip"
                    className="w-full"
                    appendTo={overlayAppendTo}
                  />
                </div>

                {!form.workgroupId ? (
                  <p className="md:col-span-6 flex items-start gap-2 text-sm text-on-surface-variant">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {t("maintenancePlans.workgroupHint")}
                  </p>
                ) : null}
              </div>
            </TabPanel>

            <TabPanel header={t("workOrders.tabPlandaten")}>
              <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-6" style={{ margin: 0, display: "grid" }}>
                <div className="space-y-2 md:col-span-3">
                  <label htmlFor="mp-next-due" className={fieldLabelClass}>
                    {t("maintenancePlans.nextDueAt")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <Calendar
                    inputId="mp-next-due"
                    value={form.nextDueAt}
                    onChange={(e) => {
                      const next = e.value instanceof Date ? e.value : null;
                      setForm((c) => ({ ...c, nextDueAt: next }));
                    }}
                    showTime
                    hourFormat="24"
                    dateFormat={refData.calendarDateFormat}
                    className="w-full min-w-0 max-w-full"
                    appendTo={overlayAppendTo}
                  />
                </div>

                <div className="space-y-2 md:col-span-3">
                  <label htmlFor="mp-duration" className={fieldLabelClass}>
                    {t("workOrders.plannedDuration")}
                  </label>
                  <InputNumber
                    inputId="mp-duration"
                    value={form.plannedDurationMinutes}
                    onValueChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        plannedDurationMinutes: typeof e.value === "number" ? e.value : null,
                      }))
                    }
                    min={0}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="mp-interval-value" className={fieldLabelClass}>
                    {t("maintenancePlans.intervalValue")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <InputNumber
                    inputId="mp-interval-value"
                    value={form.intervalValue}
                    onValueChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        intervalValue: typeof e.value === "number" && e.value >= 1 ? e.value : 1,
                      }))
                    }
                    min={1}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="mp-interval-unit" className={fieldLabelClass}>
                    {t("maintenancePlans.intervalUnit")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <Dropdown
                    inputId="mp-interval-unit"
                    value={form.intervalUnit}
                    options={intervalUnitOptions}
                    onChange={(e) => setForm((c) => ({ ...c, intervalUnit: e.value as IntervalUnit }))}
                    className="w-full app-inline-icon-dropdown"
                    appendTo={overlayAppendTo}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="mp-lead" className={fieldLabelClass}>
                    {t("maintenancePlans.leadTimeDays")}
                  </label>
                  <InputNumber
                    inputId="mp-lead"
                    value={form.leadTimeDays}
                    onValueChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        leadTimeDays: typeof e.value === "number" && e.value >= 0 ? e.value : 0,
                      }))
                    }
                    min={0}
                    className="w-full"
                  />
                </div>

                {editingId ? (
                  <div className="space-y-2 md:col-span-2">
                    <label htmlFor="mp-executions" className={fieldLabelClass}>
                      {t("maintenancePlans.executionCount")}
                    </label>
                    <InputText
                      id="mp-executions"
                      value={String(
                        plans.find((p) => p.id === editingId)?.executionCount ??
                          (selectedPlan?.id === editingId ? selectedPlan.executionCount : 0),
                      )}
                      disabled
                      className="w-full"
                    />
                  </div>
                ) : null}
              </div>
            </TabPanel>
          </TabView>
        </div>
      </Dialog>
    </div>
  );
}
