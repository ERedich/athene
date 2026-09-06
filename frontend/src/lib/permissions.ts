export type PermissionActionKind = "crud" | "extra";

export type PermissionCatalogAction = {
  key: string;
  kind: PermissionActionKind;
};

export type PermissionCatalogApp = {
  appKey: string;
  route: string | null;
  labelKey: string;
  meta?: boolean;
  actions: PermissionCatalogAction[];
};

export function permissionKey(appKey: string, action: string): string {
  return `${appKey}.${action}`;
}

export function hasPermission(
  permissions: readonly string[] | Set<string> | undefined,
  key: string,
): boolean {
  if (!permissions) return false;
  if (permissions instanceof Set) return permissions.has(key);
  return permissions.includes(key);
}

export function operationalKeysFromCatalog(
  catalog: PermissionCatalogApp[],
): string[] {
  const metaKeys = new Set([
    "permissions.manage",
    "permission-templates.view",
    "permission-templates.create",
    "permission-templates.update",
    "permission-templates.delete",
    "layout-editor.editSystem",
  ]);
  const keys: string[] = [];
  for (const app of catalog) {
    if (app.meta) continue;
    for (const action of app.actions) {
      const k = permissionKey(app.appKey, action.key);
      if (metaKeys.has(k)) continue;
      keys.push(k);
    }
  }
  return keys;
}
