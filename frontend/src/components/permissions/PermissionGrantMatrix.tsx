import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "primereact/checkbox";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";

import { LucideInputSearchIcon } from "../LucideInputSearchIcon";
import type { PermissionCatalogApp } from "../../lib/permissions";
import { permissionKey } from "../../lib/permissions";

type Props = {
  catalog: PermissionCatalogApp[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Keys the actor may grant; if set, others are disabled. */
  grantableKeys?: ReadonlySet<string>;
  disabled?: boolean;
};

const ACTION_LABEL_KEYS: Record<string, string> = {
  view: "permissions.action.view",
  create: "permissions.action.create",
  update: "permissions.action.update",
  delete: "permissions.action.delete",
  start: "permissions.action.start",
  pause: "permissions.action.pause",
  cancel: "permissions.action.cancel",
  complete: "permissions.action.complete",
  feedback: "permissions.action.feedback",
  assign: "permissions.action.assign",
  subscribe: "permissions.action.subscribe",
  generateDue: "permissions.action.generateDue",
  execute: "permissions.action.execute",
  editSystem: "permissions.action.editSystem",
  manage: "permissions.action.manage",
};

export function PermissionGrantMatrix({
  catalog,
  selected,
  onChange,
  grantableKeys,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((app) => {
      const label = t(app.labelKey, { defaultValue: app.appKey }).toLowerCase();
      return (
        label.includes(q) ||
        app.appKey.toLowerCase().includes(q) ||
        (app.route?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [catalog, search, t]);

  const toggle = (key: string, checked: boolean) => {
    if (disabled) return;
    if (grantableKeys && !grantableKeys.has(key)) return;
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(next);
  };

  const toggleAppCrud = (app: PermissionCatalogApp, checked: boolean) => {
    if (disabled) return;
    const next = new Set(selected);
    for (const action of app.actions) {
      if (action.kind !== "crud") continue;
      const key = permissionKey(app.appKey, action.key);
      if (grantableKeys && !grantableKeys.has(key)) continue;
      if (checked) next.add(key);
      else next.delete(key);
    }
    onChange(next);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <IconField iconPosition="left" className="w-56">
        <LucideInputSearchIcon />
        <InputText
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("permissions.matrixSearch")}
          className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
          disabled={disabled}
        />
      </IconField>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <div className="flex flex-col gap-4">
          {filtered.map((app) => {
            const crudActions = app.actions.filter((a) => a.kind === "crud");
            const crudKeys = crudActions.map((a) => permissionKey(app.appKey, a.key));
            const allCrud =
              crudKeys.length > 0 && crudKeys.every((k) => selected.has(k));
            const appLabel = t(app.labelKey, { defaultValue: app.appKey });

            return (
              <section
                key={app.appKey}
                className="rounded-sm bg-surface-container-low px-3 py-2"
              >
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <h3 className="text-[11px] font-medium uppercase tracking-[0.1em] text-outline">
                    {appLabel}
                    {app.route ? (
                      <span className="ml-2 font-mono normal-case tracking-normal text-on-surface-variant">
                        {app.route}
                      </span>
                    ) : null}
                  </h3>
                  {crudKeys.length > 1 ? (
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface">
                      <Checkbox
                        checked={allCrud}
                        onChange={(e) => toggleAppCrud(app, Boolean(e.checked))}
                        disabled={disabled}
                      />
                      <span>{t("permissions.selectAllCrud")}</span>
                    </label>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {app.actions.map((action) => {
                    const key = permissionKey(app.appKey, action.key);
                    const locked = Boolean(grantableKeys && !grantableKeys.has(key));
                    const labelKey =
                      ACTION_LABEL_KEYS[action.key] ?? `permissions.action.${action.key}`;
                    return (
                      <label
                        key={key}
                        className={`flex items-center gap-2 text-sm ${
                          locked ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                        }`}
                        title={key}
                      >
                        <Checkbox
                          inputId={`perm-${key}`}
                          checked={selected.has(key)}
                          onChange={(e) => toggle(key, Boolean(e.checked))}
                          disabled={disabled || locked}
                        />
                        <span>{t(labelKey, { defaultValue: action.key })}</span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
