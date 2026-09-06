import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, FileText, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { fetchSystemToolCatalog } from "../lib/systemToolsApi";
import {
  SYSTEM_TOOL_LABEL_KEYS,
  SYSTEM_TOOL_META_KEYS,
  type SystemToolCatalogItem,
  type SystemToolId,
} from "../lib/systemToolTypes";

const TOOL_ICONS: Record<SystemToolId, LucideIcon> = {
  "maintenance-plan-generate-due": CalendarClock,
  "banf-create": FileText,
};

export function SystemToolsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setHeaderActions, setHeaderRowCount } =
    useOutletContext<AppShellOutletContext>();
  const toast = useRef<Toast>(null);

  const [items, setItems] = useState<SystemToolCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchSystemToolCatalog();
      setItems(data);
    } catch {
      setError(true);
      setItems([]);
      toast.current?.show({
        severity: "error",
        summary: t("systemTools.loadError"),
        life: 4000,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setHeaderRowCount(null);
    return () => setHeaderRowCount(null);
  }, [setHeaderRowCount]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const label = t(SYSTEM_TOOL_LABEL_KEYS[item.id]).toLowerCase();
      const meta = t(SYSTEM_TOOL_META_KEYS[item.id]).toLowerCase();
      return label.includes(q) || meta.includes(q) || item.id.includes(q);
    });
  }, [items, search, t]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("systemTools.searchHub")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
              aria-label={t("systemTools.searchHub")}
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [search, setHeaderActions, t]);

  if (error && !loading) {
    return (
      <div className="app-system-tools-page app-system-tools-page--message min-h-0 flex-1 overflow-auto">
        <Toast ref={toast} position="top-right" />
        <div className="m-4 rounded-lg bg-surface-container-low p-4 text-sm text-on-surface">
          <p>{t("systemTools.loadError")}</p>
          <Button
            type="button"
            label={t("systemTools.retry")}
            size="small"
            className="mt-3"
            onClick={() => void load()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-system-tools-page min-h-0 flex-1 overflow-auto">
      <Toast ref={toast} position="top-right" />
      <p className="app-system-tools-lead text-sm text-on-surface-variant">
        {t("systemTools.hubLead")}
      </p>
      <div className="app-system-tools-grid" role="list">
        {filtered.map((item, index) => {
          const Icon = TOOL_ICONS[item.id];
          const enabled = item.enabled;
          const className = [
            "app-system-tools-tile",
            "app-card-cascade",
            enabled ? "" : "app-system-tools-tile--disabled",
          ]
            .filter(Boolean)
            .join(" ");

          const body = (
            <>
              <span className="app-system-tools-tile-icon" aria-hidden>
                <Icon size={28} strokeWidth={1.75} />
              </span>
              <span className="app-system-tools-tile-title">
                {t(SYSTEM_TOOL_LABEL_KEYS[item.id])}
              </span>
              {!enabled ? (
                <span className="app-system-tools-tile-meta">
                  {t("systemTools.comingSoon")}
                </span>
              ) : (
                <>
                  <span className="app-system-tools-tile-meta">
                    {t(SYSTEM_TOOL_META_KEYS[item.id])}
                  </span>
                  <span className="app-system-tools-tile-value" aria-live="polite">
                    {loading
                      ? "…"
                      : item.dueCount != null
                        ? t("systemTools.dueCount", { count: item.dueCount })
                        : "—"}
                  </span>
                </>
              )}
            </>
          );

          if (!enabled) {
            return (
              <div
                key={item.id}
                role="listitem"
                className={className}
                style={{ ["--app-cascade-index" as string]: index }}
                aria-disabled="true"
              >
                {body}
              </div>
            );
          }

          return (
            <Link
              key={item.id}
              to={`/systemwerkzeuge/${item.id}`}
              role="listitem"
              className={className}
              style={{ ["--app-cascade-index" as string]: index }}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/systemwerkzeuge/${item.id}`);
              }}
            >
              {body}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
