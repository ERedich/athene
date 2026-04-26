/**
 * Post-login shell — separate from login-only tokens in `screens/login/loginDesign.ts`.
 */

export type AppScheme = "light" | "dark";

export type AppThemeColors = {
  background: string;
  surface: string;
  inputBackground: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  primary: string;
  primaryContainer: string;
  border: string;
};

const lightColors: AppThemeColors = {
  background: "#f7f9fc",
  surface: "#ffffff",
  inputBackground: "#ffffff",
  onSurface: "#191c1e",
  onSurfaceVariant: "#5d4038",
  outline: "#926f66",
  primary: "#ad2c00",
  primaryContainer: "#d83900",
  border: "rgba(25, 28, 30, 0.08)",
};

const darkColors: AppThemeColors = {
  background: "#0f1419",
  surface: "#1b2025",
  inputBackground: "#252a30",
  onSurface: "#dee3ea",
  onSurfaceVariant: "#9aa7b2",
  outline: "#859398",
  primary: "#ff8c42",
  primaryContainer: "#ea580c",
  border: "rgba(255, 255, 255, 0.1)",
};

export type AppTheme = {
  scheme: AppScheme;
  isDark: boolean;
  colors: AppThemeColors;
  radii: { sm: number; md: number };
  space: { xs: number; sm: number; md: number; lg: number };
};

export function getAppTheme(scheme: AppScheme): AppTheme {
  return {
    scheme,
    isDark: scheme === "dark",
    colors: scheme === "light" ? lightColors : darkColors,
    radii: { sm: 6, md: 10 },
    space: { xs: 4, sm: 8, md: 16, lg: 24 },
  };
}
