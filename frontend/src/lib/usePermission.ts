import { useAuth } from "../auth/AuthContext";
import { hasPermission, permissionKey } from "./permissions";

export function usePermission(key: string): boolean {
  const { permissions } = useAuth();
  return hasPermission(permissions, key);
}

export function useAppCrud(appKey: string): {
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
} {
  const { permissions } = useAuth();
  return {
    canView: hasPermission(permissions, permissionKey(appKey, "view")),
    canCreate: hasPermission(permissions, permissionKey(appKey, "create")),
    canUpdate: hasPermission(permissions, permissionKey(appKey, "update")),
    canDelete: hasPermission(permissions, permissionKey(appKey, "delete")),
  };
}

export function usePermissions(): {
  permissions: string[];
  has: (key: string) => boolean;
} {
  const { permissions } = useAuth();
  return {
    permissions,
    has: (key: string) => hasPermission(permissions, key),
  };
}
