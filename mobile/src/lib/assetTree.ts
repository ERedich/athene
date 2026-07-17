import type { AssetType } from "../types/api";

export type AssetTreeAsset = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  type: AssetType;
  parentAssetId: string | null;
  parentAssetKey: string | null;
  parentAssetName: string | null;
  parentAssetType: AssetType | null;
  documentCount: number;
  workOrderCount: number;
};

export type AssetTreeNode = {
  id: string;
  asset: AssetTreeAsset;
  children: AssetTreeNode[];
  leaf: boolean;
  hasDescendantDocuments: boolean;
  hasDescendantWorkOrders: boolean;
};

export type FlatTreeRow = {
  id: string;
  asset: AssetTreeAsset;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  hasDescendantDocuments: boolean;
  hasDescendantWorkOrders: boolean;
};

export type RefButtonAppearance = "empty" | "outline" | "filled" | "outlineFilled";

export function refButtonAppearance(
  ownCount: number,
  hasDescendant: boolean,
): RefButtonAppearance {
  const hasOwn = ownCount > 0;
  if (hasOwn && hasDescendant) return "outlineFilled";
  if (hasOwn) return "filled";
  if (hasDescendant) return "outline";
  return "empty";
}

function compareAssetKey(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Build a tree from a flat asset list using `parentAssetId`. */
export function buildAssetTree(assets: AssetTreeAsset[]): AssetTreeNode[] {
  const byId = new Map<string, AssetTreeNode>();
  const sorted = [...assets].sort((a, b) => compareAssetKey(a.key, b.key));

  for (const asset of sorted) {
    byId.set(asset.id, {
      id: asset.id,
      asset,
      children: [],
      leaf: true,
      hasDescendantDocuments: false,
      hasDescendantWorkOrders: false,
    });
  }

  const roots: AssetTreeNode[] = [];
  for (const asset of sorted) {
    const node = byId.get(asset.id)!;
    const parentId = asset.parentAssetId;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
      byId.get(parentId)!.leaf = false;
    } else {
      roots.push(node);
    }
  }

  return annotateDescendantRefs(roots);
}

/**
 * Bottom-up: mark each node when any descendant has own document/work-order refs.
 * Mutates nodes in place and returns the same array.
 */
export function annotateDescendantRefs(nodes: AssetTreeNode[]): AssetTreeNode[] {
  const walk = (list: AssetTreeNode[]) => {
    for (const node of list) {
      if (node.children.length) walk(node.children);
      let hasDescendantDocuments = false;
      let hasDescendantWorkOrders = false;
      for (const child of node.children) {
        if (child.asset.documentCount > 0 || child.hasDescendantDocuments) {
          hasDescendantDocuments = true;
        }
        if (child.asset.workOrderCount > 0 || child.hasDescendantWorkOrders) {
          hasDescendantWorkOrders = true;
        }
      }
      node.hasDescendantDocuments = hasDescendantDocuments;
      node.hasDescendantWorkOrders = hasDescendantWorkOrders;
    }
  };
  walk(nodes);
  return nodes;
}

/** Flatten id → descendant ref flags for lookups outside the flat list (e.g. detail sheet). */
export function collectDescendantRefFlags(
  nodes: AssetTreeNode[],
): Map<string, { hasDescendantDocuments: boolean; hasDescendantWorkOrders: boolean }> {
  const map = new Map<string, { hasDescendantDocuments: boolean; hasDescendantWorkOrders: boolean }>();
  const walk = (list: AssetTreeNode[]) => {
    for (const node of list) {
      map.set(node.id, {
        hasDescendantDocuments: node.hasDescendantDocuments,
        hasDescendantWorkOrders: node.hasDescendantWorkOrders,
      });
      if (node.children.length) walk(node.children);
    }
  };
  walk(nodes);
  return map;
}

/** IDs of all non-leaf nodes (for expand-all). */
export function collectExpandableIds(nodes: AssetTreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: AssetTreeNode[]) => {
    for (const n of list) {
      if (n.children.length > 0) {
        ids.add(n.id);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

/**
 * Filter tree by query; keep ancestors of matches so hierarchy stays visible.
 */
export function filterAssetTree(nodes: AssetTreeNode[], query: string): AssetTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  const filterNode = (node: AssetTreeNode): AssetTreeNode | null => {
    const asset = node.asset;
    const haystack = [asset.key, asset.name, asset.siteKey, asset.siteName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const filteredChildren = node.children.map(filterNode).filter((c): c is AssetTreeNode => c != null);
    if (haystack.includes(q) || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
        leaf: filteredChildren.length === 0,
        // Keep full-tree descendant flags (not recomputed on filtered children).
        hasDescendantDocuments: node.hasDescendantDocuments,
        hasDescendantWorkOrders: node.hasDescendantWorkOrders,
      };
    }
    return null;
  };

  return nodes.map(filterNode).filter((n): n is AssetTreeNode => n != null);
}

/** Flatten visible tree rows for FlatList rendering. */
export function flattenVisibleTree(nodes: AssetTreeNode[], expandedIds: Set<string>, depth = 0): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const expanded = expandedIds.has(node.id);
    rows.push({
      id: node.id,
      asset: node.asset,
      depth,
      hasChildren,
      expanded,
      hasDescendantDocuments: node.hasDescendantDocuments,
      hasDescendantWorkOrders: node.hasDescendantWorkOrders,
    });
    if (hasChildren && expanded) {
      rows.push(...flattenVisibleTree(node.children, expandedIds, depth + 1));
    }
  }
  return rows;
}
