import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getAppTheme, type AppScheme, type AppTheme } from "../styles/appTheme";

const STORAGE_KEY = "athene.appShellColorScheme";

export type AppThemeContextValue = AppTheme & {
  setScheme: (scheme: AppScheme) => void;
  toggleScheme: () => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<AppScheme>("light");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!alive) return;
        if (raw === "dark" || raw === "light") setSchemeState(raw);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setScheme = useCallback((next: AppScheme) => {
    setSchemeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      /* ignore */
    });
  }, []);

  const toggleScheme = useCallback(() => {
    setSchemeState((prev) => {
      const next: AppScheme = prev === "light" ? "dark" : "light";
      void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
        /* ignore */
      });
      return next;
    });
  }, []);

  const value = useMemo<AppThemeContextValue>(() => {
    const base = getAppTheme(scheme);
    return {
      ...base,
      setScheme,
      toggleScheme,
    };
  }, [scheme, setScheme, toggleScheme]);

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const ctx = useContext(AppThemeContext);
  if (!ctx) {
    throw new Error("useAppTheme must be used within AppThemeProvider");
  }
  return ctx;
}
