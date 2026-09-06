import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import {
  ArrowLeftRight,
  CheckSquare,
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
import { DocumentMimeIcon } from "../components/documents/DocumentMimeIcon";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { AppTabHeader } from "../components/tabs/AppTabHeader";
import { LucideSpinner, lucidePrimeBtnIcon } from "../icons/lucide";
import { documentCategoryBadgeClass } from "../constants/assetDocumentCategory";
import { useDocumentImageHoverPreview } from "../hooks/useDocumentImageHoverPreview";
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
  collectSubtreeAssetIds,
  filterAssetTree,
  refButtonAppearance,
  type AnnotatedTreeNode,
  type AssetTreeAsset,
  type AssetTreeType,
  type RefButtonAppearance,
} from "../lib/assetTree";
import { isImageDocument } from "../lib/isImageDocument";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";
import { STANDARD_TAB_HOST_CLASS, STANDARD_TAB_VIEW_CLASS, useTabInk } from "../lib/tabs";
import type { WorkOrder, WorkOrderStatus } from "../lib/workOrderTypes";
import { useWorkOrderDialog } from "../workOrders/WorkOrderDialogContext";

type AssetDocumentRow = {
  id: string;
  assetId: string;
  fileName: string;
  displayName: string | null;
  category: string;
  mimeType: string | null;
  fileSize: number;
  assetKey: string | null;
  assetName: string | null;
};

type RefsTabIndex = 0 | 1 | 2;

type InspectionPointRow = {
  id: string;
  key: string;
  name: string;
  type: string;
};

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
    assetId: typeof o.assetId === "string" ? o.assetId : "",
    fileName: o.fileName,
    displayName: typeof o.displayName === "string" ? o.displayName : null,
    category: typeof o.category === "string" && o.category.trim() ? o.category : "general",
    mimeType: typeof o.mimeType === "string" ? o.mimeType : null,
    fileSize,
    assetKey: typeof o.assetKey === "string" ? o.assetKey : null,
    assetName: typeof o.assetName === "string" ? o.assetName : null,
  };
}

/** True when any strict descendant of rootId has documentCount > 0. */
function assetHasDescendantDocuments(assets: AssetTreeAsset[], rootId: string): boolean {
  const subtreeIds = collectSubtreeAssetIds(assets, rootId);
  for (const asset of assets) {
    if (asset.id === rootId) continue;
    if (subtreeIds.has(asset.id) && asset.documentCount > 0) return true;
  }
  return false;
}

function countSubtreeDocuments(assets: AssetTreeAsset[], rootId: string): number {
  const subtreeIds = collectSubtreeAssetIds(assets, rootId);
  let total = 0;
  for (const asset of assets) {
    if (subtreeIds.has(asset.id)) total += asset.documentCount;
  }
  return total;
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

function documentsRefClass(appearance: RefButtonAppearance): string {
  switch (appearance) {
    case "filled":
      return "app-ref-button--documents";
    case "outline":
      return "app-ref-button--documents-outline";
    case "outlineFilled":
      return "app-ref-button--documents-outline-filled";
    case "empty":
    default:
      return "app-ref-button--documents-inactive";
  }
}

function workOrdersRefClass(appearance: RefButtonAppearance): string {
  switch (appearance) {
    case "filled":
      return "app-ref-button--work-orders";
    case "outline":
      return "app-ref-button--work-orders-outline";
    case "outlineFilled":
      return "app-ref-button--work-orders-outline-filled";
    case "empty":
    default:
      return "app-ref-button--work-orders-empty";
  }
}

function inspectionPointsRefClass(appearance: RefButtonAppearance): string {
  switch (appearance) {
    case "filled":
      return "app-ref-button--inspection-points";
    case "outline":
      return "app-ref-button--inspection-points-outline";
    case "outlineFilled":
      return "app-ref-button--inspection-points-outline-filled";
    case "empty":
    default:
      return "app-ref-button--inspection-points-empty";
  }
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
    inspectionPointCount: parseCount(o.inspectionPointCount),
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
  const [ipLoading, setIpLoading] = useState(false);
  const [ipRows, setIpRows] = useState<InspectionPointRow[]>([]);
  const [ipLoadedAssetId, setIpLoadedAssetId] = useState<string | null>(null);
  const { showPreview, clearPreview, previewPortal } = useDocumentImageHoverPreview();

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
        const includeDescendants = assetHasDescendantDocuments(assets, asset.id);
        const qs = includeDescendants ? "?includeDescendants=1" : "";
        const res = await apiFetch(`/api/assets/${asset.id}/documents${qs}`);
        if (!res.ok) throw new Error("docs");
        const data = (await res.json()) as unknown;
        const rows = Array.isArray(data)
          ? data
              .map(parseDocumentRow)
              .filter((row): row is AssetDocumentRow => row != null)
              .map((row) => (row.assetId ? row : { ...row, assetId: asset.id }))
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
    [assets, t],
  );

  const loadWorkOrders = useCallback(
    async (asset: AssetTreeAsset) => {
      setWoLoading(true);
      try {
        const res = await apiFetch(
          `/api/work-orders?assetId=${encodeURIComponent(asset.id)}&limit=2000&offset=0`,
        );
        if (!res.ok) throw new Error("wos");
        const data = (await res.json()) as unknown;
        const rows = Array.isArray(data)
          ? (data as WorkOrder[])
          : data && typeof data === "object" && Array.isArray((data as { rows?: unknown }).rows)
            ? ((data as { rows: WorkOrder[] }).rows)
            : [];
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

  const loadInspectionPoints = useCallback(
    async (asset: AssetTreeAsset) => {
      setIpLoading(true);
      try {
        const res = await apiFetch(`/api/assets/${asset.id}/inspection-points`);
        if (!res.ok) throw new Error("ips");
        const data = (await res.json()) as unknown;
        const rows = Array.isArray(data) ? (data as InspectionPointRow[]) : [];
        setIpRows(rows);
        setIpLoadedAssetId(asset.id);
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("baumstruktur.inspectionPointsLoadError"),
          life: 6000,
        });
        setIpRows([]);
        setIpLoadedAssetId(null);
      } finally {
        setIpLoading(false);
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
        setIpRows([]);
        setDocsLoadedAssetId(null);
        setWoLoadedAssetId(null);
        setIpLoadedAssetId(null);
        setDocsSearchTerm("");
      }
      if (tab === 0) {
        if (!sameAsset || docsLoadedAssetId !== asset.id) void loadDocuments(asset);
      } else if (tab === 1) {
        if (!sameAsset || woLoadedAssetId !== asset.id) void loadWorkOrders(asset);
      } else if (!sameAsset || ipLoadedAssetId !== asset.id) {
        void loadInspectionPoints(asset);
      }
    },
    [
      docsLoadedAssetId,
      ipLoadedAssetId,
      loadDocuments,
      loadInspectionPoints,
      loadWorkOrders,
      refsAsset?.id,
      woLoadedAssetId,
    ],
  );

  const closeRefsDrawer = useCallback(() => {
    clearPreview();
    setRefsAsset(null);
  }, [clearPreview]);

  useEffect(() => {
    if (refsAsset != null) return;
    clearPreview();
  }, [clearPreview, refsAsset]);

  useEffect(() => {
    if (refsTab === 0) return;
    clearPreview();
  }, [clearPreview, refsTab]);

  const onRefsTabChange = useCallback(
    (index: number) => {
      const tab: RefsTabIndex = index === 2 ? 2 : index === 1 ? 1 : 0;
      setRefsTab(tab);
      if (!refsAsset) return;
      if (tab === 0 && docsLoadedAssetId !== refsAsset.id) void loadDocuments(refsAsset);
      if (tab === 1 && woLoadedAssetId !== refsAsset.id) void loadWorkOrders(refsAsset);
      if (tab === 2 && ipLoadedAssetId !== refsAsset.id) void loadInspectionPoints(refsAsset);
    },
    [
      docsLoadedAssetId,
      ipLoadedAssetId,
      loadDocuments,
      loadInspectionPoints,
      loadWorkOrders,
      refsAsset,
      woLoadedAssetId,
    ],
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
      const assetLabel = [doc.assetKey, doc.assetName].filter(Boolean).join(" ").toLowerCase();
      return (
        name.includes(q) ||
        doc.fileName.toLowerCase().includes(q) ||
        (assetLabel.length > 0 && assetLabel.includes(q))
      );
    });
  }, [docsRows, docsSearchTerm]);

  const refsHasDescendantDocuments = useMemo(() => {
    if (!refsAsset) return false;
    return assetHasDescendantDocuments(assets, refsAsset.id);
  }, [assets, refsAsset]);

  const docsTabCount = useMemo(() => {
    if (!refsAsset) return 0;
    if (refsHasDescendantDocuments) return countSubtreeDocuments(assets, refsAsset.id);
    return refsAsset.documentCount;
  }, [assets, refsAsset, refsHasDescendantDocuments]);

  const ownDocsRows = useMemo(() => {
    if (!refsAsset || !refsHasDescendantDocuments) return filteredDocsRows;
    return filteredDocsRows.filter((doc) => doc.assetId === refsAsset.id);
  }, [filteredDocsRows, refsAsset, refsHasDescendantDocuments]);

  const descendantDocsRows = useMemo(() => {
    if (!refsAsset || !refsHasDescendantDocuments) return [];
    return filteredDocsRows.filter((doc) => doc.assetId !== refsAsset.id);
  }, [filteredDocsRows, refsAsset, refsHasDescendantDocuments]);

  const renderDocCard = useCallback(
    (doc: AssetDocumentRow, index: number, showAssetLabel: boolean) => {
      const ownerAssetId = doc.assetId || refsAsset?.id || "";
      const title = doc.displayName?.trim() || doc.fileName;
      const mime = doc.mimeType ?? "application/octet-stream";
      const imageDoc = isImageDocument(mime, doc.fileName);
      const assetLabel =
        doc.assetKey && doc.assetName
          ? `${doc.assetKey} - ${doc.assetName}`
          : doc.assetKey || doc.assetName || null;
      return (
        <div
          key={doc.id}
          role="button"
          tabIndex={0}
          className="app-card-cascade app-asset-refs-doc-card flex cursor-pointer items-center gap-2 rounded-sm border border-solid border-outline-variant px-3 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--color-on-surface)_4%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          style={{ ["--app-cascade-index" as string]: index }}
          title={imageDoc ? t("documentsUi.imagePreviewHint") : t("assets.documentsOpen")}
          onClick={() => {
            if (!ownerAssetId) return;
            void openDocumentContent(ownerAssetId, doc.id);
          }}
          onMouseEnter={(e) => {
            if (!imageDoc || !ownerAssetId) return;
            showPreview({
              cacheKey: `asset:${ownerAssetId}:${doc.id}`,
              title,
              mimeType: mime,
              fileName: doc.fileName,
              anchor: e.currentTarget.getBoundingClientRect(),
              fetchUrl: `/api/assets/${ownerAssetId}/documents/${doc.id}/content`,
            });
          }}
          onMouseLeave={() => {
            if (!imageDoc) return;
            clearPreview();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!ownerAssetId) return;
              void openDocumentContent(ownerAssetId, doc.id);
            }
          }}
        >
          <DocumentMimeIcon mimeType={mime} fileName={doc.fileName} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-on-surface" title={title}>
              {title}
            </div>
            {showAssetLabel && assetLabel ? (
              <div className="truncate text-xs text-on-surface-variant" title={assetLabel}>
                {assetLabel}
              </div>
            ) : null}
            {doc.displayName?.trim() && doc.displayName.trim() !== doc.fileName ? (
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
              <span className="min-w-0 truncate">{mime.split(";")[0]}</span>
              <span className="shrink-0 tabular-nums">{formatFileSize(doc.fileSize)}</span>
            </div>
          </div>
        </div>
      );
    },
    [clearPreview, openDocumentContent, refsAsset?.id, showPreview, t],
  );

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
      const flags = node as AnnotatedTreeNode;
      const docsAppearance = refButtonAppearance(
        asset.documentCount,
        flags.hasDescendantDocuments === true,
      );
      const woAppearance = refButtonAppearance(
        asset.workOrderCount,
        flags.hasDescendantWorkOrders === true,
      );
      const ipAppearance = refButtonAppearance(
        asset.inspectionPointCount,
        flags.hasDescendantInspectionPoints === true,
      );
      const hasDocuments = asset.documentCount > 0;
      const hasWorkOrders = asset.workOrderCount > 0;
      const hasInspectionPoints = asset.inspectionPointCount > 0;
      const docsBadge = hasDocuments ? String(asset.documentCount) : " ";
      const woBadge = hasWorkOrders ? String(asset.workOrderCount) : " ";
      const ipBadge = hasInspectionPoints ? String(asset.inspectionPointCount) : " ";
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
            className={`h-7 w-7 !rounded-[0.5rem] !p-0 ${documentsRefClass(docsAppearance)}`}
            onClick={() => openRefsDrawer(asset, 0)}
            aria-label={t("baumstruktur.referencesDocuments")}
            title={t("baumstruktur.referencesDocuments")}
          />
          <Button
            type="button"
            icon={<ClipboardList className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
            badge={woBadge}
            badgeClassName={`${refBadgeClass} ${hasWorkOrders ? "" : "app-ref-badge--placeholder"}`}
            className={`h-7 w-7 !rounded-[0.5rem] !p-0 ${workOrdersRefClass(woAppearance)}`}
            disabled={!hasWorkOrders}
            onClick={() => openRefsDrawer(asset, 1)}
            aria-label={t("baumstruktur.referencesWorkOrders")}
            title={t("baumstruktur.referencesWorkOrders")}
          />
          <Button
            type="button"
            icon={<CheckSquare className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
            badge={ipBadge}
            badgeClassName={`${refBadgeClass} ${hasInspectionPoints ? "" : "app-ref-badge--placeholder"}`}
            className={`h-7 w-7 !rounded-[0.5rem] !p-0 ${inspectionPointsRefClass(ipAppearance)}`}
            disabled={!hasInspectionPoints}
            onClick={() => openRefsDrawer(asset, 2)}
            aria-label={t("baumstruktur.referencesInspectionPoints")}
            title={t("baumstruktur.referencesInspectionPoints")}
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

  useTabInk(
    refsTabHostRef,
    [refsAsset, refsTab, docsLoading, woLoading, ipLoading],
    refsAsset != null,
  );

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button
            type="button"
            className="app-header-action-nav-item app-header-action-nav-item--icon"
            onClick={expandAll}
            title={t("baumstruktur.expandAll")}
            aria-label={t("baumstruktur.expandAll")}
          >
            <ChevronsUpDown className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </li>
        <li>
          <button
            type="button"
            className="app-header-action-nav-item app-header-action-nav-item--icon"
            onClick={collapseAll}
            title={t("baumstruktur.collapseAll")}
            aria-label={t("baumstruktur.collapseAll")}
          >
            <ChevronsDownUp className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
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
            className={`app-asset-treetable w-full${typeColorsEnabled ? " app-asset-treetable--typed" : ""}`}
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
            <div ref={refsTabHostRef} className={`${STANDARD_TAB_HOST_CLASS} flex min-h-0 flex-1 flex-col`}>
            <TabView
              activeIndex={refsTab}
              onTabChange={(e) => onRefsTabChange(e.index)}
              className={`${STANDARD_TAB_VIEW_CLASS} app-asset-refs-tabs flex min-h-0 flex-1 flex-col`}
              pt={{
                navContent: { className: "shrink-0" },
                panelContainer: { className: "min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2" },
              }}
            >
              <TabPanel
                header={
                  <AppTabHeader
                    label={t("baumstruktur.referencesDocuments")}
                    count={docsTabCount}
                  />
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
                  ) : refsHasDescendantDocuments ? (
                    docsSearchTerm.trim() &&
                    ownDocsRows.length === 0 &&
                    descendantDocsRows.length === 0 &&
                    docsRows.length > 0 ? (
                      <div className="text-sm text-on-surface-variant">
                        {t("assets.documentsSearchEmpty")}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <section className="space-y-2">
                          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-on-surface-variant underline underline-offset-2">
                            {t("baumstruktur.documentsAtThisElement")}
                          </h3>
                          {ownDocsRows.length === 0 ? (
                            <div className="text-sm text-on-surface-variant">-</div>
                          ) : (
                            <div className="grid grid-cols-1 gap-2">
                              {ownDocsRows.map((doc, index) => renderDocCard(doc, index, false))}
                            </div>
                          )}
                        </section>
                        <section className="space-y-2">
                          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-on-surface-variant underline underline-offset-2">
                            {t("baumstruktur.documentsAtDescendants")}
                          </h3>
                          {descendantDocsRows.length === 0 ? (
                            <div className="text-sm text-on-surface-variant">-</div>
                          ) : (
                            <div className="grid grid-cols-1 gap-2">
                              {descendantDocsRows.map((doc, index) =>
                                renderDocCard(doc, index, true),
                              )}
                            </div>
                          )}
                        </section>
                      </div>
                    )
                  ) : filteredDocsRows.length === 0 ? (
                    <div className="text-sm text-on-surface-variant">
                      {docsRows.length === 0
                        ? t("baumstruktur.documentsEmpty")
                        : t("assets.documentsSearchEmpty")}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {filteredDocsRows.map((doc, index) => renderDocCard(doc, index, false))}
                    </div>
                  )}
                </div>
              </TabPanel>
              <TabPanel
                header={
                  <AppTabHeader
                    label={t("baumstruktur.referencesWorkOrders")}
                    count={refsAsset.workOrderCount}
                  />
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
              <TabPanel
                header={
                  <AppTabHeader
                    label={t("baumstruktur.referencesInspectionPoints")}
                    count={refsAsset.inspectionPointCount}
                  />
                }
              >
                <div className="space-y-3">
                  {ipLoading ? (
                    <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                      <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
                      <span>{t("baumstruktur.loading")}</span>
                    </div>
                  ) : ipRows.length === 0 ? (
                    <div className="text-sm text-on-surface-variant">
                      {t("baumstruktur.inspectionPointsEmpty")}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {ipRows.map((row, index) => (
                        <div
                          key={row.id}
                          className="app-card-cascade flex flex-col gap-0.5 rounded-sm border border-solid border-outline-variant px-3 py-2"
                          style={{ ["--app-cascade-index" as string]: index }}
                        >
                          <div className="truncate text-sm font-medium text-on-surface">
                            {row.key} – {row.name}
                          </div>
                          <div className="text-xs text-on-surface-variant">
                            {t(`assets.inspectionPointTypeValues.${row.type}`, {
                              defaultValue: row.type,
                            })}
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

      {previewPortal}
    </div>
  );
}
