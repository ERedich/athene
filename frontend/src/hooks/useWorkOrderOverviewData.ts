import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../lib/api";
import type { StatusHistoryEntry } from "../lib/workOrderOverviewCharts";
import type { TransactionRow } from "../pages/TransactionsPage";

export type WorkOrderOverviewAssignment = {
  id: string;
  employeeKey: string;
  employeeName: string;
};

type LoadState = {
  assignments: WorkOrderOverviewAssignment[];
  transactions: TransactionRow[];
  statusHistory: StatusHistoryEntry[];
  loading: boolean;
  error: boolean;
};

const emptyState: LoadState = {
  assignments: [],
  transactions: [],
  statusHistory: [],
  loading: false,
  error: false,
};

export function useWorkOrderOverviewData(orderId: string | null) {
  const [state, setState] = useState<LoadState>(emptyState);

  const load = useCallback(async (id: string) => {
    setState((s) => ({ ...s, loading: true, error: false }));
    try {
      const txParams = new URLSearchParams();
      txParams.set("workOrderId", id);
      txParams.set("page", "1");
      txParams.set("limit", "200");

      const [assignRes, txRes, historyRes] = await Promise.all([
        apiFetch(`/api/work-orders/${id}/assignments`),
        apiFetch(`/api/transactions?${txParams.toString()}`),
        apiFetch(`/api/work-orders/${id}/status-history`),
      ]);

      let assignments: WorkOrderOverviewAssignment[] = [];
      if (assignRes.ok) {
        const raw = (await assignRes.json()) as {
          employeeKey?: string;
          employeeName?: string;
          id?: string;
        }[];
        assignments = Array.isArray(raw)
          ? raw.map((a) => ({
              id: a.id ?? "",
              employeeKey: a.employeeKey ?? "",
              employeeName: a.employeeName ?? "",
            }))
          : [];
      }

      let transactions: TransactionRow[] = [];
      if (txRes.ok) {
        const data = (await txRes.json()) as { rows?: TransactionRow[] };
        transactions = Array.isArray(data.rows) ? data.rows : [];
      }

      let statusHistory: StatusHistoryEntry[] = [];
      if (historyRes.ok) {
        const raw = (await historyRes.json()) as StatusHistoryEntry[];
        statusHistory = Array.isArray(raw) ? raw : [];
      }

      setState({
        assignments,
        transactions,
        statusHistory,
        loading: false,
        error: !assignRes.ok && !txRes.ok && !historyRes.ok,
      });
    } catch {
      setState({ assignments: [], transactions: [], statusHistory: [], loading: false, error: true });
    }
  }, []);

  useEffect(() => {
    if (!orderId) {
      setState(emptyState);
      return;
    }
    void load(orderId);
  }, [orderId, load]);

  return state;
}
