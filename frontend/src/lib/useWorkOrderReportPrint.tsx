import { useCallback, useRef, useState, type RefObject } from "react";
import { Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Toast } from "primereact/toast";

import { useAuth } from "../auth/AuthContext";
import { AppDialog } from "../components/AppDialog";
import { LucideSpinner } from "../icons/lucide";
import { apiFetch } from "./api";
import type { WorkOrder } from "./workOrderTypes";

type ReportListItem = { id: string; key: string; name: string };

export function useWorkOrderReportPrint(toastRef: RefObject<Toast | null>) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printReportsLoading, setPrintReportsLoading] = useState(false);
  const [printReports, setPrintReports] = useState<ReportListItem[]>([]);
  const [printTarget, setPrintTarget] = useState<WorkOrder | null>(null);
  const [printRenderingId, setPrintRenderingId] = useState<string | null>(null);
  const printRenderingIdRef = useRef<string | null>(null);

  const openPrintDialog = useCallback(
    async (row: WorkOrder) => {
      setPrintTarget(row);
      setPrintDialogOpen(true);
      setPrintReportsLoading(true);
      setPrintReports([]);
      try {
        const params = new URLSearchParams({
          siteId: user.workingSiteId,
          targetAppKey: "workOrders",
        });
        const res = await apiFetch(`/api/report-designer/definitions?${params}`);
        if (!res.ok) throw new Error("load");
        const data = (await res.json()) as { items: ReportListItem[] };
        setPrintReports(data.items ?? []);
      } catch {
        setPrintReports([]);
        toastRef.current?.show({
          severity: "error",
          summary: t("workOrders.printError"),
          life: 4000,
        });
      } finally {
        setPrintReportsLoading(false);
      }
    },
    [t, toastRef, user.workingSiteId],
  );

  const renderSavedReport = useCallback(
    async (definitionId: string) => {
      if (!printTarget) return;
      printRenderingIdRef.current = definitionId;
      setPrintRenderingId(definitionId);
      try {
        const report = printReports.find((r) => r.id === definitionId);
        const base =
          report?.name?.toLowerCase().replace(/[^a-z0-9-_]+/g, "-") || "report";
        const res = await apiFetch("/api/report-designer/render-saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            definitionId,
            recordId: printTarget.id,
          }),
        });
        if (!res.ok) throw new Error("pdf");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${base}-WO-${printTarget.orderNumber}.pdf`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setPrintDialogOpen(false);
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("workOrders.printError"),
          life: 5000,
        });
      } finally {
        printRenderingIdRef.current = null;
        setPrintRenderingId(null);
      }
    },
    [printReports, printTarget, t, toastRef],
  );

  const PrintDialogEl = (
    <AppDialog
      visible={printDialogOpen}
      onHide={() => {
        if (printRenderingIdRef.current) return;
        setPrintDialogOpen(false);
      }}
      header={t("workOrders.printPickReport")}
      style={{ width: "min(28rem, 94vw)" }}
      modal
    >
      <div className="flex flex-col gap-2">
        {printTarget ? (
          <div className="mb-1 text-xs text-on-surface-variant">
            #{printTarget.orderNumber} — {printTarget.name}
          </div>
        ) : null}
        {printReportsLoading ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <LucideSpinner className="h-4 w-4" />
            {t("workOrders.printLoading")}
          </div>
        ) : printReports.length === 0 ? (
          <div className="text-sm text-on-surface-variant">{t("workOrders.printEmpty")}</div>
        ) : (
          printReports.map((report) => (
            <button
              key={report.id}
              type="button"
              disabled={printRenderingId != null}
              className="flex w-full items-center justify-between gap-2 rounded-sm border border-outline-variant bg-surface px-3 py-2 text-left text-sm hover:bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] disabled:opacity-50"
              onClick={() => void renderSavedReport(report.id)}
            >
              <span className="font-semibold text-on-surface">{report.name}</span>
              {printRenderingId === report.id ? (
                <LucideSpinner className="h-4 w-4 shrink-0" />
              ) : (
                <Printer className="h-4 w-4 shrink-0 text-on-surface-variant" strokeWidth={1.75} />
              )}
            </button>
          ))
        )}
      </div>
    </AppDialog>
  );

  return { openPrintDialog, PrintDialogEl };
}
