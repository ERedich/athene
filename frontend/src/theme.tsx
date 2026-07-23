import { useCallback, useEffect, useRef, useState } from "react";

import { LucideSpinner } from "./icons/lucide";
import laraDark from "primereact/resources/themes/lara-dark-blue/theme.css?url";
import laraLight from "primereact/resources/themes/lara-light-blue/theme.css?url";

const PRIME_THEME_LINK_ID = "prime-theme-link";
const THEME_STORAGE_KEY = "athene-theme";
const OVERLAY_DELAY_MS = 180;
const ROOT_CROSSFADE_CLASS = "theme-crossfade-fallback";
const ROOT_CROSSFADE_MS = 240;

/** Last GN-PRIM hex applied; re-used when light/dark toggles focus/highlight alphas. */
let appliedPrimaryColorHex: string | null = null;

type ViewTransitionCapableDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => {
    finished: Promise<void>;
  };
};

function themeNameFromDark(dark: boolean): "dark" | "light" {
  return dark ? "dark" : "light";
}

function hrefForTheme(dark: boolean): string {
  return dark ? laraDark : laraLight;
}

function readStoredTheme(): "dark" | "light" | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function readInitialDark(): boolean {
  const stored = readStoredTheme();
  if (stored) {
    return stored === "dark";
  }
  return document.documentElement.dataset.theme !== "light";
}

function persistTheme(dark: boolean): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeNameFromDark(dark));
  } catch {
    /* ignore storage write failures */
  }
}

function getPrimeThemeLink(): HTMLLinkElement | null {
  return document.getElementById(PRIME_THEME_LINK_ID) as HTMLLinkElement | null;
}

function cleanupLink(link: HTMLLinkElement): void {
  if (link.parentNode) {
    link.parentNode.removeChild(link);
  }
}

function preloadThemeStylesheet(href: string): Promise<void> {
  return new Promise((resolve) => {
    const preload = document.createElement("link");
    preload.rel = "preload";
    preload.as = "style";
    preload.href = href;
    preload.onload = () => {
      cleanupLink(preload);
      resolve();
    };
    preload.onerror = () => {
      cleanupLink(preload);
      resolve();
    };
    document.head.appendChild(preload);
  });
}

async function swapPrimeThemeStylesheet(dark: boolean): Promise<void> {
  const nextHref = hrefForTheme(dark);
  const primeThemeLink = getPrimeThemeLink();

  if (!primeThemeLink) {
    return;
  }

  if (primeThemeLink.href === nextHref) {
    return;
  }

  await preloadThemeStylesheet(nextHref);
  primeThemeLink.href = nextHref;
}

async function runThemeCommitTransition(commit: () => void): Promise<void> {
  const doc = document as ViewTransitionCapableDocument;

  if (typeof doc.startViewTransition === "function") {
    const transition = doc.startViewTransition(() => {
      commit();
    });

    try {
      await transition.finished;
    } catch {
      /* ignore transition cancellation */
    }
    return;
  }

  const root = document.documentElement;
  root.classList.add(ROOT_CROSSFADE_CLASS);
  commit();
  await new Promise((resolve) => window.setTimeout(resolve, ROOT_CROSSFADE_MS));
  root.classList.remove(ROOT_CROSSFADE_CLASS);
}

export function initializeTheme(): void {
  const dark = readInitialDark();
  document.documentElement.dataset.theme = themeNameFromDark(dark);
  const primeThemeLink = getPrimeThemeLink();
  if (primeThemeLink) {
    primeThemeLink.href = hrefForTheme(dark);
  }
  persistTheme(dark);

  // Warm up the alternate stylesheet to minimize first toggle latency.
  void preloadThemeStylesheet(hrefForTheme(!dark));
}

type Rgb = { r: number; g: number; b: number };

function parseHexToRgb(hex: string): Rgb | null {
  let s = hex.trim();
  if (!s.startsWith("#")) s = `#${s}`;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(s);
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function darkenRgb(rgb: Rgb, amount: number): Rgb {
  return mixRgb(rgb, { r: 0, g: 0, b: 0 }, amount);
}

function lightenRgb(rgb: Rgb, amount: number): Rgb {
  return mixRgb(rgb, { r: 255, g: 255, b: 255 }, amount);
}

/**
 * Apply app primary color to CSS variables on `:root`.
 * Updates `--color-primary`, container, Prime scale, and focus/highlight tokens.
 */
export function applyPrimaryColor(hex: string): void {
  const rgb = parseHexToRgb(hex);
  if (!rgb) return;

  const primary = rgbToHex(rgb);
  const container = rgbToHex(darkenRgb(rgb, 0.18));
  const root = document.documentElement;
  const isDark = root.dataset.theme !== "light";

  appliedPrimaryColorHex = primary;

  root.style.setProperty("--color-primary", primary);
  root.style.setProperty("--color-primary-container", container);

  const scale: Array<[string, Rgb]> = [
    ["--primary-50", lightenRgb(rgb, 0.92)],
    ["--primary-100", lightenRgb(rgb, 0.84)],
    ["--primary-200", lightenRgb(rgb, 0.68)],
    ["--primary-300", lightenRgb(rgb, 0.48)],
    ["--primary-400", lightenRgb(rgb, 0.24)],
    ["--primary-500", rgb],
    ["--primary-600", darkenRgb(rgb, 0.18)],
    ["--primary-700", darkenRgb(rgb, 0.36)],
    ["--primary-800", darkenRgb(rgb, 0.5)],
    ["--primary-900", darkenRgb(rgb, 0.62)],
  ];
  for (const [name, value] of scale) {
    root.style.setProperty(name, rgbToHex(value));
  }

  const focusAlpha = isDark ? 0.35 : 0.2;
  const highlightAlpha = isDark ? 0.14 : 0.1;
  root.style.setProperty(
    "--focus-ring",
    `0 0 0 0.2rem rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${focusAlpha})`,
  );
  root.style.setProperty(
    "--highlight-bg",
    `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${highlightAlpha})`,
  );
  root.style.setProperty(
    "--highlight-text-color",
    isDark ? rgbToHex(lightenRgb(rgb, 0.35)) : rgbToHex(darkenRgb(rgb, 0.36)),
  );
}

function reapplyPrimaryColorIfSet(): void {
  if (appliedPrimaryColorHex) {
    applyPrimaryColor(appliedPrimaryColorHex);
  }
}

export function useThemeSwitcher() {
  const [dark, setDark] = useState(() => readInitialDark());
  const [isThemeLoading, setIsThemeLoading] = useState(false);
  const darkRef = useRef(dark);
  const sequenceRef = useRef(0);

  useEffect(() => {
    darkRef.current = dark;
  }, [dark]);

  const applyTheme = useCallback(async (nextDark: boolean) => {
    if (nextDark === darkRef.current) {
      return;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    let overlayVisible = false;
    const showOverlayTimer = window.setTimeout(() => {
      if (sequenceRef.current === sequence) {
        overlayVisible = true;
        setIsThemeLoading(true);
      }
    }, OVERLAY_DELAY_MS);

    try {
      await swapPrimeThemeStylesheet(nextDark);
      if (sequenceRef.current !== sequence) {
        return;
      }

      window.clearTimeout(showOverlayTimer);
      if (overlayVisible) {
        setIsThemeLoading(false);
      }

      await runThemeCommitTransition(() => {
        document.documentElement.dataset.theme = themeNameFromDark(nextDark);
        persistTheme(nextDark);
        darkRef.current = nextDark;
        setDark(nextDark);
        reapplyPrimaryColorIfSet();
      });

      // Keep the next toggle fast as well.
      void preloadThemeStylesheet(hrefForTheme(!nextDark));
    } finally {
      window.clearTimeout(showOverlayTimer);
      if (sequenceRef.current === sequence && overlayVisible) {
        setIsThemeLoading(false);
      }
    }
  }, []);

  const toggleTheme = useCallback(() => {
    void applyTheme(!darkRef.current);
  }, [applyTheme]);

  return {
    dark,
    isThemeLoading,
    setDark: applyTheme,
    toggleTheme,
  };
}

type ThemeLoadingOverlayProps = {
  visible: boolean;
};

export function ThemeLoadingOverlay({ visible }: ThemeLoadingOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="theme-swap-overlay" role="status" aria-live="polite" aria-label="Loading theme">
      <div className="theme-swap-overlay__glass">
        <LucideSpinner className="theme-swap-overlay__spinner h-6 w-6" strokeWidth={1.75} />
      </div>
    </div>
  );
}
