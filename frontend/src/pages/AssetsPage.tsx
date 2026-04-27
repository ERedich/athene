import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";
import { Toast } from "primereact/toast";
import {
  TreeTable,
  type TreeTableEvent,
  type TreeTableSelectionEvent,
  type TreeTableToggleEvent,
} from "primereact/treetable";
import type { TreeNode } from "primereact/treenode";

import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import {
  APP_PARAM_KEY_ALLOW_SITE_CHANGE,
  APP_PARAM_KEY_COLORIZE_ASSET_TREE_ROWS,
} from "../lib/appParameterKeys";
import {
  ASSET_DOCUMENT_CATEGORY_ORDER,
  type AssetDocumentCategory,
  documentCategoryBadgeClass,
  isAssetDocumentCategory,
} from "../constants/assetDocumentCategory";
import {
  DEFAULT_ASSET_TYPE_DISPLAY_CONFIG,
  type AssetTypeDisplayConfig,
} from "../lib/assetTypeDisplay";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";
import {
  useTableContextMenu,
  useTreeTableContextMenu,
} from "../lib/useTableContextMenu";

type AssetType = "site" | "structure" | "line" | "maintenanceObject";

function isAssetTypeValue(v: unknown): v is AssetType {
  return (
    v === "site" ||
    v === "structure" ||
    v === "line" ||
    v === "maintenanceObject"
  );
}

/** PrimeIcons glyph per asset type (industrial hierarchy metaphor). */
function assetTypePrimeIconClass(type: AssetType): string {
  switch (type) {
    case "site":
      return "pi pi-map-marker";
    case "structure":
      return "pi pi-sitemap";
    case "line":
      return "pi pi-arrows-h";
    case "maintenanceObject":
      return "pi pi-wrench";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function assetTypeIconClassNames(type: AssetType): string {
  return `${assetTypePrimeIconClass(type)} app-asset-type-icon app-asset-type-icon--${type}`;
}

function assetTypeDisplayLabel(
  type: AssetType,
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
  type: AssetType,
  cfg: AssetTypeDisplayConfig | null,
): CSSProperties | undefined {
  const hex = cfg?.[type]?.colorHex?.trim();
  if (!hex) return undefined;
  return { color: hex };
}

function resolveAssetTypeDropdownValue(incoming: unknown): AssetType | null {
  if (incoming == null) return null;
  if (isAssetTypeValue(incoming)) return incoming;
  if (
    typeof incoming === "object" &&
    incoming !== null &&
    "value" in incoming
  ) {
    const v = (incoming as { value: unknown }).value;
    if (isAssetTypeValue(v)) return v;
  }
  return null;
}

type SiteOption = {
  id: string;
  key: string;
  name: string;
  colorHex: string;
};

type SiteDropdownOption = { label: string; value: string };

type Asset = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  type: AssetType;
  parentAssetId: string | null;
  parentAssetKey: string | null;
  parentAssetName: string | null;
  parentAssetType: AssetType | null;
  serialNumber: string | null;
  buildDate: string | null;
  manufacturer: string | null;
  remark: string | null;
  costCenterId: string | null;
  costCenterKey: string | null;
  costCenterName: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
};

const ASSETS_TREE_TABLE_STATE_STORAGE_KEY = "athene-assets-tree-table";
const ASSETS_TABLE_VIRTUAL_ROW_PX = 38;
const ASSETS_TREE_ROW_ANIMATION_MS = 240;

/**
 * PrimeReact TreeTable._restoreState has a bug: when a persisted state contains
 * `expandedKeysState` and `onToggle` is set, it calls `props.onRowToggle(...)`,
 * which is not declared on the component (-> runtime TypeError, or DOM warning if
 * the prop is passed in). Tree expansion is owned by our own React state anyway,
 * so we plug into `stateStorage="custom"` and strip `expandedKeysState` from the
 * restored payload to avoid that codepath entirely.
 */
function readAssetsTreeTableStoredState(): Record<string, unknown> | undefined {
  try {
    const raw = localStorage.getItem(ASSETS_TREE_TABLE_STATE_STORAGE_KEY);
    if (!raw) return undefined;
    const isoDate = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
    const parsed = JSON.parse(raw, (_k, v) =>
      typeof v === "string" && isoDate.test(v) ? new Date(v) : v,
    ) as Record<string, unknown>;
    delete parsed.expandedKeysState;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeAssetsTreeTableState(state: object): void {
  try {
    localStorage.setItem(
      ASSETS_TREE_TABLE_STATE_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    /* ignore */
  }
}

function supportsAssetsTableVirtualScroller(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const firefox = /firefox\//i.test(ua) || /fxios/i.test(ua);
  const chromium =
    /chrome\//i.test(ua) ||
    /crios/i.test(ua) ||
    /edg\//i.test(ua) ||
    /opr\//i.test(ua);
  return !firefox && !chromium;
}

/**
 * Build tree roots from filtered rows; parents outside the set become implicit roots.
 * Children are materialized lazily only for expanded branches to keep large trees responsive.
 */
function buildFilteredAssetTreeNodes(
  assets: Asset[],
  expandedKeys: Set<string>,
): TreeNode[] {
  const idSet = new Set(assets.map((a) => a.id));
  const byParent = new Map<string | null, Asset[]>();

  const effectiveParentId = (a: Asset): string | null => {
    if (!a.parentAssetId) return null;
    if (!idSet.has(a.parentAssetId)) return null;
    return a.parentAssetId;
  };

  for (const a of assets) {
    const p = effectiveParentId(a);
    const list = byParent.get(p) ?? [];
    list.push(a);
    byParent.set(p, list);
  }
  for (const list of byParent.values()) {
    list.sort((x, y) =>
      x.key.localeCompare(y.key, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }

  const toNodes = (parentId: string | null): TreeNode[] => {
    const rows = byParent.get(parentId) ?? [];
    return rows.map((row) => {
      const node: TreeNode = { key: row.id, data: row };
      const hasChildren = (byParent.get(row.id)?.length ?? 0) > 0;
      if (hasChildren) {
        node.leaf = false;
        if (expandedKeys.has(row.id)) {
          node.children = toNodes(row.id);
        }
      }
      return node;
    });
  };

  return toNodes(null);
}

type CostCenterListRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
};

type AssetDocument = {
  id: string;
  assetId: string;
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

type PendingDocumentUpload = DocumentUploadDraft & {
  localId: string;
  addedAt: number;
};

type FormState = {
  key: string;
  name: string;
  siteId: string;
  type: AssetType;
  parentAssetId: string;
  costCenterId: string;
  serialNumber: string;
  buildDate: string;
  manufacturer: string;
  remark: string;
};

const PENDING_AUTO_UPLOAD_MS = 5_000;
const PENDING_RING_C = 2 * Math.PI * 10;

function newPendingLocalId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `p-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function fileExtension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

/** PrimeIcons class for MIME / extension (color hints for scanability). */
function documentTypeIconClass(mimeType: string, fileName: string): string {
  const ext = fileExtension(fileName);
  const mt = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (mt.includes("pdf") || ext === "pdf") return "pi pi-file-pdf text-red-500";
  if (mt.startsWith("image/")) return "pi pi-image text-sky-500";
  if (mt.startsWith("video/")) return "pi pi-video text-violet-500";
  if (mt.startsWith("audio/")) return "pi pi-volume-up text-amber-600";
  if (mt.includes("zip") || ext === "zip" || ext === "rar" || ext === "7z")
    return "pi pi-folder-open text-amber-700";
  if (
    mt.includes("wordprocessingml") ||
    mt.includes("msword") ||
    ext === "doc" ||
    ext === "docx"
  )
    return "pi pi-file-word text-blue-600";
  if (
    mt.includes("spreadsheetml") ||
    mt.includes("ms-excel") ||
    ext === "xls" ||
    ext === "xlsx" ||
    ext === "csv"
  )
    return "pi pi-file-excel text-emerald-600";
  if (
    mt.includes("presentationml") ||
    mt.includes("powerpoint") ||
    ext === "ppt" ||
    ext === "pptx"
  )
    return "pi pi-file text-orange-600";
  if (
    mt.startsWith("text/") ||
    ext === "txt" ||
    ext === "md" ||
    ext === "json" ||
    ext === "xml"
  )
    return "pi pi-file-edit text-slate-500";
  return "pi pi-file text-on-surface-variant";
}

function documentSearchHaystack(
  displayName: string,
  fileName: string,
  mimeType: string,
  categoryLabel: string,
  auditHaystack = "",
): string {
  const ext = fileExtension(displayName) || fileExtension(fileName);
  const mt = mimeType.toLowerCase();
  const main = mt.split(";")[0]?.trim() ?? "";
  const [maj, min] = main.split("/");
  const base = [
    displayName,
    fileName,
    categoryLabel,
    mimeType,
    ext,
    maj ?? "",
    min ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return auditHaystack ? `${base} ${auditHaystack.toLowerCase()}`.trim() : base;
}

/** ISO + lokalisierte Datums-/Zeitstrings für Suche (Uploader, Änderungen). */
function documentAuditSearchHaystack(
  createdAt: string,
  updatedAt: string,
  createdBy: string,
  updatedBy: string,
  locale: string,
): string {
  const parts: string[] = [createdBy, updatedBy, createdAt, updatedAt];
  for (const iso of [createdAt, updatedAt]) {
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      parts.push(iso);
      continue;
    }
    parts.push(d.toISOString());
    try {
      parts.push(
        new Intl.DateTimeFormat(locale, {
          dateStyle: "short",
          timeStyle: "short",
        }).format(d),
      );
      parts.push(
        new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d),
      );
    } catch {
      /* ignore */
    }
  }
  return parts.join(" ");
}

type DocumentCategoryDropdownResolved =
  | { kind: "empty" }
  | { kind: "ok"; category: AssetDocumentCategory; labelOverride?: string };

/** PrimeReact `valueTemplate` may pass the full `{ value, label }` option or a string. */
function resolveDocumentCategoryDropdownIncoming(
  incoming: unknown,
): DocumentCategoryDropdownResolved {
  if (incoming == null) return { kind: "empty" };
  if (
    typeof incoming === "object" &&
    incoming !== null &&
    "value" in incoming
  ) {
    const o = incoming as { value: unknown; label?: unknown };
    if (typeof o.value !== "string") return { kind: "empty" };
    const category = isAssetDocumentCategory(o.value) ? o.value : "general";
    const labelOverride = typeof o.label === "string" ? o.label : undefined;
    return { kind: "ok", category, labelOverride };
  }
  if (typeof incoming === "string") {
    const category = isAssetDocumentCategory(incoming) ? incoming : "general";
    return { kind: "ok", category };
  }
  return { kind: "empty" };
}

type PendingAutoUploadOpenSlotProps = {
  /** Bumps on an interval so the ring re-renders. */
  tick: number;
  addedAt: number;
  busy: boolean;
  ariaLabelIdle: string;
  ariaLabelBusy: string;
};

/** Same grid slot as the “open document” icon button: reverse ring while waiting, spinner while uploading. */
function PendingAutoUploadOpenSlot({
  tick,
  addedAt,
  busy,
  ariaLabelIdle,
  ariaLabelBusy,
}: PendingAutoUploadOpenSlotProps) {
  void tick;
  if (busy) {
    return (
      <Button
        type="button"
        text
        disabled
        tabIndex={-1}
        className="pointer-events-none shrink-0 !h-9 !min-h-9 !w-9 !min-w-9 !p-0 opacity-100"
        icon="pi pi-spin pi-spinner"
        aria-label={ariaLabelBusy}
        title={ariaLabelBusy}
      />
    );
  }
  const elapsed = Date.now() - addedAt;
  const remainingRatio = Math.max(
    0,
    Math.min(1, 1 - elapsed / PENDING_AUTO_UPLOAD_MS),
  );
  const dash = PENDING_RING_C * remainingRatio;
  return (
    <Button
      type="button"
      text
      disabled
      tabIndex={-1}
      className="pointer-events-none shrink-0 !h-9 !min-h-9 !w-9 !min-w-9 !p-0 opacity-100"
      aria-label={ariaLabelIdle}
      title={ariaLabelIdle}
    >
      <svg
        className="h-[1.125rem] w-[1.125rem] shrink-0 -rotate-90 text-primary"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          className="text-outline-variant"
          stroke="currentColor"
          strokeWidth="2"
          opacity={0.25}
        />
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${PENDING_RING_C}`}
        />
      </svg>
    </Button>
  );
}

const emptyForm = (): FormState => ({
  key: "",
  name: "",
  siteId: "",
  type: "site",
  parentAssetId: "",
  costCenterId: "",
  serialNumber: "",
  buildDate: "",
  manufacturer: "",
  remark: "",
});

const actionNavItem =
  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-on-surface-variant transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const createActionNavItem = `${actionNavItem} hover:bg-green-500/10 hover:text-green-500`;
const primaryActionNavItem = `${actionNavItem} hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)]`;
const deleteActionNavItem = `${actionNavItem} hover:bg-red-500/10`;
const createActionIcon = "text-green-500/70";
const primaryActionIcon =
  "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
const deleteActionIcon = "text-red-500";

const allowedParentTypes: Record<AssetType, AssetType[]> = {
  site: ["site"],
  structure: ["site", "structure"],
  line: ["site", "structure", "line"],
  maintenanceObject: ["site", "structure", "line", "maintenanceObject"],
};

const assetDialogTabs = {
  General: 0,
  Documents: 1,
} as const;

function collectDescendantIds(
  parentId: string,
  assets: Asset[],
  expandedSet: Set<string>,
): string[] {
  const byParent = new Map<string, Asset[]>();
  for (const row of assets) {
    if (!row.parentAssetId) continue;
    const siblings = byParent.get(row.parentAssetId) ?? [];
    siblings.push(row);
    byParent.set(row.parentAssetId, siblings);
  }

  const descendants: string[] = [];
  const stack = [...(byParent.get(parentId) ?? [])];
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current) continue;
    descendants.push(current.id);
    if (expandedSet.has(current.id)) {
      const children = byParent.get(current.id) ?? [];
      stack.unshift(...children);
    }
  }
  return descendants;
}

type AssetDialogTab = (typeof assetDialogTabs)[keyof typeof assetDialogTabs];
type AssetsPageProps = { mode?: "table" | "tree" };
type HeaderActionsProps = {
  t: (key: string) => string;
  selectedAsset: Asset | null;
  onCreate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  searchTermInput: string;
  onSearchTermInputChange: (value: string) => void;
};

function AssetsHeaderActions({
  t,
  selectedAsset,
  onCreate,
  onEdit,
  onDelete,
  searchTermInput,
  onSearchTermInputChange,
}: HeaderActionsProps) {
  return (
    <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
      <li>
        <button
          type="button"
          className={createActionNavItem}
          onClick={onCreate}
        >
          <i className={`pi pi-plus ${createActionIcon}`} aria-hidden />
          <span>{t("assets.new")}</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          className={primaryActionNavItem}
          disabled={!selectedAsset}
          onClick={onEdit}
        >
          <i className={`pi pi-pencil ${primaryActionIcon}`} aria-hidden />
          <span>{t("assets.edit")}</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          className={deleteActionNavItem}
          disabled={!selectedAsset}
          onClick={onDelete}
        >
          <i className={`pi pi-trash ${deleteActionIcon}`} aria-hidden />
          <span>{t("assets.delete")}</span>
        </button>
      </li>
      <li
        aria-hidden
        className="mx-1 h-6 w-px shrink-0 bg-[color-mix(in_srgb,var(--color-on-surface)_20%,transparent)]"
      />
      <li className="ml-auto">
        <IconField iconPosition="left">
          <InputIcon className="pi pi-search text-xs text-on-surface-variant" />
          <InputText
            value={searchTermInput}
            onChange={(e) => onSearchTermInputChange(e.target.value)}
            placeholder={t("assets.searchPlaceholder")}
            className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
          />
        </IconField>
      </li>
    </ul>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function parseDateOnly(value: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

function formatDateOnly(value: Date | null): string {
  if (!value) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function AssetsPage({ mode = "table" }: AssetsPageProps) {
  const { t, i18n } = useTranslation();
  const { user, appParameterBooleans, appParameterAssetTypes } = useAuth();
  const langDe = i18n.language?.toLowerCase().startsWith("de");
  const calendarDateFormat = langDe ? "dd.mm.yy" : "mm/dd/yy";
  const siteFieldLocked =
    !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const colorizeTreeRows = Boolean(
    appParameterBooleans[APP_PARAM_KEY_COLORIZE_ASSET_TREE_ROWS],
  );
  const { setHeaderActions, setHeaderRowCount } =
    useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  /** Until `assets` is loaded, Prime state restore may fire `onSelectionChange` with an id we cannot resolve yet. */
  const [pendingTreeSelectionId, setPendingTreeSelectionId] = useState<
    string | null
  >(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState<AssetDialogTab>(
    assetDialogTabs.General,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTermInput, setSearchTermInput] = useState("");
  const [documents, setDocuments] = useState<AssetDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingDocumentUpload[]>([]);
  const [uploadMetaVisible, setUploadMetaVisible] = useState(false);
  const [uploadDrafts, setUploadDrafts] = useState<DocumentUploadDraft[]>([]);
  const [documentsSearchTerm, setDocumentsSearchTerm] = useState("");
  const [pendingUiTick, setPendingUiTick] = useState(0);
  const [pendingRowUploading, setPendingRowUploading] = useState<
    Record<string, boolean>
  >({});
  const [documentEdit, setDocumentEdit] = useState<AssetDocument | null>(null);
  const [documentEditDisplayName, setDocumentEditDisplayName] = useState("");
  const [documentEditCategory, setDocumentEditCategory] =
    useState<AssetDocumentCategory>("general");
  const [documentEditSaving, setDocumentEditSaving] = useState(false);
  const [treeExpandedKeys, setTreeExpandedKeys] = useState<
    Record<string, boolean>
  >({});
  const [treeAnimatedExpandingKeys, setTreeAnimatedExpandingKeys] = useState<
    Record<string, boolean>
  >({});
  const [treeAnimatedEnteringRows, setTreeAnimatedEnteringRows] = useState<
    Record<string, boolean>
  >({});
  const [assetsGridScrollHeight, setAssetsGridScrollHeight] = useState("60vh");
  const assetsGridHostRef = useRef<HTMLDivElement | null>(null);
  const treePendingCollapseKeysRef = useRef<Record<string, boolean>>({});
  const treeCollapseTimersRef = useRef(new Map<string, number>());
  const treeEnterTimersRef = useRef(new Map<string, number>());
  const treeMode = mode === "tree";
  const debouncedSearchTerm = useDebouncedValue(searchTermInput, 180);

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "short",
      }),
    [i18n.language],
  );

  const assetsTableVirtualScrollerOptions = useMemo(
    () =>
      supportsAssetsTableVirtualScroller()
        ? { itemSize: ASSETS_TABLE_VIRTUAL_ROW_PX, showLoader: true }
        : undefined,
    [],
  );
  const treeTypeColors =
    appParameterAssetTypes ?? DEFAULT_ASSET_TYPE_DISPLAY_CONFIG;
  const treeTableStyle = useMemo<CSSProperties | undefined>(() => {
    if (!colorizeTreeRows) return undefined;
    return {
      ["--app-asset-type-row-site" as string]: treeTypeColors.site.colorHex,
      ["--app-asset-type-row-structure" as string]:
        treeTypeColors.structure.colorHex,
      ["--app-asset-type-row-line" as string]: treeTypeColors.line.colorHex,
      ["--app-asset-type-row-maintenance-object" as string]:
        treeTypeColors.maintenanceObject.colorHex,
    };
  }, [
    colorizeTreeRows,
    treeTypeColors.line.colorHex,
    treeTypeColors.maintenanceObject.colorHex,
    treeTypeColors.site.colorHex,
    treeTypeColors.structure.colorHex,
  ]);

  const editingIdRef = useRef<string | null>(null);
  const formRef = useRef(form);
  const pendingFilesRef = useRef(pendingFiles);
  const pendingAutoTimersRef = useRef(new Map<string, number>());
  const assetCreateLockRef = useRef<Promise<string | null> | null>(null);
  const runAutoUploadForPendingRef = useRef<
    (doc: PendingDocumentUpload) => Promise<void>
  >(async () => {});

  const clearPendingAutoTimer = useCallback((localId: string) => {
    const existing = pendingAutoTimersRef.current.get(localId);
    if (existing) window.clearTimeout(existing);
    pendingAutoTimersRef.current.delete(localId);
  }, []);

  const clearAllPendingAutoTimers = useCallback(() => {
    for (const timer of pendingAutoTimersRef.current.values())
      window.clearTimeout(timer);
    pendingAutoTimersRef.current.clear();
  }, []);

  const clearTreeCollapseTimer = useCallback((key: string) => {
    const timer = treeCollapseTimersRef.current.get(key);
    if (timer) {
      window.clearTimeout(timer);
      treeCollapseTimersRef.current.delete(key);
    }
  }, []);

  const clearAllTreeCollapseTimers = useCallback(() => {
    for (const timer of treeCollapseTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    treeCollapseTimersRef.current.clear();
  }, []);

  const clearTreeEnterTimer = useCallback((key: string) => {
    const timer = treeEnterTimersRef.current.get(key);
    if (timer) {
      window.clearTimeout(timer);
      treeEnterTimersRef.current.delete(key);
    }
  }, []);

  const clearAllTreeEnterTimers = useCallback(() => {
    for (const timer of treeEnterTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    treeEnterTimersRef.current.clear();
  }, []);

  const scheduleTreeEnterAnimationRows = useCallback(
    (rowIds: string[]) => {
      if (rowIds.length === 0) return;
      setTreeAnimatedEnteringRows((current) => {
        const next = { ...current };
        for (const id of rowIds) {
          next[id] = true;
          clearTreeEnterTimer(id);
          const timer = window.setTimeout(() => {
            treeEnterTimersRef.current.delete(id);
            setTreeAnimatedEnteringRows((rows) => {
              if (!(id in rows)) return rows;
              const updated = { ...rows };
              delete updated[id];
              return updated;
            });
          }, ASSETS_TREE_ROW_ANIMATION_MS);
          treeEnterTimersRef.current.set(id, timer);
        }
        return next;
      });
    },
    [clearTreeEnterTimer],
  );

  const updateTreeExpansionWithAnimation = useCallback(
    (nextExpandedKeys: Record<string, boolean>) => {
      const activeNext: Record<string, boolean> = {};
      for (const [key, enabled] of Object.entries(nextExpandedKeys)) {
        if (enabled) activeNext[key] = true;
      }

      setTreeExpandedKeys(activeNext);
      setTreeAnimatedExpandingKeys(activeNext);

      const currentExpanded = new Set(
        Object.entries(treeExpandedKeys)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([key]) => key),
      );
      const nextExpanded = new Set(Object.keys(activeNext));
      const collapsedKeys = [...currentExpanded].filter(
        (key) => !nextExpanded.has(key),
      );
      const expandedKeysAdded = [...nextExpanded].filter(
        (key) => !currentExpanded.has(key),
      );

      if (expandedKeysAdded.length > 0) {
        const rowsToAnimate = new Set<string>();
        for (const key of expandedKeysAdded) {
          const directChildren = assets
            .filter((row) => row.parentAssetId === key)
            .map((row) => row.id);
          for (const id of directChildren) rowsToAnimate.add(id);
          const expandedBeforeSet = new Set(
            Object.keys(activeNext).filter((id) => id !== key),
          );
          for (const id of collectDescendantIds(
            key,
            assets,
            expandedBeforeSet,
          )) {
            rowsToAnimate.add(id);
          }
        }
        scheduleTreeEnterAnimationRows([...rowsToAnimate]);
      }

      const pendingCollapse = treePendingCollapseKeysRef.current;
      for (const key of Object.keys(pendingCollapse)) {
        if (!collapsedKeys.includes(key)) {
          delete pendingCollapse[key];
          clearTreeCollapseTimer(key);
        }
      }

      for (const key of collapsedKeys) {
        pendingCollapse[key] = true;
        clearTreeCollapseTimer(key);
        const timer = window.setTimeout(() => {
          delete treePendingCollapseKeysRef.current[key];
          treeCollapseTimersRef.current.delete(key);
          setTreeAnimatedExpandingKeys((current) => {
            if (!(key in current)) return current;
            const next = { ...current };
            delete next[key];
            return next;
          });
        }, ASSETS_TREE_ROW_ANIMATION_MS);
        treeCollapseTimersRef.current.set(key, timer);
      }

      if (collapsedKeys.length === 0) {
        setTreeAnimatedExpandingKeys(activeNext);
      }
    },
    [
      assets,
      clearTreeCollapseTimer,
      scheduleTreeEnterAnimationRows,
      treeExpandedKeys,
    ],
  );

  const formatShortDt = useCallback(
    (iso: string) => {
      try {
        return dateTimeFormatter.format(new Date(iso));
      } catch {
        return iso;
      }
    },
    [dateTimeFormatter],
  );

  const typeOptions = useMemo(
    () =>
      (["site", "structure", "line", "maintenanceObject"] as AssetType[]).map(
        (type) => ({
          label: assetTypeDisplayLabel(type, appParameterAssetTypes, langDe, t),
          value: type,
        }),
      ),
    [appParameterAssetTypes, langDe, t],
  );

  const renderAssetTypeDropdownOption = useCallback(
    (option: { value: AssetType; label: string }) => (
      <span className="flex min-w-0 items-center gap-2">
        <i
          className={assetTypeIconClassNames(option.value)}
          style={assetTypeIconColorStyle(option.value, appParameterAssetTypes)}
          aria-hidden
        />
        <span className="truncate">{option.label}</span>
      </span>
    ),
    [appParameterAssetTypes],
  );

  const renderAssetTypeDropdownValue = useCallback(
    (incoming: unknown) => {
      const type = resolveAssetTypeDropdownValue(incoming);
      if (!type) {
        return (
          <span className="text-on-surface-variant">{t("assets.type")}</span>
        );
      }
      return (
        <span className="flex min-w-0 items-center gap-2">
          <i
            className={assetTypeIconClassNames(type)}
            style={assetTypeIconColorStyle(type, appParameterAssetTypes)}
            aria-hidden
          />
          <span className="truncate">
            {assetTypeDisplayLabel(type, appParameterAssetTypes, langDe, t)}
          </span>
        </span>
      );
    },
    [appParameterAssetTypes, langDe, t],
  );

  const typeColumnBody = useCallback(
    (row: Asset) => (
      <span className="flex min-w-0 items-center gap-2">
        <i
          className={assetTypeIconClassNames(row.type)}
          style={assetTypeIconColorStyle(row.type, appParameterAssetTypes)}
          aria-hidden
        />
        <span className="truncate">
          {assetTypeDisplayLabel(row.type, appParameterAssetTypes, langDe, t)}
        </span>
      </span>
    ),
    [appParameterAssetTypes, langDe, t],
  );

  const siteDropdownOptions = useMemo<SiteDropdownOption[]>(
    () =>
      sites.map((site) => ({
        label: `${site.key} - ${site.name}`,
        value: site.id,
      })),
    [sites],
  );

  const renderSiteDropdownOption = useCallback(
    (option: SiteDropdownOption) => {
      const site = sites.find((s) => s.id === option.value);
      const hex = site?.colorHex || DEFAULT_SITE_COLOR_HEX;
      return (
        <span
          className="truncate"
          style={{ color: readableSiteColor(hex) }}
          title={`${option.label} (${hex})`}
        >
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
          : incoming &&
              typeof incoming === "object" &&
              incoming !== null &&
              "value" in incoming
            ? String((incoming as { value: unknown }).value ?? "")
            : "";
      const site = sites.find((s) => s.id === id);
      if (!site) {
        return (
          <span className="text-on-surface-variant">
            {t("assets.sitePlaceholder")}
          </span>
        );
      }
      const hex = site.colorHex || DEFAULT_SITE_COLOR_HEX;
      const label = `${site.key} - ${site.name}`;
      return (
        <span
          className="truncate"
          style={{ color: readableSiteColor(hex) }}
          title={`${label} (${hex})`}
        >
          {label}
        </span>
      );
    },
    [sites, t],
  );

  const siteColumnBody = useCallback((row: Asset) => {
    const hex = row.siteColorHex || DEFAULT_SITE_COLOR_HEX;
    const label = `${row.siteKey} - ${row.siteName}`;
    return (
      <span
        className="truncate"
        style={{ color: readableSiteColor(hex) }}
        title={`${label} (${hex})`}
      >
        {row.siteName}
      </span>
    );
  }, []);

  const documentCategoryOptions = useMemo(
    () =>
      ASSET_DOCUMENT_CATEGORY_ORDER.map((value) => ({
        value,
        label: t(`assets.documentCategories.${value}`),
      })).sort((a, b) => a.label.localeCompare(b.label, i18n.language)),
    [i18n.language, t],
  );

  const renderDocumentCategoryDropdownOption = useCallback(
    (option: { value: AssetDocumentCategory; label: string }) => (
      <span
        className={`inline-block max-w-full truncate rounded-sm px-1.5 py-0.5 text-sm font-medium leading-tight ${documentCategoryBadgeClass(option.value)}`}
      >
        {option.label}
      </span>
    ),
    [],
  );

  const renderDocumentCategoryDropdownOptionPlain = useCallback(
    (option: { value: AssetDocumentCategory; label: string }) => (
      <span className="inline-block max-w-full truncate text-sm text-on-surface">
        {option.label}
      </span>
    ),
    [],
  );

  const renderDocumentCategoryDropdownValue = useCallback(
    (incoming: unknown) => {
      const r = resolveDocumentCategoryDropdownIncoming(incoming);
      if (r.kind === "empty") {
        return (
          <span className="text-on-surface-variant">
            {t("assets.documentsCategory")}
          </span>
        );
      }
      const text =
        r.labelOverride ?? t(`assets.documentCategories.${r.category}`);
      return (
        <span
          className={`inline-block max-w-full truncate rounded-sm px-1.5 py-0.5 text-sm font-medium leading-tight ${documentCategoryBadgeClass(r.category)}`}
        >
          {text}
        </span>
      );
    },
    [t],
  );

  const renderDocumentCategoryDropdownValuePlain = useCallback(
    (incoming: unknown) => {
      const r = resolveDocumentCategoryDropdownIncoming(incoming);
      if (r.kind === "empty") {
        return (
          <span className="text-on-surface-variant">
            {t("assets.documentsCategory")}
          </span>
        );
      }
      const text =
        r.labelOverride ?? t(`assets.documentCategories.${r.category}`);
      return (
        <span className="inline-block max-w-full truncate text-sm text-on-surface">
          {text}
        </span>
      );
    },
    [t],
  );

  const filteredDocuments = useMemo(() => {
    const q = documentsSearchTerm.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((doc) => {
      const cat = t(`assets.documentCategories.${doc.category}`);
      const auditLine = t("assets.documentsUploadAudit", {
        user: doc.createdBy,
        date: formatShortDt(doc.createdAt),
      });
      const audit = `${documentAuditSearchHaystack(doc.createdAt, doc.updatedAt, doc.createdBy, doc.updatedBy, i18n.language)} ${auditLine}`;
      const hay = documentSearchHaystack(
        doc.displayName,
        doc.fileName,
        doc.mimeType,
        cat,
        audit,
      );
      return hay.includes(q);
    });
  }, [documents, documentsSearchTerm, formatShortDt, i18n.language, t]);

  const filteredPendingFiles = useMemo(() => {
    const q = documentsSearchTerm.trim().toLowerCase();
    if (!q) return pendingFiles;
    return pendingFiles.filter((doc) => {
      const cat = t(`assets.documentCategories.${doc.category}`);
      const mime = doc.file.type || "application/octet-stream";
      const hay = documentSearchHaystack(
        doc.displayName,
        doc.file.name,
        mime,
        cat,
      );
      return hay.includes(q);
    });
  }, [pendingFiles, documentsSearchTerm, t]);

  const parentOptions = useMemo(() => {
    const allowed = allowedParentTypes[form.type];
    return assets
      .filter((asset) => asset.siteId === form.siteId)
      .filter((asset) => allowed.includes(asset.type))
      .filter((asset) => asset.id !== editingId)
      .map((asset) => ({
        label: `${asset.key} - ${asset.name} (${assetTypeDisplayLabel(asset.type, appParameterAssetTypes, langDe, t)})`,
        value: asset.id,
      }));
  }, [
    appParameterAssetTypes,
    assets,
    editingId,
    form.siteId,
    form.type,
    langDe,
    t,
  ]);

  const costCenterDropdownOptions = useMemo(
    () =>
      costCenters
        .filter(
          (cc) =>
            cc.siteId === form.siteId &&
            (cc.isActive ||
              (form.costCenterId !== "" && cc.id === form.costCenterId)),
        )
        .map((cc) => ({
          label: `${cc.key} - ${cc.name}${cc.isActive ? "" : ` (${t("costCenters.inactive")})`}`,
          value: cc.id,
        })),
    [costCenters, form.costCenterId, form.siteId, t],
  );

  const assetSearchHaystacks = useMemo(
    () =>
      new Map(
        assets.map((row) => [
          row.id,
          [
            row.key,
            row.name,
            row.siteKey,
            row.siteName,
            row.siteColorHex,
            row.type,
            row.parentAssetKey ?? "",
            row.parentAssetName ?? "",
            row.costCenterKey ?? "",
            row.costCenterName ?? "",
            row.serialNumber ?? "",
            row.manufacturer ?? "",
            row.remark ?? "",
            String(row.documentCount),
            row.createdBy,
            row.updatedBy,
          ]
            .join(" ")
            .toLowerCase(),
        ]),
      ),
    [assets],
  );

  const filteredAssets = useMemo(() => {
    const q = debouncedSearchTerm.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((row) =>
      (assetSearchHaystacks.get(row.id) ?? "").includes(q),
    );
  }, [assetSearchHaystacks, assets, debouncedSearchTerm]);

  const treeMergedExpandedKeys = useMemo(
    () => ({
      ...treeExpandedKeys,
      ...treePendingCollapseKeysRef.current,
      ...treeAnimatedExpandingKeys,
    }),
    [treeAnimatedExpandingKeys, treeExpandedKeys],
  );
  const treeAnimatedExpandedKeySet = useMemo(
    () =>
      new Set(
        Object.entries(treeMergedExpandedKeys)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([key]) => key),
      ),
    [treeMergedExpandedKeys],
  );
  const assetTreeNodes = useMemo(
    () =>
      buildFilteredAssetTreeNodes(filteredAssets, treeAnimatedExpandedKeySet),
    [filteredAssets, treeAnimatedExpandedKeySet],
  );

  /** Prime `selectionMode="single"`: `selectionKeys` is the node key string or null — not `{ id: true }`. */
  const treeSelectionKey = selectedAsset?.id ?? pendingTreeSelectionId ?? null;

  const handleTreeSelectionChange = useCallback(
    (e: TreeTableSelectionEvent) => {
      const val = e.value as
        | string
        | Record<string, boolean>
        | null
        | undefined;
      if (val == null) {
        setPendingTreeSelectionId(null);
        setSelectedAsset(null);
        return;
      }
      const id =
        typeof val === "string"
          ? val
          : (Object.keys(val).find((k) => val[k] === true) ?? null);
      if (!id) {
        setPendingTreeSelectionId(null);
        setSelectedAsset(null);
        return;
      }
      const row = assets.find((a) => a.id === id);
      if (row) {
        setPendingTreeSelectionId(null);
        setSelectedAsset(row);
        return;
      }
      if (assets.length === 0) {
        setPendingTreeSelectionId(id);
        return;
      }
      setPendingTreeSelectionId(null);
      setSelectedAsset(null);
    },
    [assets],
  );

  const handleTreeRowToggle = useCallback(
    (e: TreeTableToggleEvent) => {
      updateTreeExpansionWithAnimation(
        (e.value ?? {}) as Record<string, boolean>,
      );
    },
    [updateTreeExpansionWithAnimation],
  );

  useEffect(() => {
    if (!treeMode) {
      clearAllTreeCollapseTimers();
      clearAllTreeEnterTimers();
      treePendingCollapseKeysRef.current = {};
      setTreeAnimatedExpandingKeys({});
      setTreeAnimatedEnteringRows({});
      setPendingTreeSelectionId(null);
      return;
    }
    if (!pendingTreeSelectionId || assets.length === 0) return;
    const row = assets.find((a) => a.id === pendingTreeSelectionId);
    setPendingTreeSelectionId(null);
    setSelectedAsset(row ?? null);
  }, [
    assets,
    clearAllTreeCollapseTimers,
    clearAllTreeEnterTimers,
    pendingTreeSelectionId,
    treeMode,
  ]);

  useEffect(() => {
    const existingIds = new Set(filteredAssets.map((a) => a.id));
    setTreeExpandedKeys((current) => {
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(current)) {
        if (v && existingIds.has(k)) next[k] = true;
      }
      return next;
    });

    setTreeAnimatedExpandingKeys((current) => {
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(current)) {
        if (v && existingIds.has(k)) next[k] = true;
      }
      return next;
    });

    const pendingCollapse = treePendingCollapseKeysRef.current;
    for (const key of Object.keys(pendingCollapse)) {
      if (!existingIds.has(key)) {
        delete pendingCollapse[key];
        clearTreeCollapseTimer(key);
      }
    }

    setTreeAnimatedEnteringRows((current) => {
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(current)) {
        if (v && existingIds.has(k)) next[k] = true;
      }
      return next;
    });
  }, [filteredAssets]);

  useEffect(() => {
    return () => {
      clearAllTreeCollapseTimers();
      clearAllTreeEnterTimers();
      treePendingCollapseKeysRef.current = {};
    };
  }, [clearAllTreeCollapseTimers, clearAllTreeEnterTimers]);

  const treeRowClassName = useCallback(
    (node: TreeNode): Record<string, boolean> => {
      if (!node.data) return {};
      const row = node.data as Asset;
      const classes: Record<string, boolean> = {};
      if (colorizeTreeRows) {
        classes[`app-asset-row-type-${row.type}`] = true;
      }
      if (treeAnimatedExpandingKeys[row.id]) {
        classes["app-assets-tree-row-expanding"] = true;
      }
      if (treePendingCollapseKeysRef.current[row.id]) {
        classes["app-assets-tree-row-collapsing"] = true;
      }
      if (treeAnimatedEnteringRows[row.id]) {
        classes["app-assets-tree-row-entering"] = true;
      }
      return classes;
    },
    [colorizeTreeRows, treeAnimatedEnteringRows, treeAnimatedExpandingKeys],
  );

  useLayoutEffect(() => {
    const recalcAssetsGridHeight = () => {
      const host = assetsGridHostRef.current;
      if (!host) return;
      const top = host.getBoundingClientRect().top;
      // Keep a small bottom gap so paginator/scrollbars do not touch viewport edge.
      const next = Math.max(280, Math.floor(window.innerHeight - top - 12));
      setAssetsGridScrollHeight(`${next}px`);
    };
    recalcAssetsGridHeight();
    window.addEventListener("resize", recalcAssetsGridHeight);
    return () => window.removeEventListener("resize", recalcAssetsGridHeight);
  }, [treeMode]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsRes, sitesRes, costCentersRes] = await Promise.all([
        apiFetch("/api/assets"),
        apiFetch("/api/sites"),
        apiFetch("/api/cost-centers"),
      ]);
      if (!assetsRes.ok || !sitesRes.ok || !costCentersRes.ok)
        throw new Error("load");
      const [assetsData, sitesData, costCentersData] = (await Promise.all([
        assetsRes.json(),
        sitesRes.json(),
        costCentersRes.json(),
      ])) as [Asset[], SiteOption[], CostCenterListRow[]];
      setAssets(assetsData);
      setSites(sitesData);
      setCostCenters(costCentersData);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("assets.loadError"),
        life: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreate = useCallback(() => {
    clearAllPendingAutoTimers();
    setEditingId(null);
    setForm({
      ...emptyForm(),
      ...(siteFieldLocked ? { siteId: user.workingSiteId } : {}),
    });
    setDocuments([]);
    setPendingFiles([]);
    setUploadDrafts([]);
    setUploadMetaVisible(false);
    setActiveTabIndex(assetDialogTabs.General);
    setDialogVisible(true);
  }, [clearAllPendingAutoTimers, siteFieldLocked, user.workingSiteId]);

  const openEdit = useCallback(
    (row: Asset) => {
      clearAllPendingAutoTimers();
      setEditingId(row.id);
      setForm({
        key: row.key,
        name: row.name,
        siteId: row.siteId,
        type: row.type,
        parentAssetId: row.parentAssetId ?? "",
        costCenterId: row.costCenterId ?? "",
        serialNumber: row.serialNumber ?? "",
        buildDate: row.buildDate ?? "",
        manufacturer: row.manufacturer ?? "",
        remark: row.remark ?? "",
      });
      setPendingFiles([]);
      setUploadDrafts([]);
      setUploadMetaVisible(false);
      setActiveTabIndex(assetDialogTabs.General);
      setDialogVisible(true);
    },
    [clearAllPendingAutoTimers],
  );

  const openDocuments = useCallback(
    (row: Asset) => {
      openEdit(row);
      setActiveTabIndex(assetDialogTabs.Documents);
    },
    [openEdit],
  );

  const handleAssetTabChange = useCallback((event: { index: number }) => {
    if (
      event.index === assetDialogTabs.General ||
      event.index === assetDialogTabs.Documents
    ) {
      setActiveTabIndex(event.index);
    }
  }, []);

  const tabHostRef = useRef<HTMLDivElement | null>(null);

  const updateTabInk = useCallback(() => {
    const host = tabHostRef.current;
    if (!host) return;
    const nav = host.querySelector<HTMLElement>(".p-tabview-nav");
    const active = nav?.querySelector<HTMLElement>(
      "li.p-highlight .p-tabview-nav-link",
    );
    if (!nav || !active) return;
    nav.style.setProperty("--app-ink-x", `${active.offsetLeft}px`);
    nav.style.setProperty("--app-ink-w", `${active.offsetWidth}px`);
  }, []);

  useLayoutEffect(() => {
    if (!dialogVisible) return;
    const raf = requestAnimationFrame(updateTabInk);
    return () => cancelAnimationFrame(raf);
  }, [activeTabIndex, dialogVisible, updateTabInk]);

  useEffect(() => {
    if (!dialogVisible) return;
    window.addEventListener("resize", updateTabInk);
    return () => window.removeEventListener("resize", updateTabInk);
  }, [dialogVisible, updateTabInk]);

  useEffect(() => {
    if (!form.siteId) {
      if (form.parentAssetId) setForm((cur) => ({ ...cur, parentAssetId: "" }));
      if (form.costCenterId) setForm((cur) => ({ ...cur, costCenterId: "" }));
      return;
    }
    const allowed = new Set(parentOptions.map((opt) => String(opt.value)));
    if (form.parentAssetId && !allowed.has(form.parentAssetId)) {
      setForm((cur) => ({ ...cur, parentAssetId: "" }));
    }
    const allowedCc = new Set(
      costCenterDropdownOptions.map((opt) => String(opt.value)),
    );
    if (form.costCenterId && !allowedCc.has(form.costCenterId)) {
      setForm((cur) => ({ ...cur, costCenterId: "" }));
    }
  }, [
    costCenterDropdownOptions,
    form.costCenterId,
    form.parentAssetId,
    form.siteId,
    form.type,
    parentOptions,
  ]);

  const showSaveError = async (res: Response) => {
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string };
      code = body.error;
    } catch {
      /* ignore */
    }
    let detail = t("assets.saveError");
    if (code === "duplicate_key") detail = t("assets.duplicateKey");
    if (code === "invalid_parent_type") detail = t("assets.invalidParentType");
    if (code === "invalid_parent_site") detail = t("assets.invalidParentSite");
    if (code === "invalid_parent_cycle")
      detail = t("assets.invalidParentCycle");
    if (code === "invalid_parent_self") detail = t("assets.invalidParentSelf");
    if (code === "invalid_parent_asset")
      detail = t("assets.invalidParentAsset");
    if (code === "foreign_key_violation") detail = t("assets.foreignKey");
    if (code === "invalid_cost_center") detail = t("assets.invalidCostCenter");
    toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
  };

  const loadDocuments = useCallback(
    async (assetId: string) => {
      setDocumentsLoading(true);
      try {
        const res = await apiFetch(`/api/assets/${assetId}/documents`);
        if (!res.ok) throw new Error("load_documents");
        const data = (await res.json()) as AssetDocument[];
        setDocuments(data);
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("assets.documentsLoadError"),
          life: 6000,
        });
      } finally {
        setDocumentsLoading(false);
      }
    },
    [t],
  );

  const uploadDocument = useCallback(
    async (
      assetId: string,
      document: PendingDocumentUpload,
    ): Promise<boolean> => {
      const fd = new FormData();
      fd.append("file", document.file, document.file.name);
      fd.append("displayName", document.displayName.trim());
      fd.append("category", document.category);
      const res = await apiFetch(`/api/assets/${assetId}/documents`, {
        method: "POST",
        body: fd,
      });
      return res.ok;
    },
    [],
  );

  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => {
    if (!dialogVisible || pendingFiles.length === 0) return;
    const id = window.setInterval(() => setPendingUiTick((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, [dialogVisible, pendingFiles.length]);

  const ensureAssetIdForDocumentUpload = useCallback(async (): Promise<
    string | null
  > => {
    if (editingIdRef.current) return editingIdRef.current;
    if (assetCreateLockRef.current) return assetCreateLockRef.current;
    const f = formRef.current;
    const key = f.key.trim();
    const name = f.name.trim();
    const siteId = f.siteId.trim();
    if (!key || !name || !siteId) return null;
    if (f.remark.trim().length > 2000) return null;
    const payload = {
      key,
      name,
      siteId,
      type: f.type,
      parentAssetId: f.parentAssetId.trim() || null,
      costCenterId: f.costCenterId.trim() || null,
      serialNumber: f.serialNumber.trim() || null,
      buildDate: f.buildDate.trim() || null,
      manufacturer: f.manufacturer.trim() || null,
      remark: f.remark.trim() || null,
    };
    const promise = (async (): Promise<string | null> => {
      const res = await apiFetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return null;
      const saved = (await res.json()) as Asset;
      editingIdRef.current = saved.id;
      setEditingId(saved.id);
      await loadData();
      return saved.id;
    })();
    assetCreateLockRef.current = promise;
    try {
      return await promise;
    } finally {
      assetCreateLockRef.current = null;
    }
  }, [loadData]);

  const schedulePendingAutoUpload = useCallback(
    (localId: string) => {
      clearPendingAutoTimer(localId);
      const timer = window.setTimeout(() => {
        const current = pendingFilesRef.current.find(
          (p) => p.localId === localId,
        );
        if (!current) return;
        void runAutoUploadForPendingRef.current(current);
      }, PENDING_AUTO_UPLOAD_MS);
      pendingAutoTimersRef.current.set(localId, timer);
    },
    [clearPendingAutoTimer],
  );

  const runAutoUploadForPending = useCallback(
    async (doc: PendingDocumentUpload) => {
      clearPendingAutoTimer(doc.localId);
      if (!pendingFilesRef.current.some((p) => p.localId === doc.localId))
        return;
      setPendingRowUploading((m) => ({ ...m, [doc.localId]: true }));
      const bumpAndReschedule = () => {
        setPendingFiles((p) =>
          p.map((x) =>
            x.localId === doc.localId ? { ...x, addedAt: Date.now() } : x,
          ),
        );
        schedulePendingAutoUpload(doc.localId);
      };
      try {
        const assetId = await ensureAssetIdForDocumentUpload();
        if (!assetId) {
          toastRef.current?.show({
            severity: "warn",
            summary: t("assets.documentsAutoUploadNeedsAsset"),
            life: 5000,
          });
          bumpAndReschedule();
          return;
        }
        const latest =
          pendingFilesRef.current.find((p) => p.localId === doc.localId) ?? doc;
        const ok = await uploadDocument(assetId, latest);
        if (!ok) {
          toastRef.current?.show({
            severity: "error",
            summary: t("assets.documentsUploadPartialError"),
            life: 6000,
          });
          bumpAndReschedule();
          return;
        }
        setPendingFiles((p) => p.filter((x) => x.localId !== doc.localId));
        await loadDocuments(assetId);
        await loadData();
        toastRef.current?.show({
          severity: "success",
          summary: t("assets.documentsAutoUploaded"),
          life: 2500,
        });
      } finally {
        setPendingRowUploading((m) => {
          const next = { ...m };
          delete next[doc.localId];
          return next;
        });
      }
    },
    [
      clearPendingAutoTimer,
      ensureAssetIdForDocumentUpload,
      loadData,
      loadDocuments,
      schedulePendingAutoUpload,
      t,
      uploadDocument,
    ],
  );

  runAutoUploadForPendingRef.current = runAutoUploadForPending;

  useEffect(() => {
    if (!dialogVisible || !editingId) {
      if (!dialogVisible) {
        clearAllPendingAutoTimers();
        setDocuments([]);
        setPendingFiles([]);
        setUploadDrafts([]);
        setUploadMetaVisible(false);
        setDocumentsSearchTerm("");
        setPendingRowUploading({});
        setDocumentEdit(null);
        setDocumentEditSaving(false);
      }
      return;
    }
    void loadDocuments(editingId);
  }, [clearAllPendingAutoTimers, dialogVisible, editingId, loadDocuments]);

  const save = async () => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key || !name || !siteId) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("assets.validationRequired"),
        life: 4000,
      });
      return;
    }
    if (form.remark.trim().length > 2000) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("assets.remarkTooLong"),
        life: 4000,
      });
      return;
    }
    setSaving(true);
    try {
      clearAllPendingAutoTimers();
      const payload = {
        key,
        name,
        siteId,
        type: form.type,
        parentAssetId: form.parentAssetId.trim() || null,
        costCenterId: form.costCenterId.trim() || null,
        serialNumber: form.serialNumber.trim() || null,
        buildDate: form.buildDate.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        remark: form.remark.trim() || null,
      };
      const url = editingId ? `/api/assets/${editingId}` : "/api/assets";
      const res = await apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        await showSaveError(res);
        pendingFilesRef.current.forEach((p) =>
          schedulePendingAutoUpload(p.localId),
        );
        return;
      }
      const saved = (await res.json()) as Asset;
      if (pendingFiles.length > 0) {
        setUploading(true);
        try {
          const uploads = await Promise.all(
            pendingFiles.map((document) => uploadDocument(saved.id, document)),
          );
          if (uploads.some((ok) => !ok)) {
            toastRef.current?.show({
              severity: "warn",
              summary: t("assets.documentsUploadPartialError"),
              life: 5000,
            });
          } else {
            toastRef.current?.show({
              severity: "success",
              summary: t("assets.documentsUploaded"),
              life: 3000,
            });
          }
        } finally {
          setUploading(false);
        }
      }
      setDialogVisible(false);
      setPendingFiles([]);
      await loadData();
      toastRef.current?.show({
        severity: "success",
        summary: editingId ? t("assets.saved") : t("assets.created"),
        life: 3000,
      });
    } catch {
      pendingFilesRef.current.forEach((p) =>
        schedulePendingAutoUpload(p.localId),
      );
      toastRef.current?.show({
        severity: "error",
        summary: t("assets.saveError"),
        life: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/assets/${id}`, { method: "DELETE" });
        if (res.status === 204) {
          setSelectedAsset((cur) => (cur?.id === id ? null : cur));
          await loadData();
          toastRef.current?.show({
            severity: "success",
            summary: t("assets.deleted"),
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
            ? t("assets.foreignKey")
            : t("assets.deleteError");
        toastRef.current?.show({
          severity: "error",
          summary: detail,
          life: 6000,
        });
      } catch {
        toastRef.current?.show({
          severity: "error",
          summary: t("assets.deleteError"),
          life: 6000,
        });
      }
    },
    [loadData, t],
  );

  const confirmDelete = useCallback(
    (row: Asset) => {
      confirmDialog({
        message: t("assets.confirmDelete", { name: row.name }),
        header: t("assets.confirmDeleteTitle"),
        icon: "pi pi-exclamation-triangle",
        acceptClassName: "p-button-danger",
        acceptLabel: t("assets.yes"),
        rejectLabel: t("assets.no"),
        accept: () => void deleteRow(row.id),
      });
    },
    [deleteRow, t],
  );

  const tableCtx = useTableContextMenu<Asset>({
    labels: {
      new: t("assets.new"),
      edit: t("assets.edit"),
      delete: t("assets.delete"),
    },
    handlers: {
      onCreate: openCreate,
      onEdit: openEdit,
      onDelete: confirmDelete,
    },
    selection: selectedAsset,
    setSelection: setSelectedAsset,
  });

  const treeCtx = useTreeTableContextMenu<Asset>({
    labels: {
      new: t("assets.new"),
      edit: t("assets.edit"),
      delete: t("assets.delete"),
    },
    handlers: {
      onCreate: openCreate,
      onEdit: openEdit,
      onDelete: confirmDelete,
    },
    selection: selectedAsset,
    setSelection: setSelectedAsset,
    rows: assets,
  });

  useEffect(() => {
    if (
      selectedAsset &&
      !assets.some((asset) => asset.id === selectedAsset.id)
    ) {
      setSelectedAsset(null);
    }
  }, [assets, selectedAsset]);

  useEffect(() => {
    setHeaderRowCount(filteredAssets.length);
    return () => {
      setHeaderRowCount(null);
    };
  }, [filteredAssets.length, setHeaderRowCount]);

  const headerActionsNode = useMemo(
    () => (
      <AssetsHeaderActions
        t={t}
        selectedAsset={selectedAsset}
        onCreate={openCreate}
        onEdit={() => {
          if (selectedAsset) openEdit(selectedAsset);
        }}
        onDelete={() => {
          if (selectedAsset) confirmDelete(selectedAsset);
        }}
        searchTermInput={searchTermInput}
        onSearchTermInputChange={setSearchTermInput}
      />
    ),
    [confirmDelete, openCreate, openEdit, searchTermInput, selectedAsset, t],
  );

  useEffect(() => {
    setHeaderActions(headerActionsNode);
    return () => {
      setHeaderActions(null);
    };
  }, [headerActionsNode, setHeaderActions]);

  const parentBody = (row: Asset) => {
    if (!row.parentAssetId)
      return <span className="text-on-surface-variant">—</span>;
    const typeLabel = row.parentAssetType
      ? assetTypeDisplayLabel(
          row.parentAssetType,
          appParameterAssetTypes,
          langDe,
          t,
        )
      : "—";
    const full = `${row.parentAssetKey} - ${row.parentAssetName} (${typeLabel})`;
    return (
      <span className="block min-w-0 truncate" title={full}>
        {full}
      </span>
    );
  };

  const costCenterBody = (row: Asset) => {
    if (!row.costCenterId)
      return <span className="text-on-surface-variant">—</span>;
    const full = `${row.costCenterKey} - ${row.costCenterName}`;
    return (
      <span className="block min-w-0 truncate" title={full}>
        {full}
      </span>
    );
  };

  const dateOnlyBody = (value: string | null) =>
    value ? value : <span className="text-on-surface-variant">—</span>;

  const nullableTextBody = (value: string | null) =>
    value ? value : <span className="text-on-surface-variant">—</span>;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handlePickFiles = (ev: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(ev.target.files ?? []);
    if (incoming.length === 0) return;
    setUploadDrafts(
      incoming.map((file) => ({
        file,
        displayName: file.name,
        category: "general",
      })),
    );
    setUploadMetaVisible(true);
    ev.target.value = "";
  };

  const updateUploadDraft = (
    index: number,
    patch: Partial<Pick<DocumentUploadDraft, "displayName" | "category">>,
  ) => {
    setUploadDrafts((cur) =>
      cur.map((item, i) => {
        if (i !== index) return item;
        return { ...item, ...patch };
      }),
    );
  };

  const confirmUploadDrafts = () => {
    const hasInvalidName = uploadDrafts.some(
      (draft) => !draft.displayName.trim(),
    );
    if (hasInvalidName) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("assets.documentsDisplayNameRequired"),
        life: 4000,
      });
      return;
    }
    const next: PendingDocumentUpload[] = uploadDrafts.map((draft) => ({
      localId: newPendingLocalId(),
      addedAt: Date.now(),
      file: draft.file,
      displayName: draft.displayName.trim(),
      category: draft.category,
    }));
    setPendingFiles((cur) => [...cur, ...next]);
    next.forEach((d) => schedulePendingAutoUpload(d.localId));
    setUploadMetaVisible(false);
    setUploadDrafts([]);
  };

  const cancelUploadDrafts = () => {
    setUploadMetaVisible(false);
    setUploadDrafts([]);
  };

  const removePendingFileByLocalId = (localId: string) => {
    clearPendingAutoTimer(localId);
    setPendingFiles((cur) => cur.filter((p) => p.localId !== localId));
  };

  const openDocumentContent = async (assetId: string, documentId: string) => {
    try {
      const res = await apiFetch(
        `/api/assets/${assetId}/documents/${documentId}/content`,
      );
      if (!res.ok) {
        toastRef.current?.show({
          severity: "error",
          summary: t("assets.documentsOpenError"),
          life: 6000,
        });
        return;
      }
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
      // Delay revocation so the new tab can fully load the Blob resource.
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("assets.documentsOpenError"),
        life: 6000,
      });
    }
  };

  const deleteDocument = async (assetId: string, documentId: string) => {
    const res = await apiFetch(
      `/api/assets/${assetId}/documents/${documentId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      toastRef.current?.show({
        severity: "error",
        summary: t("assets.documentsDeleteError"),
        life: 6000,
      });
      return;
    }
    setDocumentEdit((cur) => (cur?.id === documentId ? null : cur));
    await Promise.all([loadDocuments(assetId), loadData()]);
    toastRef.current?.show({
      severity: "success",
      summary: t("assets.documentsDeleted"),
      life: 3000,
    });
  };

  const saveDocumentEdit = useCallback(async () => {
    if (!documentEdit || !editingId) return;
    const name = documentEditDisplayName.trim();
    if (!name) {
      toastRef.current?.show({
        severity: "warn",
        summary: t("assets.documentsDisplayNameRequired"),
        life: 4000,
      });
      return;
    }
    setDocumentEditSaving(true);
    try {
      const res = await apiFetch(
        `/api/assets/${editingId}/documents/${documentEdit.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: name,
            category: documentEditCategory,
          }),
        },
      );
      if (!res.ok) {
        let detail = t("assets.documentsUpdateError");
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error === "invalid_document_category")
            detail = t("assets.invalidDocumentCategory");
          if (body.error === "invalid_display_name")
            detail = t("assets.documentsDisplayNameRequired");
        } catch {
          /* ignore */
        }
        toastRef.current?.show({
          severity: "error",
          summary: detail,
          life: 6000,
        });
        return;
      }
      setDocumentEdit(null);
      await loadDocuments(editingId);
      await loadData();
      toastRef.current?.show({
        severity: "success",
        summary: t("assets.documentsUpdated"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("assets.documentsUpdateError"),
        life: 6000,
      });
    } finally {
      setDocumentEditSaving(false);
    }
  }, [
    documentEdit,
    documentEditCategory,
    documentEditDisplayName,
    editingId,
    loadData,
    loadDocuments,
    t,
  ]);

  const referencesBody = (row: Asset) => {
    const hasDocuments = row.documentCount > 0;
    const badgeValue = hasDocuments ? String(row.documentCount) : " ";
    const badgeClassName = `!bg-slate-900 !text-white !shadow-none !min-w-[1.1rem] !h-4 !text-[10px] !leading-4 !p-0 ${
      hasDocuments ? "" : "app-ref-badge--placeholder"
    }`;
    return (
      <div className="flex items-center">
        <Button
          type="button"
          icon="pi pi-file"
          badge={badgeValue}
          badgeClassName={badgeClassName}
          className={`h-7 w-7 !rounded-[0.5rem] !p-0 ${
            hasDocuments
              ? "app-ref-button--documents"
              : "app-ref-button--documents-inactive"
          }`}
          disabled={!hasDocuments}
          onClick={() => openDocuments(row)}
          aria-label={t("assets.references")}
          title={t("assets.references")}
        />
      </div>
    );
  };

  const dialogFooter = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={t("assets.cancel")}
        severity="secondary"
        outlined
        disabled={saving || uploading}
        onClick={() => setDialogVisible(false)}
      />
      <Button
        type="button"
        label={t("assets.save")}
        icon="pi pi-check"
        loading={saving || uploading}
        disabled={uploading}
        onClick={() => void save()}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />
      {!treeMode ? tableCtx.ContextMenuEl : null}
      {treeMode ? treeCtx.ContextMenuEl : null}

      <div
        ref={assetsGridHostRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {!treeMode ? (
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            {...tableCtx.wrapperProps}
          >
            <DataTable
              className="app-data-table flex min-h-0 min-w-0 w-full flex-1"
              value={filteredAssets}
              loading={loading}
              dataKey="id"
              selection={selectedAsset}
              onSelectionChange={(e) =>
                setSelectedAsset(e.value as Asset | null)
              }
              onRowDoubleClick={(e) => openEdit(e.data as Asset)}
              {...tableCtx.tableProps}
              selectionMode="single"
              metaKeySelection={false}
              stripedRows
              showGridlines
              scrollable
              resizableColumns
              columnResizeMode="expand"
              scrollHeight={assetsGridScrollHeight}
              virtualScrollerOptions={assetsTableVirtualScrollerOptions}
              tableStyle={{ minWidth: "118rem" }}
              stateStorage="local"
              stateKey="athene-assets-table"
              emptyMessage={t("assets.empty")}
            >
              <Column
                field="key"
                header={t("assets.key")}
                sortable
                className="min-w-28"
              />
              <Column
                field="name"
                header={t("assets.name")}
                sortable
                className="min-w-56"
              />
              <Column
                field="type"
                header={t("assets.type")}
                sortable
                body={typeColumnBody}
                className="min-w-36"
              />
              <Column
                field="siteName"
                header={t("assets.site")}
                sortable
                body={siteColumnBody}
                className="min-w-44"
              />
              <Column
                field="costCenterName"
                header={t("assets.costCenter")}
                sortable
                body={costCenterBody}
                className="min-w-48"
              />
              <Column
                field="parentAssetName"
                sortField="parentAssetName"
                header={t("assets.parentAsset")}
                body={parentBody}
                sortable
                className="min-w-72"
              />
              <Column
                field="serialNumber"
                header={t("assets.serialNumber")}
                body={(row: Asset) => nullableTextBody(row.serialNumber)}
                sortable
                className="min-w-40"
              />
              <Column
                field="buildDate"
                header={t("assets.buildDate")}
                body={(row: Asset) => dateOnlyBody(row.buildDate)}
                sortable
                className="min-w-28"
              />
              <Column
                field="manufacturer"
                header={t("assets.manufacturer")}
                body={(row: Asset) => nullableTextBody(row.manufacturer)}
                sortable
                className="min-w-56"
              />
              <Column
                field="documentCount"
                header={t("assets.references")}
                body={referencesBody}
                sortable
                style={{ width: "8rem", minWidth: "8rem", maxWidth: "8rem" }}
              />
              <Column
                field="createdAt"
                header={t("assets.createdAt")}
                body={(row: Asset) => formatShortDt(row.createdAt)}
                sortable
                className="min-w-44 whitespace-nowrap text-on-surface-variant"
              />
              <Column
                field="createdBy"
                header={t("assets.createdBy")}
                sortable
                className="min-w-36 text-on-surface-variant"
              />
              <Column
                field="updatedAt"
                header={t("assets.updatedAt")}
                body={(row: Asset) => formatShortDt(row.updatedAt)}
                sortable
                className="min-w-44 whitespace-nowrap text-on-surface-variant"
              />
              <Column
                field="updatedBy"
                header={t("assets.updatedBy")}
                sortable
                className="min-w-36 text-on-surface-variant"
              />
            </DataTable>
          </div>
        ) : (
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            {...treeCtx.wrapperProps}
          >
            <TreeTable
              className={`app-data-table app-assets-treetable flex min-h-0 min-w-0 w-full flex-1 ${
                colorizeTreeRows ? "app-assets-treetable--type-colored" : ""
              }`}
              value={assetTreeNodes}
              loading={loading}
              selectionMode="single"
              selectionKeys={treeSelectionKey}
              onSelectionChange={handleTreeSelectionChange}
              {...treeCtx.treeTableProps}
              expandedKeys={treeExpandedKeys}
              onToggle={handleTreeRowToggle}
              rowClassName={treeRowClassName}
              onRowClick={(e: TreeTableEvent) => {
                const oe = e.originalEvent as MouseEvent<HTMLElement>;
                if (oe.detail === 2) {
                  const row = e.node?.data as Asset | undefined;
                  if (row) openEdit(row);
                }
              }}
              metaKeySelection={false}
              stripedRows
              showGridlines
              scrollable
              resizableColumns
              columnResizeMode="expand"
              scrollHeight={assetsGridScrollHeight}
              tableStyle={{ minWidth: "118rem" }}
              style={treeTableStyle}
              stateStorage="custom"
              stateKey={ASSETS_TREE_TABLE_STATE_STORAGE_KEY}
              customRestoreState={readAssetsTreeTableStoredState}
              customSaveState={writeAssetsTreeTableState}
              emptyMessage={t("assets.empty")}
            >
              <Column
                field="key"
                header={t("assets.key")}
                expander
                sortable
                className="min-w-28"
              />
              <Column
                field="name"
                header={t("assets.name")}
                sortable
                className="min-w-56"
              />
              <Column
                field="type"
                header={t("assets.type")}
                sortable
                className="min-w-36"
                body={(node: TreeNode) =>
                  node.data ? typeColumnBody(node.data as Asset) : null
                }
              />
              <Column
                field="siteName"
                header={t("assets.site")}
                sortable
                className="min-w-44"
                body={(node: TreeNode) =>
                  node.data ? siteColumnBody(node.data as Asset) : null
                }
              />
              <Column
                field="costCenterName"
                header={t("assets.costCenter")}
                sortable
                body={(node: TreeNode) =>
                  node.data ? costCenterBody(node.data as Asset) : null
                }
                className="min-w-48"
              />
              <Column
                field="parentAssetName"
                sortField="parentAssetName"
                header={t("assets.parentAsset")}
                body={(node: TreeNode) =>
                  node.data ? parentBody(node.data as Asset) : null
                }
                sortable
                className="min-w-72"
              />
              <Column
                field="serialNumber"
                header={t("assets.serialNumber")}
                sortable
                className="min-w-40"
                body={(node: TreeNode) =>
                  node.data
                    ? nullableTextBody((node.data as Asset).serialNumber)
                    : null
                }
              />
              <Column
                field="buildDate"
                header={t("assets.buildDate")}
                sortable
                className="min-w-28"
                body={(node: TreeNode) =>
                  node.data
                    ? dateOnlyBody((node.data as Asset).buildDate)
                    : null
                }
              />
              <Column
                field="manufacturer"
                header={t("assets.manufacturer")}
                sortable
                body={(node: TreeNode) =>
                  node.data
                    ? nullableTextBody((node.data as Asset).manufacturer)
                    : null
                }
                className="min-w-56"
              />
              <Column
                field="documentCount"
                header={t("assets.references")}
                body={(node: TreeNode) =>
                  node.data ? referencesBody(node.data as Asset) : null
                }
                sortable
                style={{ width: "8rem", minWidth: "8rem", maxWidth: "8rem" }}
                bodyClassName="app-assets-treetable-ref-cell"
              />
              <Column
                field="createdAt"
                header={t("assets.createdAt")}
                body={(node: TreeNode) =>
                  node.data
                    ? formatShortDt((node.data as Asset).createdAt)
                    : null
                }
                sortable
                className="min-w-44 whitespace-nowrap text-on-surface-variant"
              />
              <Column
                field="createdBy"
                header={t("assets.createdBy")}
                sortable
                className="min-w-36 text-on-surface-variant"
                body={(node: TreeNode) =>
                  node.data ? (node.data as Asset).createdBy : null
                }
              />
              <Column
                field="updatedAt"
                header={t("assets.updatedAt")}
                body={(node: TreeNode) =>
                  node.data
                    ? formatShortDt((node.data as Asset).updatedAt)
                    : null
                }
                sortable
                className="min-w-44 whitespace-nowrap text-on-surface-variant"
              />
              <Column
                field="updatedBy"
                header={t("assets.updatedBy")}
                sortable
                className="min-w-36 text-on-surface-variant"
                body={(node: TreeNode) =>
                  node.data ? (node.data as Asset).updatedBy : null
                }
              />
            </TreeTable>
          </div>
        )}
      </div>
      <Dialog
        header={editingId ? t("assets.editTitle") : t("assets.createTitle")}
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
            onTabChange={handleAssetTabChange}
          >
            <TabPanel header={t("assets.tabGeneral")}>
              <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="asset-key"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("assets.key")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <InputText
                    id="asset-key"
                    value={form.key}
                    onChange={(e) =>
                      setForm((cur) => ({ ...cur, key: e.target.value }))
                    }
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="asset-name"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("assets.name")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <InputText
                    id="asset-name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((cur) => ({ ...cur, name: e.target.value }))
                    }
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="asset-site"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("assets.site")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <Dropdown
                    inputId="asset-site"
                    value={form.siteId}
                    options={siteDropdownOptions}
                    onChange={(e) =>
                      setForm((cur) => ({
                        ...cur,
                        siteId: String(e.value ?? ""),
                      }))
                    }
                    placeholder={t("assets.sitePlaceholder")}
                    className="w-full app-inline-icon-dropdown"
                    itemTemplate={renderSiteDropdownOption}
                    valueTemplate={renderSiteDropdownValue}
                    filter
                    disabled={siteFieldLocked}
                    appendTo={overlayAppendTo}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="asset-cost-center"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("assets.costCenter")}
                  </label>
                  <Dropdown
                    inputId="asset-cost-center"
                    value={form.costCenterId}
                    options={costCenterDropdownOptions}
                    onChange={(e) =>
                      setForm((cur) => ({
                        ...cur,
                        costCenterId: String(e.value ?? ""),
                      }))
                    }
                    placeholder={t("assets.costCenterPlaceholder")}
                    className="w-full app-inline-icon-dropdown"
                    disabled={!form.siteId}
                    filter
                    showClear
                    appendTo={overlayAppendTo}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="asset-type"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("assets.type")}
                    <span className="app-required-marker" aria-hidden>
                      *
                    </span>
                  </label>
                  <Dropdown
                    inputId="asset-type"
                    value={form.type}
                    options={typeOptions}
                    onChange={(e) =>
                      setForm((cur) => ({ ...cur, type: e.value as AssetType }))
                    }
                    className="w-full app-inline-icon-dropdown"
                    itemTemplate={renderAssetTypeDropdownOption}
                    valueTemplate={renderAssetTypeDropdownValue}
                    appendTo={overlayAppendTo}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label
                    htmlFor="asset-parent"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("assets.parentAsset")}
                  </label>
                  <Dropdown
                    inputId="asset-parent"
                    value={form.parentAssetId}
                    options={parentOptions}
                    onChange={(e) =>
                      setForm((cur) => ({
                        ...cur,
                        parentAssetId: String(e.value ?? ""),
                      }))
                    }
                    placeholder={t("assets.parentAssetPlaceholder")}
                    className="w-full app-inline-icon-dropdown"
                    disabled={!form.siteId}
                    filter
                    showClear
                    appendTo={overlayAppendTo}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="asset-serial-number"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("assets.serialNumber")}
                  </label>
                  <InputText
                    id="asset-serial-number"
                    value={form.serialNumber}
                    onChange={(e) =>
                      setForm((cur) => ({
                        ...cur,
                        serialNumber: e.target.value,
                      }))
                    }
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="asset-build-date"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("assets.buildDate")}
                  </label>
                  <div className="relative w-full">
                    <Calendar
                      inputId="asset-build-date"
                      value={parseDateOnly(form.buildDate)}
                      onChange={(e) => {
                        const next =
                          e.value instanceof Date
                            ? formatDateOnly(e.value)
                            : "";
                        setForm((cur) => ({ ...cur, buildDate: next }));
                      }}
                      dateFormat={calendarDateFormat}
                      className="w-full"
                      appendTo={overlayAppendTo}
                    />
                    <i
                      className="pi pi-calendar pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
                      aria-hidden
                    />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label
                    htmlFor="asset-manufacturer"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("assets.manufacturer")}
                  </label>
                  <InputText
                    id="asset-manufacturer"
                    value={form.manufacturer}
                    onChange={(e) =>
                      setForm((cur) => ({
                        ...cur,
                        manufacturer: e.target.value,
                      }))
                    }
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label
                    htmlFor="asset-remark"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("assets.remark")}
                  </label>
                  <textarea
                    id="asset-remark"
                    value={form.remark}
                    onChange={(e) =>
                      setForm((cur) => ({ ...cur, remark: e.target.value }))
                    }
                    className="w-full p-inputtext p-component min-h-28 resize-y"
                    maxLength={2000}
                  />
                  <div className="text-xs text-on-surface-variant text-right">
                    {t("assets.remarkCounter", {
                      count: form.remark.length,
                      max: 2000,
                    })}
                  </div>
                </div>
              </div>
            </TabPanel>
            <TabPanel header={t("assets.tabDocuments")}>
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-[8fr_2fr] items-stretch gap-2">
                  <Button
                    type="button"
                    icon="pi pi-upload"
                    label={t("assets.documentsUpload")}
                    className="w-full min-w-0 justify-center !h-9 min-h-9 max-h-9 py-0"
                    onClick={() => fileInputRef.current?.click()}
                  />
                  <IconField
                    iconPosition="left"
                    className="min-w-0 w-full !h-9 min-h-9 max-h-9"
                  >
                    <InputIcon className="pi pi-search text-xs text-on-surface-variant" />
                    <InputText
                      value={documentsSearchTerm}
                      onChange={(e) => setDocumentsSearchTerm(e.target.value)}
                      placeholder={t("assets.documentsSearchPlaceholder")}
                      className="app-header-search-input !h-full min-h-0 w-full !rounded-sm text-sm"
                    />
                  </IconField>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handlePickFiles}
                />
                {uploading ? (
                  <div
                    className="flex items-center gap-2 text-sm text-on-surface-variant"
                    role="status"
                    aria-live="polite"
                  >
                    <i className="pi pi-spin pi-spinner" aria-hidden />
                    <span>{t("assets.documentsUploading")}</span>
                  </div>
                ) : null}
                {pendingFiles.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm text-on-surface-variant">
                      {t("assets.documentsPending")}
                    </div>
                    {filteredPendingFiles.length === 0 ? (
                      <div className="text-sm text-on-surface-variant">
                        {t("assets.documentsSearchEmpty")}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {filteredPendingFiles.map((document, index) => (
                          <div
                            key={document.localId}
                            className="app-card-cascade flex items-center gap-3 rounded-sm border border-outline-variant px-3 py-2"
                            style={{ ["--app-cascade-index" as string]: index }}
                          >
                            <i
                              className={`${documentTypeIconClass(document.file.type || "application/octet-stream", document.file.name)} shrink-0 text-lg`}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm">
                                {document.displayName}
                              </div>
                              <div className="text-xs text-on-surface-variant">
                                <span
                                  className={`inline align-middle rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight md:text-xs ${documentCategoryBadgeClass(document.category)}`}
                                >
                                  {t(
                                    `assets.documentCategories.${document.category}`,
                                  )}
                                </span>
                                <span className="text-on-surface-variant">
                                  {" "}
                                  ·{" "}
                                </span>
                                {
                                  (
                                    document.file.type ||
                                    "application/octet-stream"
                                  ).split(";")[0]
                                }{" "}
                                · {formatFileSize(document.file.size)}
                              </div>
                            </div>
                            <PendingAutoUploadOpenSlot
                              tick={pendingUiTick}
                              addedAt={document.addedAt}
                              busy={Boolean(
                                pendingRowUploading[document.localId],
                              )}
                              ariaLabelIdle={t(
                                "assets.documentsAutoUploadCountdownAria",
                              )}
                              ariaLabelBusy={t("assets.documentsUploading")}
                            />
                            <Button
                              type="button"
                              text
                              severity="danger"
                              className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0"
                              icon="pi pi-times"
                              aria-label={t("assets.documentsRemovePending")}
                              title={t("assets.documentsRemovePending")}
                              onClick={() =>
                                removePendingFileByLocalId(document.localId)
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
                {editingId ? (
                  <div className="space-y-2">
                    <div className="text-sm text-on-surface-variant">
                      {t("assets.documentsExisting")}
                    </div>
                    {documentsLoading ? (
                      <div
                        className="flex items-center gap-2 text-sm text-on-surface-variant"
                        role="status"
                        aria-live="polite"
                      >
                        <i className="pi pi-spin pi-spinner" aria-hidden />
                        <span>{t("assets.documentsLoading")}</span>
                      </div>
                    ) : documents.length === 0 ? (
                      <div className="text-sm text-on-surface-variant">
                        {t("assets.documentsEmpty")}
                      </div>
                    ) : filteredDocuments.length === 0 ? (
                      <div className="text-sm text-on-surface-variant">
                        {t("assets.documentsSearchEmpty")}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {filteredDocuments.map((doc, index) => (
                          <div
                            key={doc.id}
                            role="button"
                            tabIndex={0}
                            aria-label={t("assets.documentsCardOpenEdit")}
                            className="app-card-cascade flex cursor-pointer items-center gap-3 rounded-sm border border-outline-variant px-3 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--color-on-surface)_4%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            style={{ ["--app-cascade-index" as string]: index }}
                            title={t("assets.documentsCardOpenEdit")}
                            onClick={() => {
                              setDocumentEdit(doc);
                              setDocumentEditDisplayName(
                                doc.displayName || doc.fileName,
                              );
                              setDocumentEditCategory(doc.category);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setDocumentEdit(doc);
                                setDocumentEditDisplayName(
                                  doc.displayName || doc.fileName,
                                );
                                setDocumentEditCategory(doc.category);
                              }
                            }}
                          >
                            <i
                              className={`${documentTypeIconClass(doc.mimeType, doc.fileName)} shrink-0 text-lg`}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm">
                                {doc.displayName || doc.fileName}
                              </div>
                              <div className="text-xs text-on-surface-variant">
                                <span
                                  className={`inline align-middle rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight md:text-xs ${documentCategoryBadgeClass(doc.category)}`}
                                >
                                  {t(
                                    `assets.documentCategories.${doc.category}`,
                                  )}
                                </span>
                                <span className="text-on-surface-variant">
                                  {" "}
                                  ·{" "}
                                </span>
                                {
                                  (
                                    doc.mimeType ?? "application/octet-stream"
                                  ).split(";")[0]
                                }{" "}
                                · {formatFileSize(doc.fileSize)}
                              </div>
                              <div className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                                {t("assets.documentsUploadAudit", {
                                  user: doc.createdBy,
                                  date: formatShortDt(doc.createdAt),
                                })}
                              </div>
                            </div>
                            <Button
                              type="button"
                              text
                              className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0"
                              icon="pi pi-external-link"
                              aria-label={t("assets.documentsOpen")}
                              title={t("assets.documentsOpen")}
                              onClick={(e) => {
                                e.stopPropagation();
                                void openDocumentContent(doc.assetId, doc.id);
                              }}
                            />
                            <Button
                              type="button"
                              text
                              severity="danger"
                              className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0"
                              icon="pi pi-trash"
                              aria-label={t("assets.delete")}
                              title={t("assets.delete")}
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDialog({
                                  message: t("assets.documentsConfirmDelete", {
                                    name: doc.displayName || doc.fileName,
                                  }),
                                  header: t("assets.documentsDeleteTitle"),
                                  icon: "pi pi-exclamation-triangle",
                                  acceptClassName: "p-button-danger",
                                  acceptLabel: t("assets.yes"),
                                  rejectLabel: t("assets.no"),
                                  accept: () =>
                                    void deleteDocument(doc.assetId, doc.id),
                                });
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-sm border border-outline-variant px-3 py-2 text-sm text-on-surface-variant">
                    {t("assets.documentsCreateHint")}
                  </div>
                )}
              </div>
            </TabPanel>
          </TabView>
        </div>
      </Dialog>

      <Dialog
        header={t("assets.documentsMetaDialogTitle")}
        visible={uploadMetaVisible}
        className="app-modal-window"
        onHide={cancelUploadDrafts}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        <div className="space-y-3">
          <div className="text-sm text-on-surface-variant">
            {t("assets.documentsMetaDialogHint")}
          </div>
          <div className="space-y-3">
            {uploadDrafts.map((draft, index) => (
              <div
                key={`${draft.file.name}-${index}`}
                className="rounded-sm border border-outline-variant p-3"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                      {t("assets.documentsDisplayName")}
                    </label>
                    <InputText
                      value={draft.displayName}
                      onChange={(e) =>
                        updateUploadDraft(index, {
                          displayName: e.target.value,
                        })
                      }
                      className="w-full"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                      {t("assets.documentsCategory")}
                    </label>
                    <Dropdown
                      value={draft.category}
                      options={documentCategoryOptions}
                      optionLabel="label"
                      optionValue="value"
                      itemTemplate={renderDocumentCategoryDropdownOption}
                      valueTemplate={renderDocumentCategoryDropdownValue}
                      onChange={(e) =>
                        updateUploadDraft(index, {
                          category: e.value as AssetDocumentCategory,
                        })
                      }
                      className="w-full app-inline-icon-dropdown"
                      appendTo={overlayAppendTo}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              label={t("assets.cancel")}
              severity="secondary"
              outlined
              onClick={cancelUploadDrafts}
            />
            <Button
              type="button"
              label={t("assets.documentsMetaApply")}
              icon="pi pi-check"
              onClick={confirmUploadDrafts}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        header={t("assets.documentsEditTitle")}
        visible={documentEdit !== null}
        className="app-modal-window"
        onHide={() => {
          if (!documentEditSaving) setDocumentEdit(null);
        }}
        modal
        dismissableMask={!documentEditSaving}
        closable={!documentEditSaving}
        draggable={false}
        resizable={false}
      >
        <div className="space-y-3">
          <p className="text-sm text-on-surface-variant">
            {t("assets.documentsEditHint")}
          </p>
          {documentEdit ? (
            <>
              <div className="text-xs text-on-surface-variant">
                {t("assets.documentsUploadAudit", {
                  user: documentEdit.createdBy,
                  date: formatShortDt(documentEdit.createdAt),
                })}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="document-edit-display-name"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("assets.documentsDisplayName")}
                  </label>
                  <InputText
                    id="document-edit-display-name"
                    value={documentEditDisplayName}
                    onChange={(e) => setDocumentEditDisplayName(e.target.value)}
                    className="w-full"
                    autoComplete="off"
                    disabled={documentEditSaving}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="document-edit-category"
                    className="block text-[11px] text-outline uppercase tracking-[0.1em]"
                  >
                    {t("assets.documentsCategory")}
                  </label>
                  <Dropdown
                    inputId="document-edit-category"
                    value={documentEditCategory}
                    options={documentCategoryOptions}
                    optionLabel="label"
                    optionValue="value"
                    itemTemplate={renderDocumentCategoryDropdownOptionPlain}
                    valueTemplate={renderDocumentCategoryDropdownValuePlain}
                    onChange={(e) =>
                      setDocumentEditCategory(e.value as AssetDocumentCategory)
                    }
                    className="w-full app-inline-icon-dropdown"
                    disabled={documentEditSaving}
                    appendTo={overlayAppendTo}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  label={t("assets.cancel")}
                  severity="secondary"
                  outlined
                  disabled={documentEditSaving}
                  onClick={() => setDocumentEdit(null)}
                />
                <Button
                  type="button"
                  label={t("assets.save")}
                  icon="pi pi-check"
                  loading={documentEditSaving}
                  disabled={documentEditSaving}
                  onClick={() => void saveDocumentEdit()}
                />
              </div>
            </>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
