import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import type { Toast } from "primereact/toast";

import { useAuth } from "../auth/AuthContext";
import { useWorkOrderSearchReferenceData } from "./useWorkOrderSearchReferenceData";
import { apiFetch } from "../lib/api";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../lib/appParameterKeys";
import {
  maintenancePlanDialogTabs,
  type MaintenancePlanDialogTab,
} from "../lib/maintenancePlanDialog";
import {
  emptyMaintenancePlanForm,
  maintenancePlanToFormState,
  type MaintenancePlan,
  type MaintenancePlanFormState,
  type MaintenancePlanIntervalUnit,
} from "../lib/maintenancePlanTypes";

type SelectOption = { label: string; value: string };

export type UseMaintenancePlanEditDialogStateOptions = {
  toastRef: RefObject<Toast | null>;
  onSaved?: (plan: MaintenancePlan | null) => void;
  onClose?: () => void;
};

export function useMaintenancePlanEditDialogState(options: UseMaintenancePlanEditDialogStateOptions) {
  const { toastRef, onSaved, onClose } = options;
  const { t } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const tabHostRef = useRef<HTMLDivElement>(null);
  const refData = useWorkOrderSearchReferenceData({ autoLoad: true });

  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<MaintenancePlan | null>(null);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(maintenancePlanDialogTabs.General);
  const [form, setForm] = useState<MaintenancePlanFormState>(emptyMaintenancePlanForm());
  const [saving, setSaving] = useState(false);
  const [inspectionRounds, setInspectionRounds] = useState<
    Array<{ id: string; key: string; name: string; siteId: string }>
  >([]);

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

  const orderTypeOptions = useMemo<SelectOption[]>(() => {
    // form.siteId is seeded from the user's Hauptbuchungskreis on create.
    const siteId = selectedAsset?.siteId || form.siteId || user?.workingSiteId || "";
    if (!siteId) return [];
    return refData.workOrderTypes
      .filter((row) => row.siteId === siteId)
      .filter((row) => row.isActive || row.key === form.orderType)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
      .map((row) => ({
        label: row.isActive ? row.name : `${row.name} (${t("auftragstypen.inactive")})`,
        value: row.key,
      }));
  }, [form.orderType, form.siteId, refData.workOrderTypes, selectedAsset?.siteId, t, user?.workingSiteId]);

  const classificationOptions = useMemo<SelectOption[]>(
    () =>
      refData.classifications
        .filter((cl) => selectedAsset?.siteId && cl.siteId === selectedAsset.siteId && cl.appliesToWorkOrder)
        .map((cl) => ({ label: `${cl.key} - ${cl.name}`, value: cl.id })),
    [refData.classifications, selectedAsset?.siteId],
  );

  const inspectionRoundOptions = useMemo<SelectOption[]>(
    () =>
      inspectionRounds
        .filter((r) => (form.siteId ? r.siteId === form.siteId : true))
        .map((r) => ({ label: `${r.key} - ${r.name}`, value: r.id })),
    [form.siteId, inspectionRounds],
  );

  useEffect(() => {
    if (!dialogVisible) return;
    void (async () => {
      try {
        const res = await apiFetch("/api/inspection-rounds");
        if (!res.ok) return;
        const data = (await res.json()) as Array<{
          id: string;
          key: string;
          name: string;
          siteId: string;
        }>;
        setInspectionRounds(Array.isArray(data) ? data : []);
      } catch {
        setInspectionRounds([]);
      }
    })();
  }, [dialogVisible]);

  useEffect(() => {
    if (!form.inspectionRoundId) return;
    const ok = inspectionRoundOptions.some((o) => o.value === form.inspectionRoundId);
    if (!ok) setForm((cur) => ({ ...cur, inspectionRoundId: "" }));
  }, [form.inspectionRoundId, inspectionRoundOptions]);

  useEffect(() => {
    if (!form.siteId && !selectedAsset?.siteId) return;
    if (orderTypeOptions.length === 0) return;
    const stillAllowed = orderTypeOptions.some((o) => o.value === form.orderType);
    if (stillAllowed) return;
    const preferred =
      orderTypeOptions.find((o) => o.value === "maintenance")?.value ?? orderTypeOptions[0]?.value;
    if (!preferred) return;
    setForm((cur) => ({ ...cur, orderType: preferred }));
  }, [form.orderType, form.siteId, orderTypeOptions, selectedAsset?.siteId]);

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

  const closeDialog = useCallback(() => {
    setDialogVisible(false);
    setEditingId(null);
    setEditingRow(null);
    onClose?.();
  }, [onClose]);

  const openCreate = useCallback(() => {
    // Neue Datensätze starten immer im Hauptbuchungskreis des Users.
    const defaultSiteId = user?.workingSiteId ?? "";
    setEditingId(null);
    setEditingRow(null);
    setActiveTabIndex(maintenancePlanDialogTabs.General);
    setForm(emptyMaintenancePlanForm(defaultSiteId));
    setDialogVisible(true);
  }, [user?.workingSiteId]);

  const openEdit = useCallback((row: MaintenancePlan) => {
    setEditingId(row.id);
    setEditingRow(row);
    setActiveTabIndex(maintenancePlanDialogTabs.General);
    setForm(maintenancePlanToFormState(row));
    setDialogVisible(true);
  }, []);

  const setActiveTab = useCallback((tab: MaintenancePlanDialogTab | number) => {
    setActiveTabIndex(tab);
  }, []);

  const save = useCallback(async () => {
    if (
      !form.key.trim() ||
      !form.name.trim() ||
      !form.siteId ||
      !form.assetId ||
      !form.costCenterId ||
      !form.workgroupId ||
      !form.orderType ||
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
        inspectionRoundId: form.inspectionRoundId || null,
        plannedDurationMinutes: form.plannedDurationMinutes,
        orderType: form.orderType,
        intervalUnit: form.intervalUnit,
        intervalValue: form.intervalValue,
        nextDueAt: form.nextDueAt.toISOString(),
        leadTimeDays: form.leadTimeDays,
        isActive: form.isActive,
        ignoreOpenWorkOrders: form.ignoreOpenWorkOrders,
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
      const saved = (await res.json().catch(() => null)) as MaintenancePlan | null;
      toastRef.current?.show({
        severity: "success",
        summary: editingId ? t("maintenancePlans.saved") : t("maintenancePlans.created"),
        life: 2500,
      });
      setDialogVisible(false);
      setEditingId(null);
      setEditingRow(null);
      onSaved?.(saved);
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
  }, [editingId, form, onSaved, t, toastRef]);

  return {
    dialogVisible,
    editingId,
    editingRow,
    activeTabIndex,
    setActiveTabIndex: setActiveTab,
    form,
    setForm,
    saving,
    siteFieldLocked,
    tabHostRef,
    refData,
    intervalUnitOptions,
    siteDropdownOptions,
    assetOptions,
    costCenterOptions,
    orderTypeOptions,
    classificationOptions,
    inspectionRoundOptions,
    workgroupOptions,
    responsibleEmployeeOptions,
    updateTabInk,
    openCreate,
    openEdit,
    closeDialog,
    save,
  };
}

export type MaintenancePlanEditDialogProps = ReturnType<typeof useMaintenancePlanEditDialogState>;

export type { MaintenancePlanIntervalUnit };
