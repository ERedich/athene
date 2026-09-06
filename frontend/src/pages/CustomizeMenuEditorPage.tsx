import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, RotateCcw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Dropdown } from "primereact/dropdown";
import { Toast } from "primereact/toast";

import { AddNavItemDialog } from "../components/customizeMenu/AddNavItemDialog";
import { MobileNavLayoutEditor } from "../components/customizeMenu/MobileNavLayoutEditor";
import { NavLayoutEditor } from "../components/customizeMenu/NavLayoutEditor";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { useNavLayout } from "../layout/NavLayoutContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { navGroups } from "../layout/navModel";
import { apiFetch } from "../lib/api";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import {
  addCustomGroup,
  addCustomLeaf,
  addCustomMobileItem,
  addCustomSubItem,
  catalogToMobileNavLayout,
  catalogToWebNavLayout,
  parseMobileNavLayout,
  parseWebNavLayout,
  resolveMobileNavLayout,
  resolveWebNavLayout,
  resolvedToMobileNavLayout,
  resolvedToWebNavLayout,
  type ResolvedMobileNavItem,
  type ResolvedNavGroup,
  type WebNavLayout,
  type MobileNavLayout,
} from "../lib/navLayout";

type Platform = "web" | "mobile";

type ConfigDetail = {
  id: string;
  key: string;
  name: string;
  webLayout: unknown;
  mobileLayout: unknown;
};

export function CustomizeMenuEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id || id === "new";
  const { setHeaderActions, setHeaderRowCount } =
    useOutletContext<AppShellOutletContext>();
  const { refresh: refreshSidebar } = useNavLayout();
  const toast = useRef<Toast>(null);

  const [configName, setConfigName] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("web");
  const [webDraft, setWebDraft] = useState<ResolvedNavGroup[]>(() =>
    resolveWebNavLayout(navGroups, null),
  );
  const [mobileDraft, setMobileDraft] = useState<ResolvedMobileNavItem[]>(() =>
    resolveMobileNavLayout(null),
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) {
      setConfigName("");
      setWebDraft(resolveWebNavLayout(navGroups, catalogToWebNavLayout(navGroups)));
      setMobileDraft(resolveMobileNavLayout(catalogToMobileNavLayout()));
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/nav-menu-configs/${id}`);
        if (!res.ok) throw new Error("load");
        const data = (await res.json()) as ConfigDetail;
        if (cancelled) return;
        setConfigName(data.name);
        const web = parseWebNavLayout(data.webLayout);
        const mobile = parseMobileNavLayout(data.mobileLayout);
        setWebDraft(resolveWebNavLayout(navGroups, web));
        setMobileDraft(resolveMobileNavLayout(mobile));
      } catch {
        if (!cancelled) {
          toast.current?.show({
            severity: "error",
            summary: t("customizeMenu.loadError"),
            life: 4000,
          });
          navigate("/customize-menu");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew, navigate, t]);

  const visibleCount = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (platform === "mobile") {
      if (!q) return mobileDraft.length;
      return mobileDraft.filter((it) => {
        const label = it.name ?? (it.labelKey ? t(it.labelKey) : "");
        return label.toLowerCase().includes(q);
      }).length;
    }
    let count = 0;
    for (const g of webDraft) {
      const gl = (g.name ?? (g.labelKey ? t(g.labelKey) : "")).toLowerCase();
      const items = g.items;
      if (!q) {
        count += 1 + (items.length > 0 ? items.length : 0);
        continue;
      }
      const gm = gl.includes(q);
      const matched = items.filter((it) => {
        const il = (it.name ?? (it.labelKey ? t(it.labelKey) : "")).toLowerCase();
        return il.includes(q);
      });
      if (gm || matched.length > 0) {
        count += 1 + (gm ? items.length : matched.length);
      }
    }
    return count;
  }, [mobileDraft, platform, search, t, webDraft]);

  useEffect(() => {
    setHeaderRowCount(visibleCount);
    return () => setHeaderRowCount(null);
  }, [setHeaderRowCount, visibleCount]);

  const save = useCallback(async () => {
    const name = configName.trim();
    if (!name) {
      toast.current?.show({
        severity: "warn",
        summary: t("customizeMenu.nameRequired"),
        life: 3000,
      });
      return;
    }
    setSaving(true);
    try {
      const webLayout: WebNavLayout = resolvedToWebNavLayout(webDraft);
      const mobileLayout: MobileNavLayout =
        resolvedToMobileNavLayout(mobileDraft);
      const body = JSON.stringify({
        name,
        webLayout,
        mobileLayout,
      });
      const res = await apiFetch(
        isNew ? "/api/nav-menu-configs" : `/api/nav-menu-configs/${id}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error ?? "save");
      }
      const saved = (await res.json()) as ConfigDetail;
      await refreshSidebar();
      toast.current?.show({
        severity: "success",
        summary: t("customizeMenu.saveSuccess"),
        life: 2500,
      });
      if (isNew) {
        navigate(`/customize-menu/${saved.id}`, { replace: true });
      }
    } catch {
      toast.current?.show({
        severity: "error",
        summary: t("customizeMenu.saveError"),
        life: 4000,
      });
    } finally {
      setSaving(false);
    }
  }, [
    configName,
    id,
    isNew,
    mobileDraft,
    navigate,
    refreshSidebar,
    t,
    webDraft,
  ]);

  const resetPlatform = () => {
    if (platform === "web") {
      setWebDraft(
        resolveWebNavLayout(navGroups, catalogToWebNavLayout(navGroups)),
      );
    } else {
      setMobileDraft(resolveMobileNavLayout(catalogToMobileNavLayout()));
    }
    toast.current?.show({
      severity: "success",
      summary: t("customizeMenu.resetSuccess"),
      life: 2500,
    });
  };

  useEffect(() => {
    const platformOptions: Array<{ value: Platform; label: string }> = [
      { value: "web", label: t("customizeMenu.platformWeb") },
      { value: "mobile", label: t("customizeMenu.platformMobile") },
    ];
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button
            type="button"
            className="app-header-action-nav-item inline-flex items-center gap-1.5"
            onClick={() => navigate("/customize-menu")}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            {t("customizeMenu.backToList")}
          </button>
        </li>
        <li>
          <button
            type="button"
            className="app-header-action-nav-item inline-flex items-center gap-1.5"
            disabled={saving}
            onClick={() => void save()}
          >
            <Save className="h-4 w-4" strokeWidth={1.75} />
            {t("customizeMenu.save")}
          </button>
        </li>
        <li>
          <button
            type="button"
            className="app-header-action-nav-item inline-flex items-center gap-1.5"
            disabled={saving}
            onClick={resetPlatform}
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
            {t("customizeMenu.reset")}
          </button>
        </li>
        <li>
          <button
            type="button"
            className="app-header-action-nav-item inline-flex items-center gap-1.5"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            {t("customizeMenu.addItem")}
          </button>
        </li>
        <li className="ml-auto flex items-center gap-2">
          <Dropdown
            aria-label={t("customizeMenu.platformLabel")}
            value={platform}
            options={platformOptions}
            optionLabel="label"
            optionValue="value"
            onChange={(e) => setPlatform((e.value as Platform) ?? "web")}
            className="app-header-preset-dropdown app-inline-icon-dropdown h-9 w-36 shrink-0 text-sm"
            panelClassName="app-header-preset-dropdown-panel"
            appendTo={overlayAppendTo}
          />
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("customizeMenu.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [navigate, save, saving, search, setHeaderActions, t, platform]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-on-surface-variant">
        {t("customizeMenu.loading")}
      </div>
    );
  }

  return (
    <div className="app-customize-menu-page flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <Toast ref={toast} position="top-right" />
      <AddNavItemDialog
        visible={addOpen}
        onHide={() => setAddOpen(false)}
        platform={platform}
        groups={webDraft}
        onAddGroup={(name) => setWebDraft((d) => addCustomGroup(d, name))}
        onAddLeaf={(name, to) =>
          setWebDraft((d) => addCustomLeaf(d, name, to, navGroups))
        }
        onAddSub={(groupId, name, to) =>
          setWebDraft((d) => addCustomSubItem(d, groupId, name, to, navGroups))
        }
        onAddMobile={(name, to) =>
          setMobileDraft((d) => addCustomMobileItem(d, name, to))
        }
      />

      <div className="mb-4 flex flex-col gap-1">
        <label
          htmlFor="nav-config-name"
          className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
        >
          {t("customizeMenu.configName")}
          <span className="text-[var(--color-primary)]"> *</span>
        </label>
        <InputText
          id="nav-config-name"
          value={configName}
          onChange={(e) => setConfigName(e.target.value)}
          className="max-w-xl !rounded-sm"
          maxLength={200}
        />
      </div>

      {platform === "web" ? (
        <NavLayoutEditor
          groups={webDraft}
          search={search}
          onChange={setWebDraft}
        />
      ) : (
        <MobileNavLayoutEditor
          items={mobileDraft}
          search={search}
          onChange={setMobileDraft}
        />
      )}
    </div>
  );
}
