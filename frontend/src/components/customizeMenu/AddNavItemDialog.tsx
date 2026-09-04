import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";

import {
  displayNavLabel,
  listMobileNavApps,
  listWebNavApps,
  type NavAppOption,
  type ResolvedNavGroup,
} from "../../lib/navLayout";
import { navGroups } from "../../layout/navModel";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import { AppDialog } from "../AppDialog";

export type AddNavItemKind = "group" | "leaf" | "sub";

type AddNavItemDialogProps = {
  visible: boolean;
  onHide: () => void;
  platform: "web" | "mobile";
  groups: ResolvedNavGroup[];
  onAddGroup: (name: string) => void;
  onAddLeaf: (name: string, to: string) => void;
  onAddSub: (groupId: string, name: string, to: string) => void;
  onAddMobile: (name: string, to: string) => void;
};

export function AddNavItemDialog({
  visible,
  onHide,
  platform,
  groups,
  onAddGroup,
  onAddLeaf,
  onAddSub,
  onAddMobile,
}: AddNavItemDialogProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<AddNavItemKind>("leaf");
  const [name, setName] = useState("");
  const [to, setTo] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  const webApps = useMemo(
    () => listWebNavApps(navGroups).map((a) => ({ ...a, label: t(a.labelKey) })),
    [t],
  );
  const mobileApps = useMemo(
    () => listMobileNavApps().map((a) => ({ ...a, label: t(a.labelKey) })),
    [t],
  );
  const apps = platform === "mobile" ? mobileApps : webApps;

  const groupOptions = useMemo(
    () =>
      groups
        .filter((g) => g.role === "group" || g.items.length > 0 || !g.to)
        .map((g) => ({
          id: g.id,
          label: displayNavLabel(t, g),
        })),
    [groups, t],
  );

  const reset = () => {
    setKind("leaf");
    setName("");
    setTo(null);
    setGroupId(null);
  };

  useEffect(() => {
    if (visible) reset();
  }, [visible, platform]);

  const canSubmit = (() => {
    if (!name.trim()) return false;
    if (platform === "mobile") return Boolean(to);
    if (kind === "group") return true;
    if (kind === "leaf") return Boolean(to);
    return Boolean(to && groupId);
  })();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (platform === "mobile") {
      if (!to) return;
      onAddMobile(trimmed, to);
      onHide();
      return;
    }

    if (kind === "group") {
      onAddGroup(trimmed);
      onHide();
      return;
    }
    if (kind === "leaf") {
      if (!to) return;
      onAddLeaf(trimmed, to);
      onHide();
      return;
    }
    if (kind === "sub") {
      if (!to || !groupId) return;
      onAddSub(groupId, trimmed, to);
      onHide();
    }
  };

  const appOptionTemplate = (opt: (NavAppOption & { label: string }) | null) => {
    if (!opt) return null;
    const { Icon } = opt;
    return (
      <span className="inline-flex items-center gap-2">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
        {opt.label}
      </span>
    );
  };

  return (
    <AppDialog
      header={t("customizeMenu.addItem")}
      visible={visible}
      onHide={onHide}
      className="app-dialog-sm"
      modal
      dismissableMask
      draggable={false}
      resizable={false}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="app-header-action-nav-item"
            onClick={onHide}
          >
            {t("customizeMenu.cancel")}
          </button>
          <button
            type="button"
            className="app-header-action-nav-item"
            disabled={!canSubmit}
            onClick={submit}
          >
            {t("customizeMenu.addConfirm")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pt-3">
        {platform === "web" ? (
          <div className="flex flex-col gap-1.5">
            {(
              [
                ["group", "customizeMenu.typeGroup"],
                ["leaf", "customizeMenu.typeLeaf"],
                ["sub", "customizeMenu.typeSub"],
              ] as const
            ).map(([value, labelKey]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 text-sm text-on-surface"
              >
                <input
                  type="radio"
                  name="nav-item-kind"
                  checked={kind === value}
                  onChange={() => setKind(value)}
                />
                {t(labelKey)}
              </label>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wider text-on-surface-variant">
            {t("customizeMenu.itemName")}
          </label>
          <InputText
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full !rounded-sm text-sm"
            maxLength={80}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>

        {platform === "web" && kind === "sub" ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wider text-on-surface-variant">
              {t("customizeMenu.parentGroup")}
            </label>
            <Dropdown
              value={groupId}
              options={groupOptions}
              optionLabel="label"
              optionValue="id"
              onChange={(e) => setGroupId(e.value as string | null)}
              placeholder={t("customizeMenu.parentGroup")}
              className="w-full"
              appendTo={overlayAppendTo}
            />
          </div>
        ) : null}

        {(platform === "mobile" || kind === "leaf" || kind === "sub") && (
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wider text-on-surface-variant">
              {t("customizeMenu.app")}
            </label>
            <Dropdown
              value={to}
              options={apps}
              optionLabel="label"
              optionValue="to"
              itemTemplate={appOptionTemplate}
              valueTemplate={appOptionTemplate}
              onChange={(e) => setTo(e.value as string | null)}
              placeholder={t("customizeMenu.app")}
              className="w-full"
              filter
              appendTo={overlayAppendTo}
            />
          </div>
        )}
      </div>
    </AppDialog>
  );
}
