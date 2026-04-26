/**
 * Consolidated login-only design tokens from:
 * - `mobile/athene_mobile_login_light_theme/code.html`
 * - `mobile/athene_mobile_login_dark_theme/code.html`
 *
 * Used exclusively by the login screen — do not consume elsewhere.
 */

export type LoginScheme = "light" | "dark";

/** Shared corner radii (Tailwind extend in HTML mocks). */
export const loginRadii = {
  default: 2,
  lg: 4,
  xl: 8,
  full: 12,
} as const;

export const loginTypography = {
  display: "Space Grotesk",
  label: "Space Grotesk",
  body: { light: "Space Grotesk", dark: "Manrope" },
} as const;

/** Light palette — Material-style names from light mock. */
const lightColors = {
  surface: "#f7f9fc",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#f2f4f7",
  surfaceContainerHigh: "#e6e8eb",
  onSurface: "#191c1e",
  onSurfaceVariant: "#5d4038",
  outline: "#926f66",
  outlineVariant: "#e7bdb2",
  primary: "#ad2c00",
  primaryContainer: "#d83900",
  onPrimary: "#ffffff",
  tertiary: "#006099",
  tertiaryFixedVariant: "#004a77",
  inverseSurface: "#2d3133",
  error: "#ba1a1a",
} as const;

/** Dark palette — from dark mock + kinetic accents. */
const darkColors = {
  background: "#0f1419",
  surfaceContainerLowest: "#0a0f14",
  surface: "#0f1419",
  surfaceContainer: "#1b2025",
  surfaceContainerLow: "#171c21",
  surfaceContainerHigh: "#252a30",
  surfaceContainerHighest: "#30353b",
  surfaceVariant: "#30353b",
  onSurface: "#dee3ea",
  onSurfaceVariant: "#bbc9cf",
  outline: "#859398",
  outlineVariant: "#3c494e",
  primary: "#a8e8ff",
  primaryContainer: "#00d4ff",
  onPrimary: "#003642",
  atheneOrange: "#FF4500",
  tertiary: "#ffd9a1",
  inverseSurface: "#dee3ea",
  error: "#ffb4ab",
} as const;

export const loginEffects = {
  lightBlurAccent: "rgba(255, 69, 0, 0.08)",
  darkGridDot: "#3c494e",
  darkGlassBackground: "rgba(27, 32, 37, 0.6)",
} as const;

export type LoginTokens = {
  scheme: LoginScheme;
  colors: Record<string, string>;
  radii: typeof loginRadii;
  /** Expo Google Font *postScript* names after loading. */
  fonts: {
    body: string;
    label: string;
    displayBold: string;
  };
  cardShadow: { offset: { width: number; height: number }; opacity: number; radius: number };
};

const fontKeys = {
  light: {
    body: "SpaceGrotesk_400Regular",
    label: "SpaceGrotesk_500Medium",
    displayBold: "SpaceGrotesk_700Bold",
  },
  dark: {
    body: "Manrope_400Regular",
    label: "SpaceGrotesk_500Medium",
    displayBold: "SpaceGrotesk_700Bold",
  },
} as const;

export function getLoginTokens(scheme: LoginScheme): LoginTokens {
  const isLight = scheme === "light";
  return {
    scheme,
    colors: isLight
      ? { ...lightColors, background: lightColors.surface }
      : { ...darkColors },
    radii: loginRadii,
    fonts: fontKeys[isLight ? "light" : "dark"],
    cardShadow: isLight
      ? { offset: { width: 0, height: 24 }, opacity: 0.04, radius: 48 }
      : { offset: { width: 0, height: 20 }, opacity: 0.06, radius: 40 },
  };
}
