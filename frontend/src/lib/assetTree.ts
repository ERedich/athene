import type { TreeNode } from "primereact/treenode";

export type AssetTreeType = "site" | "structure" | "line" | "maintenanceObject";

export type AssetTreeAsset = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  type: AssetTreeType;
  parentAssetId: string | null;
  parentAssetKey: string | null;
  parentAssetName: string | null;
  parentAssetType: AssetTreeType | null;
  documentCount: number;
  workOrderCount: number;
};

function compareAssetKey(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Build a PrimeReact tree from a flat asset list using `parentAssetId`. */
export function buildAssetTree(assets: AssetTreeAsset[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  const sorted = [...assets].sort((a, b) => compareAssetKey(a.key, b.key));

  for (const asset of sorted) {
    byId.set(asset.id, {
      key: asset.id,
      label: `${asset.key} - ${asset.name}`,
      data: asset,
      children: [],
    });
  }

  const roots: TreeNode[] = [];
  for (const asset of sorted) {
    const node = byId.get(asset.id)!;
    const parentId = asset.parentAssetId;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  const pruneEmpty = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.children && n.children.length === 0) {
        n.children = undefined;
        n.leaf = true;
      } else if (n.children) {
        pruneEmpty(n.children);
      }
    }
  };
  pruneEmpty(roots);
  return roots;
}

/** Keys of all non-leaf nodes (for expand-all). */
export function collectExpandableKeys(nodes: TreeNode[]): Record<string, boolean> {
  const keys: Record<string, boolean> = {};
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.children && n.children.length > 0 && n.key != null) {
        keys[String(n.key)] = true;
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return keys;
}

/**
 * Filter tree by query; keep ancestors of matches so hierarchy stays visible.
 */
export function filterAssetTree(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  const filterNode = (node: TreeNode): TreeNode | null => {
    const asset = node.data as AssetTreeAsset | undefined;
    const haystack = [asset?.key, asset?.name, asset?.siteKey, asset?.siteName, node.label]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const filteredChildren = (node.children ?? [])
      .map(filterNode)
      .filter((c): c is TreeNode => c != null);
    if (haystack.includes(q) || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren.length > 0 ? filteredChildren : undefined,
        leaf: filteredChildren.length === 0,
      };
    }
    return null;
  };

  return nodes.map(filterNode).filter((n): n is TreeNode => n != null);
}
