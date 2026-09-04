import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiFetch } from "../lib/api";
import {
  parseWebNavLayout,
  resolveWebNavLayout,
  toSidebarNavGroups,
  type SidebarNavGroup,
  type WebNavLayout,
} from "../lib/navLayout";
import { navGroups } from "./navModel";

type NavLayoutContextValue = {
  navLayout: WebNavLayout | null;
  sidebarGroups: SidebarNavGroup[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const NavLayoutContext = createContext<NavLayoutContextValue | null>(null);

export function NavLayoutProvider({ children }: { children: ReactNode }) {
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
    return toSidebarNavGroups(resolved);
  }, [navLayout]);

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
