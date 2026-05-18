import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Badge } from "primereact/badge";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";

import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import {
  APP_PARAM_KEY_ALLOW_CHANGE_STOCKDATA,
  APP_PARAM_KEY_ALLOW_SITE_CHANGE,
} from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { sparePartDialogTabs, type SparePartDialogTab } from "../lib/sparePartDialog";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";
import { useTableContextMenu } from "../lib/useTableContextMenu";

type SiteOption = {
  id: string;
  key: string;
  name: string;
  colorHex: string;
};

type SiteDropdownOption = { label: string; value: string };

type ClassificationListRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  appliesToMaterial: boolean;
};

type WarehouseListRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
};

type StockControlLineRow = {
  id: string;
  warehouseId: string;
  warehouseKey: string;
  warehouseName: string;
  storageLocation: string;
  quantity: string;
};

type SparePart = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  isActive: boolean;
  serialNumber: string | null;
  classificationId: string | null;
  classificationKey: string | null;
  classificationName: string | null;
  manufacturer: string | null;
  articleNumber: string | null;
  alternativeDesignation: string | null;
  stockControlLines?: StockControlLineRow[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type StockLineForm = {
  localId: string;
  /** Set when loaded from API — existing stock rows are read-only when MT-ACSD is N. */
  persistedId?: string;
  warehouseId: string;
  storageLocation: string;
  quantity: number;
};

type FormState = {
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  serialNumber: string;
  classificationId: string;
  manufacturer: string;
  articleNumber: string;
  alternativeDesignation: string;
};

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  siteId: "",
  isActive: true,
  serialNumber: "",
  classificationId: "",
  manufacturer: "",
  articleNumber: "",
  alternativeDesignation: "",
});

const newStockLine = (): StockLineForm => ({
  localId: crypto.randomUUID(),
  warehouseId: "",
  storageLocation: "",
  quantity: 0,
});

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const deleteActionIcon = "text-red-500";

function mapStockLinesFromApi(lines: StockControlLineRow[]): StockLineForm[] {
  return lines.map((line) => ({
    localId: line.id || crypto.randomUUID(),
    persistedId: line.id,
    warehouseId: line.warehouseId,
    storageLocation: line.storageLocation ?? "",
    quantity: Number(line.quantity) || 0,
  }));
}

function isPersistedStockLine(line: StockLineForm): boolean {
  return Boolean(line.persistedId);
}

export function SparePartsPage() {
  const { t, i18n } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const allowChangeStockdata =
    appParameterBooleans[APP_PARAM_KEY_ALLOW_CHANGE_STOCKDATA] !== false;
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [classifications, setClassifications] = useState<ClassificationListRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSparePart, setSelectedSparePart] = useState<SparePart | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [stockLines, setStockLines] = useState<StockLineForm[]>([]);
  const [stockDetailLoading, setStockDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTabIndex, setActiveTabIndex] = useState<SparePartDialogTab>(
    sparePartDialogTabs.General,
  );

  const siteDropdownOptions = useMemo<SiteDropdownOption[]>(
    () => sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
    [sites],
  );

  const classificationDropdownOptions = useMemo(
    () =>
      classifications
        .filter((cl) => cl.siteId === form.siteId && cl.appliesToMaterial)
        .map((cl) => ({
          label: `${cl.key} - ${cl.name}`,
          value: cl.id,
        })),
    [classifications, form.siteId],
  );

  const warehouseDropdownOptions = useMemo(
    () =>
      warehouses
        .filter((wh) => wh.siteId === form.siteId)
        .map((wh) => ({
          label: `${wh.key} - ${wh.name}`,
          value: wh.id,
        })),
    [form.siteId, warehouses],
  );

  const stockTabCount = stockLines.length;
  const hasPersistedStockLines = stockLines.some(isPersistedStockLine);
  const showExistingStockLockedHint = Boolean(editingId) && !allowChangeStockdata && hasPersistedStockLines;

  const isStockLineLocked = useCallback(
    (line: StockLineForm) => !allowChangeStockdata && isPersistedStockLine(line),
    [allowChangeStockdata],
  );

  const renderSiteDropdownOption = useCallback(
    (option: SiteDropdownOption) => {
      const site = sites.find((s) => s.id === option.value);
      const hex = site?.colorHex || DEFAULT_SITE_COLOR_HEX;
      return (
        <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${option.label} (${hex})`}>
          {option.label}
        </span>
      );
    },
    [sites],
  );

  const renderSiteDropdownValue = useCallback(
    (incoming: unknown) => {
      const id =
        typeof incoming === "string"
          ? incoming
          : incoming && typeof incoming === "object" && incoming !== null && "value" in incoming
            ? String((incoming as { value: unknown }).value ?? "")
            : "";
      const site = sites.find((s) => s.id === id);
      if (!site) {
        return <span className="text-on-surface-variant">{t("spareParts.sitePlaceholder")}</span>;
      }
      const hex = site.colorHex || DEFAULT_SITE_COLOR_HEX;
      const label = `${site.key} - ${site.name}`;
      return (
        <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
          {label}
        </span>
      );
    },
    [sites, t],
  );

  const siteColumnBody = useCallback((row: SparePart) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${label} (${hex})`}>
        {row.siteName}
      </span>
    );
  }, []);

  const classificationColumnBody = useCallback((row: SparePart) => {
    if (!row.classificationId) return <span className="text-on-surface-variant">—</span>;
    return `${row.classificationKey ?? ""} - ${row.classificationName ?? ""}`.trim();
  }, []);

  const filteredSpareParts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return spareParts;
    return spareParts.filter((row) =>
      [
        row.key,
        row.name,
        row.siteKey,
        row.siteName,
        row.siteColorHex,
        row.serialNumber,
        row.classificationKey,
        row.classificationName,
        row.manufacturer,
        row.articleNumber,
        row.alternativeDesignation,
        row.createdBy,
        row.updatedBy,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [spareParts, searchTerm]);

  useEffect(() => {
    setHeaderRowCount(filteredSpareParts.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filteredSpareParts.length, setHeaderRowCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sparePartsRes, sitesRes, classificationsRes, warehousesRes] = await Promise.all([
        apiFetch("/api/spare-parts"),
        apiFetch("/api/sites"),
        apiFetch("/api/classifications"),
        apiFetch("/api/warehouses"),
      ]);
      if (!sparePartsRes.ok || !sitesRes.ok || !classificationsRes.ok || !warehousesRes.ok) {
        throw new Error("load");
      }
      const [sparePartsData, sitesData, classificationsData, warehousesData] = (await Promise.all([
        sparePartsRes.json(),
        sitesRes.json(),
        classificationsRes.json(),
        warehousesRes.json(),
      ])) as [SparePart[], SiteOption[], ClassificationListRow[], WarehouseListRow[]];
      setSpareParts(sparePartsData);
      setSites(sitesData);
      setClassifications(classificationsData);
      setWarehouses(warehousesData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("spareParts.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadStockDetail = useCallback(
    async (id: string) => {
      setStockDetailLoading(true);
      try {
        const res = await apiFetch(`/api/spare-parts/${id}`);
        if (!res.ok) throw new Error("detail");
        const detail = (await res.json()) as SparePart;
        setStockLines(mapStockLinesFromApi(detail.stockControlLines ?? []));
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("spareParts.loadError"),
          life: 6000,
        });
        setStockLines([]);
      } finally {
        setStockDetailLoading(false);
      }
    },
    [t],
  );

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm({
      ...emptyForm(),
      ...(siteFieldLocked ? { siteId: user.workingSiteId } : {}),
    });
    setStockLines([]);
    setActiveTabIndex(sparePartDialogTabs.General);
    setDialogVisible(true);
  }, [siteFieldLocked, user.workingSiteId]);

  const openEdit = useCallback(
    (row: SparePart) => {
      setEditingId(row.id);
      setForm({
        key: row.key,
        name: row.name,
        siteId: row.siteId,
        isActive: row.isActive,
        serialNumber: row.serialNumber ?? "",
        classificationId: row.classificationId ?? "",
        manufacturer: row.manufacturer ?? "",
        articleNumber: row.articleNumber ?? "",
        alternativeDesignation: row.alternativeDesignation ?? "",
      });
      setStockLines([]);
      setActiveTabIndex(sparePartDialogTabs.General);
      setDialogVisible(true);
      void loadStockDetail(row.id);
    },
    [loadStockDetail],
  );

  const handleSparePartTabChange = useCallback((event: { index: number }) => {
    if (
      event.index === sparePartDialogTabs.General ||
      event.index === sparePartDialogTabs.StockData
    ) {
      setActiveTabIndex(event.index);
    }
  }, []);

  const tabHostRef = useRef<HTMLDivElement | null>(null);

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
    const raf = requestAnimationFrame(updateTabInk);
    return () => cancelAnimationFrame(raf);
  }, [activeTabIndex, dialogVisible, stockTabCount, updateTabInk]);

  useEffect(() => {
    if (!dialogVisible) return;
    window.addEventListener("resize", updateTabInk);
    return () => window.removeEventListener("resize", updateTabInk);
  }, [dialogVisible, updateTabInk]);

  useEffect(() => {
    if (!form.classificationId) return;
    const stillAllowed = classificationDropdownOptions.some(
      (opt) => opt.value === form.classificationId,
    );
    if (!stillAllowed) {
      setForm((cur) => ({ ...cur, classificationId: "" }));
    }
  }, [classificationDropdownOptions, form.classificationId]);

  useEffect(() => {
    const allowedWarehouseIds = new Set(warehouseDropdownOptions.map((opt) => String(opt.value)));
    setStockLines((lines) => {
      let changed = false;
      const next = lines.map((line) => {
        if (isPersistedStockLine(line)) return line;
        if (!line.warehouseId || allowedWarehouseIds.has(line.warehouseId)) return line;
        changed = true;
        return { ...line, warehouseId: "" };
      });
      return changed ? next : lines;
    });
  }, [warehouseDropdownOptions]);

  const showSaveError = async (res: Response) => {
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string };
      code = body.error;
    } catch {
      /* ignore */
    }
    let detail = t("spareParts.saveError");
    if (code === "duplicate_key") detail = t("spareParts.duplicateKey");
    if (code === "foreign_key_violation") detail = t("spareParts.foreignKey");
    if (code === "invalid_classification") detail = t("spareParts.invalidClassification");
    if (code === "warehouse_site_mismatch") detail = t("spareParts.warehouseSiteMismatch");
    if (code === "stock_data_locked") detail = t("spareParts.stockDataLocked");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !siteId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("spareParts.validationRequired"),
        life: 4000,
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        key,
        name,
        siteId,
        isActive: form.isActive,
        serialNumber: form.serialNumber.trim() || null,
        classificationId: form.classificationId.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        articleNumber: form.articleNumber.trim() || null,
        alternativeDesignation: form.alternativeDesignation.trim() || null,
        stockControlLines: editingId
          ? stockLines
              .filter((line) => line.warehouseId)
              .map((line) => ({
                warehouseId: line.warehouseId,
                storageLocation: line.storageLocation.trim(),
                quantity: line.quantity,
              }))
          : [],
      };
      const url = editingId ? `/api/spare-parts/${editingId}` : "/api/spare-parts";
      const res = await apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        await showSaveError(res);
        return;
      }
      setDialogVisible(false);
      await loadData();
      toastRef.current?.show({
        severity: "success",
        summary: editingId ? t("spareParts.saved") : t("spareParts.created"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("spareParts.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/spare-parts/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedSparePart((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("spareParts.deleted"),
            life: 3000,
          });
          return;
        }
        let code: string | undefined;
        try {
          const body = (await res.json()) as { error?: string };
          code = body.error;
        } catch {
          /* ignore */
        }
        const detail =
          code === "foreign_key_violation"
            ? t("spareParts.foreignKey")
            : t("spareParts.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("spareParts.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: SparePart) => {
      confirmDialog({
        message: t("spareParts.confirmDelete", { name: row.name }),
        header: t("spareParts.confirmDeleteTitle"),
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
        acceptClassName: "p-button-danger",
        acceptLabel: t("spareParts.yes"),
        rejectLabel: t("spareParts.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<SparePart>({
    labels: { new: t("spareParts.new"), edit: t("spareParts.edit"), delete: t("spareParts.delete") },
    handlers: { onCreate: openCreate, onEdit: openEdit, onDelete: confirmDelete },
    selection: selectedSparePart,
    setSelection: setSelectedSparePart,
  });

  useEffect(() => {
    if (selectedSparePart && !spareParts.some((sp) => sp.id === selectedSparePart.id)) {
      setSelectedSparePart(null);
    }
  }, [spareParts, selectedSparePart]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("spareParts.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedSparePart}
            onClick={() => {
              if (selectedSparePart) openEdit(selectedSparePart);
            }}
          >
            <Pencil className={`${primaryActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("spareParts.edit")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedSparePart}
            onClick={() => {
              if (selectedSparePart) confirmDelete(selectedSparePart);
            }}
          >
            <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("spareParts.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("spareParts.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, openCreate, openEdit, searchTerm, selectedSparePart, setHeaderActions, t]);

  const activeBody = (row: SparePart) =>
    row.isActive ? (
      <Check
        className="h-4 w-4 text-on-surface"
        strokeWidth={1.75}
        aria-label={t("spareParts.active")}
      />
    ) : (
      <span className="text-on-surface-variant">{t("spareParts.inactive")}</span>
    );

  const formatShortDt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const optionalText = (value: string | null) =>
    value ? <span className="truncate">{value}</span> : <span className="text-on-surface-variant">—</span>;

  const addStockLine = () => {
    setStockLines((lines) => [...lines, newStockLine()]);
  };

  const removeStockLine = (localId: string) => {
    setStockLines((lines) => lines.filter((line) => line.localId !== localId));
  };

  const updateStockLine = (localId: string, patch: Partial<StockLineForm>) => {
    setStockLines((lines) =>
      lines.map((line) => (line.localId === localId ? { ...line, ...patch } : line)),
    );
  };

  const dialogFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("spareParts.cancel")}
        severity="secondary"
        outlined
        disabled={saving}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("spareParts.save")}
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
          value={filteredSpareParts}
          loading={loading}
          dataKey="id"
          selection={selectedSparePart}
          onSelectionChange={(e) => setSelectedSparePart(e.value as SparePart | null)}
          onRowDoubleClick={(e) => openEdit(e.data as SparePart)}
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
          tableStyle={{ minWidth: "88rem" }}
          stateStorage="local"
          stateKey="athene-spare-parts-table"
          emptyMessage={t("spareParts.empty")}
        >
          <Column field="key" header={t("spareParts.key")} sortable />
          <Column field="name" header={t("spareParts.name")} sortable />
          <Column field="siteName" header={t("spareParts.site")} sortable body={siteColumnBody} />
          <Column
            columnKey="active"
            header={t("spareParts.active")}
            body={activeBody}
            className="w-28 text-center"
          />
          <Column
            field="serialNumber"
            header={t("spareParts.serialNumber")}
            body={(row: SparePart) => optionalText(row.serialNumber)}
            sortable
          />
          <Column
            field="classificationKey"
            header={t("spareParts.classification")}
            body={classificationColumnBody}
            sortable
          />
          <Column
            field="manufacturer"
            header={t("spareParts.manufacturer")}
            body={(row: SparePart) => optionalText(row.manufacturer)}
            sortable
          />
          <Column
            field="articleNumber"
            header={t("spareParts.articleNumber")}
            body={(row: SparePart) => optionalText(row.articleNumber)}
            sortable
          />
          <Column
            field="alternativeDesignation"
            header={t("spareParts.alternativeDesignation")}
            body={(row: SparePart) => optionalText(row.alternativeDesignation)}
            sortable
          />
          <Column
            field="createdAt"
            header={t("spareParts.createdAt")}
            body={(row: SparePart) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="createdBy"
            header={t("spareParts.createdBy")}
            sortable
            className="text-on-surface-variant"
          />
          <Column
            field="updatedAt"
            header={t("spareParts.updatedAt")}
            body={(row: SparePart) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column
            field="updatedBy"
            header={t("spareParts.updatedBy")}
            sortable
            className="text-on-surface-variant"
          />
        </DataTable>
      </div>

      <Dialog
        header={editingId ? t("spareParts.editTitle") : t("spareParts.createTitle")}
        visible={dialogVisible}
        className="app-big-modal-window app-tabbed-modal-window"
        onHide={() => setDialogVisible(false)}
        onShow={updateTabInk}
        footer={dialogFooter}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        <div ref={tabHostRef} className="app-tabview-with-ink">
          <TabView
            className="app-sticky-tabs"
            activeIndex={activeTabIndex}
            onTabChange={handleSparePartTabChange}
          >
            <TabPanel header={t("spareParts.tabGeneral")}>
              <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="spare-part-key"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("spareParts.key")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <InputText
                    id="spare-part-key"
                    value={form.key}
                    onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="spare-part-name"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("spareParts.name")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <InputText
                    id="spare-part-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="spare-part-site"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("spareParts.site")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <Dropdown
                    inputId="spare-part-site"
                    value={form.siteId}
                    options={siteDropdownOptions}
                    onChange={(e) => setForm((f) => ({ ...f, siteId: String(e.value ?? "") }))}
                    placeholder={t("spareParts.sitePlaceholder")}
                    className="w-full app-inline-icon-dropdown"
                    itemTemplate={renderSiteDropdownOption}
                    valueTemplate={renderSiteDropdownValue}
                    filter
                    disabled={siteFieldLocked}
                    appendTo={overlayAppendTo}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <Checkbox
                      inputId="spare-part-isActive"
                      checked={form.isActive}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: Boolean(e.checked) }))}
                      className="rounded-none"
                    />
                    <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
                      {t("spareParts.active")}
                    </span>
                  </label>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="spare-part-serial"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("spareParts.serialNumber")}
                  </label>
                  <InputText
                    id="spare-part-serial"
                    value={form.serialNumber}
                    onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="spare-part-classification"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("spareParts.classification")}
                  </label>
                  <Dropdown
                    inputId="spare-part-classification"
                    value={form.classificationId || null}
                    options={classificationDropdownOptions}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, classificationId: String(e.value ?? "") }))
                    }
                    placeholder={t("spareParts.classificationPlaceholder")}
                    className="w-full app-inline-icon-dropdown"
                    disabled={!form.siteId}
                    filter
                    showClear
                    appendTo={overlayAppendTo}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="spare-part-manufacturer"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("spareParts.manufacturer")}
                  </label>
                  <InputText
                    id="spare-part-manufacturer"
                    value={form.manufacturer}
                    onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="spare-part-article"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("spareParts.articleNumber")}
                  </label>
                  <InputText
                    id="spare-part-article"
                    value={form.articleNumber}
                    onChange={(e) => setForm((f) => ({ ...f, articleNumber: e.target.value }))}
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label
                    htmlFor="spare-part-alt-designation"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("spareParts.alternativeDesignation")}
                  </label>
                  <InputText
                    id="spare-part-alt-designation"
                    value={form.alternativeDesignation}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, alternativeDesignation: e.target.value }))
                    }
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
              </div>
            </TabPanel>
            <TabPanel
              header={
                <span className="inline-flex items-center gap-2">
                  <span>{t("spareParts.tabStockData")}</span>
                  {editingId && stockTabCount > 0 ? <Badge value={stockTabCount} /> : null}
                </span>
              }
            >
              {!editingId ? (
                <p className="m-0 pt-1 text-sm text-on-surface-variant">
                  {t("spareParts.stockCreateHint")}
                </p>
              ) : stockDetailLoading ? (
                <p className="m-0 pt-1 text-sm text-on-surface-variant">{t("spareParts.loadError")}</p>
              ) : (
                <div className="flex flex-col gap-3 pt-1">
                  {showExistingStockLockedHint ? (
                    <p className="m-0 text-sm text-on-surface-variant">
                      {t("spareParts.stockDataLockedHint")}
                    </p>
                  ) : null}
                  <div>
                    <Button
                      type="button"
                      label={t("spareParts.addStockLine")}
                      icon={<Plus className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                      severity="secondary"
                      outlined
                      onClick={addStockLine}
                    />
                  </div>
                  {stockLines.length === 0 ? (
                    <p className="m-0 text-sm text-on-surface-variant">{t("spareParts.empty")}</p>
                  ) : (
                    <div className="overflow-x-auto rounded-sm border border-outline-variant/40">
                      <table className="w-full min-w-[40rem] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-outline-variant/40 bg-surface-container-low">
                            <th className="px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.1em] text-outline">
                              {t("spareParts.warehouse")}
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.1em] text-outline">
                              {t("spareParts.storageLocation")}
                            </th>
                            <th className="w-36 px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.1em] text-outline">
                              {t("spareParts.quantity")}
                            </th>
                            <th className="w-14 px-3 py-2" aria-hidden />
                          </tr>
                        </thead>
                        <tbody>
                          {stockLines.map((line) => {
                            const lineLocked = isStockLineLocked(line);
                            return (
                              <tr
                                key={line.localId}
                                className="border-b border-outline-variant/30 last:border-b-0"
                              >
                                <td className="px-3 py-2 align-top">
                                  <Dropdown
                                    value={line.warehouseId || null}
                                    options={warehouseDropdownOptions}
                                    onChange={(e) =>
                                      updateStockLine(line.localId, {
                                        warehouseId: String(e.value ?? ""),
                                      })
                                    }
                                    placeholder={t("spareParts.warehousePlaceholder")}
                                    className="w-full min-w-[12rem] app-inline-icon-dropdown"
                                    filter
                                    disabled={lineLocked || !form.siteId}
                                    appendTo={overlayAppendTo}
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <InputText
                                    value={line.storageLocation}
                                    onChange={(e) =>
                                      updateStockLine(line.localId, {
                                        storageLocation: e.target.value,
                                      })
                                    }
                                    className="w-full min-w-[10rem]"
                                    autoComplete="off"
                                    disabled={lineLocked}
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <InputNumber
                                    value={line.quantity}
                                    onValueChange={(e) =>
                                      updateStockLine(line.localId, {
                                        quantity: e.value ?? 0,
                                      })
                                    }
                                    min={0}
                                    className="w-full"
                                    inputClassName="w-full"
                                    disabled={lineLocked}
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {!lineLocked ? (
                                    <Button
                                      type="button"
                                      severity="danger"
                                      text
                                      rounded
                                      aria-label={t("spareParts.removeStockLine")}
                                      icon={<Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                                      onClick={() => removeStockLine(line.localId)}
                                    />
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </TabPanel>
          </TabView>
        </div>
      </Dialog>
    </div>
  );
}
