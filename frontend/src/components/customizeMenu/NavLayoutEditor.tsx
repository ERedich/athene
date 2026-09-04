import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
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
import { ContextMenu } from "primereact/contextmenu";
import type { MenuItem } from "primereact/menuitem";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";

import { AppDialog } from "../AppDialog";
import {
  displayNavLabel,
  listWebNavApps,
  moveGroup,
  moveItem,
  removeCustomGroup,
  removeCustomItem,
  toggleGroupHidden,
  toggleItemHidden,
  updateCustomGroup,
  updateCustomItem,
  type ResolvedNavGroup,
} from "../../lib/navLayout";
import { navGroups } from "../../layout/navModel";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

const DND_MIME = "application/x-athene-nav-layout";
const ACTION_ICON_SIZE = 20;
const ROW_ICON_SIZE = 18;

type DragPayload =
  | { kind: "group"; groupId: string; index: number }
  | { kind: "item"; groupId: string; index: number; itemId: string };

type NavLayoutEditorProps = {
  groups: ResolvedNavGroup[];
  search: string;
  onChange: (next: ResolvedNavGroup[]) => void;
};

function matchesSearch(label: string, search: string): boolean {
  if (!search.trim()) return true;
  return label.toLowerCase().includes(search.trim().toLowerCase());
}

export function NavLayoutEditor({
  groups,
  search,
  onChange,
}: NavLayoutEditorProps) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const ctxRef = useRef<ContextMenu>(null);
  const [ctxItems, setCtxItems] = useState<MenuItem[]>([]);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<{
    groupId: string;
    itemId: string;
  } | null>(null);
  const [editName, setEditName] = useState("");
  const [editTo, setEditTo] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    kind: "group" | "item";
    groupId: string;
    itemId?: string;
    label: string;
  } | null>(null);

  const apps = useMemo(() => listWebNavApps(navGroups), []);
  const appOptions = useMemo(
    () => apps.map((a) => ({ ...a, label: t(a.labelKey) })),
    [apps, t],
  );

  const writeDrag = (e: DragEvent, payload: DragPayload) => {
    e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
    setDragging(payload);
  };

  const readDrag = (e: DragEvent): DragPayload | null => {
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return dragging;
    try {
      return JSON.parse(raw) as DragPayload;
    } catch {
      return dragging;
    }
  };

  const endDrag = () => {
    setDragging(null);
    setDropHint(null);
  };

  const openContext = useCallback((event: MouseEvent, items: MenuItem[]) => {
    event.preventDefault();
    setCtxItems(items);
    ctxRef.current?.show(event);
  }, []);

  const filtered = groups
    .map((g) => {
      const groupLabel = displayNavLabel(t, g);
      const itemMatches = g.items.filter((it) =>
        matchesSearch(displayNavLabel(t, it), search),
      );
      const groupMatch = matchesSearch(groupLabel, search);
      const show = !search.trim() || groupMatch || itemMatches.length > 0;
      if (!show) return null;
      return {
        group: g,
        visibleItems: search.trim() && !groupMatch ? itemMatches : g.items,
      };
    })
    .filter(Boolean) as Array<{
    group: ResolvedNavGroup;
    visibleItems: ResolvedNavGroup["items"];
  }>;

  const saveEdit = () => {
    if (editGroupId) {
      onChange(
        updateCustomGroup(
          groups,
          editGroupId,
          { name: editName, to: editTo ?? undefined },
          navGroups,
        ),
      );
      setEditGroupId(null);
      return;
    }
    if (editItem) {
      onChange(
        updateCustomItem(
          groups,
          editItem.groupId,
          editItem.itemId,
          { name: editName, to: editTo ?? undefined },
          navGroups,
        ),
      );
      setEditItem(null);
    }
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.kind === "group") {
      onChange(removeCustomGroup(groups, deleteConfirm.groupId));
    } else if (deleteConfirm.itemId) {
      onChange(
        removeCustomItem(groups, deleteConfirm.groupId, deleteConfirm.itemId),
      );
    }
    setDeleteConfirm(null);
  };

  return (
    <div className="app-customize-menu-editor space-y-2">
      <ContextMenu model={ctxItems} ref={ctxRef} />
      {filtered.map(({ group: g, visibleItems }) => {
        const gi = groups.findIndex((x) => x.id === g.id);
        const groupLabel = displayNavLabel(t, g);
        const { Icon: GroupIcon } = g;
        const isLeaf = g.role === "leaf" || (g.items.length === 0 && Boolean(g.to));
        const groupDropId = `group:${g.id}`;
        const isCustom = g.source === "custom";

        return (
          <div
            key={g.id}
            className={`app-customize-menu-group rounded-lg ${
              g.hidden ? "opacity-50" : ""
            } ${dropHint === groupDropId ? "app-customize-menu-drop-target" : ""}`}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropHint(
                dragging.kind === "group" ? groupDropId : `item-end:${g.id}`,
              );
            }}
            onDrop={(e) => {
              e.preventDefault();
              const payload = readDrag(e);
              endDrag();
              if (!payload) return;
              if (payload.kind === "group") {
                onChange(moveGroup(groups, payload.index, gi));
                return;
              }
              const destLen =
                g.items.length > 0 ? g.items.length : g.to ? 1 : 0;
              onChange(
                moveItem(groups, payload.groupId, payload.index, g.id, destLen),
              );
            }}
            onContextMenu={(e) =>
              openContext(e, [
                {
                  label: g.hidden
                    ? t("customizeMenu.show")
                    : t("customizeMenu.hide"),
                  command: () => onChange(toggleGroupHidden(groups, g.id)),
                },
                {
                  label: t("customizeMenu.moveUp"),
                  disabled: gi <= 0,
                  command: () => onChange(moveGroup(groups, gi, gi - 1)),
                },
                {
                  label: t("customizeMenu.moveDown"),
                  disabled: gi >= groups.length - 1,
                  command: () => onChange(moveGroup(groups, gi, gi + 1)),
                },
              ])
            }
          >
            <div className="app-customize-menu-group-header flex items-center gap-1.5 px-2 py-2.5">
              <button
                type="button"
                className="app-customize-menu-handle app-customize-menu-icon-btn shrink-0 cursor-grab touch-none text-on-surface-variant hover:bg-surface-container-high"
                draggable
                aria-label={t("customizeMenu.dragGroup")}
                onDragStart={(e) =>
                  writeDrag(e, { kind: "group", groupId: g.id, index: gi })
                }
                onDragEnd={endDrag}
              >
                <GripVertical size={ACTION_ICON_SIZE} strokeWidth={2} />
              </button>
              <GroupIcon
                className="app-customize-menu-group-icon shrink-0"
                size={ROW_ICON_SIZE}
                strokeWidth={2}
                aria-hidden
              />
              <span className="app-customize-menu-group-label min-w-0 flex-1 truncate">
                {groupLabel}
              </span>
              <EditorIconButton
                label={t("customizeMenu.moveUp")}
                disabled={gi <= 0}
                onClick={() => onChange(moveGroup(groups, gi, gi - 1))}
              >
                <ChevronUp size={ACTION_ICON_SIZE} strokeWidth={2} />
              </EditorIconButton>
              <EditorIconButton
                label={t("customizeMenu.moveDown")}
                disabled={gi >= groups.length - 1}
                onClick={() => onChange(moveGroup(groups, gi, gi + 1))}
              >
                <ChevronDown size={ACTION_ICON_SIZE} strokeWidth={2} />
              </EditorIconButton>
              {isCustom ? (
                <>
                  <EditorIconButton
                    label={t("customizeMenu.edit")}
                    onClick={() => {
                      setEditGroupId(g.id);
                      setEditName(g.name ?? "");
                      setEditTo(g.to ?? null);
                      setEditItem(null);
                    }}
                  >
                    <Pencil size={ACTION_ICON_SIZE} strokeWidth={2} />
                  </EditorIconButton>
                  <EditorIconButton
                    label={t("customizeMenu.delete")}
                    onClick={() =>
                      setDeleteConfirm({
                        kind: "group",
                        groupId: g.id,
                        label: groupLabel,
                      })
                    }
                  >
                    <Trash2 size={ACTION_ICON_SIZE} strokeWidth={2} />
                  </EditorIconButton>
                </>
              ) : null}
              <EditorIconButton
                label={
                  g.hidden ? t("customizeMenu.show") : t("customizeMenu.hide")
                }
                onClick={() => onChange(toggleGroupHidden(groups, g.id))}
              >
                {g.hidden ? (
                  <EyeOff size={ACTION_ICON_SIZE} strokeWidth={2} />
                ) : (
                  <Eye size={ACTION_ICON_SIZE} strokeWidth={2} />
                )}
              </EditorIconButton>
            </div>

            {!isLeaf ? (
              <ul className="app-customize-menu-group-items m-0 list-none space-y-0.5 px-2 pb-2 pt-1">
                {(search.trim() ? visibleItems : g.items).map((item) => {
                  const itemIndex = g.items.findIndex((x) => x.id === item.id);
                  const itemLabel = displayNavLabel(t, item);
                  const { Icon } = item;
                  const itemDropId = `item:${g.id}:${itemIndex}`;

                  return (
                    <li
                      key={item.id}
                      className={`flex items-center gap-1 rounded-md px-1 py-1.5 ${
                        item.hidden ? "opacity-50" : ""
                      } ${
                        dropHint === itemDropId
                          ? "app-customize-menu-drop-target"
                          : ""
                      }`}
                      onDragOver={(e) => {
                        if (!dragging || dragging.kind !== "item") return;
                        e.preventDefault();
                        e.stopPropagation();
                        setDropHint(itemDropId);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const payload = readDrag(e);
                        endDrag();
                        if (!payload || payload.kind !== "item") return;
                        onChange(
                          moveItem(
                            groups,
                            payload.groupId,
                            payload.index,
                            g.id,
                            itemIndex,
                          ),
                        );
                      }}
                    >
                      <button
                        type="button"
                        className="app-customize-menu-handle app-customize-menu-icon-btn shrink-0 cursor-grab touch-none text-on-surface-variant hover:bg-surface-container-high"
                        draggable
                        aria-label={t("customizeMenu.dragItem")}
                        onDragStart={(e) =>
                          writeDrag(e, {
                            kind: "item",
                            groupId: g.id,
                            index: itemIndex,
                            itemId: item.id,
                          })
                        }
                        onDragEnd={endDrag}
                      >
                        <GripVertical size={ACTION_ICON_SIZE} strokeWidth={2} />
                      </button>
                      <Icon
                        className="app-customize-menu-row-icon shrink-0 text-on-surface-variant"
                        size={ROW_ICON_SIZE}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-on-surface">
                        {itemLabel}
                      </span>
                      <EditorIconButton
                        label={t("customizeMenu.moveUp")}
                        disabled={itemIndex <= 0}
                        onClick={() =>
                          onChange(
                            moveItem(
                              groups,
                              g.id,
                              itemIndex,
                              g.id,
                              itemIndex - 1,
                            ),
                          )
                        }
                      >
                        <ChevronUp size={ACTION_ICON_SIZE} strokeWidth={2} />
                      </EditorIconButton>
                      <EditorIconButton
                        label={t("customizeMenu.moveDown")}
                        disabled={itemIndex >= g.items.length - 1}
                        onClick={() =>
                          onChange(
                            moveItem(
                              groups,
                              g.id,
                              itemIndex,
                              g.id,
                              itemIndex + 1,
                            ),
                          )
                        }
                      >
                        <ChevronDown size={ACTION_ICON_SIZE} strokeWidth={2} />
                      </EditorIconButton>
                      {item.source === "custom" ? (
                        <>
                          <EditorIconButton
                            label={t("customizeMenu.edit")}
                            onClick={() => {
                              setEditItem({ groupId: g.id, itemId: item.id });
                              setEditName(item.name ?? "");
                              setEditTo(item.to);
                              setEditGroupId(null);
                            }}
                          >
                            <Pencil size={ACTION_ICON_SIZE} strokeWidth={2} />
                          </EditorIconButton>
                          <EditorIconButton
                            label={t("customizeMenu.delete")}
                            onClick={() =>
                              setDeleteConfirm({
                                kind: "item",
                                groupId: g.id,
                                itemId: item.id,
                                label: itemLabel,
                              })
                            }
                          >
                            <Trash2 size={ACTION_ICON_SIZE} strokeWidth={2} />
                          </EditorIconButton>
                        </>
                      ) : null}
                      <EditorIconButton
                        label={
                          item.hidden
                            ? t("customizeMenu.show")
                            : t("customizeMenu.hide")
                        }
                        onClick={() =>
                          onChange(toggleItemHidden(groups, g.id, item.id))
                        }
                      >
                        {item.hidden ? (
                          <EyeOff size={ACTION_ICON_SIZE} strokeWidth={2} />
                        ) : (
                          <Eye size={ACTION_ICON_SIZE} strokeWidth={2} />
                        )}
                      </EditorIconButton>
                    </li>
                  );
                })}
                {g.items.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-on-surface-variant">
                    {t("customizeMenu.emptyGroup")}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        );
      })}

      <AppDialog
        header={t("customizeMenu.edit")}
        visible={editGroupId !== null || editItem !== null}
        className="app-modal-window"
        onHide={() => {
          setEditGroupId(null);
          setEditItem(null);
        }}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="app-header-action-nav-item"
              onClick={() => {
                setEditGroupId(null);
                setEditItem(null);
              }}
            >
              {t("customizeMenu.cancel")}
            </button>
            <button
              type="button"
              className="app-header-action-nav-item"
              onClick={saveEdit}
            >
              {t("customizeMenu.apply")}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wider text-on-surface-variant">
              {t("customizeMenu.itemName")}
            </label>
            <InputText
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full !rounded-sm"
              maxLength={80}
            />
          </div>
          {(editItem ||
            (editGroupId &&
              groups.find((g) => g.id === editGroupId)?.role === "leaf")) && (
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wider text-on-surface-variant">
                {t("customizeMenu.app")}
              </label>
              <Dropdown
                value={editTo}
                options={appOptions}
                optionLabel="label"
                optionValue="to"
                onChange={(e) => setEditTo(e.value as string | null)}
                className="w-full"
                filter
                appendTo={overlayAppendTo}
              />
            </div>
          )}
        </div>
      </AppDialog>

      <AppDialog
        header={t("customizeMenu.delete")}
        visible={deleteConfirm !== null}
        className="app-modal-window"
        onHide={() => setDeleteConfirm(null)}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="app-header-action-nav-item"
              onClick={() => setDeleteConfirm(null)}
            >
              {t("customizeMenu.cancel")}
            </button>
            <button
              type="button"
              className="app-header-action-nav-item"
              onClick={confirmDelete}
            >
              {t("customizeMenu.delete")}
            </button>
          </div>
        }
      >
        <p className="m-0 text-sm">
          {t("customizeMenu.deleteItemConfirm", {
            name: deleteConfirm?.label ?? "",
          })}
        </p>
      </AppDialog>
    </div>
  );
}

function EditorIconButton({
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
      className="app-customize-menu-icon-btn shrink-0 text-on-surface-variant hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-30"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
