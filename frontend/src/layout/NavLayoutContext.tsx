import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "../auth/AuthContext";
import { appKeyForPathname } from "../auth/RequireAppView";
import { apiFetch } from "../lib/api";
import {
  parseWebNavLayout,
  resolveWebNavLayout,
  toSidebarNavGroups,
  type SidebarNavGroup,
  type WebNavLayout,
} from "../lib/navLayout";
import { hasPermission, permissionKey } from "../lib/permissions";
import { navGroups } from "./navModel";

type NavLayoutContextValue = {
  navLayout: WebNavLayout | null;
  sidebarGroups: SidebarNavGroup[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const NavLayoutContext = createContext<NavLayoutContextValue | null>(null);

function filterGroupsByPermission(
  groups: SidebarNavGroup[],
  permissions: string[],
): SidebarNavGroup[] {
  return groups
    .map((g) => {
      if (g.to) {
        const appKey = appKeyForPathname(g.to);
        if (appKey && !hasPermission(permissions, permissionKey(appKey, "view"))) {
          return null;
        }
        return g;
      }
      const items = (g.items ?? []).filter((item) => {
        const appKey = appKeyForPathname(item.to);
        if (!appKey) return true;
        return hasPermission(permissions, permissionKey(appKey, "view"));
      });
      if (items.length === 0) return null;
      return { ...g, items };
    })
    .filter((g): g is SidebarNavGroup => g != null);
}

export function NavLayoutProvider({ children }: { children: ReactNode }) {
  const { permissions } = useAuth();
  const [navLayout, setNavLayoutState] = useState<WebNavLayout | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/nav-layout?platform=web");
      if (!res.ok) {
        setNavLayoutState(null);
        return;
      }
      const data = (await res.json()) as { navLayout?: unknown };
      setNavLayoutState(parseWebNavLayout(data.navLayout));
    } catch {
      setNavLayoutState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sidebarGroups = useMemo(() => {
    const resolved = resolveWebNavLayout(navGroups, navLayout);
    const groups = toSidebarNavGroups(resolved);
    return filterGroupsByPermission(groups, permissions);
  }, [navLayout, permissions]);

  const value = useMemo(
    () => ({
      navLayout,
      sidebarGroups,
      loading,
      refresh,
    }),
    [navLayout, sidebarGroups, loading, refresh],
  );

  return (
    <NavLayoutContext.Provider value={value}>
      {children}
    </NavLayoutContext.Provider>
  );
}

export function useNavLayout(): NavLayoutContextValue {
  const ctx = useContext(NavLayoutContext);
  if (!ctx) {
    throw new Error("useNavLayout must be used within NavLayoutProvider");
  }
  return ctx;
}
