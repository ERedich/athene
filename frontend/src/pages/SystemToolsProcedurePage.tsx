import { useCallback, useEffect, useRef, useState } from "react";
import { WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import { Button } from "primereact/button";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { Toast } from "primereact/toast";

import { lucidePrimeBtnIcon } from "../icons/lucide";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import {
  fetchMaintenancePlanSweepStatus,
  fetchSystemToolCatalog,
  postGenerateDueMaintenancePlans,
} from "../lib/systemToolsApi";
import {
  isEnabledSystemToolId,
  isSystemToolId,
  type GenerateDueResult,
  type MaintenancePlanSweepStatus,
} from "../lib/systemToolTypes";

const SKIP_REASON_KEYS: Record<string, string> = {
  not_found: "systemTools.skipNotFound",
  not_active: "systemTools.skipNotActive",
  not_due: "systemTools.skipNotDue",
  open_work_order_exists: "systemTools.skipOpenWorkOrder",
  no_responsibles: "systemTools.skipNoResponsibles",
  unauthorized: "systemTools.skipUnauthorized",
  create_failed: "systemTools.skipCreateFailed",
};

function formatDateTime(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function SystemToolsProcedurePage() {
  const { t, i18n } = useTranslation();
  const { procedureId } = useParams<{ procedureId: string }>();
  const { setHeaderActions, setHeaderRowCount } =
    useOutletContext<AppShellOutletContext>();
  const toast = useRef<Toast>(null);

  const [dueCount, setDueCount] = useState<number | null>(null);
  const [sweep, setSweep] = useState<MaintenancePlanSweepStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastResults, setLastResults] = useState<GenerateDueResult[] | null>(null);
  const [error, setError] = useState(false);

  const toolOk = isSystemToolId(procedureId);
  const enabledOk = isEnabledSystemToolId(procedureId);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [catalog, status] = await Promise.all([
        fetchSystemToolCatalog(),
        fetchMaintenancePlanSweepStatus(),
      ]);
      const item = catalog.find((c) => c.id === "maintenance-plan-generate-due");
      setDueCount(item?.dueCount ?? 0);
      setSweep(status);
    } catch {
      setError(true);
      toast.current?.show({
        severity: "error",
        summary: t("systemTools.loadError"),
        life: 4000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!enabledOk) return;
    void load();
  }, [enabledOk, load]);

  useEffect(() => {
    setHeaderRowCount(null);
    setHeaderActions(null);
    return () => {
      setHeaderRowCount(null);
      setHeaderActions(null);
    };
  }, [setHeaderActions, setHeaderRowCount]);

  const runGenerate = useCallback(async () => {
    setRunning(true);
    try {
      const data = await postGenerateDueMaintenancePlans();
      const results = data.results ?? [];
      setLastResults(results);
      const created = results.filter((r) => r.status === "created").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      toast.current?.show({
        severity: "success",
        summary: t("systemTools.generateDone", { created, skipped }),
        life: 4500,
      });
      await load();
    } catch {
      toast.current?.show({
        severity: "error",
        summary: t("systemTools.generateError"),
        life: 4000,
      });
    } finally {
      setRunning(false);
    }
  }, [load, t]);

  const confirmRun = useCallback(() => {
    confirmDialog({
      message: t("systemTools.confirmGenerate", { count: dueCount ?? 0 }),
      header: t("systemTools.confirmGenerateTitle"),
      icon: "pi pi-exclamation-triangle",
      acceptLabel: t("systemTools.yes"),
      rejectLabel: t("systemTools.no"),
      accept: () => void runGenerate(),
    });
  }, [dueCount, runGenerate, t]);

  if (!toolOk || !enabledOk) {
    return <Navigate to="/systemwerkzeuge" replace />;
  }

  const skipSummary = (() => {
    if (!lastResults) return null;
    const skipped = lastResults.filter((r) => r.status === "skipped");
    if (skipped.length === 0) return null;
    const counts = new Map<string, number>();
    for (const r of skipped) {
      const key = r.reason ?? "create_failed";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([reason, count]) => {
      const labelKey = SKIP_REASON_KEYS[reason];
      const label = labelKey ? t(labelKey) : reason;
      return `${count}× ${label}`;
    });
  })();

  return (
    <div className="app-system-tools-procedure min-h-0 flex-1 overflow-auto p-4">
      <Toast ref={toast} position="top-right" />
      <ConfirmDialog />

      <div className="mb-4">
        <Link
          to="/systemwerkzeuge"
          className="text-sm text-primary no-underline hover:underline"
        >
          {t("systemTools.backToHub")}
        </Link>
      </div>

      {error && !loading ? (
        <div className="rounded-lg bg-surface-container-low p-4 text-sm text-on-surface">
          <p>{t("systemTools.loadError")}</p>
          <Button
            type="button"
            label={t("systemTools.retry")}
            size="small"
            className="mt-3"
            onClick={() => void load()}
          />
        </div>
      ) : (
        <div className="app-system-tools-procedure-card max-w-2xl">
          <h2 className="m-0 text-lg font-semibold text-on-surface">
            {t("systemTools.toolGenerateDue")}
          </h2>
          <p className="mt-2 mb-0 text-sm text-on-surface-variant">
            {t("systemTools.procedureGenerateDueLead")}
          </p>

          <dl className="app-system-tools-kpis mt-4 mb-0">
            <div>
              <dt>{t("systemTools.kpiDue")}</dt>
              <dd aria-live="polite">
                {loading ? "…" : dueCount != null ? dueCount : "—"}
              </dd>
            </div>
            <div>
              <dt>{t("systemTools.kpiLastSweep")}</dt>
              <dd>
                {loading
                  ? "…"
                  : formatDateTime(sweep?.lastRunAt ?? null, i18n.language)}
              </dd>
            </div>
            <div>
              <dt>{t("systemTools.kpiNextSweep")}</dt>
              <dd>
                {loading
                  ? "…"
                  : formatDateTime(sweep?.nextRunAt ?? null, i18n.language)}
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            <Button
              type="button"
              disabled={running || loading}
              onClick={confirmRun}
              className="gap-2"
            >
              <WandSparkles className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
              <span>{t("systemTools.runGenerate")}</span>
            </Button>
          </div>

          {lastResults ? (
            <div className="mt-4 rounded-lg bg-surface-container-low p-3 text-sm text-on-surface">
              <p className="m-0 font-medium">
                {t("systemTools.lastRunSummary", {
                  created: lastResults.filter((r) => r.status === "created").length,
                  skipped: lastResults.filter((r) => r.status === "skipped").length,
                })}
              </p>
              {skipSummary && skipSummary.length > 0 ? (
                <ul className="mt-2 mb-0 list-disc pl-5 text-on-surface-variant">
                  {skipSummary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
