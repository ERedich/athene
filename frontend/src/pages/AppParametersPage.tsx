import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { TabPanel, TabView } from "primereact/tabview";
import { Toast } from "primereact/toast";

import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";

type AppParameterRow = {
  id: string;
  key: string;
  category: string;
  codeSuffix: string;
  nameDe: string;
  nameEn: string;
  descriptionDe: string | null;
  descriptionEn: string | null;
  valueType: string;
  boolValue: boolean;
  updatedAt: string;
};

const CATEGORIES = ["GN", "WO", "SH", "MT", "PO", "SV"] as const;
type CategoryCode = (typeof CATEGORIES)[number];

const tabKey: Record<CategoryCode, string> = {
  GN: "appParameters.tabGN",
  WO: "appParameters.tabWO",
  SH: "appParameters.tabSH",
  MT: "appParameters.tabMT",
  PO: "appParameters.tabPO",
  SV: "appParameters.tabSV",
};

export function AppParametersPage() {
  const { t, i18n } = useTranslation();
  const { setHeaderActions } = useOutletContext<AppShellOutletContext>();
  const { refresh } = useAuth();
  const toastRef = useRef<Toast>(null);
  const tabHostRef = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState<AppParameterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [patchingKey, setPatchingKey] = useState<string | null>(null);

  const langDe = i18n.language?.toLowerCase().startsWith("de");

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
    const raf = requestAnimationFrame(updateTabInk);
    return () => cancelAnimationFrame(raf);
  }, [activeTab, loading, rows.length, updateTabInk]);

  useEffect(() => {
    window.addEventListener("resize", updateTabInk);
    return () => window.removeEventListener("resize", updateTabInk);
  }, [updateTabInk]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/app-parameters");
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as AppParameterRow[];
      setRows(data);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("appParameters.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setHeaderActions(null);
    return () => setHeaderActions(null);
  }, [setHeaderActions]);

  const handleTabChange = useCallback((event: { index: number }) => {
    setActiveTab(event.index);
  }, []);

  const byCategory = useCallback(
    (cat: CategoryCode) => rows.filter((r) => r.category === cat),
    [rows],
  );

  const patchBool = useCallback(
    async (key: string, boolValue: boolean) => {
      setPatchingKey(key);
      const prev = rows;
      setRows((cur) => cur.map((r) => (r.key === key ? { ...r, boolValue } : r)));
      try {
        const res = await apiFetch(`/api/app-parameters/${encodeURIComponent(key)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boolValue }),
        });
        if (!res.ok) throw new Error("patch");
        const updated = (await res.json()) as AppParameterRow;
        setRows((cur) => cur.map((r) => (r.key === key ? updated : r)));
        await refresh();
        toastRef.current?.show({
          severity: "success",
          summary: t("appParameters.saved"),
          life: 3000,
        });
      } catch {
        setRows(prev);
        toastRef.current?.show({
          severity: "error",
          summary: t("appParameters.saveError"),
          life: 6000,
        });
      } finally {
        setPatchingKey(null);
      }
    },
    [rows, refresh, t],
  );

  const nameBody = useCallback(
    (row: AppParameterRow) => <span>{langDe ? row.nameDe : row.nameEn}</span>,
    [langDe],
  );

  const descBody = useCallback(
    (row: AppParameterRow) => {
      const text = langDe ? row.descriptionDe : row.descriptionEn;
      if (!text) return <span className="text-on-surface-variant">—</span>;
      return (
        <span className="block text-on-surface-variant text-sm leading-snug">{text}</span>
      );
    },
    [langDe],
  );

  const valueBody = useCallback(
    (row: AppParameterRow) => {
      if (row.valueType !== "boolean") return null;
      return (
        <div
          className="flex justify-center py-0.5"
          onClick={(ev) => ev.stopPropagation()}
          onKeyDown={(ev) => ev.stopPropagation()}
        >
          <Checkbox
            inputId={`app-param-${row.key}`}
            checked={row.boolValue}
            disabled={patchingKey === row.key}
            className="rounded-none"
            onChange={(e) => void patchBool(row.key, Boolean(e.checked))}
          />
        </div>
      );
    },
    [patchBool, patchingKey],
  );

  const panels = useMemo(
    () =>
      CATEGORIES.map((cat) => (
        <TabPanel key={cat} header={t(tabKey[cat])}>
          <div className="app-parameters-tab-panel-inner">
            <DataTable
              className="app-data-table app-parameters-data-table w-full"
              value={byCategory(cat)}
              loading={loading && rows.length === 0}
              dataKey="key"
              stripedRows
              showGridlines
              scrollable
              scrollHeight="flex"
              emptyMessage={t("appParameters.emptyTab")}
              tableStyle={{ width: "100%", minWidth: 0, tableLayout: "fixed" }}
            >
              <Column
                field="key"
                header={t("appParameters.colKey")}
                style={{ width: "11rem" }}
                className="font-mono text-sm align-top"
              />
              <Column
                header={t("appParameters.colName")}
                body={nameBody}
                style={{ width: "16%" }}
                className="align-top"
              />
              <Column header={t("appParameters.colDescription")} body={descBody} className="align-top" />
              <Column
                header={t("appParameters.colValue")}
                body={valueBody}
                style={{ width: "5.5rem" }}
                className="text-center align-top"
              />
            </DataTable>
          </div>
        </TabPanel>
      )),
    [byCategory, descBody, loading, nameBody, rows.length, t, valueBody],
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />
      <div className="app-tabbed-page-shell">
        <div ref={tabHostRef} className="app-tabview-with-ink">
          <TabView
            className="app-sticky-tabs"
            activeIndex={activeTab}
            onTabChange={handleTabChange}
          >
            {panels}
          </TabView>
        </div>
      </div>
    </div>
  );
}
