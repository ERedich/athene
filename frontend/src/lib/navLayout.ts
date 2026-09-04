import { FolderOpen, type LucideIcon } from "lucide-react";

import type { NavGroup, NavRouteItem } from "../layout/navModel";
import {
  mobileNavCatalog,
  mobileNavCatalogByTo,
  type MobileNavCatalogItem,
} from "../layout/mobileNavCatalog";

export const NAV_LAYOUT_VERSION = 2 as const;
export const NAV_LAYOUT_LOCKED_TO = "/customize-menu";

export type NavSource = "catalog" | "custom";

export type WebNavLayoutItem = {
  id: string;
  source: NavSource;
  to: string;
  name?: string;
  hidden: boolean;
};

export type WebNavLayoutGroup = {
  id: string;
  source: NavSource;
  role: "group" | "leaf";
  name?: string;
  to?: string;
  hidden: boolean;
  items: WebNavLayoutItem[];
};

export type WebNavLayout = {
  version: typeof NAV_LAYOUT_VERSION;
  platform: "web";
  groups: WebNavLayoutGroup[];
};

export type MobileNavLayoutItem = {
  id: string;
  source: NavSource;
  to: string;
  name?: string;
  hidden: boolean;
};

export type MobileNavLayout = {
  version: typeof NAV_LAYOUT_VERSION;
  platform: "mobile";
  items: MobileNavLayoutItem[];
};

/** @deprecated alias — prefer WebNavLayout */
export type NavLayout = WebNavLayout;

export type ResolvedNavItem = {
  id: string;
  source: NavSource;
  to: string;
  end?: boolean;
  Icon: LucideIcon;
  labelKey?: string;
  name?: string;
  hidden: boolean;
};

export type ResolvedNavGroup = {
  id: string;
  source: NavSource;
  role: "group" | "leaf";
  labelKey?: string;
  name?: string;
  Icon: LucideIcon;
  hidden: boolean;
  to?: string;
  end?: boolean;
  items: ResolvedNavItem[];
};

export type ResolvedMobileNavItem = {
  id: string;
  source: NavSource;
  to: string;
  Icon: LucideIcon;
  labelKey?: string;
  name?: string;
  hidden: boolean;
};

export type NavAppOption = {
  to: string;
  labelKey: string;
  Icon: LucideIcon;
};

type CatalogRoute = NavRouteItem & {
  homeGroupId: string;
  isLeafRoute: boolean;
};

function newCustomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `custom:${crypto.randomUUID()}`;
  }
  return `custom:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function catalogItemId(homeGroupId: string, to: string): string {
  return `catalog:${homeGroupId}:${to}`;
}

export function catalogLeafGroupItemId(groupId: string): string {
  return `catalog:${groupId}:__leaf__`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function buildCatalogIndex(catalog: NavGroup[]): {
  byTo: Map<string, CatalogRoute>;
  byGroup: Map<string, NavGroup>;
  allApps: NavAppOption[];
} {
  const byTo = new Map<string, CatalogRoute>();
  const byGroup = new Map<string, NavGroup>();
  const allApps: NavAppOption[] = [];
  const seenApp = new Set<string>();

  for (const g of catalog) {
    byGroup.set(g.id, g);
    if (g.to && g.items.length === 0) {
      byTo.set(g.to, {
        to: g.to,
        end: g.end,
        Icon: g.Icon,
        labelKey: g.labelKey,
        homeGroupId: g.id,
        isLeafRoute: true,
      });
      if (!seenApp.has(g.to)) {
        seenApp.add(g.to);
        allApps.push({ to: g.to, labelKey: g.labelKey, Icon: g.Icon });
      }
    }
    for (const item of g.items) {
      byTo.set(item.to, {
        ...item,
        homeGroupId: g.id,
        isLeafRoute: false,
      });
      if (!seenApp.has(item.to)) {
        seenApp.add(item.to);
        allApps.push({
          to: item.to,
          labelKey: item.labelKey,
          Icon: item.Icon,
        });
      }
    }
  }
  return { byTo, byGroup, allApps };
}

export function listWebNavApps(catalog: NavGroup[]): NavAppOption[] {
  return buildCatalogIndex(catalog).allApps;
}

export function listMobileNavApps(): NavAppOption[] {
  return mobileNavCatalog.map((i) => ({
    to: i.to,
    labelKey: i.labelKey,
    Icon: i.Icon,
  }));
}

/** Default web layout from catalog. */
export function catalogToWebNavLayout(catalog: NavGroup[]): WebNavLayout {
  return {
    version: NAV_LAYOUT_VERSION,
    platform: "web",
    groups: catalog.map((g) => {
      if (g.items.length === 0 && g.to) {
        return {
          id: g.id,
          source: "catalog" as const,
          role: "leaf" as const,
          to: g.to,
          hidden: false,
          items: [],
        };
      }
      return {
        id: g.id,
        source: "catalog" as const,
        role: "group" as const,
        hidden: false,
        items: g.items.map((it) => ({
          id: catalogItemId(g.id, it.to),
          source: "catalog" as const,
          to: it.to,
          hidden: false,
        })),
      };
    }),
  };
}

/** @deprecated use catalogToWebNavLayout */
export function catalogToNavLayout(catalog: NavGroup[]): WebNavLayout {
  return catalogToWebNavLayout(catalog);
}

export function catalogToMobileNavLayout(
  catalog: MobileNavCatalogItem[] = mobileNavCatalog,
): MobileNavLayout {
  return {
    version: NAV_LAYOUT_VERSION,
    platform: "mobile",
    items: catalog.map((it) => ({
      id: `catalog:mobile:${it.to}`,
      source: "catalog" as const,
      to: it.to,
      hidden: false,
    })),
  };
}

function parseSource(v: unknown): NavSource {
  return v === "custom" ? "custom" : "catalog";
}

function parseWebItem(raw: unknown): WebNavLayoutItem | null {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const to = typeof raw.to === "string" ? raw.to.trim() : "";
  if (!id || !to) return null;
  const source = parseSource(raw.source);
  const name =
    source === "custom" && typeof raw.name === "string"
      ? raw.name.trim().slice(0, 80)
      : undefined;
  if (source === "custom" && !name) return null;
  return {
    id,
    source,
    to,
    name: source === "custom" ? name : undefined,
    hidden: raw.hidden === true,
  };
}

function parseWebGroup(raw: unknown): WebNavLayoutGroup | null {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;
  const source = parseSource(raw.source);
  const role = raw.role === "leaf" ? "leaf" : "group";
  const name =
    source === "custom" && typeof raw.name === "string"
      ? raw.name.trim().slice(0, 80)
      : undefined;
  if (source === "custom" && !name) return null;
  const to = typeof raw.to === "string" ? raw.to.trim() : undefined;
  if (role === "leaf" && source === "custom" && !to) return null;
  const items: WebNavLayoutItem[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(raw.items)) {
    for (const it of raw.items) {
      const parsed = parseWebItem(it);
      if (!parsed || seenIds.has(parsed.id)) continue;
      seenIds.add(parsed.id);
      items.push(parsed);
    }
  }
  return {
    id,
    source,
    role,
    name: source === "custom" ? name : undefined,
    to: role === "leaf" ? to : source === "catalog" ? to : to,
    hidden: raw.hidden === true,
    items: role === "leaf" && items.length === 0 ? [] : items,
  };
}

/** Soft-parse web layout (accepts v1 legacy and upgrades). */
export function parseWebNavLayout(raw: unknown): WebNavLayout | null {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) return null;

  // Legacy v1
  if (raw.version === 1 && Array.isArray(raw.groups)) {
    const groups: WebNavLayoutGroup[] = [];
    for (const g of raw.groups) {
      if (!isPlainObject(g)) continue;
      const id = typeof g.id === "string" ? g.id.trim() : "";
      if (!id) continue;
      const items: WebNavLayoutItem[] = [];
      if (Array.isArray(g.items)) {
        for (const it of g.items) {
          if (!isPlainObject(it)) continue;
          const to = typeof it.to === "string" ? it.to.trim() : "";
          if (!to) continue;
          items.push({
            id: catalogItemId(id, to),
            source: "catalog",
            to,
            hidden: it.hidden === true,
          });
        }
      }
      groups.push({
        id,
        source: "catalog",
        role: items.length === 0 ? "leaf" : "group",
        hidden: g.hidden === true,
        items,
      });
    }
    if (groups.length === 0) return null;
    return { version: NAV_LAYOUT_VERSION, platform: "web", groups };
  }

  if (raw.version !== NAV_LAYOUT_VERSION) return null;
  if (!Array.isArray(raw.groups)) return null;
  const groups: WebNavLayoutGroup[] = [];
  const seen = new Set<string>();
  for (const g of raw.groups) {
    const parsed = parseWebGroup(g);
    if (!parsed || seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    groups.push(parsed);
  }
  if (groups.length === 0) return null;
  return { version: NAV_LAYOUT_VERSION, platform: "web", groups };
}

/** @deprecated */
export function parseNavLayout(raw: unknown): WebNavLayout | null {
  return parseWebNavLayout(raw);
}

export function parseMobileNavLayout(raw: unknown): MobileNavLayout | null {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) return null;
  if (raw.version !== NAV_LAYOUT_VERSION) return null;
  if (!Array.isArray(raw.items)) return null;
  const items: MobileNavLayoutItem[] = [];
  const seen = new Set<string>();
  for (const it of raw.items) {
    if (!isPlainObject(it)) continue;
    const id = typeof it.id === "string" ? it.id.trim() : "";
    const to = typeof it.to === "string" ? it.to.trim() : "";
    if (!id || !to || seen.has(id)) continue;
    const source = parseSource(it.source);
    const name =
      source === "custom" && typeof it.name === "string"
        ? it.name.trim().slice(0, 80)
        : undefined;
    if (source === "custom" && !name) continue;
    seen.add(id);
    items.push({
      id,
      source,
      to,
      name: source === "custom" ? name : undefined,
      hidden: it.hidden === true,
    });
  }
  if (items.length === 0) return null;
  return { version: NAV_LAYOUT_VERSION, platform: "mobile", items };
}

function resolveIconForTo(
  to: string,
  byTo: Map<string, CatalogRoute>,
  fallback: LucideIcon,
): { Icon: LucideIcon; labelKey?: string; end?: boolean } {
  const cat = byTo.get(to);
  if (cat) return { Icon: cat.Icon, labelKey: cat.labelKey, end: cat.end };
  return { Icon: fallback };
}

/**
 * Merge catalog + layout into resolved groups (editor).
 */
export function resolveWebNavLayout(
  catalog: NavGroup[],
  layout: WebNavLayout | null,
): ResolvedNavGroup[] {
  const { byTo, byGroup } = buildCatalogIndex(catalog);
  const effective = layout ?? catalogToWebNavLayout(catalog);
  const usedCatalogItemIds = new Set<string>();
  const usedCatalogGroupIds = new Set<string>();

  const resolved: ResolvedNavGroup[] = [];

  for (const lg of effective.groups) {
    if (lg.source === "catalog") {
      const cat = byGroup.get(lg.id);
      if (!cat) continue;
      usedCatalogGroupIds.add(lg.id);

      const items: ResolvedNavItem[] = [];
      if (lg.role === "group" || lg.items.length > 0) {
        for (const lit of lg.items) {
          if (lit.source === "catalog") {
            const catItem = byTo.get(lit.to);
            if (!catItem) continue;
            usedCatalogItemIds.add(lit.id);
            // Also mark canonical catalog id
            usedCatalogItemIds.add(catalogItemId(catItem.homeGroupId, lit.to));
            if (catItem.isLeafRoute) {
              usedCatalogItemIds.add(catalogLeafGroupItemId(catItem.homeGroupId));
            }
            items.push({
              id: lit.id,
              source: "catalog",
              to: lit.to,
              end: catItem.end,
              Icon: catItem.Icon,
              labelKey: catItem.labelKey,
              hidden: lit.hidden === true,
            });
          } else {
            const meta = resolveIconForTo(lit.to, byTo, FolderOpen);
            items.push({
              id: lit.id,
              source: "custom",
              to: lit.to,
              end: meta.end,
              Icon: meta.Icon,
              name: lit.name,
              hidden: lit.hidden === true,
            });
          }
        }
      }

      const isLeaf =
        items.length === 0 &&
        Boolean(cat.to) &&
        (lg.role === "leaf" || cat.items.length === 0);

      resolved.push({
        id: cat.id,
        source: "catalog",
        role: isLeaf ? "leaf" : "group",
        labelKey: cat.labelKey,
        Icon: cat.Icon,
        hidden: lg.hidden === true,
        to: cat.to,
        end: cat.end,
        items: isLeaf ? [] : items,
      });
    } else {
      // custom group or leaf
      const items: ResolvedNavItem[] = [];
      for (const lit of lg.items) {
        if (lit.source === "catalog") {
          const catItem = byTo.get(lit.to);
          if (!catItem) continue;
          usedCatalogItemIds.add(catalogItemId(catItem.homeGroupId, lit.to));
          items.push({
            id: lit.id,
            source: "catalog",
            to: lit.to,
            end: catItem.end,
            Icon: catItem.Icon,
            labelKey: catItem.labelKey,
            hidden: lit.hidden === true,
          });
        } else {
          const meta = resolveIconForTo(lit.to, byTo, FolderOpen);
          items.push({
            id: lit.id,
            source: "custom",
            to: lit.to,
            Icon: meta.Icon,
            name: lit.name,
            hidden: lit.hidden === true,
          });
        }
      }

      if (lg.role === "leaf") {
        const meta = resolveIconForTo(lg.to ?? "", byTo, FolderOpen);
        resolved.push({
          id: lg.id,
          source: "custom",
          role: "leaf",
          name: lg.name,
          Icon: meta.Icon,
          hidden: lg.hidden === true,
          to: lg.to,
          end: meta.end,
          items: [],
        });
      } else {
        resolved.push({
          id: lg.id,
          source: "custom",
          role: "group",
          name: lg.name,
          Icon: FolderOpen,
          hidden: lg.hidden === true,
          items,
        });
      }
    }
  }

  // Append missing catalog groups / items
  for (const cat of catalog) {
    if (!usedCatalogGroupIds.has(cat.id)) {
      if (cat.items.length === 0 && cat.to) {
        resolved.push({
          id: cat.id,
          source: "catalog",
          role: "leaf",
          labelKey: cat.labelKey,
          Icon: cat.Icon,
          hidden: false,
          to: cat.to,
          end: cat.end,
          items: [],
        });
      } else {
        resolved.push({
          id: cat.id,
          source: "catalog",
          role: "group",
          labelKey: cat.labelKey,
          Icon: cat.Icon,
          hidden: false,
          items: cat.items.map((it) => ({
            id: catalogItemId(cat.id, it.to),
            source: "catalog" as const,
            to: it.to,
            end: it.end,
            Icon: it.Icon,
            labelKey: it.labelKey,
            hidden: false,
          })),
        });
      }
      continue;
    }

    // Group present — append missing catalog children
    const home = resolved.find((r) => r.id === cat.id);
    if (!home || home.role === "leaf") {
      // If leaf and catalog has only leaf, ok. If catalog group had items missing, promote.
      if (home?.role === "leaf" && cat.items.length > 0) {
        // shouldn't happen for our catalog
      }
      continue;
    }

    for (const it of cat.items) {
      const cid = catalogItemId(cat.id, it.to);
      const already = home.items.some(
        (x) => x.source === "catalog" && x.to === it.to,
      );
      if (already || usedCatalogItemIds.has(cid)) continue;
      home.items.push({
        id: cid,
        source: "catalog",
        to: it.to,
        end: it.end,
        Icon: it.Icon,
        labelKey: it.labelKey,
        hidden: false,
      });
    }
  }

  // Ensure locked customize-menu exists and is visible
  return ensureLockedVisible(resolved);
}

/** @deprecated */
export function resolveNavLayout(
  catalog: NavGroup[],
  layout: WebNavLayout | null,
): ResolvedNavGroup[] {
  return resolveWebNavLayout(catalog, layout);
}

export function resolveMobileNavLayout(
  layout: MobileNavLayout | null,
): ResolvedMobileNavItem[] {
  const byTo = mobileNavCatalogByTo();
  const effective = layout ?? catalogToMobileNavLayout();
  const usedCatalog = new Set<string>();
  const resolved: ResolvedMobileNavItem[] = [];

  for (const it of effective.items) {
    if (it.source === "catalog") {
      const cat = byTo.get(it.to);
      if (!cat) continue;
      usedCatalog.add(it.to);
      resolved.push({
        id: it.id,
        source: "catalog",
        to: it.to,
        Icon: cat.Icon,
        labelKey: cat.labelKey,
        hidden: it.hidden === true,
      });
    } else {
      const cat = byTo.get(it.to);
      resolved.push({
        id: it.id,
        source: "custom",
        to: it.to,
        Icon: cat?.Icon ?? FolderOpen,
        name: it.name,
        hidden: it.hidden === true,
      });
    }
  }

  for (const cat of mobileNavCatalog) {
    if (usedCatalog.has(cat.to)) continue;
    resolved.push({
      id: `catalog:mobile:${cat.to}`,
      source: "catalog",
      to: cat.to,
      Icon: cat.Icon,
      labelKey: cat.labelKey,
      hidden: false,
    });
  }

  return resolved;
}

/** Sidebar groups — supports custom display names via `label`. */
export type SidebarNavGroup = NavGroup & {
  label?: string;
  items: Array<NavRouteItem & { label?: string; id?: string }>;
};

export function toSidebarNavGroups(
  resolved: ResolvedNavGroup[],
): SidebarNavGroup[] {
  const out: SidebarNavGroup[] = [];
  for (const g of resolved) {
    if (g.hidden) continue;

    if (g.role === "leaf" || (g.items.length === 0 && g.to)) {
      if (!g.to) continue;
      out.push({
        id: g.id,
        labelKey: g.labelKey ?? "",
        label: g.name,
        Icon: g.Icon,
        items: [],
        to: g.to,
        end: g.end,
      });
      continue;
    }

    const visibleItems = g.items.filter((it) => !it.hidden);
    if (visibleItems.length === 0) continue;

    out.push({
      id: g.id,
      labelKey: g.labelKey ?? "",
      label: g.name,
      Icon: g.Icon,
      items: visibleItems.map((it) => ({
        id: it.id,
        to: it.to,
        end: it.end,
        Icon: it.Icon,
        labelKey: it.labelKey ?? "",
        label: it.name,
      })),
    });
  }
  return out;
}

export function resolvedToWebNavLayout(
  resolved: ResolvedNavGroup[],
): WebNavLayout {
  return {
    version: NAV_LAYOUT_VERSION,
    platform: "web",
    groups: resolved.map((g) => {
      if (g.role === "leaf" || (g.items.length === 0 && g.to)) {
        return {
          id: g.id,
          source: g.source,
          role: "leaf" as const,
          name: g.source === "custom" ? g.name : undefined,
          to: g.to,
          hidden: g.hidden,
          items: [],
        };
      }
      return {
        id: g.id,
        source: g.source,
        role: "group" as const,
        name: g.source === "custom" ? g.name : undefined,
        hidden: g.hidden,
        items: g.items.map((it) => ({
          id: it.id,
          source: it.source,
          to: it.to,
          name: it.source === "custom" ? it.name : undefined,
          hidden: it.hidden,
        })),
      };
    }),
  };
}

/** @deprecated */
export function resolvedToNavLayout(
  resolved: ResolvedNavGroup[],
): WebNavLayout {
  return resolvedToWebNavLayout(resolved);
}

export function resolvedToMobileNavLayout(
  resolved: ResolvedMobileNavItem[],
): MobileNavLayout {
  return {
    version: NAV_LAYOUT_VERSION,
    platform: "mobile",
    items: resolved.map((it) => ({
      id: it.id,
      source: it.source,
      to: it.to,
      name: it.source === "custom" ? it.name : undefined,
      hidden: it.hidden,
    })),
  };
}

export function ensureLockedVisible(
  resolved: ResolvedNavGroup[],
): ResolvedNavGroup[] {
  // Formerly forced /customize-menu visible; hiding is now allowed.
  return resolved;
}

export function displayNavLabel(
  t: (key: string) => string,
  entry: { labelKey?: string; name?: string },
): string {
  if (entry.name?.trim()) return entry.name.trim();
  if (entry.labelKey) return t(entry.labelKey);
  return "";
}

export function moveGroup(
  resolved: ResolvedNavGroup[],
  fromIndex: number,
  toIndex: number,
): ResolvedNavGroup[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= resolved.length ||
    toIndex >= resolved.length ||
    fromIndex === toIndex
  ) {
    return resolved;
  }
  const next = [...resolved];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function promoteLeafIfNeeded(g: ResolvedNavGroup): ResolvedNavItem[] {
  if (g.items.length > 0) return [...g.items];
  if (!g.to) return [];
  return [
    {
      id:
        g.source === "catalog"
          ? catalogLeafGroupItemId(g.id)
          : `${g.id}:leaf`,
      source: g.source,
      to: g.to,
      end: g.end,
      Icon: g.Icon,
      labelKey: g.labelKey,
      name: g.name,
      hidden: false,
    },
  ];
}

export function moveItem(
  resolved: ResolvedNavGroup[],
  fromGroupId: string,
  fromIndex: number,
  toGroupId: string,
  toIndex: number,
): ResolvedNavGroup[] {
  const fromGi = resolved.findIndex((g) => g.id === fromGroupId);
  const toGi = resolved.findIndex((g) => g.id === toGroupId);
  if (fromGi < 0 || toGi < 0) return resolved;

  const next = resolved.map((g) => ({
    ...g,
    items: promoteLeafIfNeeded({
      ...g,
      role: g.role === "leaf" ? "group" : g.role,
    }),
  }));

  // Force group role when promoting for move
  for (const g of next) {
    if (g.items.length > 0) g.role = "group";
  }

  const fromGroup = next[fromGi];
  const toGroup = next[toGi];
  if (fromIndex < 0 || fromIndex >= fromGroup.items.length) return resolved;

  const [moved] = fromGroup.items.splice(fromIndex, 1);
  if (!moved) return resolved;

  let insertAt = Math.max(0, Math.min(toIndex, toGroup.items.length));
  if (fromGroupId === toGroupId && fromIndex < insertAt) insertAt -= 1;
  toGroup.items.splice(insertAt, 0, moved);

  // Collapse back to leaf if only original leaf remains
  const collapse = (g: ResolvedNavGroup): ResolvedNavGroup => {
    if (
      g.source === "catalog" &&
      g.to &&
      g.items.length === 1 &&
      g.items[0].to === g.to &&
      g.items[0].source === "catalog"
    ) {
      return {
        ...g,
        role: "leaf",
        items: [],
        hidden: g.hidden || g.items[0].hidden,
      };
    }
    if (g.items.length === 0 && g.source === "catalog" && g.to) {
      return { ...g, role: "leaf", items: [] };
    }
    if (g.items.length === 0 && g.source === "custom" && !g.to) {
      return { ...g, role: "group", items: [] };
    }
    return { ...g, role: "group" };
  };

  next[fromGi] = collapse(fromGroup);
  if (fromGi !== toGi) next[toGi] = collapse(toGroup);
  else next[fromGi] = collapse(next[fromGi]);

  return ensureLockedVisible(next);
}

export function toggleGroupHidden(
  resolved: ResolvedNavGroup[],
  groupId: string,
): ResolvedNavGroup[] {
  return ensureLockedVisible(
    resolved.map((g) =>
      g.id === groupId ? { ...g, hidden: !g.hidden } : g,
    ),
  );
}

export function toggleItemHidden(
  resolved: ResolvedNavGroup[],
  groupId: string,
  itemId: string,
): ResolvedNavGroup[] {
  return ensureLockedVisible(
    resolved.map((g) => {
      if (g.id !== groupId) return g;
      if (g.role === "leaf" && g.to) {
        // leaf hide via group
        return { ...g, hidden: !g.hidden };
      }
      return {
        ...g,
        items: g.items.map((it) => {
          if (it.id !== itemId) return it;
          return { ...it, hidden: !it.hidden };
        }),
      };
    }),
  );
}

export function addCustomGroup(
  resolved: ResolvedNavGroup[],
  name: string,
): ResolvedNavGroup[] {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return resolved;
  return [
    ...resolved,
    {
      id: newCustomId(),
      source: "custom",
      role: "group",
      name: trimmed,
      Icon: FolderOpen,
      hidden: false,
      items: [],
    },
  ];
}

export function addCustomLeaf(
  resolved: ResolvedNavGroup[],
  name: string,
  to: string,
  catalog: NavGroup[],
): ResolvedNavGroup[] {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed || !to) return resolved;
  const { byTo } = buildCatalogIndex(catalog);
  const meta = resolveIconForTo(to, byTo, FolderOpen);
  return [
    ...resolved,
    {
      id: newCustomId(),
      source: "custom",
      role: "leaf",
      name: trimmed,
      Icon: meta.Icon,
      hidden: false,
      to,
      end: meta.end,
      items: [],
    },
  ];
}

export function addCustomSubItem(
  resolved: ResolvedNavGroup[],
  groupId: string,
  name: string,
  to: string,
  catalog: NavGroup[],
): ResolvedNavGroup[] {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed || !to) return resolved;
  const { byTo } = buildCatalogIndex(catalog);
  const meta = resolveIconForTo(to, byTo, FolderOpen);
  return ensureLockedVisible(
    resolved.map((g) => {
      if (g.id !== groupId) return g;
      const items = promoteLeafIfNeeded({ ...g, role: "group" });
      return {
        ...g,
        role: "group" as const,
        items: [
          ...items,
          {
            id: newCustomId(),
            source: "custom" as const,
            to,
            end: meta.end,
            Icon: meta.Icon,
            name: trimmed,
            hidden: false,
          },
        ],
      };
    }),
  );
}

export function updateCustomGroup(
  resolved: ResolvedNavGroup[],
  groupId: string,
  patch: { name?: string; to?: string },
  catalog: NavGroup[],
): ResolvedNavGroup[] {
  const { byTo } = buildCatalogIndex(catalog);
  return resolved.map((g) => {
    if (g.id !== groupId || g.source !== "custom") return g;
    const name = patch.name?.trim().slice(0, 80) ?? g.name;
    if (g.role === "leaf" && patch.to) {
      const meta = resolveIconForTo(patch.to, byTo, FolderOpen);
      return {
        ...g,
        name,
        to: patch.to,
        Icon: meta.Icon,
        end: meta.end,
      };
    }
    return { ...g, name };
  });
}

export function updateCustomItem(
  resolved: ResolvedNavGroup[],
  groupId: string,
  itemId: string,
  patch: { name?: string; to?: string },
  catalog: NavGroup[],
): ResolvedNavGroup[] {
  const { byTo } = buildCatalogIndex(catalog);
  return resolved.map((g) => {
    if (g.id !== groupId) return g;
    return {
      ...g,
      items: g.items.map((it) => {
        if (it.id !== itemId || it.source !== "custom") return it;
        const name = patch.name?.trim().slice(0, 80) ?? it.name;
        if (patch.to) {
          const meta = resolveIconForTo(patch.to, byTo, FolderOpen);
          return {
            ...it,
            name,
            to: patch.to,
            Icon: meta.Icon,
            end: meta.end,
          };
        }
        return { ...it, name };
      }),
    };
  });
}

export function removeCustomGroup(
  resolved: ResolvedNavGroup[],
  groupId: string,
): ResolvedNavGroup[] {
  const g = resolved.find((x) => x.id === groupId);
  if (!g || g.source !== "custom") return resolved;
  return ensureLockedVisible(resolved.filter((x) => x.id !== groupId));
}

export function removeCustomItem(
  resolved: ResolvedNavGroup[],
  groupId: string,
  itemId: string,
): ResolvedNavGroup[] {
  return ensureLockedVisible(
    resolved.map((g) => {
      if (g.id !== groupId) return g;
      const item = g.items.find((i) => i.id === itemId);
      if (!item || item.source !== "custom") return g;
      return { ...g, items: g.items.filter((i) => i.id !== itemId) };
    }),
  );
}

export function moveMobileItem(
  resolved: ResolvedMobileNavItem[],
  fromIndex: number,
  toIndex: number,
): ResolvedMobileNavItem[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= resolved.length ||
    toIndex >= resolved.length ||
    fromIndex === toIndex
  ) {
    return resolved;
  }
  const next = [...resolved];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function toggleMobileItemHidden(
  resolved: ResolvedMobileNavItem[],
  itemId: string,
): ResolvedMobileNavItem[] {
  return resolved.map((it) =>
    it.id === itemId ? { ...it, hidden: !it.hidden } : it,
  );
}

export function addCustomMobileItem(
  resolved: ResolvedMobileNavItem[],
  name: string,
  to: string,
): ResolvedMobileNavItem[] {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed || !to) return resolved;
  const cat = mobileNavCatalogByTo().get(to);
  return [
    ...resolved,
    {
      id: newCustomId(),
      source: "custom",
      to,
      Icon: cat?.Icon ?? FolderOpen,
      name: trimmed,
      hidden: false,
    },
  ];
}

export function updateCustomMobileItem(
  resolved: ResolvedMobileNavItem[],
  itemId: string,
  patch: { name?: string; to?: string },
): ResolvedMobileNavItem[] {
  return resolved.map((it) => {
    if (it.id !== itemId || it.source !== "custom") return it;
    const name = patch.name?.trim().slice(0, 80) ?? it.name;
    const to = patch.to ?? it.to;
    const cat = mobileNavCatalogByTo().get(to);
    return {
      ...it,
      name,
      to,
      Icon: cat?.Icon ?? FolderOpen,
    };
  });
}

export function removeCustomMobileItem(
  resolved: ResolvedMobileNavItem[],
  itemId: string,
): ResolvedMobileNavItem[] {
  const it = resolved.find((x) => x.id === itemId);
  if (!it || it.source !== "custom") return resolved;
  return resolved.filter((x) => x.id !== itemId);
}

export function toMobileDrawerItems(
  resolved: ResolvedMobileNavItem[],
): Array<{ to: string; labelKey?: string; label?: string; Icon: LucideIcon }> {
  return resolved
    .filter((it) => !it.hidden)
    .map((it) => ({
      to: it.to,
      labelKey: it.labelKey,
      label: it.name,
      Icon: it.Icon,
    }));
}
