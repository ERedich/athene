import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useOutletContext } from "react-router-dom";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";

import { AppDialog } from "../components/AppDialog";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";

type ConfigListRow = {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export function CustomizeMenuPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { setHeaderActions, setHeaderRowCount } =
    useOutletContext<AppShellOutletContext>();
  const toast = useRef<Toast>(null);

  const [rows, setRows] = useState<ConfigListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ConfigListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/nav-menu-configs");
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as ConfigListRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch {
      toast.current?.show({
        severity: "error",
        summary: t("customizeMenu.loadError"),
        life: 4000,
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  useEffect(() => {
    setHeaderRowCount(filtered.length);
    return () => setHeaderRowCount(null);
  }, [filtered.length, setHeaderRowCount]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button
            type="button"
            className="app-header-action-nav-item inline-flex items-center gap-1.5"
            onClick={() => navigate("/customize-menu/new")}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t("customizeMenu.newConfig")}
          </button>
        </li>
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("customizeMenu.searchConfigs")}
              className="app-header-search-input !rounded-sm text-sm"
              aria-label={t("customizeMenu.searchConfigs")}
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [navigate, search, setHeaderActions, t]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/nav-menu-configs/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete");
      setDeleteTarget(null);
      toast.current?.show({
        severity: "success",
        summary: t("customizeMenu.deleteConfigSuccess"),
        life: 2500,
      });
      await load();
    } catch {
      toast.current?.show({
        severity: "error",
        summary: t("customizeMenu.deleteConfigError"),
        life: 4000,
      });
    } finally {
      setDeleting(false);
    }
  };

  const fmt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="app-customize-menu-page flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <Toast ref={toast} position="top-right" />
      <p className="mb-4 max-w-2xl text-sm text-on-surface-variant">
        {t("customizeMenu.listLead")}
      </p>

      {loading ? (
        <p className="text-sm text-on-surface-variant">{t("customizeMenu.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{t("customizeMenu.emptyConfigs")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {filtered.map((row) => (
            <li
              key={row.id}
              className="app-customize-menu-group flex items-center gap-3 rounded-lg px-3 py-3"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => navigate(`/customize-menu/${row.id}`)}
              >
                <span className="app-customize-menu-group-label block">
                  {row.name}
                </span>
                <span className="mt-1 block text-xs text-on-surface-variant">
                  {t("customizeMenu.updatedAt", { date: fmt(row.updatedAt) })}
                </span>
              </button>
              <button
                type="button"
                className="app-customize-menu-icon-btn text-on-surface-variant hover:bg-surface-container-high"
                aria-label={t("customizeMenu.assignUsers")}
                title={t("customizeMenu.assignUsers")}
                onClick={() => navigate(`/zuweisungen/menu/${row.id}`)}
              >
                <UserPlus size={20} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="app-customize-menu-icon-btn text-on-surface-variant hover:bg-surface-container-high"
                aria-label={t("customizeMenu.edit")}
                title={t("customizeMenu.edit")}
                onClick={() => navigate(`/customize-menu/${row.id}`)}
              >
                <Pencil size={20} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="app-customize-menu-icon-btn text-on-surface-variant hover:bg-surface-container-high"
                aria-label={t("customizeMenu.delete")}
                title={t("customizeMenu.delete")}
                onClick={() => setDeleteTarget(row)}
              >
                <Trash2 size={20} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AppDialog
        header={t("customizeMenu.deleteConfigTitle")}
        visible={deleteTarget !== null}
        className="app-modal-window"
        onHide={() => !deleting && setDeleteTarget(null)}
        modal
        dismissableMask={!deleting}
        draggable={false}
        resizable={false}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="app-header-action-nav-item"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              {t("customizeMenu.cancel")}
            </button>
            <button
              type="button"
              className="app-header-action-nav-item"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {t("customizeMenu.delete")}
            </button>
          </div>
        }
      >
        <p className="m-0 text-sm text-on-surface">
          {t("customizeMenu.deleteConfigConfirm", {
            name: deleteTarget?.name ?? "",
          })}
        </p>
      </AppDialog>
    </div>
  );
}
