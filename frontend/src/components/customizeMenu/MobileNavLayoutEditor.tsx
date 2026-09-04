import {
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";

import { AppDialog } from "../AppDialog";
import {
  displayNavLabel,
  listMobileNavApps,
  moveMobileItem,
  removeCustomMobileItem,
  toggleMobileItemHidden,
  updateCustomMobileItem,
  type ResolvedMobileNavItem,
} from "../../lib/navLayout";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

const DND_MIME = "application/x-athene-mobile-nav";
const ACTION_ICON_SIZE = 20;

type MobileNavLayoutEditorProps = {
  items: ResolvedMobileNavItem[];
  search: string;
  onChange: (next: ResolvedMobileNavItem[]) => void;
};

export function MobileNavLayoutEditor({
  items,
  search,
  onChange,
}: MobileNavLayoutEditorProps) {
  const { t } = useTranslation();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTo, setEditTo] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const apps = useMemo(
    () => listMobileNavApps().map((a) => ({ ...a, label: t(a.labelKey) })),
    [t],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items.map((it, index) => ({ it, index }));
    return items
      .map((it, index) => ({ it, index }))
      .filter(({ it }) =>
        displayNavLabel(t, it).toLowerCase().includes(q),
      );
  }, [items, search, t]);

  const deleteLabel = deleteId
    ? displayNavLabel(t, items.find((i) => i.id === deleteId) ?? {})
    : "";

  return (
    <div className="app-customize-menu-editor space-y-2">
      <div className="app-customize-menu-group rounded-lg">
        <ul className="app-customize-menu-group-items m-0 list-none space-y-0.5 rounded-lg px-2 py-2">
          {filtered.map(({ it, index }) => {
            const label = displayNavLabel(t, it);
            const { Icon } = it;
            return (
              <li
                key={it.id}
                className={`flex items-center gap-1 rounded-md px-1 py-1.5 ${
                  it.hidden ? "opacity-50" : ""
                }`}
                onDragOver={(e) => {
                  if (dragIndex == null) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex == null) return;
                  onChange(moveMobileItem(items, dragIndex, index));
                  setDragIndex(null);
                }}
              >
                <button
                  type="button"
                  className="app-customize-menu-handle app-customize-menu-icon-btn cursor-grab text-on-surface-variant hover:bg-surface-container-high"
                  draggable
                  aria-label={t("customizeMenu.dragItem")}
                  onDragStart={(e: DragEvent) => {
                    e.dataTransfer.setData(DND_MIME, String(index));
                    setDragIndex(index);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <GripVertical size={ACTION_ICON_SIZE} strokeWidth={2} />
                </button>
                <Icon
                  className="app-customize-menu-row-icon shrink-0 text-on-surface-variant"
                  size={18}
                  strokeWidth={1.75}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-on-surface">
                  {label}
                </span>
                <IconBtn
                  label={t("customizeMenu.moveUp")}
                  disabled={index <= 0}
                  onClick={() =>
                    onChange(moveMobileItem(items, index, index - 1))
                  }
                >
                  <ChevronUp size={ACTION_ICON_SIZE} strokeWidth={2} />
                </IconBtn>
                <IconBtn
                  label={t("customizeMenu.moveDown")}
                  disabled={index >= items.length - 1}
                  onClick={() =>
                    onChange(moveMobileItem(items, index, index + 1))
                  }
                >
                  <ChevronDown size={ACTION_ICON_SIZE} strokeWidth={2} />
                </IconBtn>
                {it.source === "custom" ? (
                  <>
                    <IconBtn
                      label={t("customizeMenu.edit")}
                      onClick={() => {
                        setEditId(it.id);
                        setEditName(it.name ?? "");
                        setEditTo(it.to);
                      }}
                    >
                      <Pencil size={ACTION_ICON_SIZE} strokeWidth={2} />
                    </IconBtn>
                    <IconBtn
                      label={t("customizeMenu.delete")}
                      onClick={() => setDeleteId(it.id)}
                    >
                      <Trash2 size={ACTION_ICON_SIZE} strokeWidth={2} />
                    </IconBtn>
                  </>
                ) : null}
                <IconBtn
                  label={
                    it.hidden ? t("customizeMenu.show") : t("customizeMenu.hide")
                  }
                  onClick={() =>
                    onChange(toggleMobileItemHidden(items, it.id))
                  }
                >
                  {it.hidden ? (
                    <EyeOff size={ACTION_ICON_SIZE} strokeWidth={2} />
                  ) : (
                    <Eye size={ACTION_ICON_SIZE} strokeWidth={2} />
                  )}
                </IconBtn>
              </li>
            );
          })}
        </ul>
      </div>

      <AppDialog
        header={t("customizeMenu.edit")}
        visible={editId !== null}
        className="app-modal-window"
        onHide={() => setEditId(null)}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="app-header-action-nav-item"
              onClick={() => setEditId(null)}
            >
              {t("customizeMenu.cancel")}
            </button>
            <button
              type="button"
              className="app-header-action-nav-item"
              onClick={() => {
                if (!editId) return;
                onChange(
                  updateCustomMobileItem(items, editId, {
                    name: editName,
                    to: editTo ?? undefined,
                  }),
                );
                setEditId(null);
              }}
            >
              {t("customizeMenu.apply")}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <InputText
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full !rounded-sm"
            maxLength={80}
            placeholder={t("customizeMenu.itemName")}
          />
          <Dropdown
            value={editTo}
            options={apps}
            optionLabel="label"
            optionValue="to"
            onChange={(e) => setEditTo(e.value as string | null)}
            className="w-full"
            appendTo={overlayAppendTo}
          />
        </div>
      </AppDialog>

      <AppDialog
        header={t("customizeMenu.delete")}
        visible={deleteId !== null}
        className="app-modal-window"
        onHide={() => setDeleteId(null)}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="app-header-action-nav-item"
              onClick={() => setDeleteId(null)}
            >
              {t("customizeMenu.cancel")}
            </button>
            <button
              type="button"
              className="app-header-action-nav-item"
              onClick={() => {
                if (!deleteId) return;
                onChange(removeCustomMobileItem(items, deleteId));
                setDeleteId(null);
              }}
            >
              {t("customizeMenu.delete")}
            </button>
          </div>
        }
      >
        <p className="m-0 text-sm">
          {t("customizeMenu.deleteItemConfirm", { name: deleteLabel })}
        </p>
      </AppDialog>
    </div>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="app-customize-menu-icon-btn shrink-0 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
