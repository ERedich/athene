import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { AppDialog } from "../components/AppDialog";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Paginator, type PaginatorPageChangeEvent } from "primereact/paginator";
import { Toast } from "primereact/toast";

import { useAuth } from "../auth/AuthContext";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { AssetSelItem } from "../components/selItem/AssetSelItem";
import { SparePartSelItem } from "../components/selItem/SparePartSelItem";
import { WorkOrderSelItem } from "../components/selItem/WorkOrderSelItem";
import { lucidePrimeBtnIcon } from "../icons/lucide";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch, apiUrl } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import type { SparePartLookupResult } from "../lib/sparePartLookupApi";
import type { WorkOrderLookupResult } from "../lib/workOrderLookupApi";
import type { WorkOrderReferenceAsset } from "../lib/workOrderTypes";

export type TransactionRow = {
  id: string;
  transactionNumber: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  type: string;
  bookedAt: string;
  quantity: string;
  workOrderId: string | null;
  workOrderOrderNumber: string | null;
  remark: string | null;
  employeeId: string | null;
  employeeKey: string | null;
  employeeName: string | null;
  sparePartId: string | null;
  sparePartKey: string | null;
  sparePartName: string | null;
  warehouseId: string | null;
  warehouseKey: string | null;
  warehouseName: string | null;
  storageLocationId: string | null;
  storageLocationKey: string | null;
  assetId: string | null;
  assetKey: string | null;
  assetName: string | null;
  costCenterId: string | null;
  costCenterKey: string | null;
  costCenterName: string | null;
  unitPrice: string | null;
};

type SiteOption = {
  id: string;
  key: string;
  name: string;
};

type CostCenterOption = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
};

type StockLineOption = {
  storageLocationId: string;
  label: string;
  available: number;
  valuationPrice: number | null;
};

type CreateTransactionType = "IN" | "EX" | "RM" | "RT" | "IV" | "ZU";

const CREATE_TYPES: CreateTransactionType[] = ["IN", "EX", "RM", "RT", "IV", "ZU"];
const BOOKABLE_CREATE_TYPES = new Set<CreateTransactionType>(["RM", "ZU"]);

const typeLabelKey: Record<string, string> = {
  IN: "transactions.typeIN",
  EX: "transactions.typeEX",
  RM: "transactions.typeRM",
  RT: "transactions.typeRT",
  IV: "transactions.typeIV",
  ZU: "transactions.typeZU",
};

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const createActionIcon = "text-green-500/70";
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const deleteActionIcon = "text-red-500";

function typeBadgeClass(type: string): string {
  switch (type) {
    case "IN":
    case "EX":
    case "RM":
    case "RT":
    case "IV":
    case "ZU":
      return `app-tx-type-badge app-tx-type-badge--${type}`;
    default:
      return "app-tx-type-badge app-tx-type-badge--unknown";
  }
}

function computePreviewGld(
  oldQty: number,
  oldGld: number | null,
  qty: number | null,
  unitPrice: number | null,
): number | null {
  if (qty == null || qty <= 0 || unitPrice == null || unitPrice < 0) return null;
  const gld = oldGld != null && Number.isFinite(oldGld) && oldGld >= 0 ? oldGld : 0;
  if (oldQty <= 0) return unitPrice;
  return Math.round(((oldQty * gld + qty * unitPrice) / (oldQty + qty)) * 10_000) / 10_000;
}

const typeToggleIdleClass =
  "bg-transparent text-on-surface-variant hover:text-on-surface";
const typeToggleActiveClass =
  "bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)] text-[var(--color-primary)]";
const typeToggleBaseClass =
  "inline-flex h-8 min-w-[3.25rem] items-center justify-center rounded-md px-4 text-sm font-medium tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-45";

function materialLabel(row: TransactionRow): string {
  if (!row.sparePartKey) return "—";
  return `${row.sparePartKey}${row.sparePartName ? ` · ${row.sparePartName}` : ""}`;
}

function storageLabel(row: TransactionRow): string {
  if (!row.storageLocationKey) return "—";
  const warehouse = row.warehouseKey
    ? `${row.warehouseKey}${row.warehouseName ? ` · ${row.warehouseName}` : ""}`
    : null;
  return warehouse ? `${warehouse} / ${row.storageLocationKey}` : row.storageLocationKey;
}

function assetLabel(row: TransactionRow): string {
  if (!row.assetKey) return "—";
  return `${row.assetKey}${row.assetName ? ` · ${row.assetName}` : ""}`;
}

function costCenterLabel(row: TransactionRow): string {
  if (!row.costCenterKey) return "—";
  return `${row.costCenterKey}${row.costCenterName ? ` · ${row.costCenterName}` : ""}`;
}

export function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const toastRef = useRef<Toast>(null);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sparePartIdFilter, setSparePartIdFilter] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<TransactionRow | null>(null);
  const [detail, setDetail] = useState<TransactionRow | null>(null);

  const [createVisible, setCreateVisible] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [stockLines, setStockLines] = useState<StockLineOption[]>([]);
  const [stockLinesLoading, setStockLinesLoading] = useState(false);
  const [formType, setFormType] = useState<CreateTransactionType>("RM");
  const [formSiteId, setFormSiteId] = useState<string | null>(user.workingSiteId);
  const [formSparePartId, setFormSparePartId] = useState("");
  const [formSparePartKey, setFormSparePartKey] = useState("");
  const [formSparePartForceInvalid, setFormSparePartForceInvalid] = useState(false);
  const [formStorageLocationId, setFormStorageLocationId] = useState<string | null>(null);
  const [formQuantity, setFormQuantity] = useState<number | null>(null);
  const [formQuantityInsufficient, setFormQuantityInsufficient] = useState(false);
  const [formUnitPrice, setFormUnitPrice] = useState<number | null>(null);
  const [formRemark, setFormRemark] = useState("");
  const [formWorkOrderId, setFormWorkOrderId] = useState("");
  const [formWorkOrderNumber, setFormWorkOrderNumber] = useState("");
  const [formAssetId, setFormAssetId] = useState("");
  const [formAssetKey, setFormAssetKey] = useState("");
  const [formCostCenterId, setFormCostCenterId] = useState<string | null>(null);
  const [formCostCenterForceInvalid, setFormCostCenterForceInvalid] = useState(false);

  useEffect(() => {
    setHeaderRowCount(total);
    return () => {
      setHeaderRowCount(null);
    };
  }, [setHeaderRowCount, total]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(0);
    }, 350);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

  useEffect(() => {
    const raw = searchParams.get("sparePartId")?.trim() || "";
    if (!raw) return;
    setSparePartIdFilter(raw);
    setPage(0);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page + 1));
    params.set("limit", String(limit));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sparePartIdFilter) params.set("sparePartId", sparePartIdFilter);
    try {
      const res = await apiFetch(apiUrl(`/api/transactions?${params.toString()}`));
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as {
        rows: TransactionRow[];
        total: number;
      };
      setRows(data.rows);
      setTotal(data.total);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("transactions.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, limit, sparePartIdFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const siteOptions = useMemo(
    () => sites.map((s) => ({ label: `${s.key} — ${s.name}`, value: s.id })),
    [sites],
  );

  const costCenterOptions = useMemo(() => {
    if (!formSiteId) return [];
    return costCenters
      .filter((cc) => cc.siteId === formSiteId)
      .filter((cc) => cc.isActive || cc.id === formCostCenterId)
      .map((cc) => ({
        label: `${cc.key} — ${cc.name}`,
        value: cc.id,
      }));
  }, [costCenters, formCostCenterId, formSiteId]);

  const stockLineDropdownOptions = useMemo(
    () =>
      stockLines.map((line) => ({
        label: line.label,
        value: line.storageLocationId,
      })),
    [stockLines],
  );

  const selectedStockLine = useMemo(
    () => stockLines.find((line) => line.storageLocationId === formStorageLocationId) ?? null,
    [formStorageLocationId, stockLines],
  );

  const formQuantityRef = useRef(formQuantity);
  formQuantityRef.current = formQuantity;
  const selectedStockLineRef = useRef(selectedStockLine);
  selectedStockLineRef.current = selectedStockLine;

  const warnInsufficientQuantity = useCallback(
    (quantity: number | null): boolean => {
      if (formType !== "RM") {
        setFormQuantityInsufficient(false);
        return false;
      }
      const stockLine = selectedStockLineRef.current;
      if (quantity == null || !stockLine || quantity <= stockLine.available) {
        setFormQuantityInsufficient(false);
        return false;
      }
      setFormQuantityInsufficient(true);
      toastRef.current?.show({
        severity: "warn",
        summary: t("transactions.createInsufficientStock", {
          available: stockLine.available,
        }),
        life: 5000,
      });
      return true;
    },
    [formType, t],
  );

  const handleQuantityBlur = useCallback(() => {
    // InputNumber may call onValueChange in the same blur turn; defer so the ref is current.
    queueMicrotask(() => {
      warnInsufficientQuantity(formQuantityRef.current);
    });
  }, [warnInsufficientQuantity]);

  const handleQuantityChange = useCallback(
    (value: number | null) => {
      setFormQuantity(value);
      if (formType !== "RM") {
        setFormQuantityInsufficient(false);
        return;
      }
      const stockLine = selectedStockLineRef.current;
      setFormQuantityInsufficient(
        value != null && stockLine != null && value > stockLine.available,
      );
    },
    [formType],
  );

  const resetReferenceFields = useCallback(() => {
    setFormWorkOrderId("");
    setFormWorkOrderNumber("");
    setFormAssetId("");
    setFormAssetKey("");
    setFormCostCenterId(null);
    setFormCostCenterForceInvalid(false);
  }, []);

  const resetMaterialFields = useCallback(() => {
    setFormSparePartId("");
    setFormSparePartKey("");
    setFormSparePartForceInvalid(false);
    setFormStorageLocationId(null);
    setFormQuantity(null);
    setFormQuantityInsufficient(false);
    setFormUnitPrice(null);
    setFormRemark("");
    setStockLines([]);
    resetReferenceFields();
  }, [resetReferenceFields]);

  const resetCreateForm = useCallback(() => {
    setFormType("RM");
    setFormSiteId(user.workingSiteId);
    resetMaterialFields();
  }, [resetMaterialFields, user.workingSiteId]);

  const handleCreateTypeChange = useCallback(
    (next: CreateTransactionType) => {
      setFormType(next);
      resetMaterialFields();
    },
    [resetMaterialFields],
  );

  const handleWorkOrderSelect = useCallback((workOrder: WorkOrderLookupResult | null) => {
    if (!workOrder) {
      setFormWorkOrderId("");
      return;
    }
    setFormWorkOrderId(workOrder.id);
    setFormWorkOrderNumber(String(workOrder.orderNumber));
    setFormAssetId(workOrder.assetId);
    setFormAssetKey(workOrder.assetKey);
    setFormCostCenterId(workOrder.costCenterId);
    setFormCostCenterForceInvalid(false);
  }, []);

  const handleAssetSelect = useCallback((asset: WorkOrderReferenceAsset | null) => {
    if (!asset) {
      setFormAssetId("");
      return;
    }
    setFormAssetId(asset.id);
    setFormAssetKey(asset.key);
    // Manual asset pick may diverge from linked WO — drop WO to avoid mismatch on save.
    setFormWorkOrderId("");
    setFormWorkOrderNumber("");
    if (asset.costCenterId) {
      setFormCostCenterId(asset.costCenterId);
      setFormCostCenterForceInvalid(false);
    }
  }, []);

  const handleSparePartSelect = useCallback((sparePart: SparePartLookupResult | null) => {
    setFormSparePartForceInvalid(false);
    if (sparePart) {
      setFormSparePartId(sparePart.id);
      setFormSparePartKey(sparePart.key);
      setFormStorageLocationId(null);
      return;
    }
    setFormSparePartId("");
    setFormStorageLocationId(null);
  }, []);

  const openCreate = useCallback(async () => {
    resetCreateForm();
    setCreateVisible(true);
    try {
      const [sitesRes, costCentersRes] = await Promise.all([
        apiFetch("/api/sites"),
        apiFetch("/api/cost-centers"),
      ]);
      if (!sitesRes.ok || !costCentersRes.ok) throw new Error("load");
      const [sitesData, costCentersData] = (await Promise.all([
        sitesRes.json(),
        costCentersRes.json(),
      ])) as [SiteOption[], CostCenterOption[]];
      setSites(sitesData);
      setCostCenters(costCentersData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("transactions.createLoadError"),
        life: 6000,
      });
    }
  }, [resetCreateForm, t]);

  useEffect(() => {
    if (!formSparePartId) {
      setStockLines([]);
      setFormStorageLocationId(null);
      return;
    }
    let cancelled = false;
    setStockLinesLoading(true);
    void (async () => {
      try {
        const res = await apiFetch(`/api/spare-parts/${formSparePartId}`);
        if (!res.ok) throw new Error("load");
        const data = (await res.json()) as {
          stockControlLines: Array<{
            storageLocationId: string;
            storageLocationKey: string;
            warehouseKey: string;
            warehouseName: string;
            quantity: string;
            valuationPrice: string | null;
          }>;
        };
        if (cancelled) return;
        const lines: StockLineOption[] = data.stockControlLines.map((line) => {
          const available = Number(line.quantity);
          const qtyLabel = Number.isFinite(available)
            ? new Intl.NumberFormat(i18n.language, {
                maximumFractionDigits: 4,
                minimumFractionDigits: 0,
              }).format(available)
            : line.quantity;
          const priceRaw =
            line.valuationPrice != null && line.valuationPrice !== ""
              ? Number(line.valuationPrice)
              : null;
          return {
            storageLocationId: line.storageLocationId,
            available: Number.isFinite(available) ? available : 0,
            valuationPrice: priceRaw != null && Number.isFinite(priceRaw) ? priceRaw : null,
            label: `${line.warehouseKey} · ${line.warehouseName} / ${line.storageLocationKey} (${qtyLabel})`,
          };
        });
        setStockLines(lines);
        setFormStorageLocationId((cur) =>
          cur && lines.some((l) => l.storageLocationId === cur) ? cur : null,
        );
      } catch {
        if (!cancelled) {
          setStockLines([]);
          setFormStorageLocationId(null);
          toastRef.current?.show({
            severity: "error",
            summary: t("transactions.createStockLoadError"),
            life: 6000,
          });
        }
      } finally {
        if (!cancelled) setStockLinesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formSparePartId, i18n.language, t]);

  const previewNewGld = useMemo(
    () =>
      formType === "ZU"
        ? computePreviewGld(
            selectedStockLine?.available ?? 0,
            selectedStockLine?.valuationPrice ?? null,
            formQuantity,
            formUnitPrice,
          )
        : null,
    [formQuantity, formType, formUnitPrice, selectedStockLine],
  );

  const saveCreate = useCallback(async () => {
    if (!BOOKABLE_CREATE_TYPES.has(formType)) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("transactions.createNotBookable"),
        life: 4000,
      });
      return;
    }
    if (!formSiteId || !formSparePartId || !formStorageLocationId) {
      if (!formSparePartId) setFormSparePartForceInvalid(true);
      toastRef.current?.show({
        severity: "warn",
        summary: t("transactions.createValidationRequired"),
        life: 4000,
      });
      return;
    }
    if (formQuantity == null || formQuantity <= 0) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("transactions.createValidationQuantity"),
        life: 4000,
      });
      return;
    }

    if (formType === "ZU") {
      if (formUnitPrice == null || formUnitPrice < 0) {
        toastRef.current?.show({
          severity: "warn",
          summary: t("transactions.createValidationUnitPrice"),
          life: 4000,
        });
        return;
      }
      setCreateSaving(true);
      try {
        const res = await apiFetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ZU",
            sparePartId: formSparePartId,
            storageLocationId: formStorageLocationId,
            quantity: formQuantity,
            unitPrice: formUnitPrice,
            remark: formRemark.trim() || null,
          }),
        });
        if (res.status === 201) {
          setCreateVisible(false);
          resetCreateForm();
          await load();
          toastRef.current?.show({
            severity: "success",
            summary: t("transactions.createdZu"),
            life: 3000,
          });
          return;
        }
        toastRef.current?.show({
          severity: "error",
          summary: t("transactions.createErrorZu"),
          life: 6000,
        });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("transactions.createErrorZu"),
          life: 6000,
        });
      } finally {
        setCreateSaving(false);
      }
      return;
    }

    if (!formCostCenterId) {
      setFormCostCenterForceInvalid(true);
      toastRef.current?.show({
        severity: "warn",
        summary: t("transactions.createValidationCostCenter"),
        life: 4000,
      });
      return;
    }
    if (warnInsufficientQuantity(formQuantity)) {
      return;
    }

    setCreateSaving(true);
    try {
      const res = await apiFetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "RM",
          sparePartId: formSparePartId,
          storageLocationId: formStorageLocationId,
          quantity: formQuantity,
          remark: formRemark.trim() || null,
          workOrderId: formWorkOrderId || null,
          assetId: formAssetId || null,
          costCenterId: formCostCenterId,
        }),
      });
      if (res.status === 201) {
        setCreateVisible(false);
        resetCreateForm();
        await load();
        toastRef.current?.show({
          severity: "success",
          summary: t("transactions.created"),
          life: 3000,
        });
        return;
      }
      const errBody = (await res.json().catch(() => null)) as {
        error?: string;
        available?: number;
      } | null;
      if (res.status === 409 && errBody?.error === "insufficient_stock") {
        toastRef.current?.show({
          severity: "error",
          summary: t("transactions.createInsufficientStock", {
            available: errBody.available ?? 0,
          }),
          life: 6000,
        });
        return;
      }
      toastRef.current?.show({
        severity: "error",
        summary: t("transactions.createError"),
        life: 6000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("transactions.createError"),
        life: 6000,
      });
    } finally {
      setCreateSaving(false);
    }
  }, [
    formAssetId,
    formCostCenterId,
    formQuantity,
    formRemark,
    formSiteId,
    formSparePartId,
    formStorageLocationId,
    formType,
    formUnitPrice,
    formWorkOrderId,
    load,
    resetCreateForm,
    t,
    warnInsufficientQuantity,
  ]);

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(apiUrl(`/api/transactions/${id}`), { method: "DELETE" });
        if (res.status === 204) {
          setSelectedRow((cur) => (cur?.id === id ? null : cur));
          setDetail((cur) => (cur?.id === id ? null : cur));
          await load();
          toastRef.current?.show({ severity: "success", summary: t("transactions.deleted"), life: 3000 });
          return;
        }
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        if (res.status === 409 && errBody?.error === "stock_line_missing") {
          toastRef.current?.show({
            severity: "error",
            summary: t("transactions.deleteStockMissing"),
            life: 6000,
          });
          return;
        }
        toastRef.current?.show({ severity: "error", summary: t("transactions.deleteError"), life: 6000 });
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("transactions.deleteError"), life: 6000 });
      }
    },
    [load, t],
  );

  const confirmDelete = useCallback(
    (row: TransactionRow) => {
      confirmDialog({
        message: t("transactions.confirmDelete", { transactionNumber: row.transactionNumber }),
        header: t("transactions.confirmDeleteTitle"),
        icon: (
          <TriangleAlert className={lucidePrimeBtnIcon} strokeWidth={1.75} aria-hidden />
        ),
        acceptClassName: "p-button-danger",
        acceptLabel: t("transactions.yes"),
        rejectLabel: t("transactions.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={() => void openCreate()}>
            <Plus className={`${createActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("transactions.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={deleteActionNavItem}
            disabled={!selectedRow}
            onClick={() => {
              if (selectedRow) confirmDelete(selectedRow);
            }}
          >
            <Trash2 className={`${deleteActionIcon} h-4 w-4`} strokeWidth={1.75} aria-hidden />
            <span>{t("transactions.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("transactions.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, openCreate, searchTerm, selectedRow, setHeaderActions, t]);

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

  const formatQty = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    return new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: 4,
      minimumFractionDigits: 0,
    }).format(n);
  };

  const formatPrice = (raw: string | null | undefined) => {
    if (raw == null || raw === "") return "—";
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    return new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: 4,
      minimumFractionDigits: 0,
    }).format(n);
  };

  const remarkShort = (text: string | null, max = 72) => {
    if (!text) return "—";
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
  };

  const typeBody = (row: TransactionRow) => (
    <span className={typeBadgeClass(row.type)} title={t(typeLabelKey[row.type] ?? row.type)}>
      {row.type}
    </span>
  );

  const detailFooter = (
    <div className="flex justify-end">
      <Button
        type="button"
        label={t("transactions.close")}
        severity="secondary"
        outlined
        onClick={() => setDetail(null)}
      />
    </div>
  );

  const createFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("transactions.cancel")}
        severity="secondary"
        outlined
        disabled={createSaving}
        onClick={() => {
          setCreateVisible(false);
          resetCreateForm();
        }}
      />
      <Button
        type="button"
        label={t("transactions.createSave")}
        loading={createSaving}
        disabled={!BOOKABLE_CREATE_TYPES.has(formType)}
        onClick={() => void saveCreate()}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <DataTable
          className="app-data-table w-full"
          value={rows}
          loading={loading}
          dataKey="id"
          selection={selectedRow}
          onSelectionChange={(e) => setSelectedRow(e.value as TransactionRow | null)}
          selectionMode="single"
          metaKeySelection={false}
          stripedRows
          showGridlines
          scrollable
          resizableColumns
          reorderableColumns
          columnResizeMode="expand"
          scrollHeight="flex"
          tableStyle={{ minWidth: "96rem" }}
          stateStorage="local"
          stateKey="athene-transactions-table"
          emptyMessage={t("transactions.empty")}
          onRowDoubleClick={(e) => setDetail(e.data as TransactionRow)}
          rowClassName={() => "cursor-pointer"}
        >
          <Column
            field="transactionNumber"
            header={t("transactions.colTransactionNumber")}
            sortable
            className="whitespace-nowrap"
          />
          <Column
            field="siteKey"
            header={t("transactions.colSite")}
            body={(r: TransactionRow) => (
              <span>
                {r.siteKey}
                <span className="text-on-surface-variant"> · {r.siteName}</span>
              </span>
            )}
            sortable
          />
          <Column columnKey="type" header={t("transactions.colType")} body={typeBody} className="w-36 text-center" align="center" alignHeader="center" />
          <Column
            field="bookedAt"
            header={t("transactions.colBookedAt")}
            body={(r: TransactionRow) => formatDt(r.bookedAt)}
            sortable
            className="whitespace-nowrap"
          />
          <Column
            field="quantity"
            header={t("transactions.colQuantity")}
            body={(r: TransactionRow) => formatQty(r.quantity)}
            sortable
            className="text-right whitespace-nowrap"
          />
          <Column
            columnKey="sparePart"
            header={t("transactions.colSparePart")}
            body={(r: TransactionRow) => materialLabel(r)}
            className="max-w-[14rem]"
          />
          <Column
            columnKey="storageLocation"
            header={t("transactions.colStorageLocation")}
            body={(r: TransactionRow) => storageLabel(r)}
            className="max-w-[16rem]"
          />
          <Column
            columnKey="asset"
            header={t("transactions.colAsset")}
            body={(r: TransactionRow) => assetLabel(r)}
            className="max-w-[14rem]"
          />
          <Column
            columnKey="costCenter"
            header={t("transactions.colCostCenter")}
            body={(r: TransactionRow) => costCenterLabel(r)}
            className="max-w-[14rem]"
          />
          <Column
            field="workOrderOrderNumber"
            header={t("transactions.colWorkOrder")}
            body={(r: TransactionRow) => (r.workOrderOrderNumber != null ? r.workOrderOrderNumber : "—")}
            sortable
          />
          <Column
            field="remark"
            header={t("transactions.colRemark")}
            body={(r: TransactionRow) => <span className="text-sm">{remarkShort(r.remark)}</span>}
            className="max-w-xs"
          />
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

      <AppDialog
        header={t("transactions.detailTitle")}
        visible={detail !== null}
        className="app-big-modal-window"
        onHide={() => setDetail(null)}
        footer={detailFooter}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        {detail ? (
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto text-sm">
            <dl className="m-0 grid grid-cols-[10rem_1fr] gap-x-3 gap-y-2">
              <dt className="text-on-surface-variant">{t("transactions.colTransactionNumber")}</dt>
              <dd className="m-0">{detail.transactionNumber}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colSite")}</dt>
              <dd className="m-0">
                {detail.siteKey} — {detail.siteName}
              </dd>
              <dt className="text-on-surface-variant">{t("transactions.colType")}</dt>
              <dd className="m-0">{typeBody(detail)}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colBookedAt")}</dt>
              <dd className="m-0">{formatDt(detail.bookedAt)}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colQuantity")}</dt>
              <dd className="m-0">{formatQty(detail.quantity)}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colUnitPrice")}</dt>
              <dd className="m-0">{formatPrice(detail.unitPrice)}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colSparePart")}</dt>
              <dd className="m-0">{materialLabel(detail)}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colStorageLocation")}</dt>
              <dd className="m-0">{storageLabel(detail)}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colAsset")}</dt>
              <dd className="m-0">{assetLabel(detail)}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colCostCenter")}</dt>
              <dd className="m-0">{costCenterLabel(detail)}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colWorkOrder")}</dt>
              <dd className="m-0">{detail.workOrderOrderNumber ?? "—"}</dd>
              <dt className="text-on-surface-variant">{t("transactions.colRemark")}</dt>
              <dd className="m-0 whitespace-pre-wrap break-words">{detail.remark ?? "—"}</dd>
            </dl>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        header={t("transactions.createTitle")}
        visible={createVisible}
        className="app-big-modal-window"
        onHide={() => {
          if (createSaving) return;
          setCreateVisible(false);
          resetCreateForm();
        }}
        footer={createFooter}
        modal
        dismissableMask={!createSaving}
        draggable={false}
        resizable={false}
      >
        <div className="flex flex-col gap-5 text-sm">
          <div className="flex flex-col gap-2">
            <span className="font-medium text-on-surface">{t("transactions.createTypeLabel")}</span>
            <div
              role="group"
              aria-label={t("transactions.createTypeLabel")}
              className="inline-flex w-fit max-w-full flex-wrap gap-0.5 rounded-lg border border-solid border-[color-mix(in_srgb,var(--color-on-surface)_22%,transparent)] p-1"
            >
              {CREATE_TYPES.map((type) => {
                const active = formType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    className={`${typeToggleBaseClass} ${active ? typeToggleActiveClass : typeToggleIdleClass}`}
                    aria-pressed={active}
                    title={t(typeLabelKey[type])}
                    disabled={createSaving}
                    onClick={() => {
                      if (!active) handleCreateTypeChange(type);
                    }}
                  >
                    {t(`transactions.createTypeShort${type}`)}
                  </button>
                );
              })}
            </div>
            <p className="m-0 text-on-surface-variant">{t(`transactions.createHint${formType}`)}</p>
          </div>

          {formType === "RM" || formType === "ZU" ? (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-on-surface-variant">{t("transactions.colSite")}</span>
                  <Dropdown
                    value={formSiteId}
                    options={siteOptions}
                    optionLabel="label"
                    optionValue="value"
                    placeholder={t("transactions.createSitePlaceholder")}
                    className="w-full"
                    filter
                    disabled
                    appendTo={overlayAppendTo}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-on-surface-variant">{t("transactions.colSparePart")}</span>
                  <SparePartSelItem
                    sparePartId={formSparePartId}
                    sparePartKey={formSparePartKey}
                    onSelect={handleSparePartSelect}
                    onSparePartKeyChange={setFormSparePartKey}
                    siteId={formSiteId ?? undefined}
                    forceInvalid={formSparePartForceInvalid}
                    disabled={!formSiteId}
                    placeholder={t("transactions.createSparePartPlaceholder")}
                    className="w-full"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-on-surface-variant">{t("transactions.colStorageLocation")}</span>
                  <Dropdown
                    value={formStorageLocationId}
                    options={stockLineDropdownOptions}
                    optionLabel="label"
                    optionValue="value"
                    onChange={(e) => {
                      setFormStorageLocationId(e.value as string | null);
                      setFormQuantityInsufficient(false);
                    }}
                    placeholder={
                      stockLinesLoading
                        ? t("transactions.createStockLoading")
                        : t("transactions.createStoragePlaceholder")
                    }
                    className="w-full"
                    filter
                    disabled={!formSparePartId || stockLinesLoading}
                    appendTo={overlayAppendTo}
                  />
                  {selectedStockLine && formType === "RM" ? (
                    <span className="text-xs text-on-surface-variant">
                      {t("transactions.createAvailable", { available: selectedStockLine.available })}
                    </span>
                  ) : null}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-on-surface-variant">{t("transactions.colQuantity")}</span>
                  <InputNumber
                    value={formQuantity}
                    onValueChange={(e) => handleQuantityChange(e.value ?? null)}
                    onBlur={handleQuantityBlur}
                    min={0}
                    minFractionDigits={0}
                    maxFractionDigits={4}
                    className={`w-full${formQuantityInsufficient ? " p-invalid" : ""}`}
                    inputClassName={`w-full${formQuantityInsufficient ? " p-invalid" : ""}`}
                    disabled={!formStorageLocationId}
                  />
                </label>
                {formType === "ZU" ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-on-surface-variant">{t("transactions.colUnitPrice")}</span>
                    <InputNumber
                      value={formUnitPrice}
                      onValueChange={(e) => setFormUnitPrice(e.value ?? null)}
                      min={0}
                      minFractionDigits={0}
                      maxFractionDigits={4}
                      className="w-full"
                      inputClassName="w-full"
                      disabled={!formStorageLocationId}
                    />
                  </label>
                ) : null}
                <label className="flex flex-col gap-1">
                  <span className="text-on-surface-variant">{t("transactions.colCurrentGld")}</span>
                  <InputNumber
                    value={selectedStockLine?.valuationPrice ?? null}
                    minFractionDigits={0}
                    maxFractionDigits={4}
                    className="w-full"
                    inputClassName="w-full"
                    disabled
                  />
                </label>
                {formType === "ZU" ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-on-surface-variant">{t("transactions.colNewGld")}</span>
                    <InputNumber
                      value={previewNewGld}
                      minFractionDigits={0}
                      maxFractionDigits={4}
                      className="w-full"
                      inputClassName="w-full"
                      disabled
                    />
                  </label>
                ) : null}
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-on-surface-variant">{t("transactions.colRemark")}</span>
                  <InputTextarea
                    value={formRemark}
                    onChange={(e) => setFormRemark(e.target.value)}
                    rows={4}
                    className="w-full"
                    autoResize
                    maxLength={2000}
                  />
                </label>
              </div>

              {formType === "RM" ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="font-medium text-on-surface">{t("transactions.createReferenceSection")}</span>
                    <span className="text-xs text-on-surface-variant">{t("transactions.createReferenceHint")}</span>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-on-surface-variant">{t("transactions.colWorkOrder")}</span>
                    <WorkOrderSelItem
                      workOrderId={formWorkOrderId}
                      orderNumberDisplay={formWorkOrderNumber}
                      onSelect={handleWorkOrderSelect}
                      onOrderNumberChange={setFormWorkOrderNumber}
                      siteId={formSiteId ?? undefined}
                      disabled={!formSiteId}
                      placeholder={t("transactions.createWorkOrderPlaceholder")}
                      className="w-full"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-on-surface-variant">{t("transactions.colAsset")}</span>
                    <AssetSelItem
                      assetId={formAssetId}
                      assetKey={formAssetKey}
                      onSelect={handleAssetSelect}
                      onAssetKeyChange={setFormAssetKey}
                      siteId={formSiteId ?? undefined}
                      disabled={!formSiteId}
                      placeholder={t("transactions.createAssetPlaceholder")}
                      className="w-full"
                    />
                  </label>
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-on-surface-variant">
                      {t("transactions.colCostCenter")}{" "}
                      <span className="text-red-400">*</span>
                    </span>
                    <Dropdown
                      value={formCostCenterId}
                      options={costCenterOptions}
                      optionLabel="label"
                      optionValue="value"
                      onChange={(e) => {
                        setFormCostCenterId(e.value as string | null);
                        setFormCostCenterForceInvalid(false);
                      }}
                      placeholder={t("transactions.createCostCenterPlaceholder")}
                      className={`w-full${formCostCenterForceInvalid ? " p-invalid" : ""}`}
                      filter
                      disabled={!formSiteId}
                      appendTo={overlayAppendTo}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-sm border border-solid border-white/10 bg-white/5 px-4 py-8 text-center text-on-surface-variant">
              {t("transactions.createNotBookable")}
            </div>
          )}
        </div>
      </AppDialog>
    </div>
  );
}
