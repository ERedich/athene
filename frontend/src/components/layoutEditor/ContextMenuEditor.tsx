import { useTranslation } from "react-i18next";
import { Checkbox } from "primereact/checkbox";

import type { ContextMenuLayoutPayload } from "../../lib/layoutEditor/types";

type Props = {
  value: ContextMenuLayoutPayload;
  onChange: (next: ContextMenuLayoutPayload) => void;
  readOnly?: boolean;
};

const ACTION_LABEL_KEYS: Record<string, string> = {
  create: "layoutEditor.contextCreate",
  edit: "layoutEditor.contextEdit",
  delete: "layoutEditor.contextDelete",
};

export function ContextMenuEditor({ value, onChange, readOnly = false }: Props) {
  const { t } = useTranslation();

  const toggle = (action: string, enabled: boolean) => {
    if (readOnly) return;
    onChange({
      version: 1,
      items: value.items.map((item) =>
        item.action === action ? { ...item, enabled } : item,
      ),
    });
  };

  return (
    <div className="flex max-w-md flex-col gap-3 rounded-sm border border-outline-variant/40 bg-surface-container-lowest p-4">
      <h3 className="m-0 text-sm font-medium text-on-surface">{t("layoutEditor.contextMenu")}</h3>
      <p className="m-0 text-sm text-on-surface-variant">{t("layoutEditor.contextMenuHelp")}</p>
      <ul className="m-0 list-none space-y-3 p-0">
        {value.items.map((item) => (
          <li key={item.action}>
            <label className="flex cursor-pointer items-center gap-3">
              <Checkbox
                checked={item.enabled}
                onChange={(e) => toggle(item.action, Boolean(e.checked))}
                disabled={readOnly}
              />
              <span className="text-sm text-on-surface">
                {t(ACTION_LABEL_KEYS[item.action] ?? item.action)}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
