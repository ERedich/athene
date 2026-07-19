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
  inspectionPointCount: number;
};

/** Descendant ref flags attached to TreeNode after `annotateDescendantRefs`. */
export type AssetTreeRefFlags = {
  hasDescendantDocuments: boolean;
  hasDescendantWorkOrders: boolean;
  hasDescendantInspectionPoints: boolean;
};

export type AnnotatedTreeNode = TreeNode & AssetTreeRefFlags;

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
  return annotateDescendantRefs(roots);
}

/**
 * Bottom-up: mark each node when any descendant has own document/work-order refs.
 * Mutates nodes in place and returns the same array.
 */
export function annotateDescendantRefs(nodes: TreeNode[]): TreeNode[] {
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.children?.length) walk(node.children);
      let hasDescendantDocuments = false;
      let hasDescendantWorkOrders = false;
      let hasDescendantInspectionPoints = false;
      for (const child of node.children ?? []) {
        const asset = child.data as AssetTreeAsset | undefined;
        const flags = child as AnnotatedTreeNode;
        if ((asset?.documentCount ?? 0) > 0 || flags.hasDescendantDocuments) {
          hasDescendantDocuments = true;
        }
        if ((asset?.workOrderCount ?? 0) > 0 || flags.hasDescendantWorkOrders) {
          hasDescendantWorkOrders = true;
        }
        if (
          (asset?.inspectionPointCount ?? 0) > 0 ||
          flags.hasDescendantInspectionPoints
        ) {
          hasDescendantInspectionPoints = true;
        }
      }
      const annotated = node as AnnotatedTreeNode;
      annotated.hasDescendantDocuments = hasDescendantDocuments;
      annotated.hasDescendantWorkOrders = hasDescendantWorkOrders;
      annotated.hasDescendantInspectionPoints = hasDescendantInspectionPoints;
    }
  };
  walk(nodes);
  return nodes;
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

/** Collect root asset id plus all descendants via parentAssetId adjacency. */
export function collectSubtreeAssetIds(
  assets: Array<{ id: string; parentAssetId: string | null }>,
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const asset of assets) {
    if (!asset.parentAssetId) continue;
    const list = childrenByParent.get(asset.parentAssetId);
    if (list) list.push(asset.id);
    else childrenByParent.set(asset.parentAssetId, [asset.id]);
  }
  const result = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    const children = childrenByParent.get(id);
    if (children) {
      for (const childId of children) stack.push(childId);
    }
  }
  return result;
}
