import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardList,
  File,
  MapPin,
  Network,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Badge } from "primereact/badge";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Sidebar } from "primereact/sidebar";
import { TabPanel, TabView } from "primereact/tabview";
import { Toast } from "primereact/toast";
import { TreeTable } from "primereact/treetable";
import type { TreeNode } from "primereact/treenode";

import { useAuth } from "../auth/AuthContext";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { LucideSpinner, lucidePrimeBtnIcon } from "../icons/lucide";
import { documentCategoryBadgeClass } from "../constants/assetDocumentCategory";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import { APP_PARAM_KEY_COLORED_ASSET_TREE } from "../lib/appParameterKeys";
import {
  DEFAULT_ASSET_TYPE_DISPLAY_CONFIG,
  type AssetTypeDisplayConfig,
} from "../lib/assetTypeDisplay";
import {
  buildAssetTree,
  collectExpandableKeys,
  filterAssetTree,
  type AssetTreeAsset,
  type AssetTreeType,
} from "../lib/assetTree";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";
import type { WorkOrder, WorkOrderStatus } from "../lib/workOrderTypes";
import { documentTypeMimeIcon } from "../hooks/useWorkOrderEditDialogState";
import { useWorkOrderDialog } from "../workOrders/WorkOrderDialogContext";

type AssetDocumentRow = {
  id: string;
  fileName: string;
  displayName: string | null;
  category: string;
  mimeType: string | null;
  fileSize: number;
};

type RefsTabIndex = 0 | 1;

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageDocument(doc: AssetDocumentRow): boolean {
  const mt = (doc.mimeType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (mt.startsWith("image/")) return true;
  const i = doc.fileName.lastIndexOf(".");
  const ext = i >= 0 ? doc.fileName.slice(i + 1).toLowerCase() : "";
  return (
    ext === "png" ||
    ext === "jpg" ||
    ext === "jpeg" ||
    ext === "gif" ||
    ext === "webp" ||
    ext === "bmp" ||
    ext === "svg"
  );
}

type ImageHoverPreview = {
  docId: string;
  title: string;
  url: string | null;
  loading: boolean;
  top: number;
  left: number;
};

function parseDocumentRow(raw: unknown): AssetDocumentRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.fileName !== "string") return null;
  const fileSize =
    typeof o.fileSize === "number" && Number.isFinite(o.fileSize)
      ? o.fileSize
      : typeof o.fileSize === "string"
        ? Number(o.fileSize) || 0
        : 0;
  return {
    id: o.id,
    fileName: o.fileName,
    displayName: typeof o.displayName === "string" ? o.displayName : null,
    category: typeof o.category === "string" && o.category.trim() ? o.category : "general",
    mimeType: typeof o.mimeType === "string" ? o.mimeType : null,
    fileSize,
  };
}

function isAssetType(v: unknown): v is AssetTreeType {
  return v === "site" || v === "structure" || v === "line" || v === "maintenanceObject";
}

function assetTypeIconComponent(type: AssetTreeType): LucideIcon {
  switch (type) {
    case "site":
      return MapPin;
    case "structure":
      return Network;
    case "line":
      return ArrowLeftRight;
    case "maintenanceObject":
      return Wrench;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function AssetTypeGlyph({ type, style }: { type: AssetTreeType; style?: CSSProperties }) {
  const Ico = assetTypeIconComponent(type);
  return (
    <Ico
      className={`app-asset-type-icon app-asset-type-icon--${type} h-4 w-4 shrink-0`}
      style={style}
      strokeWidth={1.75}
      aria-hidden
    />
  );
}

function assetTypeDisplayLabel(
  type: AssetTreeType,
  cfg: AssetTypeDisplayConfig | null,
  langDe: boolean,
  t: (key: string) => string,
): string {
  const e = cfg?.[type];
  if (e) {
    const n = (langDe ? e.nameDe : e.nameEn).trim();
    if (n) return n;
  }
  return t(`assets.types.${type}`);
}

function assetTypeIconColorStyle(
  type: AssetTreeType,
  cfg: AssetTypeDisplayConfig | null,
): CSSProperties | undefined {
  const hex = cfg?.[type]?.colorHex?.trim();
  if (!hex) return undefined;
  return { color: hex };
}

function nodeAsset(node: TreeNode): AssetTreeAsset | null {
  const data = node.data;
  if (!data || typeof data !== "object") return null;
  const asset = data as AssetTreeAsset;
  return isAssetType(asset.type) ? asset : null;
}

function parseCount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.trunc(raw);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  }
  return 0;
}

function parseAssetRow(raw: unknown): AssetTreeAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.key !== "string" || typeof o.name !== "string") return null;
  if (typeof o.siteId !== "string" || !isAssetType(o.type)) return null;
  return {
    id: o.id,
    key: o.key,
    name: o.name,
    siteId: o.siteId,
    siteKey: typeof o.siteKey === "string" ? o.siteKey : "",
    siteName: typeof o.siteName === "string" ? o.siteName : "",
    siteColorHex: typeof o.siteColorHex === "string" ? o.siteColorHex : DEFAULT_SITE_COLOR_HEX,
    type: o.type,
    parentAssetId: typeof o.parentAssetId === "string" ? o.parentAssetId : null,
    parentAssetKey: typeof o.parentAssetKey === "string" ? o.parentAssetKey : null,
    parentAssetName: typeof o.parentAssetName === "string" ? o.parentAssetName : null,
    parentAssetType: isAssetType(o.parentAssetType) ? o.parentAssetType : null,
    documentCount: parseCount(o.documentCount),
    workOrderCount: parseCount(o.workOrderCount),
  };
}

const refBadgeClass =
  "!bg-slate-900 !text-white !shadow-none !min-w-[1.1rem] !h-4 !text-[10px] !leading-4 !p-0";

export function BaumstrukturPage() {
  const { t, i18n } = useTranslation();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const { appParameterAssetTypes, appParameterBooleans } = useAuth();
  const woDialog = useWorkOrderDialog();
  const langDe = i18n.language?.toLowerCase().startsWith("de") ?? false;
  const toastRef = useRef<Toast>(null);
  const refsTabHostRef = useRef<HTMLDivElement | null>(null);
  const typeColorsEnabled = appParameterBooleans[APP_PARAM_KEY_COLORED_ASSET_TREE] === true;
  const typeDisplayConfig = appParameterAssetTypes ?? DEFAULT_ASSET_TYPE_DISPLAY_CONFIG;

  const [assets, setAssets] = useState<AssetTreeAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [refsAsset, setRefsAsset] = useState<AssetTreeAsset | null>(null);
  const [refsTab, setRefsTab] = useState<RefsTabIndex>(0);
  const [docsSearchTerm, setDocsSearchTerm] = useState("");
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsRows, setDocsRows] = useState<AssetDocumentRow[]>([]);
  const [docsLoadedAssetId, setDocsLoadedAssetId] = useState<string | null>(null);
  const [woLoading, setWoLoading] = useState(false);
  const [woRows, setWoRows] = useState<WorkOrder[]>([]);
  const [woLoadedAssetId, setWoLoadedAssetId] = useState<string | null>(null);
  const [imageHoverPreview, setImageHoverPreview] = useState<ImageHoverPreview | null>(null);
  const imagePreviewCacheRef = useRef<Map<string, string>>(new Map());
  const imagePreviewHoverTimerRef = useRef<number | null>(null);
  const imagePreviewReqSeqRef = useRef(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/assets");
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as unknown;
      const rows = Array.isArray(data)
        ? data.map(parseAssetRow).filter((row): row is AssetTreeAsset => row != null)
        : [];
      setAssets(rows);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("baumstruktur.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const typeColorVars = useMemo(
    () =>
      ({
        "--app-asset-type-site": typeDisplayConfig.site.colorHex,
        "--app-asset-type-structure": typeDisplayConfig.structure.colorHex,
        "--app-asset-type-line": typeDisplayConfig.line.colorHex,
        "--app-asset-type-maintenanceObject": typeDisplayConfig.maintenanceObject.colorHex,
      }) as CSSProperties,
    [typeDisplayConfig],
  );

  const fullTree = useMemo(() => buildAssetTree(assets), [assets]);

  const treeNodes = useMemo(
    () => filterAssetTree(fullTree, searchTerm),
    [fullTree, searchTerm],
  );

  const selectedAsset = useMemo(() => {
    if (!selectedKey) return null;
    return assets.find((a) => a.id === selectedKey) ?? null;
  }, [assets, selectedKey]);

  useEffect(() => {
    if (selectedKey && !assets.some((a) => a.id === selectedKey)) {
      setSelectedKey(null);
    }
  }, [assets, selectedKey]);

  useEffect(() => {
    setHeaderRowCount(assets.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [assets.length, setHeaderRowCount]);

  useEffect(() => {
    const q = searchTerm.trim();
    if (q) {
      setExpandedKeys(collectExpandableKeys(treeNodes));
    }
  }, [searchTerm, treeNodes]);

  const expandAll = useCallback(() => {
    setExpandedKeys(collectExpandableKeys(treeNodes));
  }, [treeNodes]);

  const collapseAll = useCallback(() => {
    setExpandedKeys({});
  }, []);

  const loadDocuments = useCallback(
    async (asset: AssetTreeAsset) => {
      setDocsLoading(true);
      try {
        const res = await apiFetch(`/api/assets/${asset.id}/documents`);
        if (!res.ok) throw new Error("docs");
        const data = (await res.json()) as unknown;
        const rows = Array.isArray(data)
          ? data.map(parseDocumentRow).filter((row): row is AssetDocumentRow => row != null)
          : [];
        setDocsRows(rows);
        setDocsLoadedAssetId(asset.id);
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("baumstruktur.documentsLoadError"),
          life: 6000,
        });
        setDocsRows([]);
        setDocsLoadedAssetId(null);
      } finally {
        setDocsLoading(false);
      }
    },
    [t],
  );

  const loadWorkOrders = useCallback(
    async (asset: AssetTreeAsset) => {
      setWoLoading(true);
      try {
        const res = await apiFetch(`/api/work-orders?assetId=${encodeURIComponent(asset.id)}`);
        if (!res.ok) throw new Error("wos");
        const data = (await res.json()) as unknown;
        const rows = Array.isArray(data) ? (data as WorkOrder[]) : [];
        setWoRows(rows);
        setWoLoadedAssetId(asset.id);
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("baumstruktur.workOrdersLoadError"),
          life: 6000,
        });
        setWoRows([]);
        setWoLoadedAssetId(null);
      } finally {
        setWoLoading(false);
      }
    },
    [t],
  );

  const openRefsDrawer = useCallback(
    (asset: AssetTreeAsset, tab: RefsTabIndex) => {
      const sameAsset = refsAsset?.id === asset.id;
      setRefsAsset(asset);
      setRefsTab(tab);
      if (!sameAsset) {
        setDocsRows([]);
        setWoRows([]);
        setDocsLoadedAssetId(null);
        setWoLoadedAssetId(null);
        setDocsSearchTerm("");
      }
      if (tab === 0) {
        if (!sameAsset || docsLoadedAssetId !== asset.id) void loadDocuments(asset);
      } else if (!sameAsset || woLoadedAssetId !== asset.id) {
        void loadWorkOrders(asset);
      }
    },
    [docsLoadedAssetId, loadDocuments, loadWorkOrders, refsAsset?.id, woLoadedAssetId],
  );

  const closeRefsDrawer = useCallback(() => {
    if (imagePreviewHoverTimerRef.current != null) {
      window.clearTimeout(imagePreviewHoverTimerRef.current);
      imagePreviewHoverTimerRef.current = null;
    }
    setImageHoverPreview(null);
    setRefsAsset(null);
  }, []);

  const clearImageHoverPreview = useCallback(() => {
    if (imagePreviewHoverTimerRef.current != null) {
      window.clearTimeout(imagePreviewHoverTimerRef.current);
      imagePreviewHoverTimerRef.current = null;
    }
    imagePreviewReqSeqRef.current += 1;
    setImageHoverPreview(null);
  }, []);

  const showImageHoverPreview = useCallback(
    (assetId: string, doc: AssetDocumentRow, anchor: DOMRect) => {
      if (!isImageDocument(doc)) return;
      if (imagePreviewHoverTimerRef.current != null) {
        window.clearTimeout(imagePreviewHoverTimerRef.current);
      }
      const title = doc.displayName?.trim() || doc.fileName;
      const previewW = 280;
      const previewH = 220;
      const gap = 12;
      const left = Math.max(8, Math.min(anchor.left - previewW - gap, window.innerWidth - previewW - 8));
      const top = Math.max(8, Math.min(anchor.top, window.innerHeight - previewH - 8));
      const cacheKey = `${assetId}:${doc.id}`;
      const cached = imagePreviewCacheRef.current.get(cacheKey);

      imagePreviewHoverTimerRef.current = window.setTimeout(() => {
        imagePreviewHoverTimerRef.current = null;
        if (cached) {
          setImageHoverPreview({
            docId: doc.id,
            title,
            url: cached,
            loading: false,
            top,
            left,
          });
          return;
        }
        const seq = ++imagePreviewReqSeqRef.current;
        setImageHoverPreview({
          docId: doc.id,
          title,
          url: null,
          loading: true,
          top,
          left,
        });
        void (async () => {
          try {
            const res = await apiFetch(`/api/assets/${assetId}/documents/${doc.id}/content`);
            if (!res.ok) throw new Error("preview");
            const blob = await res.blob();
            if (imagePreviewReqSeqRef.current !== seq) return;
            const blobUrl = URL.createObjectURL(blob);
            const prev = imagePreviewCacheRef.current.get(cacheKey);
            if (prev) URL.revokeObjectURL(prev);
            imagePreviewCacheRef.current.set(cacheKey, blobUrl);
            setImageHoverPreview({
              docId: doc.id,
              title,
              url: blobUrl,
              loading: false,
              top,
              left,
            });
          } catch {
            if (imagePreviewReqSeqRef.current !== seq) return;
            setImageHoverPreview(null);
          }
        })();
      }, 220);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (imagePreviewHoverTimerRef.current != null) {
        window.clearTimeout(imagePreviewHoverTimerRef.current);
      }
      for (const url of imagePreviewCacheRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      imagePreviewCacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (refsAsset != null) return;
    clearImageHoverPreview();
  }, [clearImageHoverPreview, refsAsset]);

  useEffect(() => {
    if (refsTab === 0) return;
    clearImageHoverPreview();
  }, [clearImageHoverPreview, refsTab]);

  const onRefsTabChange = useCallback(
    (index: number) => {
      const tab: RefsTabIndex = index === 1 ? 1 : 0;
      setRefsTab(tab);
      if (!refsAsset) return;
      if (tab === 0 && docsLoadedAssetId !== refsAsset.id) void loadDocuments(refsAsset);
      if (tab === 1 && woLoadedAssetId !== refsAsset.id) void loadWorkOrders(refsAsset);
    },
    [docsLoadedAssetId, loadDocuments, loadWorkOrders, refsAsset, woLoadedAssetId],
  );

  const openDocumentContent = useCallback(
    async (assetId: string, documentId: string) => {
      try {
        const res = await apiFetch(`/api/assets/${assetId}/documents/${documentId}/content`);
        if (!res.ok) throw new Error("open");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const popup = window.open(blobUrl, "_blank", "noopener,noreferrer");
        if (!popup) {
          URL.revokeObjectURL(blobUrl);
          toastRef.current?.show({
            severity: "warn",
            summary: t("assets.documentsPopupBlocked"),
            life: 5000,
          });
          return;
        }
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("assets.documentsOpenError"),
          life: 6000,
        });
      }
    },
    [t],
  );

  const filteredDocsRows = useMemo(() => {
    const q = docsSearchTerm.trim().toLowerCase();
    if (!q) return docsRows;
    return docsRows.filter((doc) => {
      const name = (doc.displayName || doc.fileName).toLowerCase();
      return name.includes(q) || doc.fileName.toLowerCase().includes(q);
    });
  }, [docsRows, docsSearchTerm]);

  const keyBody = useCallback(
    (node: TreeNode) => {
      const asset = nodeAsset(node);
      if (!asset) return null;
      return (
        <span className="app-asset-treetable-cell">
          <AssetTypeGlyph
            type={asset.type}
            style={assetTypeIconColorStyle(asset.type, typeDisplayConfig)}
          />
          <span className="app-asset-treetable-cell__text font-medium" title={asset.key}>
            {asset.key}
          </span>
        </span>
      );
    },
    [typeDisplayConfig],
  );

  const nameBody = useCallback((node: TreeNode) => {
    const asset = nodeAsset(node);
    if (!asset) return null;
    return (
      <span className="app-asset-treetable-cell__text block" title={asset.name}>
        {asset.name}
      </span>
    );
  }, []);

  const typeBody = useCallback(
    (node: TreeNode) => {
      const asset = nodeAsset(node);
      if (!asset) return null;
      const label = assetTypeDisplayLabel(asset.type, typeDisplayConfig, langDe, t);
      return (
        <span className="app-asset-treetable-cell__text" title={label}>
          {label}
        </span>
      );
    },
    [langDe, t, typeDisplayConfig],
  );

  const siteBody = useCallback((node: TreeNode) => {
    const asset = nodeAsset(node);
    if (!asset) return null;
    const label = `${asset.siteKey} - ${asset.siteName}`;
    const hex = asset.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    return (
      <span
        className="app-asset-treetable-cell__text block"
        style={{ color: readableSiteColor(hex) }}
        title={label}
      >
        {label}
      </span>
    );
  }, []);

  const referencesBody = useCallback(
    (node: TreeNode) => {
      const asset = nodeAsset(node);
      if (!asset) return null;
      const hasDocuments = asset.documentCount > 0;
      const hasWorkOrders = asset.workOrderCount > 0;
      const docsBadge = hasDocuments ? String(asset.documentCount) : " ";
      const woBadge = hasWorkOrders ? String(asset.workOrderCount) : " ";
      const stop = (e: MouseEvent) => {
        e.stopPropagation();
      };
      return (
        <div className="flex items-center gap-1" onClick={stop} onMouseDown={stop}>
          <Button
            type="button"
            icon={<File className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
            badge={docsBadge}
            badgeClassName={`${refBadgeClass} ${hasDocuments ? "" : "app-ref-badge--placeholder"}`}
            className={`h-7 w-7 !rounded-[0.5rem] !p-0 ${
              hasDocuments ? "app-ref-button--documents" : "app-ref-button--documents-inactive"
            }`}
            onClick={() => openRefsDrawer(asset, 0)}
            aria-label={t("baumstruktur.referencesDocuments")}
            title={t("baumstruktur.referencesDocuments")}
          />
          <Button
            type="button"
            icon={<ClipboardList className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
            badge={woBadge}
            badgeClassName={`${refBadgeClass} ${hasWorkOrders ? "" : "app-ref-badge--placeholder"}`}
            className={`h-7 w-7 !rounded-[0.5rem] !p-0 ${
              hasWorkOrders ? "app-ref-button--work-orders" : "app-ref-button--work-orders-empty"
            }`}
            disabled={!hasWorkOrders}
            onClick={() => openRefsDrawer(asset, 1)}
            aria-label={t("baumstruktur.referencesWorkOrders")}
            title={t("baumstruktur.referencesWorkOrders")}
          />
        </div>
      );
    },
    [openRefsDrawer, t],
  );

  const onSelectionChange = useCallback((e: { value: unknown }) => {
    setSelectedKey(typeof e.value === "string" ? e.value : null);
  }, []);

  const rowClassName = useCallback(
    (node: TreeNode) => {
      if (!typeColorsEnabled) return {};
      const asset = nodeAsset(node);
      if (!asset) return {};
      return { [`app-asset-treetable-row--${asset.type}`]: true };
    },
    [typeColorsEnabled],
  );

  const statusLabel = useCallback(
    (status: WorkOrderStatus) => t(`workOrders.statusValues.${status}`),
    [t],
  );

  const updateRefsTabInk = useCallback(() => {
    const host = refsTabHostRef.current;
    if (!host) return;
    const nav = host.querySelector<HTMLElement>(".p-tabview-nav");
    const active = nav?.querySelector<HTMLElement>("li.p-highlight .p-tabview-nav-link");
    if (!nav || !active) return;
    nav.style.setProperty("--app-ink-x", `${active.offsetLeft}px`);
    nav.style.setProperty("--app-ink-w", `${active.offsetWidth}px`);
  }, []);

  useLayoutEffect(() => {
    if (refsAsset == null) return;
    const raf = requestAnimationFrame(updateRefsTabInk);
    return () => cancelAnimationFrame(raf);
  }, [refsAsset, refsTab, docsLoading, woLoading, updateRefsTabInk]);

  useEffect(() => {
    if (refsAsset == null) return;
    window.addEventListener("resize", updateRefsTabInk);
    return () => window.removeEventListener("resize", updateRefsTabInk);
  }, [refsAsset, updateRefsTabInk]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-2 p-0">
        <li>
          <Button
            type="button"
            className="h-9 !rounded-sm"
            outlined
            severity="secondary"
            onClick={expandAll}
            title={t("baumstruktur.expandAll")}
            aria-label={t("baumstruktur.expandAll")}
          >
            <ChevronsUpDown className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </Button>
        </li>
        <li>
          <Button
            type="button"
            className="h-9 !rounded-sm"
            outlined
            severity="secondary"
            onClick={collapseAll}
            title={t("baumstruktur.collapseAll")}
            aria-label={t("baumstruktur.collapseAll")}
          >
            <ChevronsDownUp className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </Button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("baumstruktur.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [collapseAll, expandAll, searchTerm, setHeaderActions, t]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
        <div className="flex min-h-0 min-w-0 flex-col overflow-auto" style={typeColorVars}>
          <TreeTable
            value={treeNodes}
            loading={loading}
            expandedKeys={expandedKeys}
            onToggle={(e) => setExpandedKeys(e.value)}
            selectionMode="single"
            selectionKeys={selectedKey}
            onSelectionChange={onSelectionChange}
            rowClassName={rowClassName}
            emptyMessage={t("baumstruktur.empty")}
            showGridlines
            stripedRows={!typeColorsEnabled}
            className={`app-asset-treetable w-full text-sm${typeColorsEnabled ? " app-asset-treetable--typed" : ""}`}
            tableStyle={{ minWidth: "64rem" }}
          >
            <Column
              header={t("baumstruktur.detailKey")}
              body={keyBody}
              expander
              style={{ minWidth: "16rem" }}
            />
            <Column
              header={t("baumstruktur.detailName")}
              body={nameBody}
              style={{ minWidth: "14rem" }}
            />
            <Column
              header={t("baumstruktur.detailType")}
              body={typeBody}
              style={{ minWidth: "12rem" }}
            />
            <Column
              header={t("baumstruktur.detailSite")}
              body={siteBody}
              style={{ minWidth: "12rem" }}
            />
            <Column
              header={t("baumstruktur.references")}
              body={referencesBody}
              style={{ width: "8.5rem", minWidth: "8.5rem" }}
            />
          </TreeTable>
        </div>

        <aside className="flex min-h-0 flex-col rounded-sm border border-outline-variant bg-surface-container-low p-3">
          <h2 className="m-0 mb-3 text-sm font-semibold text-on-surface">{t("baumstruktur.detailTitle")}</h2>
          {!selectedAsset ? (
            <p className="m-0 text-sm text-on-surface-variant">{t("baumstruktur.detailEmpty")}</p>
          ) : (
            <dl className="m-0 flex flex-col gap-3">
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-on-surface-variant">
                  {t("baumstruktur.detailKey")}
                </dt>
                <dd className="m-0 mt-0.5 truncate text-sm text-on-surface" title={selectedAsset.key}>
                  {selectedAsset.key}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-on-surface-variant">
                  {t("baumstruktur.detailName")}
                </dt>
                <dd className="m-0 mt-0.5 truncate text-sm text-on-surface" title={selectedAsset.name}>
                  {selectedAsset.name}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-on-surface-variant">
                  {t("baumstruktur.detailType")}
                </dt>
                <dd className="m-0 mt-0.5 flex items-center gap-2 text-sm text-on-surface">
                  <AssetTypeGlyph
                    type={selectedAsset.type}
                    style={assetTypeIconColorStyle(selectedAsset.type, typeDisplayConfig)}
                  />
                  {assetTypeDisplayLabel(selectedAsset.type, typeDisplayConfig, langDe, t)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-on-surface-variant">
                  {t("baumstruktur.detailSite")}
                </dt>
                <dd
                  className="m-0 mt-0.5 truncate text-sm"
                  style={{
                    color: readableSiteColor(selectedAsset.siteColorHex || DEFAULT_SITE_COLOR_HEX),
                  }}
                  title={`${selectedAsset.siteKey} - ${selectedAsset.siteName}`}
                >
                  {selectedAsset.siteKey} - {selectedAsset.siteName}
                </dd>
              </div>
            </dl>
          )}
        </aside>
      </div>

      <Sidebar
        visible={refsAsset != null}
        position="right"
        onHide={closeRefsDrawer}
        modal={false}
        dismissable
        className="app-wo-search-sidebar app-asset-refs-sidebar !w-[min(36rem,100vw)] max-w-none"
        appendTo={typeof document !== "undefined" ? document.body : undefined}
        header={
          refsAsset
            ? t("baumstruktur.referencesDrawerTitle", { key: refsAsset.key })
            : t("baumstruktur.references")
        }
        pt={{
          header: { className: "app-wo-search-sidebar-header" },
          content: { className: "app-wo-search-sidebar-content flex min-h-0 flex-1 flex-col p-0" },
        }}
      >
        {refsAsset ? (
          <div className="flex max-h-[calc(100dvh-4.5rem)] min-h-0 flex-1 flex-col">
            <div ref={refsTabHostRef} className="app-tabview-with-ink flex min-h-0 flex-1 flex-col">
            <TabView
              activeIndex={refsTab}
              onTabChange={(e) => onRefsTabChange(e.index)}
              className="app-sticky-tabs app-asset-refs-tabs flex min-h-0 flex-1 flex-col"
              pt={{
                navContent: { className: "shrink-0" },
                panelContainer: { className: "min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2" },
              }}
            >
              <TabPanel
                header={
                  <span className="inline-flex items-center gap-2">
                    <span>{t("baumstruktur.referencesDocuments")}</span>
                    {refsAsset.documentCount > 0 ? <Badge value={refsAsset.documentCount} /> : null}
                  </span>
                }
              >
                <div className="space-y-3">
                  <IconField iconPosition="left" className="w-full !h-9 min-h-9 max-h-9">
                    <LucideInputSearchIcon />
                    <InputText
                      value={docsSearchTerm}
                      onChange={(e) => setDocsSearchTerm(e.target.value)}
                      placeholder={t("assets.documentsSearchPlaceholder")}
                      className="app-header-search-input !h-full min-h-0 w-full !rounded-sm text-sm"
                    />
                  </IconField>
                  {docsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                      <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
                      <span>{t("assets.documentsLoading")}</span>
                    </div>
                  ) : filteredDocsRows.length === 0 ? (
                    <div className="text-sm text-on-surface-variant">
                      {docsRows.length === 0
                        ? t("baumstruktur.documentsEmpty")
                        : t("assets.documentsSearchEmpty")}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {filteredDocsRows.map((doc, index) => {
                        const spec = documentTypeMimeIcon(doc.mimeType ?? "application/octet-stream", doc.fileName);
                        const MimeIco = spec.Icon;
                        const title = doc.displayName?.trim() || doc.fileName;
                        const imageDoc = isImageDocument(doc);
                        return (
                          <div
                            key={doc.id}
                            role="button"
                            tabIndex={0}
                            className="app-card-cascade app-asset-refs-doc-card flex cursor-pointer items-center gap-2 rounded-sm border border-solid border-outline-variant px-3 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--color-on-surface)_4%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            style={{ ["--app-cascade-index" as string]: index }}
                            title={
                              imageDoc
                                ? t("baumstruktur.documentsImagePreviewHint")
                                : t("assets.documentsOpen")
                            }
                            onClick={() => void openDocumentContent(refsAsset.id, doc.id)}
                            onMouseEnter={(e) => {
                              if (!imageDoc) return;
                              showImageHoverPreview(
                                refsAsset.id,
                                doc,
                                e.currentTarget.getBoundingClientRect(),
                              );
                            }}
                            onMouseLeave={() => {
                              if (!imageDoc) return;
                              clearImageHoverPreview();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                void openDocumentContent(refsAsset.id, doc.id);
                              }
                            }}
                          >
                            <span className="app-asset-refs-doc-icon" aria-hidden>
                              <MimeIco
                                className={spec.className}
                                width={20}
                                height={20}
                                strokeWidth={1.75}
                              />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-on-surface" title={title}>
                                {title}
                              </div>
                              {doc.displayName?.trim() &&
                              doc.displayName.trim() !== doc.fileName ? (
                                <div className="truncate text-xs text-on-surface-variant" title={doc.fileName}>
                                  {doc.fileName}
                                </div>
                              ) : null}
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-on-surface-variant">
                                <span
                                  className={`inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight ${documentCategoryBadgeClass(doc.category)}`}
                                >
                                  {t(`assets.documentCategories.${doc.category}`, {
                                    defaultValue: doc.category,
                                  })}
                                </span>
                                <span className="min-w-0 truncate">
                                  {(doc.mimeType ?? "application/octet-stream").split(";")[0]}
                                </span>
                                <span className="shrink-0 tabular-nums">{formatFileSize(doc.fileSize)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabPanel>
              <TabPanel
                header={
                  <span className="inline-flex items-center gap-2">
                    <span>{t("baumstruktur.referencesWorkOrders")}</span>
                    {refsAsset.workOrderCount > 0 ? <Badge value={refsAsset.workOrderCount} /> : null}
                  </span>
                }
              >
                <div className="space-y-3">
                  {woLoading ? (
                    <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                      <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
                      <span>{t("baumstruktur.loading")}</span>
                    </div>
                  ) : woRows.length === 0 ? (
                    <div className="text-sm text-on-surface-variant">{t("baumstruktur.workOrdersEmpty")}</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {woRows.map((row, index) => (
                        <div
                          key={row.id}
                          role="button"
                          tabIndex={0}
                          className="app-card-cascade flex cursor-pointer flex-col gap-1 rounded-sm border border-solid border-outline-variant px-3 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--color-on-surface)_4%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          style={{ ["--app-cascade-index" as string]: index }}
                          onClick={() => {
                            closeRefsDrawer();
                            woDialog.openEdit(row.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              closeRefsDrawer();
                              woDialog.openEdit(row.id);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-on-surface-variant">
                              {t("workOrders.orderNumber")} {row.orderNumber}
                            </span>
                            <span className="truncate text-xs text-on-surface-variant">
                              {statusLabel(row.status)}
                            </span>
                          </div>
                          <div className="truncate text-sm text-on-surface" title={row.name}>
                            {row.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabPanel>
            </TabView>
            </div>
          </div>
        ) : null}
      </Sidebar>

      {imageHoverPreview && typeof document !== "undefined"
        ? createPortal(
            <div
              className="app-asset-refs-image-preview"
              style={{ top: imageHoverPreview.top, left: imageHoverPreview.left }}
              role="img"
              aria-label={t("baumstruktur.documentsImagePreview", {
                name: imageHoverPreview.title,
              })}
            >
              {imageHoverPreview.loading || !imageHoverPreview.url ? (
                <div className="app-asset-refs-image-preview__loading">
                  <LucideSpinner className="h-5 w-5" strokeWidth={1.75} />
                </div>
              ) : (
                <img
                  src={imageHoverPreview.url}
                  alt={imageHoverPreview.title}
                  className="app-asset-refs-image-preview__img"
                />
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
