import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Check, ExternalLink, File, Image as ImageIcon, MessageCircle, Pencil, Plus, Trash2, TriangleAlert, Upload, X } from "lucide-react";
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
import { LucideSpinner, lucidePrimeBtnIcon } from "../icons/lucide";

import { useAtheneAssistant } from "../assistant/AtheneAssistantContext";
import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import {
  APP_PARAM_KEY_ALLOW_CHANGE_STOCKDATA,
  APP_PARAM_KEY_ALLOW_SITE_CHANGE,
} from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";
import {
  ASSET_DOCUMENT_CATEGORY_ORDER,
  documentCategoryBadgeClass,
  type AssetDocumentCategory,
} from "../constants/assetDocumentCategory";
import { documentTypeMimeIcon } from "../hooks/useWorkOrderEditDialogState";
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

type StorageLocationListRow = {
  id: string;
  key: string;
  warehouseId: string;
  isActive: boolean;
};

type StockControlLineRow = {
  id: string;
  warehouseId: string;
  warehouseKey: string;
  warehouseName: string;
  storageLocationId: string;
  storageLocationKey: string;
  quantity: string;
};

type StockPolicyScopeType = "SITE" | "WAREHOUSE" | "STORAGE_LOCATION";

type StockPolicyRow = {
  id: string;
  scopeType: StockPolicyScopeType;
  warehouseId: string | null;
  warehouseKey: string | null;
  warehouseName: string | null;
  storageLocationId: string | null;
  storageLocationKey: string | null;
  reorderLevel: string;
  minStock: string;
  orderQuantity: string;
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
  hasPhoto: boolean;
  documentCount: number;
  totalQuantity?: string | number;
  siteQuantity?: string | number;
  stockControlLines?: StockControlLineRow[];
  stockPolicies?: StockPolicyRow[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type SparePartDocument = {
  id: string;
  sparePartId: string;
  fileName: string;
  displayName: string;
  category: AssetDocumentCategory;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

type DocumentUploadDraft = {
  file: File;
  displayName: string;
  category: AssetDocumentCategory;
};

type PendingDocumentUpload = DocumentUploadDraft & { localId: string };

type StockLineForm = {
  localId: string;
  /** Set when loaded from API — existing stock rows are read-only when MT-ACSD is N. */
  persistedId?: string;
  warehouseId: string;
  storageLocationId: string;
  quantity: number;
};

type StockPolicyForm = {
  localId: string;
  scopeType: StockPolicyScopeType;
  warehouseId: string;
  storageLocationId: string;
  reorderLevel: number;
  minStock: number;
  orderQuantity: number;
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
  storageLocationId: "",
  quantity: 0,
});

const newStockPolicy = (): StockPolicyForm => ({
  localId: crypto.randomUUID(),
  scopeType: "SITE",
  warehouseId: "",
  storageLocationId: "",
  reorderLevel: 0,
  minStock: 0,
  orderQuantity: 0,
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
    storageLocationId: line.storageLocationId,
    quantity: Number(line.quantity) || 0,
  }));
}

function mapStockPoliciesFromApi(policies: StockPolicyRow[]): StockPolicyForm[] {
  return policies.map((policy) => ({
    localId: policy.id || crypto.randomUUID(),
    scopeType: policy.scopeType,
    warehouseId: policy.warehouseId ?? "",
    storageLocationId: policy.storageLocationId ?? "",
    reorderLevel: Number(policy.reorderLevel) || 0,
    minStock: Number(policy.minStock) || 0,
    orderQuantity: Number(policy.orderQuantity) || 0,
  }));
}

function isPersistedStockLine(line: StockLineForm): boolean {
  return Boolean(line.persistedId);
}

function newPendingLocalId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function SparePartsPage() {
  const { t, i18n } = useTranslation();
  const athene = useAtheneAssistant();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const allowChangeStockdata =
    appParameterBooleans[APP_PARAM_KEY_ALLOW_CHANGE_STOCKDATA] !== false;
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const photoPreviewUrlRef = useRef<string | null>(null);
  const photoFileInputRef = useRef<HTMLInputElement>(null);
  const documentsFileInputRef = useRef<HTMLInputElement>(null);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [classifications, setClassifications] = useState<ClassificationListRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseListRow[]>([]);
  const [storageLocations, setStorageLocations] = useState<StorageLocationListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSparePart, setSelectedSparePart] = useState<SparePart | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [stockLines, setStockLines] = useState<StockLineForm[]>([]);
  const [stockPolicies, setStockPolicies] = useState<StockPolicyForm[]>([]);
  const [stockDetailLoading, setStockDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTabIndex, setActiveTabIndex] = useState<SparePartDialogTab>(
    sparePartDialogTabs.General,
  );
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [hasStoredPhoto, setHasStoredPhoto] = useState(false);
  const [documents, setDocuments] = useState<SparePartDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsUploading, setDocumentsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingDocumentUpload[]>([]);
  const [uploadDrafts, setUploadDrafts] = useState<DocumentUploadDraft[]>([]);
  const [uploadMetaVisible, setUploadMetaVisible] = useState(false);
  const [documentsSearchTerm, setDocumentsSearchTerm] = useState("");
  const [documentEdit, setDocumentEdit] = useState<SparePartDocument | null>(null);
  const [documentEditDisplayName, setDocumentEditDisplayName] = useState("");
  const [documentEditCategory, setDocumentEditCategory] = useState<AssetDocumentCategory>("general");
  const [documentEditSaving, setDocumentEditSaving] = useState(false);

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

  const totalQuantityAll = useMemo(
    () => stockLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0),
    [stockLines],
  );

  const siteQuantity = useMemo(() => {
    if (!form.siteId) return 0;
    const warehouseIdsForSite = new Set(
      warehouses.filter((wh) => wh.siteId === form.siteId).map((wh) => wh.id),
    );
    return stockLines
      .filter((line) => line.warehouseId && warehouseIdsForSite.has(line.warehouseId))
      .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  }, [form.siteId, stockLines, warehouses]);

  const stockTabCount = stockLines.length;
  const policyTabCount = stockPolicies.length;
  const documentsTabCount = documents.length + pendingFiles.length;
  const documentCategoryOptions = useMemo(
    () => ASSET_DOCUMENT_CATEGORY_ORDER.map((value) => ({
      value,
      label: t(`assets.documentCategories.${value}`),
    })),
    [t],
  );
  const isStockLineLocked = useCallback(
    (line: StockLineForm) => !allowChangeStockdata && isPersistedStockLine(line),
    [allowChangeStockdata],
  );

  const scopeDropdownOptions = useMemo(
    () => [
      { label: t("spareParts.scopeSite"), value: "SITE" satisfies StockPolicyScopeType },
      { label: t("spareParts.scopeWarehouse"), value: "WAREHOUSE" satisfies StockPolicyScopeType },
      {
        label: t("spareParts.scopeStorageLocation"),
        value: "STORAGE_LOCATION" satisfies StockPolicyScopeType,
      },
    ],
    [t],
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
      const [sparePartsRes, sitesRes, classificationsRes, warehousesRes, storageLocRes] =
        await Promise.all([
          apiFetch("/api/spare-parts"),
          apiFetch("/api/sites"),
          apiFetch("/api/classifications"),
          apiFetch("/api/warehouses"),
          apiFetch("/api/storage-locations"),
        ]);
      if (
        !sparePartsRes.ok ||
        !sitesRes.ok ||
        !classificationsRes.ok ||
        !warehousesRes.ok ||
        !storageLocRes.ok
      ) {
        throw new Error("load");
      }
      const [sparePartsData, sitesData, classificationsData, warehousesData, storageLocData] =
        (await Promise.all([
          sparePartsRes.json(),
          sitesRes.json(),
          classificationsRes.json(),
          warehousesRes.json(),
          storageLocRes.json(),
        ])) as [
          SparePart[],
          SiteOption[],
          ClassificationListRow[],
          WarehouseListRow[],
          StorageLocationListRow[],
        ];
      setSpareParts(sparePartsData);
      setSites(sitesData);
      setClassifications(classificationsData);
      setWarehouses(warehousesData);
      setStorageLocations(storageLocData);
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
        setStockPolicies(mapStockPoliciesFromApi(detail.stockPolicies ?? []));
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("spareParts.loadError"),
          life: 6000,
        });
        setStockLines([]);
        setStockPolicies([]);
      } finally {
        setStockDetailLoading(false);
      }
    },
    [t],
  );

  const clearPhotoPreview = useCallback(() => {
    if (photoPreviewUrlRef.current) {
      URL.revokeObjectURL(photoPreviewUrlRef.current);
      photoPreviewUrlRef.current = null;
    }
    setPhotoPreviewUrl(null);
  }, []);

  const resetPhotoState = useCallback(() => {
    clearPhotoPreview();
    setPendingPhotoFile(null);
    setPhotoUploading(false);
    setHasStoredPhoto(false);
    if (photoFileInputRef.current) photoFileInputRef.current.value = "";
  }, [clearPhotoPreview]);

  const resetDocumentsState = useCallback(() => {
    setDocuments([]);
    setPendingFiles([]);
    setUploadDrafts([]);
    setUploadMetaVisible(false);
    setDocumentsSearchTerm("");
    setDocumentEdit(null);
    if (documentsFileInputRef.current) documentsFileInputRef.current.value = "";
  }, []);

  const closeDialog = useCallback(() => {
    resetPhotoState();
    resetDocumentsState();
    setDialogVisible(false);
  }, [resetDocumentsState, resetPhotoState]);

  const loadSparePartPhoto = useCallback(async (id: string) => {
    clearPhotoPreview();
    try {
      const res = await apiFetch(`/api/spare-parts/${id}/photo`);
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      photoPreviewUrlRef.current = url;
      setPhotoPreviewUrl(url);
      setHasStoredPhoto(true);
    } catch {
      /* preview is optional */
    }
  }, [clearPhotoPreview]);

  const uploadSparePartPhoto = useCallback(async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    return (await apiFetch(`/api/spare-parts/${id}/photo`, { method: "POST", body: fd })).ok;
  }, []);

  const removeSparePartPhoto = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/spare-parts/${id}/photo`, { method: "DELETE" });
    return res.ok || res.status === 204;
  }, []);

  const loadDocuments = useCallback(async (id: string) => {
    setDocumentsLoading(true);
    try {
      const res = await apiFetch(`/api/spare-parts/${id}/documents`);
      if (!res.ok) throw new Error("load");
      setDocuments((await res.json()) as SparePartDocument[]);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("spareParts.documentsLoadError"), life: 6000 });
    } finally {
      setDocumentsLoading(false);
    }
  }, [t]);

  const uploadDocument = useCallback(async (id: string, document: PendingDocumentUpload) => {
    const fd = new FormData();
    fd.append("file", document.file, document.file.name);
    fd.append("displayName", document.displayName);
    fd.append("category", document.category);
    return (await apiFetch(`/api/spare-parts/${id}/documents`, { method: "POST", body: fd })).ok;
  }, []);

  const openCreate = useCallback(() => {
    resetPhotoState();
    resetDocumentsState();
    setEditingId(null);
    setForm({
      ...emptyForm(),
      ...(siteFieldLocked ? { siteId: user.workingSiteId } : {}),
    });
    setStockLines([]);
    setStockPolicies([]);
    setActiveTabIndex(sparePartDialogTabs.General);
    setDialogVisible(true);
  }, [resetDocumentsState, resetPhotoState, siteFieldLocked, user.workingSiteId]);

  const openEdit = useCallback(
    (row: SparePart) => {
      resetPhotoState();
      resetDocumentsState();
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
      setStockPolicies([]);
      setActiveTabIndex(sparePartDialogTabs.General);
      setDialogVisible(true);
      void loadStockDetail(row.id);
      if (row.hasPhoto) void loadSparePartPhoto(row.id);
    },
    [loadSparePartPhoto, loadStockDetail, resetDocumentsState, resetPhotoState],
  );

  const handleSparePartTabChange = useCallback((event: { index: number }) => {
    if (
      event.index === sparePartDialogTabs.General ||
      event.index === sparePartDialogTabs.StockData ||
      event.index === sparePartDialogTabs.StockPlanning ||
      event.index === sparePartDialogTabs.Documents
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
  }, [activeTabIndex, dialogVisible, stockTabCount, policyTabCount, documentsTabCount, updateTabInk]);

  useEffect(() => {
    if (dialogVisible && editingId) void loadDocuments(editingId);
  }, [dialogVisible, editingId, loadDocuments]);

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
    if (code === "storage_location_warehouse_mismatch") {
      detail = t("spareParts.storageLocationWarehouseMismatch");
    }
    if (code === "stock_data_locked") detail = t("spareParts.stockDataLocked");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const handlePickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      if (file) toastRef.current?.show({ severity: "error", summary: t("spareParts.photoUploadError"), life: 6000 });
      return;
    }
    clearPhotoPreview();
    const preview = URL.createObjectURL(file);
    photoPreviewUrlRef.current = preview;
    setPhotoPreviewUrl(preview);
    if (!editingId) {
      setPendingPhotoFile(file);
      return;
    }
    setPhotoUploading(true);
    try {
      if (!(await uploadSparePartPhoto(editingId, file))) throw new Error("upload");
      setPendingPhotoFile(null);
      setHasStoredPhoto(true);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("spareParts.photoUploadError"), life: 6000 });
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!editingId) {
      clearPhotoPreview();
      setPendingPhotoFile(null);
      return;
    }
    setPhotoUploading(true);
    try {
      if (!(await removeSparePartPhoto(editingId))) throw new Error("delete");
      clearPhotoPreview();
      setHasStoredPhoto(false);
      await loadData();
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("spareParts.photoRemoveError"), life: 6000 });
    } finally {
      setPhotoUploading(false);
    }
  };

  const handlePickFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setUploadDrafts(files.map((file) => ({ file, displayName: file.name, category: "general" })));
    setUploadMetaVisible(true);
  };

  const confirmUploadDrafts = async () => {
    if (uploadDrafts.some((draft) => !draft.displayName.trim())) {
      toastRef.current?.show({ severity: "warn", summary: t("spareParts.documentsDisplayNameRequired"), life: 4000 });
      return;
    }
    const next = uploadDrafts.map((draft) => ({ ...draft, displayName: draft.displayName.trim(), localId: newPendingLocalId() }));
    setUploadMetaVisible(false);
    setUploadDrafts([]);
    if (!editingId) {
      setPendingFiles((current) => [...current, ...next]);
      return;
    }
    setDocumentsUploading(true);
    try {
      const results = await Promise.all(next.map((document) => uploadDocument(editingId, document)));
      if (results.some((ok) => !ok)) {
        toastRef.current?.show({ severity: "warn", summary: t("spareParts.documentsUploadPartialError"), life: 6000 });
      } else {
        toastRef.current?.show({ severity: "success", summary: t("spareParts.documentsUploaded"), life: 3000 });
      }
      await Promise.all([loadDocuments(editingId), loadData()]);
    } finally {
      setDocumentsUploading(false);
    }
  };

  const openDocumentContent = async (document: SparePartDocument) => {
    try {
      const res = await apiFetch(`/api/spare-parts/${document.sparePartId}/documents/${document.id}/content`);
      if (!res.ok) throw new Error("open");
      const url = URL.createObjectURL(await res.blob());
      if (!window.open(url, "_blank", "noopener,noreferrer")) {
        URL.revokeObjectURL(url);
        toastRef.current?.show({ severity: "warn", summary: t("spareParts.documentsPopupBlocked"), life: 5000 });
      } else window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("spareParts.documentsOpenError"), life: 6000 });
    }
  };

  const deleteDocument = async (document: SparePartDocument) => {
    const res = await apiFetch(`/api/spare-parts/${document.sparePartId}/documents/${document.id}`, { method: "DELETE" });
    if (!res.ok) {
      toastRef.current?.show({ severity: "error", summary: t("spareParts.documentsDeleteError"), life: 6000 });
      return;
    }
    await Promise.all([loadDocuments(document.sparePartId), loadData()]);
    toastRef.current?.show({ severity: "success", summary: t("spareParts.documentsDeleted"), life: 3000 });
  };

  const saveDocumentEdit = async () => {
    if (!editingId || !documentEdit || !documentEditDisplayName.trim()) return;
    setDocumentEditSaving(true);
    try {
      const res = await apiFetch(`/api/spare-parts/${editingId}/documents/${documentEdit.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: documentEditDisplayName.trim(), category: documentEditCategory }),
      });
      if (!res.ok) throw new Error("update");
      setDocumentEdit(null);
      await Promise.all([loadDocuments(editingId), loadData()]);
      toastRef.current?.show({ severity: "success", summary: t("spareParts.documentsUpdated"), life: 3000 });
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("spareParts.documentsUpdateError"), life: 6000 });
    } finally {
      setDocumentEditSaving(false);
    }
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
    if (editingId) {
      const policyIncomplete = stockPolicies.some((policy) => {
        if (policy.scopeType === "SITE") return false;
        if (!policy.warehouseId) return true;
        if (policy.scopeType === "STORAGE_LOCATION" && !policy.storageLocationId) return true;
        return false;
      });
      const stockIncomplete = stockLines.some(
        (line) => line.warehouseId && !line.storageLocationId,
      );
      if (policyIncomplete || stockIncomplete) {
        toastRef.current?.show({
          severity: "warn",
          summary: t("spareParts.stockPolicyInvalid"),
          life: 4000,
        });
        return;
      }
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
              .filter((line) => line.warehouseId && line.storageLocationId)
              .map((line) => ({
                warehouseId: line.warehouseId,
                storageLocationId: line.storageLocationId,
                quantity: line.quantity,
              }))
          : [],
        stockPolicies: editingId
          ? stockPolicies.map((policy) => {
              if (policy.scopeType === "SITE") {
                return {
                  scopeType: "SITE" as const,
                  warehouseId: null,
                  storageLocationId: null,
                  reorderLevel: policy.reorderLevel,
                  minStock: policy.minStock,
                  orderQuantity: policy.orderQuantity,
                };
              }
              if (policy.scopeType === "WAREHOUSE") {
                return {
                  scopeType: "WAREHOUSE" as const,
                  warehouseId: policy.warehouseId,
                  storageLocationId: null,
                  reorderLevel: policy.reorderLevel,
                  minStock: policy.minStock,
                  orderQuantity: policy.orderQuantity,
                };
              }
              return {
                scopeType: "STORAGE_LOCATION" as const,
                warehouseId: policy.warehouseId,
                storageLocationId: policy.storageLocationId,
                reorderLevel: policy.reorderLevel,
                minStock: policy.minStock,
                orderQuantity: policy.orderQuantity,
              };
            })
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
      const saved = (await res.json()) as SparePart;
      if (pendingPhotoFile && !(await uploadSparePartPhoto(saved.id, pendingPhotoFile))) {
        toastRef.current?.show({ severity: "error", summary: t("spareParts.photoUploadError"), life: 6000 });
      }
      if (pendingFiles.length) {
        setDocumentsUploading(true);
        try {
          const uploaded = await Promise.all(pendingFiles.map((document) => uploadDocument(saved.id, document)));
          if (uploaded.some((ok) => !ok)) {
            toastRef.current?.show({ severity: "warn", summary: t("spareParts.documentsUploadPartialError"), life: 6000 });
          }
        } finally {
          setDocumentsUploading(false);
        }
      }
      closeDialog();
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

  const atheneContextMenuItems = useCallback(
    (row: SparePart | null) => [
      {
        label: t("assistant.askAthene"),
        className: "app-context-menu-athene",
        icon: athene.busy ? (
          <LucideSpinner className={lucidePrimeBtnIcon} strokeWidth={1.75} />
        ) : (
          <MessageCircle className={lucidePrimeBtnIcon} strokeWidth={1.75} />
        ),
        disabled: !row || athene.busy,
        command: () => {
          if (!row) return;
          athene.openWithContext({
            type: "sparePart",
            id: row.id,
            label: `${row.key} - ${row.name}`,
            data: {
              key: row.key,
              name: row.name,
              siteKey: row.siteKey,
              articleNumber: row.articleNumber,
              stockLineCount: row.stockControlLines?.length ?? 0,
            },
          });
        },
      },
    ],
    [athene, t],
  );

  const tableCtx = useTableContextMenu<SparePart>({
    labels: { new: t("spareParts.new"), edit: t("spareParts.edit"), delete: t("spareParts.delete") },
    handlers: { onCreate: openCreate, onEdit: openEdit, onDelete: confirmDelete },
    selection: selectedSparePart,
    setSelection: setSelectedSparePart,
    leadingItems: atheneContextMenuItems,
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

  const formatQuantity = (value: string | number | null | undefined) => {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "0";
    return new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: 4,
      minimumFractionDigits: 0,
    }).format(n);
  };

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

  const addStockPolicy = () => {
    setStockPolicies((policies) => [...policies, newStockPolicy()]);
  };

  const removeStockPolicy = (localId: string) => {
    setStockPolicies((policies) => policies.filter((policy) => policy.localId !== localId));
  };

  const updateStockPolicy = (localId: string, patch: Partial<StockPolicyForm>) => {
    setStockPolicies((policies) =>
      policies.map((policy) => {
        if (policy.localId !== localId) return policy;
        const next = { ...policy, ...patch };
        if (patch.scopeType === "SITE") {
          next.warehouseId = "";
          next.storageLocationId = "";
        } else if (patch.scopeType === "WAREHOUSE") {
          next.storageLocationId = "";
        } else if (patch.warehouseId !== undefined && patch.warehouseId !== policy.warehouseId) {
          next.storageLocationId = "";
        }
        return next;
      }),
    );
  };

  const storageLocationOptionsForWarehouse = useCallback(
    (warehouseId: string, selectedId?: string) =>
      storageLocations
        .filter(
          (sl) =>
            sl.warehouseId === warehouseId && (sl.isActive || sl.id === selectedId),
        )
        .map((sl) => ({ label: sl.key, value: sl.id })),
    [storageLocations],
  );

  const openDocuments = useCallback((row: SparePart) => {
    openEdit(row);
    setActiveTabIndex(sparePartDialogTabs.Documents);
  }, [openEdit]);

  const referencesBody = (row: SparePart) => {
    const hasDocuments = row.documentCount > 0;
    return (
      <Button
        type="button"
        icon={<File className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        badge={hasDocuments ? String(row.documentCount) : " "}
        badgeClassName={`!bg-slate-900 !text-white !shadow-none !min-w-[1.1rem] !h-4 !text-[10px] !leading-4 !p-0 ${hasDocuments ? "" : "app-ref-badge--placeholder"}`}
        className={`h-7 w-7 !rounded-[0.5rem] !p-0 ${hasDocuments ? "app-ref-button--documents" : "app-ref-button--documents-inactive"}`}
        disabled={!hasDocuments}
        onClick={() => openDocuments(row)}
        aria-label={t("spareParts.references")}
        title={t("spareParts.references")}
      />
    );
  };

  const dialogFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("spareParts.cancel")}
        severity="secondary"
        outlined
        disabled={saving || documentsUploading}
        onClick={closeDialog}
      />
      <Button
        type="button"
        label={t("spareParts.save")}
        icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        loading={saving || documentsUploading}
        disabled={documentsUploading}
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
          <Column
            columnKey="photo"
            header=""
            body={(row: SparePart) =>
              row.hasPhoto ? <ImageIcon className="h-4 w-4 text-sky-500" strokeWidth={1.75} /> : <span className="text-on-surface-variant">—</span>
            }
            className="w-12 text-center"
          />
          <Column field="key" header={t("spareParts.key")} sortable />
          <Column field="name" header={t("spareParts.name")} sortable />
          <Column columnKey="references" header={t("spareParts.references")} body={referencesBody} className="w-20 text-center" />
          <Column field="siteName" header={t("spareParts.site")} sortable body={siteColumnBody} />
          <Column
            field="totalQuantity"
            header={t("spareParts.totalQuantity")}
            body={(row: SparePart) => formatQuantity(row.totalQuantity)}
            sortable
            className="text-right tabular-nums"
          />
          <Column
            field="siteQuantity"
            header={t("spareParts.siteQuantity")}
            body={(row: SparePart) => formatQuantity(row.siteQuantity)}
            sortable
            className="text-right tabular-nums"
          />
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
        onHide={closeDialog}
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
              <div className="flex flex-col gap-4 pt-1 md:flex-row">
                <div className="w-44 shrink-0 space-y-2">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-sm border border-outline-variant bg-surface-container-low">
                    {photoPreviewUrl ? <img src={photoPreviewUrl} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-10 w-10 text-on-surface-variant" strokeWidth={1.5} />}
                  </div>
                  <input ref={photoFileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickPhoto} />
                  <Button type="button" label={t("spareParts.photoUpload")} icon={<Upload className={lucidePrimeBtnIcon} strokeWidth={1.75} />} className="w-full" loading={photoUploading} onClick={() => photoFileInputRef.current?.click()} />
                  {(photoPreviewUrl || hasStoredPhoto) ? <Button type="button" label={t("spareParts.photoRemove")} icon={<X className={lucidePrimeBtnIcon} strokeWidth={1.75} />} severity="secondary" outlined className="w-full" disabled={photoUploading} onClick={() => void handleRemovePhoto()} /> : null}
                </div>
              <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
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
                    htmlFor="spare-part-total-quantity"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("spareParts.totalQuantity")}
                  </label>
                  <InputNumber
                    inputId="spare-part-total-quantity"
                    value={totalQuantityAll}
                    min={0}
                    className="w-full"
                    inputClassName="w-full"
                    disabled
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="spare-part-site-quantity"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("spareParts.siteQuantity")}
                  </label>
                  <InputNumber
                    inputId="spare-part-site-quantity"
                    value={siteQuantity}
                    min={0}
                    className="w-full"
                    inputClassName="w-full"
                    disabled
                    readOnly
                  />
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
                                        storageLocationId: "",
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
                                  <Dropdown
                                    value={line.storageLocationId || null}
                                    options={storageLocationOptionsForWarehouse(
                                      line.warehouseId,
                                      line.storageLocationId,
                                    )}
                                    onChange={(e) =>
                                      updateStockLine(line.localId, {
                                        storageLocationId: String(e.value ?? ""),
                                      })
                                    }
                                    placeholder={t("spareParts.storageLocationPlaceholder")}
                                    className="w-full min-w-[10rem] app-inline-icon-dropdown"
                                    filter
                                    disabled={lineLocked || !line.warehouseId}
                                    appendTo={overlayAppendTo}
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
                </div>
              )}
            </TabPanel>
            <TabPanel
              header={
                <span className="inline-flex items-center gap-2">
                  <span>{t("spareParts.tabStockPlanning")}</span>
                  {editingId && policyTabCount > 0 ? <Badge value={policyTabCount} /> : null}
                </span>
              }
            >
              {!editingId ? (
                <p className="m-0 pt-1 text-sm text-on-surface-variant">
                  {t("spareParts.stockPlanningCreateHint")}
                </p>
              ) : stockDetailLoading ? (
                <p className="m-0 pt-1 text-sm text-on-surface-variant">{t("spareParts.loadError")}</p>
              ) : (
                <div className="flex flex-col gap-3 pt-1">
                  <p className="m-0 text-sm text-on-surface-variant">
                    {t("spareParts.stockPlanningHint")}
                  </p>
                  {stockPolicies.length === 0 ? (
                    <p className="m-0 text-sm text-on-surface-variant">
                      {t("spareParts.stockPlanningEmpty")}
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-sm border border-outline-variant/40">
                      <table className="w-full min-w-[56rem] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-outline-variant/40 bg-surface-container-low">
                            <th className="px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.1em] text-outline">
                              {t("spareParts.scopeType")}
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.1em] text-outline">
                              {t("spareParts.warehouse")}
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.1em] text-outline">
                              {t("spareParts.storageLocation")}
                            </th>
                            <th className="w-28 px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.1em] text-outline">
                              {t("spareParts.reorderLevel")}
                            </th>
                            <th className="w-28 px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.1em] text-outline">
                              {t("spareParts.minStock")}
                            </th>
                            <th className="w-28 px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.1em] text-outline">
                              {t("spareParts.orderQuantity")}
                            </th>
                            <th className="w-14 px-3 py-2" aria-hidden />
                          </tr>
                        </thead>
                        <tbody>
                          {stockPolicies.map((policy) => {
                            const needsWarehouse = policy.scopeType !== "SITE";
                            const needsLocation = policy.scopeType === "STORAGE_LOCATION";
                            return (
                              <tr
                                key={policy.localId}
                                className="border-b border-outline-variant/30 last:border-b-0"
                              >
                                <td className="px-3 py-2 align-top">
                                  <Dropdown
                                    value={policy.scopeType}
                                    options={scopeDropdownOptions}
                                    onChange={(e) =>
                                      updateStockPolicy(policy.localId, {
                                        scopeType: e.value as StockPolicyScopeType,
                                      })
                                    }
                                    className="w-full min-w-[10rem] app-inline-icon-dropdown"
                                    appendTo={overlayAppendTo}
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {needsWarehouse ? (
                                    <Dropdown
                                      value={policy.warehouseId || null}
                                      options={warehouseDropdownOptions}
                                      onChange={(e) =>
                                        updateStockPolicy(policy.localId, {
                                          warehouseId: String(e.value ?? ""),
                                        })
                                      }
                                      placeholder={t("spareParts.warehousePlaceholder")}
                                      className="w-full min-w-[12rem] app-inline-icon-dropdown"
                                      filter
                                      disabled={!form.siteId}
                                      appendTo={overlayAppendTo}
                                    />
                                  ) : (
                                    <span className="text-on-surface-variant">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {needsLocation ? (
                                    <Dropdown
                                      value={policy.storageLocationId || null}
                                      options={storageLocationOptionsForWarehouse(
                                        policy.warehouseId,
                                        policy.storageLocationId,
                                      )}
                                      onChange={(e) =>
                                        updateStockPolicy(policy.localId, {
                                          storageLocationId: String(e.value ?? ""),
                                        })
                                      }
                                      placeholder={t("spareParts.storageLocationPlaceholder")}
                                      className="w-full min-w-[10rem] app-inline-icon-dropdown"
                                      filter
                                      disabled={!policy.warehouseId}
                                      appendTo={overlayAppendTo}
                                    />
                                  ) : (
                                    <span className="text-on-surface-variant">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <InputNumber
                                    value={policy.reorderLevel}
                                    onValueChange={(e) =>
                                      updateStockPolicy(policy.localId, {
                                        reorderLevel: e.value ?? 0,
                                      })
                                    }
                                    min={0}
                                    className="w-full"
                                    inputClassName="w-full"
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <InputNumber
                                    value={policy.minStock}
                                    onValueChange={(e) =>
                                      updateStockPolicy(policy.localId, {
                                        minStock: e.value ?? 0,
                                      })
                                    }
                                    min={0}
                                    className="w-full"
                                    inputClassName="w-full"
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <InputNumber
                                    value={policy.orderQuantity}
                                    onValueChange={(e) =>
                                      updateStockPolicy(policy.localId, {
                                        orderQuantity: e.value ?? 0,
                                      })
                                    }
                                    min={0}
                                    className="w-full"
                                    inputClassName="w-full"
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <Button
                                    type="button"
                                    severity="danger"
                                    text
                                    rounded
                                    aria-label={t("spareParts.removeStockPolicy")}
                                    icon={<Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                                    onClick={() => removeStockPolicy(policy.localId)}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div>
                    <Button
                      type="button"
                      label={t("spareParts.addStockPolicy")}
                      icon={<Plus className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                      severity="secondary"
                      outlined
                      onClick={addStockPolicy}
                    />
                  </div>
                </div>
              )}
            </TabPanel>
            <TabPanel header={<span className="inline-flex items-center gap-2"><span>{t("spareParts.tabDocuments")}</span>{documentsTabCount > 0 ? <Badge value={documentsTabCount} /> : null}</span>}>
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-[8fr_2fr] gap-2">
                  <Button type="button" icon={<Upload className={lucidePrimeBtnIcon} strokeWidth={1.75} />} label={t("spareParts.documentsUpload")} onClick={() => documentsFileInputRef.current?.click()} />
                  <IconField iconPosition="left"><LucideInputSearchIcon /><InputText value={documentsSearchTerm} onChange={(e) => setDocumentsSearchTerm(e.target.value)} placeholder={t("spareParts.documentsSearchPlaceholder")} className="app-header-search-input w-full !rounded-sm text-sm" /></IconField>
                </div>
                <input ref={documentsFileInputRef} type="file" multiple className="hidden" onChange={handlePickFiles} />
                {documentsUploading ? <div className="flex items-center gap-2 text-sm text-on-surface-variant"><LucideSpinner className="h-4 w-4" strokeWidth={1.75} />{t("spareParts.documentsUploading")}</div> : null}
                {pendingFiles.length > 0 ? <div className="space-y-2"><div className="text-sm text-on-surface-variant">{t("spareParts.documentsPending")}</div>{pendingFiles.map((doc) => <div key={doc.localId} className="flex items-center gap-3 rounded-sm border border-outline-variant px-3 py-2"><File className="h-5 w-5 shrink-0 text-on-surface-variant" /><span className="min-w-0 flex-1 truncate text-sm">{doc.displayName}</span><Button type="button" text severity="danger" icon={<X className={lucidePrimeBtnIcon} strokeWidth={1.75} />} aria-label={t("spareParts.documentsRemovePending")} onClick={() => setPendingFiles((files) => files.filter((file) => file.localId !== doc.localId))} /></div>)}</div> : null}
                {!editingId ? <div className="rounded-sm border border-outline-variant px-3 py-2 text-sm text-on-surface-variant">{t("spareParts.documentsCreateHint")}</div> : <div className="space-y-2"><div className="text-sm text-on-surface-variant">{t("spareParts.documentsExisting")}</div>{documentsLoading ? <div className="text-sm text-on-surface-variant">{t("spareParts.documentsLoading")}</div> : documents.filter((doc) => `${doc.displayName} ${doc.fileName}`.toLowerCase().includes(documentsSearchTerm.toLowerCase())).map((doc) => { const spec = documentTypeMimeIcon(doc.mimeType, doc.fileName); const Icon = spec.Icon; return <div key={doc.id} className="flex items-center gap-3 rounded-sm border border-outline-variant px-3 py-2"><Icon className={`${spec.className} h-5 w-5 shrink-0`} strokeWidth={1.75} /><button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setDocumentEdit(doc); setDocumentEditDisplayName(doc.displayName || doc.fileName); setDocumentEditCategory(doc.category); }}><div className="truncate text-sm">{doc.displayName || doc.fileName}</div><span className={`rounded-sm px-1.5 py-0.5 text-[11px] ${documentCategoryBadgeClass(doc.category)}`}>{t(`assets.documentCategories.${doc.category}`)}</span></button><Button type="button" text icon={<ExternalLink className={lucidePrimeBtnIcon} strokeWidth={1.75} />} aria-label={t("spareParts.documentsOpen")} onClick={() => void openDocumentContent(doc)} /><Button type="button" text severity="danger" icon={<Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />} aria-label={t("spareParts.delete")} onClick={() => confirmDialog({ message: t("spareParts.documentsConfirmDelete", { name: doc.displayName || doc.fileName }), header: t("spareParts.documentsDeleteTitle"), acceptClassName: "p-button-danger", accept: () => void deleteDocument(doc) })} /></div>; })}</div>}
              </div>
            </TabPanel>
          </TabView>
        </div>
      </Dialog>
      <Dialog header={t("spareParts.documentsMetaDialogTitle")} visible={uploadMetaVisible} className="app-modal-window" onHide={() => { setUploadMetaVisible(false); setUploadDrafts([]); }} modal dismissableMask draggable={false} resizable={false}>
        <div className="space-y-3">
          <div className="text-sm text-on-surface-variant">{t("spareParts.documentsMetaDialogHint")}</div>
          {uploadDrafts.map((draft, index) => <div key={`${draft.file.name}-${index}`} className="grid grid-cols-1 gap-3 rounded-sm border border-outline-variant p-3 md:grid-cols-2"><InputText value={draft.displayName} onChange={(e) => setUploadDrafts((drafts) => drafts.map((item, i) => i === index ? { ...item, displayName: e.target.value } : item))} /><Dropdown value={draft.category} options={documentCategoryOptions} optionLabel="label" optionValue="value" onChange={(e) => setUploadDrafts((drafts) => drafts.map((item, i) => i === index ? { ...item, category: e.value as AssetDocumentCategory } : item))} appendTo={overlayAppendTo} /></div>)}
          <div className="flex justify-end gap-2"><Button type="button" label={t("spareParts.cancel")} severity="secondary" outlined onClick={() => setUploadMetaVisible(false)} /><Button type="button" label={t("spareParts.documentsMetaApply")} icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />} onClick={() => void confirmUploadDrafts()} /></div>
        </div>
      </Dialog>
      <Dialog header={t("spareParts.documentsEditTitle")} visible={documentEdit !== null} className="app-modal-window" onHide={() => !documentEditSaving && setDocumentEdit(null)} modal dismissableMask={!documentEditSaving} draggable={false} resizable={false}>
        <div className="space-y-3"><InputText value={documentEditDisplayName} onChange={(e) => setDocumentEditDisplayName(e.target.value)} className="w-full" /><Dropdown value={documentEditCategory} options={documentCategoryOptions} optionLabel="label" optionValue="value" onChange={(e) => setDocumentEditCategory(e.value as AssetDocumentCategory)} className="w-full" appendTo={overlayAppendTo} /><div className="flex justify-end gap-2"><Button type="button" label={t("spareParts.cancel")} severity="secondary" outlined disabled={documentEditSaving} onClick={() => setDocumentEdit(null)} /><Button type="button" label={t("spareParts.save")} loading={documentEditSaving} onClick={() => void saveDocumentEdit()} /></div></div>
      </Dialog>
    </div>
  );
}
