import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, Pencil, Plus, RefreshCw, Trash2, WandSparkles, CalendarRange } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { AppDialog } from "../components/AppDialog";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import { fetchMaintenancePlans } from "../lib/maintenancePlanApi";
import type { MaintenancePlan, MaintenancePlanIntervalUnit } from "../lib/maintenancePlanTypes";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";
import { useAppCrud, usePermission } from "../lib/usePermission";
import { useTableContextMenu } from "../lib/useTableContextMenu";
import { useWorkOrderSearchReferenceData } from "../hooks/useWorkOrderSearchReferenceData";
import { useMaintenancePlanDialog } from "../maintenancePlans/MaintenancePlanDialogContext";
import {
  createActionIcon,
  createActionNavItem,
  deleteActionIcon,
  deleteActionNavItem,
  primaryActionIcon,
  primaryActionNavItem,
} from "../lib/headerActionClasses";

const fieldLabelClass = "block text-[11px] text-outline uppercase tracking-[0.1em]";

export function MaintenancePlansPage() {
  const { t } = useTranslation();
  const crud = useAppCrud("maintenance-plans");
  const canGenerateDue = usePermission("maintenance-plans.generateDue");
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const refData = useWorkOrderSearchReferenceData({ autoLoad: true });
  const mpDialog = useMaintenancePlanDialog();

  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<MaintenancePlan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [rolloutVisible, setRolloutVisible] = useState(false);
  const [rolloutPlan, setRolloutPlan] = useState<MaintenancePlan | null>(null);
  const [rolloutUntil, setRolloutUntil] = useState<Date | null>(null);
  const [rolloutSaving, setRolloutSaving] = useState(false);

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
      setPlans(await fetchMaintenancePlans());
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
    mpDialog.openCreate({
      onSaved: () => {
        void loadPlans();
      },
    });
  }, [loadPlans, mpDialog]);

  const openEdit = useCallback(
    (row: MaintenancePlan) => {
      mpDialog.openEdit(row, {
        onSaved: () => {
          void loadPlans();
        },
      });
    },
    [loadPlans, mpDialog],
  );

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

  const openRollout = useCallback((row: MaintenancePlan) => {
    setRolloutPlan(row);
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setRolloutUntil(tomorrow);
    setRolloutVisible(true);
  }, []);

  const submitRollout = useCallback(async () => {
    if (!rolloutPlan || !rolloutUntil) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("maintenancePlans.rolloutUntilRequired"),
        life: 3500,
      });
      return;
    }
    const y = rolloutUntil.getFullYear();
    const m = String(rolloutUntil.getMonth() + 1).padStart(2, "0");
    const d = String(rolloutUntil.getDate()).padStart(2, "0");
    const untilDate = `${y}-${m}-${d}`;
    setRolloutSaving(true);
    try {
      const res = await apiFetch(`/api/maintenance-plans/${rolloutPlan.id}/rollout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ untilDate }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (body.error === "until_date_in_past") throw new Error("past");
        if (body.error === "invalid_until_date") throw new Error("invalid");
        throw new Error("rollout");
      }
      const data = (await res.json()) as { created: number };
      toastRef.current?.show({
        severity: "success",
        summary: t("maintenancePlans.rolloutDone", { count: data.created ?? 0 }),
        life: 4000,
      });
      setRolloutVisible(false);
      setRolloutPlan(null);
      await loadPlans();
    } catch (err) {
      const code = (err as Error).message;
      toastRef.current?.show({
        severity: "error",
        summary:
          code === "past"
            ? t("maintenancePlans.rolloutUntilPast")
            : code === "invalid"
              ? t("maintenancePlans.rolloutUntilRequired")
              : t("maintenancePlans.rolloutError"),
        life: 4500,
      });
    } finally {
      setRolloutSaving(false);
    }
  }, [loadPlans, rolloutPlan, rolloutUntil, t]);

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

  const tableCtx = useTableContextMenu<MaintenancePlan>({
    labels: {
      new: t("maintenancePlans.new"),
      edit: t("maintenancePlans.edit"),
      delete: t("maintenancePlans.delete"),
    },
    handlers: {
      onCreate: crud.canCreate ? openCreate : undefined,
      onEdit: crud.canUpdate ? openEdit : undefined,
      onDelete: crud.canDelete ? deletePlan : undefined,
    },
    canCreate: crud.canCreate,
    canEdit: crud.canUpdate,
    canDelete: crud.canDelete,
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
        {
          label: t("maintenancePlans.rollout"),
          icon: <CalendarRange className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
          command: () => openRollout(row),
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
        {crud.canCreate ? (
          <li>
            <button type="button" className={createActionNavItem} onClick={openCreate}>
              <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
              <span>{t("maintenancePlans.new")}</span>
            </button>
          </li>
        ) : null}
        {crud.canUpdate ? (
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
        ) : null}
        {crud.canDelete ? (
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
        ) : null}
        {canGenerateDue ? (
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
        ) : null}
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedPlan || rolloutSaving}
            title={t("maintenancePlans.rollout")}
            onClick={() => {
              if (selectedPlan) openRollout(selectedPlan);
            }}
          >
            <CalendarRange className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("maintenancePlans.rollout")}</span>
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
    canGenerateDue,
    crud.canCreate,
    crud.canDelete,
    crud.canUpdate,
    deletePlan,
    generateDue,
    generating,
    loadPlans,
    openCreate,
    openEdit,
    openRollout,
    rolloutSaving,
    searchTerm,
    selectedPlan,
    setHeaderActions,
    t,
  ]);

  const formatDateTime = useCallback((iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  }, []);

  const intervalLabel = useCallback(
    (unit: MaintenancePlanIntervalUnit) => {
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

      <AppDialog
        header={t("maintenancePlans.rolloutTitle")}
        visible={rolloutVisible}
        style={{ width: "min(24rem, 95vw)" }}
        onHide={() => {
          if (rolloutSaving) return;
          setRolloutVisible(false);
          setRolloutPlan(null);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              label={t("maintenancePlans.cancel")}
              severity="secondary"
              outlined
              disabled={rolloutSaving}
              onClick={() => {
                setRolloutVisible(false);
                setRolloutPlan(null);
              }}
            />
            <Button
              type="button"
              label={t("maintenancePlans.rolloutConfirm")}
              icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
              loading={rolloutSaving}
              onClick={() => void submitRollout()}
            />
          </div>
        }
        modal
        dismissableMask={!rolloutSaving}
        draggable={false}
        resizable={false}
        appendTo={overlayAppendTo}
      >
        <div className="space-y-3 pt-1">
          <p className="m-0 text-sm text-on-surface-variant">
            {t("maintenancePlans.rolloutHint", { name: rolloutPlan?.name ?? "" })}
          </p>
          <div className="space-y-2">
            <label htmlFor="mp-rollout-until" className={fieldLabelClass}>
              {t("maintenancePlans.rolloutUntil")}
            </label>
            <Calendar
              inputId="mp-rollout-until"
              value={rolloutUntil}
              onChange={(e) => {
                const next = e.value instanceof Date ? e.value : null;
                setRolloutUntil(next);
              }}
              dateFormat={refData.calendarDateFormat}
              className="w-full"
              minDate={new Date()}
              appendTo={overlayAppendTo}
            />
          </div>
        </div>
      </AppDialog>
    </div>
  );
}
