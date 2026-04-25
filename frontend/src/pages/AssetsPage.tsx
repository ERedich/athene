import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import {
  ASSET_DOCUMENT_CATEGORY_ORDER,
  type AssetDocumentCategory,
  documentCategoryBadgeClass,
  isAssetDocumentCategory,
} from "../constants/assetDocumentCategory";

type AssetType = "site" | "structure" | "line" | "maintenanceObject";

type SiteOption = {
  id: string;
  key: string;
  name: string;
};

type Asset = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  type: AssetType;
  parentAssetId: string | null;
  parentAssetKey: string | null;
  parentAssetName: string | null;
  parentAssetType: AssetType | null;
  serialNumber: string | null;
  buildDate: string | null;
  manufacturer: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  documentCount: number;
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
  serialNumber: string;
  buildDate: string;
  manufacturer: string;
  remark: string;
};

const apiFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, { ...init, credentials: "include" });

const PENDING_AUTO_UPLOAD_MS = 5_000;
const PENDING_RING_C = 2 * Math.PI * 10;

function newPendingLocalId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  if (mt.includes("zip") || ext === "zip" || ext === "rar" || ext === "7z") return "pi pi-folder-open text-amber-700";
  if (mt.includes("wordprocessingml") || mt.includes("msword") || ext === "doc" || ext === "docx")
    return "pi pi-file-word text-blue-600";
  if (mt.includes("spreadsheetml") || mt.includes("ms-excel") || ext === "xls" || ext === "xlsx" || ext === "csv")
    return "pi pi-file-excel text-emerald-600";
  if (mt.includes("presentationml") || mt.includes("powerpoint") || ext === "ppt" || ext === "pptx")
    return "pi pi-file text-orange-600";
  if (mt.startsWith("text/") || ext === "txt" || ext === "md" || ext === "json" || ext === "xml")
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
  const base = [displayName, fileName, categoryLabel, mimeType, ext, maj ?? "", min ?? ""].join(" ").toLowerCase();
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
      parts.push(new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(d));
      parts.push(new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d));
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
function resolveDocumentCategoryDropdownIncoming(incoming: unknown): DocumentCategoryDropdownResolved {
  if (incoming == null) return { kind: "empty" };
  if (typeof incoming === "object" && incoming !== null && "value" in incoming) {
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
function PendingAutoUploadOpenSlot({ tick, addedAt, busy, ariaLabelIdle, ariaLabelBusy }: PendingAutoUploadOpenSlotProps) {
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
  const remainingRatio = Math.max(0, Math.min(1, 1 - elapsed / PENDING_AUTO_UPLOAD_MS));
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
      <svg className="h-[1.125rem] w-[1.125rem] shrink-0 -rotate-90 text-primary" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="none" className="text-outline-variant" stroke="currentColor" strokeWidth="2" opacity={0.25} />
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
const primaryActionIcon = "text-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]";
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

type AssetDialogTab = (typeof assetDialogTabs)[keyof typeof assetDialogTabs];
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

export function AssetsPage() {
  const { t, i18n } = useTranslation();
  const { setHeaderActions } = useOutletContext<AppShellOutletContext>();
  const toastRef = useRef<Toast>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState<AssetDialogTab>(assetDialogTabs.General);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [documents, setDocuments] = useState<AssetDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingDocumentUpload[]>([]);
  const [uploadMetaVisible, setUploadMetaVisible] = useState(false);
  const [uploadDrafts, setUploadDrafts] = useState<DocumentUploadDraft[]>([]);
  const [documentsSearchTerm, setDocumentsSearchTerm] = useState("");
  const [pendingUiTick, setPendingUiTick] = useState(0);
  const [pendingRowUploading, setPendingRowUploading] = useState<Record<string, boolean>>({});
  const [documentEdit, setDocumentEdit] = useState<AssetDocument | null>(null);
  const [documentEditDisplayName, setDocumentEditDisplayName] = useState("");
  const [documentEditCategory, setDocumentEditCategory] = useState<AssetDocumentCategory>("general");
  const [documentEditSaving, setDocumentEditSaving] = useState(false);

  const editingIdRef = useRef<string | null>(null);
  const formRef = useRef(form);
  const pendingFilesRef = useRef(pendingFiles);
  const pendingAutoTimersRef = useRef(new Map<string, number>());
  const assetCreateLockRef = useRef<Promise<string | null> | null>(null);
  const runAutoUploadForPendingRef = useRef<(doc: PendingDocumentUpload) => Promise<void>>(async () => {});

  const clearPendingAutoTimer = useCallback((localId: string) => {
    const existing = pendingAutoTimersRef.current.get(localId);
    if (existing) window.clearTimeout(existing);
    pendingAutoTimersRef.current.delete(localId);
  }, []);

  const clearAllPendingAutoTimers = useCallback(() => {
    for (const timer of pendingAutoTimersRef.current.values()) window.clearTimeout(timer);
    pendingAutoTimersRef.current.clear();
  }, []);

  const formatShortDt = useCallback((iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }, [i18n.language]);

  const typeOptions = useMemo(
    () =>
      (["site", "structure", "line", "maintenanceObject"] as AssetType[]).map((type) => ({
        label: t(`assets.types.${type}`),
        value: type,
      })),
    [t],
  );

  const siteOptions = useMemo(
    () => sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
    [sites],
  );

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
      <span className="inline-block max-w-full truncate text-sm text-on-surface">{option.label}</span>
    ),
    [],
  );

  const renderDocumentCategoryDropdownValue = useCallback((incoming: unknown) => {
    const r = resolveDocumentCategoryDropdownIncoming(incoming);
    if (r.kind === "empty") {
      return <span className="text-on-surface-variant">{t("assets.documentsCategory")}</span>;
    }
    const text = r.labelOverride ?? t(`assets.documentCategories.${r.category}`);
    return (
      <span
        className={`inline-block max-w-full truncate rounded-sm px-1.5 py-0.5 text-sm font-medium leading-tight ${documentCategoryBadgeClass(r.category)}`}
      >
        {text}
      </span>
    );
  }, [t]);

  const renderDocumentCategoryDropdownValuePlain = useCallback((incoming: unknown) => {
    const r = resolveDocumentCategoryDropdownIncoming(incoming);
    if (r.kind === "empty") {
      return <span className="text-on-surface-variant">{t("assets.documentsCategory")}</span>;
    }
    const text = r.labelOverride ?? t(`assets.documentCategories.${r.category}`);
    return <span className="inline-block max-w-full truncate text-sm text-on-surface">{text}</span>;
  }, [t]);

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
      const hay = documentSearchHaystack(doc.displayName, doc.fileName, doc.mimeType, cat, audit);
      return hay.includes(q);
    });
  }, [documents, documentsSearchTerm, formatShortDt, i18n.language, t]);

  const filteredPendingFiles = useMemo(() => {
    const q = documentsSearchTerm.trim().toLowerCase();
    if (!q) return pendingFiles;
    return pendingFiles.filter((doc) => {
      const cat = t(`assets.documentCategories.${doc.category}`);
      const mime = doc.file.type || "application/octet-stream";
      const hay = documentSearchHaystack(doc.displayName, doc.file.name, mime, cat);
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
        label: `${asset.key} - ${asset.name} (${t(`assets.types.${asset.type}`)})`,
        value: asset.id,
      }));
  }, [assets, editingId, form.siteId, form.type, t]);

  const filteredAssets = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((row) =>
      [
        row.key,
        row.name,
        row.siteKey,
        row.siteName,
        row.type,
        row.parentAssetKey ?? "",
        row.parentAssetName ?? "",
        row.serialNumber ?? "",
        row.manufacturer ?? "",
        row.remark ?? "",
        String(row.documentCount),
        row.createdBy,
        row.updatedBy,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [assets, searchTerm]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsRes, sitesRes] = await Promise.all([apiFetch("/api/assets"), apiFetch("/api/sites")]);
      if (!assetsRes.ok || !sitesRes.ok) throw new Error("load");
      const [assetsData, sitesData] = (await Promise.all([assetsRes.json(), sitesRes.json()])) as [
        Asset[],
        SiteOption[],
      ];
      setAssets(assetsData);
      setSites(sitesData);
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("assets.loadError"), life: 6000 });
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
    setForm(emptyForm());
    setDocuments([]);
    setPendingFiles([]);
    setUploadDrafts([]);
    setUploadMetaVisible(false);
    setActiveTabIndex(assetDialogTabs.General);
    setDialogVisible(true);
  }, [clearAllPendingAutoTimers]);

  const openEdit = useCallback((row: Asset) => {
    clearAllPendingAutoTimers();
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      siteId: row.siteId,
      type: row.type,
      parentAssetId: row.parentAssetId ?? "",
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
  }, [clearAllPendingAutoTimers]);

  const openDocuments = useCallback(
    (row: Asset) => {
      openEdit(row);
      setActiveTabIndex(assetDialogTabs.Documents);
    },
    [openEdit],
  );

  const handleAssetTabChange = useCallback((event: { index: number }) => {
    if (event.index === assetDialogTabs.General || event.index === assetDialogTabs.Documents) {
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
  }, [activeTabIndex, dialogVisible, updateTabInk]);

  useEffect(() => {
    if (!dialogVisible) return;
    window.addEventListener("resize", updateTabInk);
    return () => window.removeEventListener("resize", updateTabInk);
  }, [dialogVisible, updateTabInk]);

  useEffect(() => {
    if (!form.siteId) {
      if (form.parentAssetId) setForm((cur) => ({ ...cur, parentAssetId: "" }));
      return;
    }
    const allowed = new Set(parentOptions.map((opt) => String(opt.value)));
    if (form.parentAssetId && !allowed.has(form.parentAssetId)) {
      setForm((cur) => ({ ...cur, parentAssetId: "" }));
    }
  }, [form.parentAssetId, form.siteId, form.type, parentOptions]);

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
    if (code === "invalid_parent_cycle") detail = t("assets.invalidParentCycle");
    if (code === "invalid_parent_self") detail = t("assets.invalidParentSelf");
    if (code === "invalid_parent_asset") detail = t("assets.invalidParentAsset");
    if (code === "foreign_key_violation") detail = t("assets.foreignKey");
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
        toastRef.current?.show({ severity: "error", summary: t("assets.documentsLoadError"), life: 6000 });
      } finally {
        setDocumentsLoading(false);
      }
    },
    [t],
  );

  const uploadDocument = useCallback(
    async (assetId: string, document: PendingDocumentUpload): Promise<boolean> => {
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

  const ensureAssetIdForDocumentUpload = useCallback(async (): Promise<string | null> => {
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
        const current = pendingFilesRef.current.find((p) => p.localId === localId);
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
      if (!pendingFilesRef.current.some((p) => p.localId === doc.localId)) return;
      setPendingRowUploading((m) => ({ ...m, [doc.localId]: true }));
      const bumpAndReschedule = () => {
        setPendingFiles((p) => p.map((x) => (x.localId === doc.localId ? { ...x, addedAt: Date.now() } : x)));
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
        const latest = pendingFilesRef.current.find((p) => p.localId === doc.localId) ?? doc;
        const ok = await uploadDocument(assetId, latest);
        if (!ok) {
          toastRef.current?.show({ severity: "error", summary: t("assets.documentsUploadPartialError"), life: 6000 });
          bumpAndReschedule();
          return;
        }
        setPendingFiles((p) => p.filter((x) => x.localId !== doc.localId));
        await loadDocuments(assetId);
        await loadData();
        toastRef.current?.show({ severity: "success", summary: t("assets.documentsAutoUploaded"), life: 2500 });
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
        pendingFilesRef.current.forEach((p) => schedulePendingAutoUpload(p.localId));
        return;
      }
      const saved = (await res.json()) as Asset;
      if (pendingFiles.length > 0) {
        setUploading(true);
        try {
          const uploads = await Promise.all(pendingFiles.map((document) => uploadDocument(saved.id, document)));
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
      pendingFilesRef.current.forEach((p) => schedulePendingAutoUpload(p.localId));
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
          toastRef.current?.show({ severity: "success", summary: t("assets.deleted"), life: 3000 });
          return;
        }
        let code: string | undefined;
        try {
          const body = (await res.json()) as { error?: string };
          code = body.error;
        } catch {
          /* ignore */
        }
        const detail = code === "foreign_key_violation" ? t("assets.foreignKey") : t("assets.deleteError");
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
      } catch {
        toastRef.current?.show({ severity: "error", summary: t("assets.deleteError"), life: 6000 });
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

  useEffect(() => {
    if (selectedAsset && !assets.some((asset) => asset.id === selectedAsset.id)) {
      setSelectedAsset(null);
    }
  }, [assets, selectedAsset]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button type="button" className={createActionNavItem} onClick={openCreate}>
            <i className={`pi pi-plus ${createActionIcon}`} aria-hidden />
            <span>{t("assets.new")}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={primaryActionNavItem}
            disabled={!selectedAsset}
            onClick={() => {
              if (selectedAsset) openEdit(selectedAsset);
            }}
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
            onClick={() => {
              if (selectedAsset) confirmDelete(selectedAsset);
            }}
          >
            <i className={`pi pi-trash ${deleteActionIcon}`} aria-hidden />
            <span>{t("assets.delete")}</span>
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <InputIcon className="pi pi-search text-xs text-on-surface-variant" />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("assets.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [confirmDelete, openCreate, openEdit, searchTerm, selectedAsset, setHeaderActions, t]);

  const parentBody = (row: Asset) => {
    if (!row.parentAssetId) return <span className="text-on-surface-variant">—</span>;
    const typeLabel = row.parentAssetType ? t(`assets.types.${row.parentAssetType}`) : "—";
    return (
      <span>
        {row.parentAssetKey} - {row.parentAssetName} ({typeLabel})
      </span>
    );
  };

  const dateOnlyBody = (value: string | null) => (value ? value : <span className="text-on-surface-variant">—</span>);

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
    const hasInvalidName = uploadDrafts.some((draft) => !draft.displayName.trim());
    if (hasInvalidName) {
      toastRef.current?.show({ severity: "warn", summary: t("assets.documentsDisplayNameRequired"), life: 4000 });
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

  const openDocumentContent = (assetId: string, documentId: string) => {
    window.open(`/api/assets/${assetId}/documents/${documentId}/content`, "_blank", "noopener,noreferrer");
  };

  const deleteDocument = async (assetId: string, documentId: string) => {
    const res = await apiFetch(`/api/assets/${assetId}/documents/${documentId}`, { method: "DELETE" });
    if (!res.ok) {
      toastRef.current?.show({ severity: "error", summary: t("assets.documentsDeleteError"), life: 6000 });
      return;
    }
    setDocumentEdit((cur) => (cur?.id === documentId ? null : cur));
    await Promise.all([loadDocuments(assetId), loadData()]);
    toastRef.current?.show({ severity: "success", summary: t("assets.documentsDeleted"), life: 3000 });
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
      const res = await apiFetch(`/api/assets/${editingId}/documents/${documentEdit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          category: documentEditCategory,
        }),
      });
      if (!res.ok) {
        let detail = t("assets.documentsUpdateError");
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error === "invalid_document_category") detail = t("assets.invalidDocumentCategory");
          if (body.error === "invalid_display_name") detail = t("assets.documentsDisplayNameRequired");
        } catch {
          /* ignore */
        }
        toastRef.current?.show({ severity: "error", summary: detail, life: 6000 });
        return;
      }
      setDocumentEdit(null);
      await loadDocuments(editingId);
      await loadData();
      toastRef.current?.show({ severity: "success", summary: t("assets.documentsUpdated"), life: 3000 });
    } catch {
      toastRef.current?.show({ severity: "error", summary: t("assets.documentsUpdateError"), life: 6000 });
    } finally {
      setDocumentEditSaving(false);
    }
  }, [documentEdit, documentEditCategory, documentEditDisplayName, editingId, loadData, loadDocuments, t]);

  const referencesBody = (row: Asset) => {
    const hasDocuments = row.documentCount > 0;
    return (
      <div className="flex items-center">
        <Button
          type="button"
          icon="pi pi-file"
          badge={row.documentCount > 1 ? String(row.documentCount) : undefined}
          badgeClassName="!bg-slate-900 !text-white !shadow-none !min-w-[1.1rem] !h-4 !text-[10px] !leading-4 !p-0"
          className={`h-7 w-7 !rounded-[0.5rem] !p-0 ${
            hasDocuments ? "app-ref-button--documents" : "!bg-surface-300 !border-surface-300 !text-on-surface-variant/70"
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

      <div className="flex min-h-0 flex-1 flex-col">
        <DataTable
          className="app-data-table w-full"
          value={filteredAssets}
          loading={loading}
          dataKey="id"
          selection={selectedAsset}
          onSelectionChange={(e) => setSelectedAsset(e.value as Asset | null)}
          onRowDoubleClick={(e) => openEdit(e.data as Asset)}
          selectionMode="single"
          metaKeySelection={false}
          stripedRows
          showGridlines
          scrollable
          resizableColumns
          columnResizeMode="expand"
          scrollHeight="flex"
          tableStyle={{ minWidth: "104rem" }}
          stateStorage="local"
          stateKey="athene-assets-table"
          emptyMessage={t("assets.empty")}
        >
          <Column field="key" header={t("assets.key")} sortable />
          <Column field="name" header={t("assets.name")} sortable className="min-w-56" />
          <Column field="type" header={t("assets.type")} sortable body={(row: Asset) => t(`assets.types.${row.type}`)} />
          <Column field="siteName" header={t("assets.site")} sortable />
          <Column header={t("assets.parentAsset")} body={parentBody} className="min-w-72" />
          <Column field="serialNumber" header={t("assets.serialNumber")} body={(row: Asset) => nullableTextBody(row.serialNumber)} />
          <Column field="buildDate" header={t("assets.buildDate")} body={(row: Asset) => dateOnlyBody(row.buildDate)} />
          <Column
            field="manufacturer"
            header={t("assets.manufacturer")}
            body={(row: Asset) => nullableTextBody(row.manufacturer)}
            className="min-w-56"
          />
          <Column field="documentCount" header={t("assets.references")} body={referencesBody} className="min-w-32" />
          <Column
            field="createdAt"
            header={t("assets.createdAt")}
            body={(row: Asset) => formatShortDt(row.createdAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column field="createdBy" header={t("assets.createdBy")} sortable className="text-on-surface-variant" />
          <Column
            field="updatedAt"
            header={t("assets.updatedAt")}
            body={(row: Asset) => formatShortDt(row.updatedAt)}
            sortable
            className="whitespace-nowrap text-on-surface-variant"
          />
          <Column field="updatedBy" header={t("assets.updatedBy")} sortable className="text-on-surface-variant" />
        </DataTable>
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
        <TabView className="app-sticky-tabs" activeIndex={activeTabIndex} onTabChange={handleAssetTabChange}>
          <TabPanel header={t("assets.tabGeneral")}>
            <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="asset-key" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                  {t("assets.key")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <InputText
                  id="asset-key"
                  value={form.key}
                  onChange={(e) => setForm((cur) => ({ ...cur, key: e.target.value }))}
                  className="w-full"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="asset-name" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                  {t("assets.name")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <InputText
                  id="asset-name"
                  value={form.name}
                  onChange={(e) => setForm((cur) => ({ ...cur, name: e.target.value }))}
                  className="w-full"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="asset-site" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                  {t("assets.site")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <Dropdown
                  inputId="asset-site"
                  value={form.siteId}
                  options={siteOptions}
                  onChange={(e) => setForm((cur) => ({ ...cur, siteId: String(e.value ?? "") }))}
                  placeholder={t("assets.sitePlaceholder")}
                  className="w-full app-inline-icon-dropdown"
                  filter
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="asset-type" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                  {t("assets.type")}
                  <span className="app-required-marker" aria-hidden>
                    *
                  </span>
                </label>
                <Dropdown
                  inputId="asset-type"
                  value={form.type}
                  options={typeOptions}
                  onChange={(e) => setForm((cur) => ({ ...cur, type: e.value as AssetType }))}
                  className="w-full app-inline-icon-dropdown"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="asset-parent" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                  {t("assets.parentAsset")}
                </label>
                <Dropdown
                  inputId="asset-parent"
                  value={form.parentAssetId}
                  options={parentOptions}
                  onChange={(e) => setForm((cur) => ({ ...cur, parentAssetId: String(e.value ?? "") }))}
                  placeholder={t("assets.parentAssetPlaceholder")}
                  className="w-full app-inline-icon-dropdown"
                  disabled={!form.siteId}
                  filter
                  showClear
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
                  onChange={(e) => setForm((cur) => ({ ...cur, serialNumber: e.target.value }))}
                  className="w-full"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="asset-build-date" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                  {t("assets.buildDate")}
                </label>
                <div className="relative w-full">
                  <Calendar
                    inputId="asset-build-date"
                    value={parseDateOnly(form.buildDate)}
                    onChange={(e) => {
                      const next = e.value instanceof Date ? formatDateOnly(e.value) : "";
                      setForm((cur) => ({ ...cur, buildDate: next }));
                    }}
                    dateFormat="yy-mm-dd"
                    className="w-full"
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
                  onChange={(e) => setForm((cur) => ({ ...cur, manufacturer: e.target.value }))}
                  className="w-full"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="asset-remark" className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                  {t("assets.remark")}
                </label>
                <textarea
                  id="asset-remark"
                  value={form.remark}
                  onChange={(e) => setForm((cur) => ({ ...cur, remark: e.target.value }))}
                  className="w-full p-inputtext p-component min-h-28 resize-y"
                  maxLength={2000}
                />
                <div className="text-xs text-on-surface-variant text-right">
                  {t("assets.remarkCounter", { count: form.remark.length, max: 2000 })}
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
                <IconField iconPosition="left" className="min-w-0 w-full !h-9 min-h-9 max-h-9">
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
                <div className="flex items-center gap-2 text-sm text-on-surface-variant" role="status" aria-live="polite">
                  <i className="pi pi-spin pi-spinner" aria-hidden />
                  <span>{t("assets.documentsUploading")}</span>
                </div>
              ) : null}
              {pendingFiles.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm text-on-surface-variant">{t("assets.documentsPending")}</div>
                  {filteredPendingFiles.length === 0 ? (
                    <div className="text-sm text-on-surface-variant">{t("assets.documentsSearchEmpty")}</div>
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
                          <div className="truncate text-sm">{document.displayName}</div>
                          <div className="text-xs text-on-surface-variant">
                            <span
                              className={`inline align-middle rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight md:text-xs ${documentCategoryBadgeClass(document.category)}`}
                            >
                              {t(`assets.documentCategories.${document.category}`)}
                            </span>
                            <span className="text-on-surface-variant"> · </span>
                            {(document.file.type || "application/octet-stream").split(";")[0]} ·{" "}
                            {formatFileSize(document.file.size)}
                          </div>
                        </div>
                        <PendingAutoUploadOpenSlot
                          tick={pendingUiTick}
                          addedAt={document.addedAt}
                          busy={Boolean(pendingRowUploading[document.localId])}
                          ariaLabelIdle={t("assets.documentsAutoUploadCountdownAria")}
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
                          onClick={() => removePendingFileByLocalId(document.localId)}
                        />
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              ) : null}
              {editingId ? (
                <div className="space-y-2">
                  <div className="text-sm text-on-surface-variant">{t("assets.documentsExisting")}</div>
                  {documentsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-on-surface-variant" role="status" aria-live="polite">
                      <i className="pi pi-spin pi-spinner" aria-hidden />
                      <span>{t("assets.documentsLoading")}</span>
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="text-sm text-on-surface-variant">{t("assets.documentsEmpty")}</div>
                  ) : filteredDocuments.length === 0 ? (
                    <div className="text-sm text-on-surface-variant">{t("assets.documentsSearchEmpty")}</div>
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
                            setDocumentEditDisplayName(doc.displayName || doc.fileName);
                            setDocumentEditCategory(doc.category);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setDocumentEdit(doc);
                              setDocumentEditDisplayName(doc.displayName || doc.fileName);
                              setDocumentEditCategory(doc.category);
                            }
                          }}
                        >
                          <i
                            className={`${documentTypeIconClass(doc.mimeType, doc.fileName)} shrink-0 text-lg`}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">{doc.displayName || doc.fileName}</div>
                            <div className="text-xs text-on-surface-variant">
                              <span
                                className={`inline align-middle rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight md:text-xs ${documentCategoryBadgeClass(doc.category)}`}
                              >
                                {t(`assets.documentCategories.${doc.category}`)}
                              </span>
                              <span className="text-on-surface-variant"> · </span>
                              {(doc.mimeType ?? "application/octet-stream").split(";")[0]} ·{" "}
                              {formatFileSize(doc.fileSize)}
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
                              openDocumentContent(doc.assetId, doc.id);
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
                                message: t("assets.documentsConfirmDelete", { name: doc.displayName || doc.fileName }),
                                header: t("assets.documentsDeleteTitle"),
                                icon: "pi pi-exclamation-triangle",
                                acceptClassName: "p-button-danger",
                                acceptLabel: t("assets.yes"),
                                rejectLabel: t("assets.no"),
                                accept: () => void deleteDocument(doc.assetId, doc.id),
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
          <div className="text-sm text-on-surface-variant">{t("assets.documentsMetaDialogHint")}</div>
          <div className="space-y-3">
            {uploadDrafts.map((draft, index) => (
              <div key={`${draft.file.name}-${index}`} className="rounded-sm border border-outline-variant p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-[11px] text-outline uppercase tracking-[0.1em]">
                      {t("assets.documentsDisplayName")}
                    </label>
                    <InputText
                      value={draft.displayName}
                      onChange={(e) => updateUploadDraft(index, { displayName: e.target.value })}
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
                      onChange={(e) => updateUploadDraft(index, { category: e.value as AssetDocumentCategory })}
                      className="w-full app-inline-icon-dropdown"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" label={t("assets.cancel")} severity="secondary" outlined onClick={cancelUploadDrafts} />
            <Button type="button" label={t("assets.documentsMetaApply")} icon="pi pi-check" onClick={confirmUploadDrafts} />
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
          <p className="text-sm text-on-surface-variant">{t("assets.documentsEditHint")}</p>
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
                    onChange={(e) => setDocumentEditCategory(e.value as AssetDocumentCategory)}
                    className="w-full app-inline-icon-dropdown"
                    disabled={documentEditSaving}
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
