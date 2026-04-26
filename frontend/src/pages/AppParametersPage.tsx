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
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";
import { Toast } from "primereact/toast";

import { useAuth } from "../auth/AuthContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { APP_PARAM_KEY_ASSET_TYPES } from "../lib/appParameterKeys";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [assetTypesDialogOpen, setAssetTypesDialogOpen] = useState(false);
  const [assetTypesDraft, setAssetTypesDraft] = useState<AssetTypeDisplayConfig>(() => ({
    ...DEFAULT_ASSET_TYPE_DISPLAY_CONFIG,
  }));
  const [assetTypesSaving, setAssetTypesSaving] = useState(false);

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

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const jsonBlob =
        r.jsonValue === null || r.jsonValue === undefined ? "" : JSON.stringify(r.jsonValue);
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
      ]
        .join("\n")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, searchTerm]);

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

  const openAssetTypesDialog = useCallback((row: AppParameterRow) => {
    const parsed = parseAssetTypeDisplayConfig(row.jsonValue);
    setAssetTypesDraft(parsed ? { ...parsed } : { ...DEFAULT_ASSET_TYPE_DISPLAY_CONFIG });
    setAssetTypesDialogOpen(true);
  }, []);

  const saveAssetTypesDialog = useCallback(async () => {
    const validated = parseAssetTypeDisplayConfig(assetTypesDraft);
    if (!validated) {
      toastRef.current?.show({
        severity: "error",
        summary: t("appParameters.assetTypesInvalid"),
        life: 6000,
      });
      return;
    }
    setAssetTypesSaving(true);
    const prev = rows;
    setRows((cur) =>
      cur.map((r) => (r.key === APP_PARAM_KEY_ASSET_TYPES ? { ...r, jsonValue: validated } : r)),
    );
    try {
      const res = await apiFetch(`/api/app-parameters/${encodeURIComponent(APP_PARAM_KEY_ASSET_TYPES)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonValue: validated }),
      });
      if (!res.ok) throw new Error("patch");
      const updated = (await res.json()) as AppParameterRow;
      setRows((cur) => cur.map((r) => (r.key === APP_PARAM_KEY_ASSET_TYPES ? updated : r)));
      await refresh();
      setAssetTypesDialogOpen(false);
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
      setAssetTypesSaving(false);
    }
  }, [assetTypesDraft, refresh, rows, t]);

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

  const renderParameterCard = useCallback(
    (row: AppParameterRow) => {
      const displayName = langDe ? row.nameDe : row.nameEn;
      const desc = langDe ? row.descriptionDe : row.descriptionEn;
      const parsedTypes = parseAssetTypeDisplayConfig(row.jsonValue);

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
                    disabled={patchingKey === row.key}
                    className="rounded-none"
                    onChange={(e) => void patchBool(row.key, Boolean(e.checked))}
                  />
                  <label htmlFor={`app-param-${row.key}`} className="cursor-pointer text-sm text-on-surface-variant">
                    {t("appParameters.boolValueLabel")}
                  </label>
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
                    disabled={patchingKey !== null}
                    onClick={() => openAssetTypesDialog(row)}
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
    [langDe, openAssetTypesDialog, patchBool, patchingKey, t],
  );

  const panels = useMemo(
    () =>
      CATEGORIES.map((cat) => {
        const list = byCategory(cat);
        return (
          <TabPanel key={cat} header={t(tabKey[cat])}>
            <div className="app-parameters-tab-panel-inner">
              {loading && rows.length === 0 ? (
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
    [byCategory, loading, renderParameterCard, rows.length, t],
  );

  const assetTypesDialogFooter = (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        type="button"
        label={t("appParameters.cancel")}
        className="p-button-text"
        disabled={assetTypesSaving}
        onClick={() => setAssetTypesDialogOpen(false)}
      />
      <Button
        type="button"
        label={t("appParameters.save")}
        icon="pi pi-check"
        loading={assetTypesSaving}
        onClick={() => void saveAssetTypesDialog()}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <Toast ref={toastRef} position="top-right" />
      <Dialog
        header={t("appParameters.assetTypesDialogTitle")}
        visible={assetTypesDialogOpen}
        style={{ width: "min(40rem, 95vw)" }}
        contentClassName="app-atyp-dialog"
        onHide={() => !assetTypesSaving && setAssetTypesDialogOpen(false)}
        footer={assetTypesDialogFooter}
        modal
        dismissableMask={!assetTypesSaving}
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
      <div className="app-tabbed-page-shell">
        <div ref={tabHostRef} className="app-tabview-with-ink">
          <TabView className="app-sticky-tabs" activeIndex={activeTab} onTabChange={handleTabChange}>
            {panels}
          </TabView>
        </div>
      </div>
    </div>
  );
}
