import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { Paginator, type PaginatorPageChangeEvent } from "primereact/paginator";
import { Toast } from "primereact/toast";

export type AuditLogEntry = {
  id: string;
  tableName: string;
  recordId: string;
  operation: string;
  changedAt: string;
  changedBy: string | null;
  changedByLogin: string | null;
  requestId: string | null;
  oldData: unknown;
  newData: unknown;
  changedFields: string[] | null;
  reason: string | null;
  source: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

const fetchOpts: RequestInit = { credentials: "include" };

export function AuditLogPage() {
  const { t, i18n } = useTranslation();
  const toastRef = useRef<Toast>(null);
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);

  const [filterTable, setFilterTable] = useState("");
  const [filterRecordId, setFilterRecordId] = useState("");
  const [filterOperation, setFilterOperation] = useState<string | null>(null);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  const operationOptions = useMemo(
    () => [
      { label: t("auditLog.opAll"), value: null },
      { label: "INSERT", value: "INSERT" },
      { label: "UPDATE", value: "UPDATE" },
      { label: "DELETE", value: "DELETE" },
    ],
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page + 1));
    params.set("limit", String(limit));
    if (filterTable.trim()) params.set("tableName", filterTable.trim());
    if (filterRecordId.trim()) params.set("recordId", filterRecordId.trim());
    if (filterOperation) params.set("operation", filterOperation);
    if (filterFrom.trim()) params.set("from", filterFrom.trim());
    if (filterTo.trim()) params.set("to", filterTo.trim());
    try {
      const res = await fetch(`/api/audit-log?${params.toString()}`, fetchOpts);
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as {
        rows: AuditLogEntry[];
        total: number;
      };
      setRows(data.rows);
      setTotal(data.total);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("auditLog.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterTable, filterRecordId, filterOperation, filterFrom, filterTo, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPageChange = (e: PaginatorPageChangeEvent) => {
    if (e.rows !== limit) {
      setLimit(e.rows);
      setPage(0);
      return;
    }
    setPage(e.page);
  };

  const formatDt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const opBody = (row: AuditLogEntry) => (
    <span className="font-mono text-xs">{row.operation}</span>
  );

  const detailFooter = (
    <div className="flex justify-end">
      <Button type="button" label={t("auditLog.close")} onClick={() => setDetail(null)} />
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />
      <p className="m-0 text-sm text-on-surface-variant">{t("auditLog.intro")}</p>

      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-white/10 bg-surface-container-low p-3">
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-outline" htmlFor="al-table">
            {t("auditLog.filterTable")}
          </label>
          <InputText
            id="al-table"
            value={filterTable}
            onChange={(e) => {
              setFilterTable(e.target.value);
              setPage(0);
            }}
            className="text-sm"
            placeholder="site"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-outline" htmlFor="al-record">
            {t("auditLog.filterRecord")}
          </label>
          <InputText
            id="al-record"
            value={filterRecordId}
            onChange={(e) => {
              setFilterRecordId(e.target.value);
              setPage(0);
            }}
            className="font-mono text-sm"
            placeholder="uuid"
          />
        </div>
        <div className="space-y-1">
          <span className="block text-[10px] uppercase tracking-wider text-outline">{t("auditLog.filterOp")}</span>
          <Dropdown
            value={filterOperation}
            options={operationOptions}
            onChange={(e) => {
              setFilterOperation(e.value as string | null);
              setPage(0);
            }}
            className="min-w-[10rem] text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-outline" htmlFor="al-from">
            {t("auditLog.filterFrom")}
          </label>
          <InputText
            id="al-from"
            value={filterFrom}
            onChange={(e) => {
              setFilterFrom(e.target.value);
              setPage(0);
            }}
            className="font-mono text-sm"
            placeholder="2026-01-01T00:00:00Z"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-outline" htmlFor="al-to">
            {t("auditLog.filterTo")}
          </label>
          <InputText
            id="al-to"
            value={filterTo}
            onChange={(e) => {
              setFilterTo(e.target.value);
              setPage(0);
            }}
            className="font-mono text-sm"
            placeholder="2026-12-31T23:59:59Z"
          />
        </div>
        <Button
          type="button"
          icon="pi pi-refresh"
          label={t("auditLog.apply")}
          outlined
          size="small"
          className="ml-auto"
          onClick={() => void load()}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <DataTable
          className="compact-data-table w-full"
          value={rows}
          loading={loading}
          dataKey="id"
          stripedRows
          size="small"
          scrollable
          scrollHeight="flex"
          emptyMessage={t("auditLog.empty")}
          onRowClick={(e) => setDetail(e.data as AuditLogEntry)}
          rowClassName={() => "cursor-pointer"}
        >
          <Column
            field="changedAt"
            header={t("auditLog.colWhen")}
            body={(r: AuditLogEntry) => formatDt(r.changedAt)}
            sortable
            className="whitespace-nowrap"
          />
          <Column field="tableName" header={t("auditLog.colTable")} sortable />
          <Column field="recordId" header={t("auditLog.colRecord")} body={(r) => <span className="font-mono text-xs">{r.recordId}</span>} />
          <Column header={t("auditLog.colOp")} body={opBody} className="w-28" />
          <Column field="changedByLogin" header={t("auditLog.colUser")} />
          <Column field="requestId" header={t("auditLog.colRequest")} body={(r) => <span className="font-mono text-xs truncate max-w-[8rem] inline-block">{r.requestId ?? "—"}</span>} />
        </DataTable>
        <Paginator
          first={page * limit}
          rows={limit}
          totalRecords={total}
          onPageChange={onPageChange}
          template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
          rowsPerPageOptions={[25, 50, 100]}
        />
      </div>

      <Dialog
        header={t("auditLog.detailTitle")}
        visible={detail !== null}
        style={{ width: "min(48rem, 95vw)" }}
        onHide={() => setDetail(null)}
        footer={detailFooter}
        modal
        draggable={false}
        resizable={false}
      >
        {detail ? (
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto text-sm">
            <dl className="m-0 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
              <dt className="text-on-surface-variant">{t("auditLog.colTable")}</dt>
              <dd className="m-0 font-mono">{detail.tableName}</dd>
              <dt className="text-on-surface-variant">{t("auditLog.colRecord")}</dt>
              <dd className="m-0 font-mono text-xs">{detail.recordId}</dd>
              <dt className="text-on-surface-variant">{t("auditLog.colOp")}</dt>
              <dd className="m-0 font-mono">{detail.operation}</dd>
              <dt className="text-on-surface-variant">{t("auditLog.colWhen")}</dt>
              <dd className="m-0">{formatDt(detail.changedAt)}</dd>
              <dt className="text-on-surface-variant">{t("auditLog.colUser")}</dt>
              <dd className="m-0">{detail.changedByLogin ?? detail.changedBy ?? "—"}</dd>
              <dt className="text-on-surface-variant">{t("auditLog.colRequest")}</dt>
              <dd className="m-0 font-mono text-xs break-all">{detail.requestId ?? "—"}</dd>
              {detail.changedFields?.length ? (
                <>
                  <dt className="text-on-surface-variant">{t("auditLog.changedFields")}</dt>
                  <dd className="m-0 font-mono text-xs">{detail.changedFields.join(", ")}</dd>
                </>
              ) : null}
            </dl>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  {t("auditLog.oldData")}
                </div>
                <pre className="max-h-64 overflow-auto rounded-sm border border-white/10 bg-black/30 p-2 text-xs font-mono">
                  {detail.oldData != null ? JSON.stringify(detail.oldData, null, 2) : "—"}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  {t("auditLog.newData")}
                </div>
                <pre className="max-h-64 overflow-auto rounded-sm border border-white/10 bg-black/30 p-2 text-xs font-mono">
                  {detail.newData != null ? JSON.stringify(detail.newData, null, 2) : "—"}
                </pre>
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
