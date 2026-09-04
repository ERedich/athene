import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutGrid,
  LayoutTemplate,
  Menu,
  Share2,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { Button } from "primereact/button";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { fetchAssignmentCatalog } from "../lib/assignmentsApi";
import {
  ASSIGNMENT_TYPE_LABEL_KEYS,
  type AssignmentCatalogItem,
  type AssignmentTypeId,
} from "../lib/assignmentTypes";

const TYPE_ICONS: Record<AssignmentTypeId, LucideIcon> = {
  menu: Menu,
  "search-preset": Share2,
  dashboard: LayoutGrid,
  layout: LayoutTemplate,
};

export function AssignmentsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { setHeaderActions, setHeaderRowCount } =
    useOutletContext<AppShellOutletContext>();
  const toast = useRef<Toast>(null);

  const [items, setItems] = useState<AssignmentCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchAssignmentCatalog();
      setItems(data);
    } catch {
      setError(true);
      setItems([]);
      toast.current?.show({
        severity: "error",
        summary: t("assignments.loadError"),
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
      const label = t(ASSIGNMENT_TYPE_LABEL_KEYS[item.id]).toLowerCase();
      return label.includes(q) || item.id.includes(q);
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
              placeholder={t("assignments.searchHub")}
              className="app-header-search-input !rounded-sm text-sm"
              aria-label={t("assignments.searchHub")}
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [search, setHeaderActions, t]);

  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat(i18n.language).format(n);
    } catch {
      return String(n);
    }
  };

  if (error && !loading) {
    return (
      <div className="app-assignments-page app-assignments-page--message min-h-0 flex-1 overflow-auto">
        <Toast ref={toast} position="top-right" />
        <div className="m-4 rounded-lg bg-surface-container-low p-4 text-sm text-on-surface">
          <p>{t("assignments.loadError")}</p>
          <Button
            type="button"
            label={t("assignments.retry")}
            size="small"
            className="mt-3"
            onClick={() => void load()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-assignments-page min-h-0 flex-1 overflow-auto">
      <Toast ref={toast} position="top-right" />
      <p className="app-assignments-lead px-4 pt-4 text-sm text-on-surface-variant">
        {t("assignments.hubLead")}
      </p>
      <div className="app-assignments-grid" role="list">
        {filtered.map((item, index) => {
          const Icon = TYPE_ICONS[item.id];
          const enabled = item.enabled;
          const className = [
            "app-assignments-tile",
            "app-card-cascade",
            enabled ? "" : "app-assignments-tile--disabled",
          ]
            .filter(Boolean)
            .join(" ");

          const body = (
            <>
              <span className="app-assignments-tile-icon" aria-hidden>
                <Icon size={28} strokeWidth={1.75} />
              </span>
              <span className="app-assignments-tile-title">
                {t(ASSIGNMENT_TYPE_LABEL_KEYS[item.id])}
              </span>
              {!enabled ? (
                <span className="app-assignments-tile-meta">
                  {t("assignments.comingSoon")}
                </span>
              ) : (
                <>
                  <span className="app-assignments-tile-meta">
                    {t("assignments.recordsCount", {
                      count: item.recordCount,
                    })}
                  </span>
                  <span className="app-assignments-tile-value" aria-live="polite">
                    {loading
                      ? "…"
                      : t("assignments.coverage", {
                          assigned: fmt(item.assignedUserCount),
                          total: fmt(item.userCount),
                        })}
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
              to={`/zuweisungen/${item.id}`}
              role="listitem"
              className={className}
              style={{ ["--app-cascade-index" as string]: index }}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/zuweisungen/${item.id}`);
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
