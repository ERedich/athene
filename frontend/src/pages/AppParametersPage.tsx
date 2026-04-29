import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { Checkbox } from "primereact/checkbox";
import { ColorPicker } from "primereact/colorpicker";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";
import { Toast } from "primereact/toast";

import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import {
  APP_PARAM_KEY_ASSET_KEY_GEN,
  APP_PARAM_KEY_ASSET_TYPES,
  APP_PARAM_KEY_DEFAULT_WORKGROUP,
  APP_PARAM_KEY_SHOW_ASSET_KEY_PATH,
  type AppParameterAssetKeyMode,
} from "../lib/appParameterKeys";
import {
  ASSET_TYPE_SLUGS,
  DEFAULT_ASSET_TYPE_DISPLAY_CONFIG,
  type AssetTypeDisplayConfig,
  type AssetTypeSlug,
  parseAssetTypeDisplayConfig,
} from "../lib/assetTypeDisplay";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";

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
  jsonValue: unknown | null;
  uuidValue: string | null;
  updatedAt: string;
};

type WorkgroupListRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
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

function pickerValueFromStored(hex: string): string {
  return hex.replace(/^#/, "").toLowerCase();
}

function storedFromPickerValue(raw: string): string {
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/i.exec(withHash);
  if (!m) return "#64748b";
  let h = m[1]!.toLowerCase();
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return `#${h}`;
}

function parameterRowDirty(a: AppParameterRow, b: AppParameterRow): boolean {
  if (a.boolValue !== b.boolValue) return true;
  if ((a.uuidValue ?? null) !== (b.uuidValue ?? null)) return true;
  return JSON.stringify(a.jsonValue) !== JSON.stringify(b.jsonValue);
}

export function AppParametersPage() {
  const { t, i18n } = useTranslation();
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();
  const { refresh, user } = useAuth();
  const toastRef = useRef<Toast>(null);
  const tabHostRef = useRef<HTMLDivElement | null>(null);
  /** Last loaded / successfully persisted snapshot from API */
  const [persistedRows, setPersistedRows] = useState<AppParameterRow[]>([]);
  /** Editable copy; committed via footer Save */
  const [draftRows, setDraftRows] = useState<AppParameterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [savingAll, setSavingAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [assetTypesDialogOpen, setAssetTypesDialogOpen] = useState(false);
  const [assetTypesDraft, setAssetTypesDraft] = useState<AssetTypeDisplayConfig>(() => ({
    ...DEFAULT_ASSET_TYPE_DISPLAY_CONFIG,
  }));
  const [workgroupsForSite, setWorkgroupsForSite] = useState<WorkgroupListRow[]>([]);

  const langDe = i18n.language?.toLowerCase().startsWith("de");

  const defaultWorkgroupDropdownOptions = useMemo(() => {
    const none = { label: t("appParameters.defaultWorkgroupNone"), value: null as string | null };
    const opts = workgroupsForSite.map((wg) => ({
      label: `${wg.key} — ${wg.name}${wg.isActive ? "" : ` (${t("workOrders.workgroupInactive")})`}`,
      value: wg.id,
    }));
    return [none, ...opts];
  }, [t, workgroupsForSite]);

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
  }, [activeTab, loading, draftRows.length, updateTabInk]);

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
      const normalized = data.map((r) => ({ ...r, uuidValue: r.uuidValue ?? null }));
      setPersistedRows(normalized);
      setDraftRows(normalized.map((r) => ({ ...r })));
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
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/workgroups");
        if (!res.ok || cancelled) return;
        const raw = (await res.json()) as unknown;
        if (!Array.isArray(raw) || cancelled) return;
        const list: WorkgroupListRow[] = raw
          .map((r) => {
            const o = r as Record<string, unknown>;
            const id = typeof o.id === "string" ? o.id : "";
            const key = typeof o.key === "string" ? o.key : "";
            const name = typeof o.name === "string" ? o.name : "";
            const siteId = typeof o.siteId === "string" ? o.siteId : "";
            const isActive = o.isActive !== false;
            return { id, key, name, siteId, isActive };
          })
          .filter((w) => w.id && w.siteId === user.workingSiteId);
        setWorkgroupsForSite(list);
      } catch {
        if (!cancelled) setWorkgroupsForSite([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.workingSiteId]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return draftRows;
    return draftRows.filter((r) => {
      const jsonBlob =
        r.jsonValue === null || r.jsonValue === undefined ? "" : JSON.stringify(r.jsonValue);
      const uuidBlob = r.uuidValue ?? "";
      const blob = [
        r.key,
        r.codeSuffix,
        r.category,
        r.nameDe,
        r.nameEn,
        r.descriptionDe ?? "",
        r.descriptionEn ?? "",
        r.valueType,
        jsonBlob,
        uuidBlob,
      ]
        .join("\n")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [draftRows, searchTerm]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li className="ml-auto">
          <IconField iconPosition="left">
            <InputIcon className="pi pi-search text-xs text-on-surface-variant" />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("appParameters.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [searchTerm, setHeaderActions, t]);

  const handleTabChange = useCallback((event: { index: number }) => {
    setActiveTab(event.index);
  }, []);

  const byCategory = useCallback(
    (cat: CategoryCode) => filteredRows.filter((r) => r.category === cat),
    [filteredRows],
  );

  const activeTabRowCount = useMemo(() => {
    const cat = CATEGORIES[activeTab];
    if (!cat) return 0;
    return filteredRows.filter((r) => r.category === cat).length;
  }, [activeTab, filteredRows]);

  useEffect(() => {
    setHeaderRowCount(activeTabRowCount);
    return () => {
      setHeaderRowCount(null);
    };
  }, [activeTabRowCount, setHeaderRowCount]);

  const updateDraftBool = useCallback((key: string, boolValue: boolean) => {
    setDraftRows((cur) => cur.map((r) => (r.key === key ? { ...r, boolValue } : r)));
  }, []);

  const updateDraftUuid = useCallback((key: string, uuidValue: string | null) => {
    setDraftRows((cur) => cur.map((r) => (r.key === key ? { ...r, uuidValue } : r)));
  }, []);

  const updateDraftJson = useCallback((key: string, jsonValue: unknown) => {
    setDraftRows((cur) => cur.map((r) => (r.key === key ? { ...r, jsonValue } : r)));
  }, []);

  const hasUnsavedChanges = useMemo(() => {
    const pmap = new Map(persistedRows.map((r) => [r.key, r]));
    return draftRows.some((d) => {
      const p = pmap.get(d.key);
      return !p || parameterRowDirty(d, p);
    });
  }, [draftRows, persistedRows]);

  const discardDraft = useCallback(() => {
    setDraftRows(persistedRows.map((r) => ({ ...r })));
  }, [persistedRows]);

  const saveAll = useCallback(async () => {
    const pmap = new Map(persistedRows.map((r) => [r.key, r]));
    const dirty = draftRows.filter((d) => {
      const p = pmap.get(d.key);
      return p && parameterRowDirty(d, p);
    });
    if (dirty.length === 0) return;
    setSavingAll(true);
    try {
      let nextPersisted = [...persistedRows];
      for (const row of dirty) {
        let body: Record<string, unknown>;
        if (row.valueType === "boolean") {
          body = { boolValue: row.boolValue };
        } else if (row.valueType === "uuid") {
          body = { uuidValue: row.uuidValue };
        } else if (row.valueType === "json") {
          body = { jsonValue: row.jsonValue };
        } else {
          continue;
        }
        const res = await apiFetch(`/api/app-parameters/${encodeURIComponent(row.key)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("patch");
        const updated = (await res.json()) as AppParameterRow;
        nextPersisted = nextPersisted.map((r) =>
          r.key === updated.key ? { ...updated, uuidValue: updated.uuidValue ?? null } : r,
        );
      }
      setPersistedRows(nextPersisted);
      setDraftRows(nextPersisted.map((r) => ({ ...r })));
      await refresh();
      toastRef.current?.show({
        severity: "success",
        summary: t("appParameters.saved"),
        life: 3000,
      });
    } catch {
      toastRef.current?.show({
        severity: "error",
        summary: t("appParameters.saveError"),
        life: 6000,
      });
    } finally {
      setSavingAll(false);
    }
  }, [draftRows, persistedRows, refresh, t]);

  const openAssetTypesDialog = useCallback((row: AppParameterRow) => {
    const parsed = parseAssetTypeDisplayConfig(row.jsonValue);
    setAssetTypesDraft(parsed ? { ...parsed } : { ...DEFAULT_ASSET_TYPE_DISPLAY_CONFIG });
    setAssetTypesDialogOpen(true);
  }, []);

  const applyAssetTypesDialogToDraft = useCallback(() => {
    const validated = parseAssetTypeDisplayConfig(assetTypesDraft);
    if (!validated) {
      toastRef.current?.show({
        severity: "error",
        summary: t("appParameters.assetTypesInvalid"),
        life: 6000,
      });
      return;
    }
    setDraftRows((cur) =>
      cur.map((r) => (r.key === APP_PARAM_KEY_ASSET_TYPES ? { ...r, jsonValue: validated } : r)),
    );
    setAssetTypesDialogOpen(false);
  }, [assetTypesDraft, t]);

  const updateAssetTypeField = useCallback(
    (slug: AssetTypeSlug, field: "nameDe" | "nameEn", value: string) => {
      setAssetTypesDraft((d) => ({ ...d, [slug]: { ...d[slug], [field]: value } }));
    },
    [],
  );

  const updateAssetTypeColor = useCallback((slug: AssetTypeSlug, raw: string) => {
    const colorHex = storedFromPickerValue(raw);
    setAssetTypesDraft((d) => ({ ...d, [slug]: { ...d[slug], colorHex } }));
  }, []);

  const assetKeyGenOptions = useMemo(
    () => [
      { label: t("appParameters.assetKeyGenManual"), value: "manual" as AppParameterAssetKeyMode },
      { label: t("appParameters.assetKeyGenAutoIncremental"), value: "auto_incremental" as AppParameterAssetKeyMode },
    ],
    [t],
  );

  const renderParameterCard = useCallback(
    (row: AppParameterRow) => {
      const displayName = langDe ? row.nameDe : row.nameEn;
      const desc = langDe ? row.descriptionDe : row.descriptionEn;
      const parsedTypes = parseAssetTypeDisplayConfig(row.jsonValue);
      const aakg =
        row.key === APP_PARAM_KEY_ASSET_KEY_GEN && row.jsonValue !== null && typeof row.jsonValue === "object"
          ? (row.jsonValue as { mode?: string }).mode
          : null;
      const aakgValue: AppParameterAssetKeyMode =
        aakg === "auto_incremental" ? "auto_incremental" : "manual";
      const sakpRaw =
        row.key === APP_PARAM_KEY_SHOW_ASSET_KEY_PATH && row.jsonValue !== null && typeof row.jsonValue === "object"
          ? (row.jsonValue as { show?: unknown; separator?: unknown })
          : null;
      const sakpShow = sakpRaw ? Boolean(sakpRaw.show) : false;
      const sakpSep =
        typeof sakpRaw?.separator === "string" && sakpRaw.separator.length === 1 ? sakpRaw.separator : ".";

      return (
        <Card key={row.key} className="app-parameter-card">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <code className="rounded-sm bg-surface-container-high px-1.5 py-0.5 font-mono text-[11px] text-on-surface-variant">
                {row.key}
              </code>
              <span className="text-xs text-on-surface-variant tabular-nums">{row.updatedAt}</span>
            </div>
            <h3 className="m-0 text-base font-medium text-on-surface leading-snug">{displayName}</h3>
            {desc ? (
              <p className="m-0 text-sm leading-relaxed text-on-surface-variant">{desc}</p>
            ) : (
              <p className="m-0 text-sm text-on-surface-variant">—</p>
            )}
            <div>
              {row.valueType === "boolean" ? (
                <div
                  className="flex items-center gap-3"
                  onClick={(ev) => ev.stopPropagation()}
                  onKeyDown={(ev) => ev.stopPropagation()}
                >
                  <Checkbox
                    inputId={`app-param-${row.key}`}
                    checked={row.boolValue}
                    disabled={savingAll}
                    className="rounded-none"
                    onChange={(e) => updateDraftBool(row.key, Boolean(e.checked))}
                  />
                  <label htmlFor={`app-param-${row.key}`} className="cursor-pointer text-sm text-on-surface-variant">
                    {t("appParameters.boolValueLabel")}
                  </label>
                </div>
              ) : row.key === APP_PARAM_KEY_ASSET_KEY_GEN && row.valueType === "json" ? (
                <div className="max-w-md" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
                  <Dropdown
                    inputId={`app-param-${row.key}`}
                    value={aakgValue}
                    options={assetKeyGenOptions}
                    optionLabel="label"
                    optionValue="value"
                    className="w-full"
                    disabled={savingAll}
                    appendTo={overlayAppendTo}
                    onChange={(e) => {
                      const v = e.value as AppParameterAssetKeyMode;
                      updateDraftJson(row.key, { mode: v });
                    }}
                  />
                </div>
              ) : row.key === APP_PARAM_KEY_SHOW_ASSET_KEY_PATH && row.valueType === "json" ? (
                <div
                  className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4"
                  onClick={(ev) => ev.stopPropagation()}
                  onKeyDown={(ev) => ev.stopPropagation()}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      inputId={`app-param-${row.key}-show`}
                      checked={sakpShow}
                      disabled={savingAll}
                      className="rounded-none"
                      onChange={(e) =>
                        updateDraftJson(row.key, {
                          show: Boolean(e.checked),
                          separator: sakpSep,
                        })
                      }
                    />
                    <label htmlFor={`app-param-${row.key}-show`} className="cursor-pointer text-sm text-on-surface-variant">
                      {t("appParameters.showAssetKeyPath")}
                    </label>
                  </div>
                  {sakpShow ? (
                    <div className="flex max-w-[8rem] flex-col gap-1">
                      <label className="text-[11px] text-outline uppercase tracking-wide" htmlFor={`app-param-${row.key}-sep`}>
                        {t("appParameters.assetKeyPathSeparator")}
                      </label>
                      <InputText
                        id={`app-param-${row.key}-sep`}
                        maxLength={1}
                        value={sakpSep}
                        disabled={savingAll}
                        className="w-full font-mono"
                        onChange={(e) => {
                          const next = e.target.value.slice(-1) || ".";
                          updateDraftJson(row.key, { show: true, separator: next });
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : row.key === APP_PARAM_KEY_ASSET_TYPES ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    {parsedTypes
                      ? ASSET_TYPE_SLUGS.map((slug) => (
                          <span
                            key={slug}
                            className="inline-block h-4 w-4 shrink-0 rounded-sm border border-outline-variant"
                            style={{ backgroundColor: parsedTypes[slug].colorHex }}
                            title={`${slug}: ${langDe ? parsedTypes[slug].nameDe : parsedTypes[slug].nameEn}`}
                          />
                        ))
                      : null}
                    <span className="text-sm text-on-surface-variant">
                      {parsedTypes ? t("appParameters.assetTypesConfigured") : t("appParameters.assetTypesInvalidShort")}
                    </span>
                  </div>
                  <Button
                    type="button"
                    label={t("appParameters.editAssetTypes")}
                    icon="pi pi-pencil"
                    className="p-button-sm w-fit"
                    disabled={savingAll}
                    onClick={() => openAssetTypesDialog(row)}
                  />
                </div>
              ) : row.key === APP_PARAM_KEY_DEFAULT_WORKGROUP && row.valueType === "uuid" ? (
                <div className="max-w-md" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
                  <Dropdown
                    inputId={`app-param-${row.key}`}
                    value={row.uuidValue}
                    options={defaultWorkgroupDropdownOptions}
                    optionLabel="label"
                    optionValue="value"
                    showClear={row.uuidValue != null}
                    className="w-full"
                    disabled={savingAll}
                    placeholder={t("appParameters.defaultWorkgroupPlaceholder")}
                    onChange={(e) => {
                      const v = e.value as string | null | undefined;
                      const next = v === undefined || v === null || v === "" ? null : String(v);
                      updateDraftUuid(row.key, next);
                    }}
                    appendTo={overlayAppendTo}
                  />
                </div>
              ) : (
                <span className="text-sm text-on-surface-variant">—</span>
              )}
            </div>
          </div>
        </Card>
      );
    },
    [
      assetKeyGenOptions,
      defaultWorkgroupDropdownOptions,
      langDe,
      openAssetTypesDialog,
      savingAll,
      updateDraftBool,
      updateDraftJson,
      updateDraftUuid,
      t,
    ],
  );

  const panels = useMemo(
    () =>
      CATEGORIES.map((cat) => {
        const list = byCategory(cat);
        return (
          <TabPanel key={cat} header={t(tabKey[cat])}>
            <div className="app-parameters-tab-panel-inner">
              {loading && draftRows.length === 0 ? (
                <div className="flex flex-1 items-center justify-center py-16 text-sm text-on-surface-variant">
                  {t("appParameters.loadingParameters")}
                </div>
              ) : list.length === 0 ? (
                <div className="py-12 text-center text-sm text-on-surface-variant">{t("appParameters.emptyTab")}</div>
              ) : (
                <div className="flex flex-col gap-4">{list.map((row) => renderParameterCard(row))}</div>
              )}
            </div>
          </TabPanel>
        );
      }),
    [byCategory, loading, renderParameterCard, draftRows.length, t],
  );

  const assetTypesDialogFooter = (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        type="button"
        label={t("appParameters.cancel")}
        className="p-button-text"
        disabled={savingAll}
        onClick={() => setAssetTypesDialogOpen(false)}
      />
      <Button
        type="button"
        label={t("appParameters.apply")}
        icon="pi pi-check"
        disabled={savingAll}
        onClick={() => applyAssetTypesDialogToDraft()}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Toast ref={toastRef} position="top-right" />
      <Dialog
        header={t("appParameters.assetTypesDialogTitle")}
        visible={assetTypesDialogOpen}
        style={{ width: "min(40rem, 95vw)" }}
        contentClassName="app-atyp-dialog"
        onHide={() => !savingAll && setAssetTypesDialogOpen(false)}
        footer={assetTypesDialogFooter}
        modal
        dismissableMask={!savingAll}
        draggable={false}
        resizable={false}
      >
        <p className="mb-4 text-sm text-on-surface-variant">{t("appParameters.assetTypesDialogHint")}</p>
        <div className="flex max-h-[min(28rem,70vh)] flex-col gap-4 overflow-y-auto pe-1">
          {ASSET_TYPE_SLUGS.map((slug) => (
            <div key={slug} className="app-atyp-type-card space-y-3 p-3">
              <div className="font-mono text-xs text-on-surface-variant">{slug}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-[11px] text-outline uppercase tracking-wide" htmlFor={`atyp-de-${slug}`}>
                    {t("appParameters.assetTypeNameDe")}
                  </label>
                  <InputText
                    id={`atyp-de-${slug}`}
                    value={assetTypesDraft[slug].nameDe}
                    onChange={(e) => updateAssetTypeField(slug, "nameDe", e.target.value)}
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-outline uppercase tracking-wide" htmlFor={`atyp-en-${slug}`}>
                    {t("appParameters.assetTypeNameEn")}
                  </label>
                  <InputText
                    id={`atyp-en-${slug}`}
                    value={assetTypesDraft[slug].nameEn}
                    onChange={(e) => updateAssetTypeField(slug, "nameEn", e.target.value)}
                    className="w-full"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor={`atyp-color-${slug}`}
                  className="mb-0 shrink-0 cursor-pointer text-[11px] text-outline uppercase tracking-wide"
                >
                  {t("sites.color")}
                </label>
                <span
                  className="app-atyp-color-swatch-wrap"
                  style={{ "--atyp-swatch": assetTypesDraft[slug].colorHex } as CSSProperties}
                >
                  <ColorPicker
                    inputId={`atyp-color-${slug}`}
                    className="app-atyp-colorpicker"
                    format="hex"
                    value={pickerValueFromStored(assetTypesDraft[slug].colorHex)}
                    onChange={(e) => {
                      const v = e.value;
                      const raw = typeof v === "string" ? v : "";
                      updateAssetTypeColor(slug, raw);
                    }}
                    appendTo={overlayAppendTo}
                  />
                </span>
                <span className="font-mono text-sm text-on-surface-variant">{assetTypesDraft[slug].colorHex}</span>
              </div>
            </div>
          ))}
        </div>
      </Dialog>
      <div className="app-tabbed-page-shell min-h-0 flex flex-1 flex-col">
        <div ref={tabHostRef} className="app-tabview-with-ink">
          <TabView className="app-sticky-tabs" activeIndex={activeTab} onTabChange={handleTabChange}>
            {panels}
          </TabView>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-outline-variant bg-surface px-4 py-3">
        <Button
          type="button"
          label={t("appParameters.discard")}
          className="p-button-text"
          disabled={!hasUnsavedChanges || savingAll}
          onClick={() => discardDraft()}
        />
        <Button
          type="button"
          label={t("appParameters.save")}
          icon="pi pi-save"
          loading={savingAll}
          disabled={!hasUnsavedChanges || savingAll}
          onClick={() => void saveAll()}
        />
      </div>
    </div>
  );
}
