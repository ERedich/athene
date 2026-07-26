import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { useTranslation } from "react-i18next";

import { apiFetch } from "../../lib/api";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import type { WorkOrder, WorkOrderSlaState } from "../../lib/workOrderTypes";

type SelectOption = { label: string; value: string };

type CustomerRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
};

type ServiceContractRow = {
  id: string;
  key: string;
  name: string;
  customerId: string;
  siteId: string;
  isActive: boolean;
};

type BillingLine = {
  kind: "labor" | "travel" | "material" | "flat";
  quantity: number;
  unitRate: number | null;
  amount: number;
};

type BillingSummary = {
  billingModel: "flat" | "timeAndMaterial" | null;
  lines: BillingLine[];
  total: number;
  serviceContractId: string | null;
};

type Props = {
  siteId: string | null | undefined;
  customerId: string;
  serviceContractId: string;
  onCustomerIdChange: (value: string) => void;
  onServiceContractIdChange: (value: string) => void;
  editingRow: WorkOrder | null;
  editingId: string | null;
  disabled: boolean;
};

function slaBadgeClass(state: WorkOrderSlaState | null | undefined): string {
  if (state === "overdue") return "bg-red-500/15 text-red-800 dark:bg-red-400/20 dark:text-red-50";
  if (state === "warn") return "bg-amber-500/18 text-amber-950 dark:bg-amber-400/20 dark:text-amber-50";
  return "bg-emerald-500/15 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-50";
}

function formatDt(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale);
}

function formatMoney(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value);
}

export function WorkOrderCustomerServiceTabContent(props: Props) {
  const { t, i18n } = useTranslation();
  const {
    siteId,
    customerId,
    serviceContractId,
    onCustomerIdChange,
    onServiceContractIdChange,
    editingRow,
    editingId,
    disabled,
  } = props;

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [contracts, setContracts] = useState<ServiceContractRow[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  const loadRefs = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const [customersRes, contractsRes] = await Promise.all([
        apiFetch("/api/customers"),
        apiFetch("/api/service-contracts"),
      ]);
      if (customersRes.ok) setCustomers((await customersRes.json()) as CustomerRow[]);
      if (contractsRes.ok) setContracts((await contractsRes.json()) as ServiceContractRow[]);
    } finally {
      setLoadingRefs(false);
    }
  }, []);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  const customerOptions = useMemo<SelectOption[]>(() => {
    return customers
      .filter((c) => (!siteId || c.siteId === siteId) && (c.isActive || c.id === customerId))
      .map((c) => ({ label: `${c.key} - ${c.name}`, value: c.id }));
  }, [customerId, customers, siteId]);

  const contractOptions = useMemo<SelectOption[]>(() => {
    return contracts
      .filter(
        (c) =>
          (!siteId || c.siteId === siteId) &&
          (!customerId || c.customerId === customerId) &&
          (c.isActive || c.id === serviceContractId),
      )
      .map((c) => ({ label: `${c.key} - ${c.name}`, value: c.id }));
  }, [contracts, customerId, serviceContractId, siteId]);

  useEffect(() => {
    if (!serviceContractId) return;
    const stillAllowed = contractOptions.some((o) => o.value === serviceContractId);
    if (!stillAllowed) onServiceContractIdChange("");
  }, [contractOptions, onServiceContractIdChange, serviceContractId]);

  const loadBillingSummary = async () => {
    if (!editingId) return;
    setBillingLoading(true);
    try {
      const res = await apiFetch(`/api/work-orders/${editingId}/billing-summary`);
      if (!res.ok) return;
      setBillingSummary((await res.json()) as BillingSummary);
    } finally {
      setBillingLoading(false);
    }
  };

  const slaRows = [
    {
      key: "reaction",
      label: t("workOrders.customerServiceSlaReaction"),
      dueAt: editingRow?.slaReactionDueAt,
      state: editingRow?.slaReactionState,
    },
    {
      key: "resolution",
      label: t("workOrders.customerServiceSlaResolution"),
      dueAt: editingRow?.slaResolutionDueAt,
      state: editingRow?.slaResolutionState,
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2" style={{ margin: 0, display: "grid" }}>
      <div className="space-y-2 md:col-span-1">
        <label htmlFor="order-customer" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
          {t("workOrders.customerServiceCustomer")}
        </label>
        <Dropdown
          inputId="order-customer"
          value={customerId || null}
          options={customerOptions}
          optionLabel="label"
          optionValue="value"
          onChange={(e) => {
            const next = String(e.value ?? "");
            onCustomerIdChange(next);
            if (next !== customerId) onServiceContractIdChange("");
          }}
          placeholder={t("workOrders.customerServiceCustomerPlaceholder")}
          className="w-full"
          filter
          showClear
          disabled={disabled || loadingRefs}
          appendTo={overlayAppendTo}
        />
      </div>

      <div className="space-y-2 md:col-span-1">
        <label htmlFor="order-service-contract" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
          {t("workOrders.customerServiceContract")}
        </label>
        <Dropdown
          inputId="order-service-contract"
          value={serviceContractId || null}
          options={contractOptions}
          optionLabel="label"
          optionValue="value"
          onChange={(e) => onServiceContractIdChange(String(e.value ?? ""))}
          placeholder={t("workOrders.customerServiceContractPlaceholder")}
          className="w-full"
          filter
          showClear
          disabled={disabled || loadingRefs || !customerId}
          appendTo={overlayAppendTo}
        />
      </div>

      <div className="space-y-3 md:col-span-2">
        <div className="text-[11px] text-outline uppercase tracking-[0.1em]">{t("workOrders.customerServiceSlaTitle")}</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {slaRows.map((row) => (
            <div
              key={row.key}
              className="rounded-sm border border-solid border-outline-variant/60 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{row.label}</span>
                <span
                  className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-medium ${slaBadgeClass(row.state ?? "ok")}`}
                >
                  {t(`workOrders.customerServiceSlaState.${row.state ?? "ok"}`)}
                </span>
              </div>
              <div className="mt-1 text-sm text-on-surface-variant">
                {t("workOrders.customerServiceSlaDue")}: {formatDt(row.dueAt, i18n.language)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingRow?.signedOffAt ? (
        <div className="space-y-1 md:col-span-2 rounded-sm border border-solid border-outline-variant/60 px-3 py-2">
          <div className="text-[11px] text-outline uppercase tracking-[0.1em]">
            {t("workOrders.customerServiceSignoffTitle")}
          </div>
          <div className="text-sm">
            {t("workOrders.customerServiceSignoffAt")}: {formatDt(editingRow.signedOffAt, i18n.language)}
          </div>
          {editingRow.signedOffByLoginName ? (
            <div className="text-sm text-on-surface-variant">
              {t("workOrders.customerServiceSignoffBy")}: {editingRow.signedOffByLoginName}
            </div>
          ) : null}
          {editingRow.signoffSatisfaction ? (
            <div className="text-sm">{t("workOrders.customerServiceSignoffSatisfaction")}: {editingRow.signoffSatisfaction}</div>
          ) : null}
          {editingRow.signoffRemark ? (
            <div className="text-sm text-on-surface-variant">{editingRow.signoffRemark}</div>
          ) : null}
        </div>
      ) : null}

      {editingId ? (
        <div className="space-y-2 md:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-outline uppercase tracking-[0.1em]">
              {t("workOrders.customerServiceBillingTitle")}
            </span>
            <Button
              type="button"
              size="small"
              outlined
              label={t("workOrders.customerServiceBillingLoad")}
              loading={billingLoading}
              disabled={disabled || billingLoading}
              onClick={() => void loadBillingSummary()}
            />
          </div>
          {billingSummary ? (
            <div className="rounded-sm border border-solid border-outline-variant/60 px-3 py-2 text-sm">
              <div className="mb-2 text-on-surface-variant">
                {t("workOrders.customerServiceBillingModel")}:{" "}
                {billingSummary.billingModel
                  ? t(`serviceContracts.billingModel.${billingSummary.billingModel}`)
                  : "—"}
              </div>
              <ul className="m-0 list-none space-y-1 p-0">
                {billingSummary.lines.map((line, idx) => (
                  <li key={idx} className="flex justify-between gap-4">
                    <span>{t(`workOrders.customerServiceBillingLine.${line.kind}`)}</span>
                    <span>{formatMoney(line.amount, i18n.language)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between gap-4 border-t border-solid border-outline-variant/60 pt-2 font-medium">
                <span>{t("workOrders.customerServiceBillingTotal")}</span>
                <span>{formatMoney(billingSummary.total, i18n.language)}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-on-surface-variant">{t("workOrders.customerServiceBillingHint")}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
