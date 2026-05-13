import { useCallback, useEffect, useRef, useState } from "react";

import { LucideSpinner } from "./icons/lucide";
import laraDark from "primereact/resources/themes/lara-dark-blue/theme.css?url";
import laraLight from "primereact/resources/themes/lara-light-blue/theme.css?url";

const PRIME_THEME_LINK_ID = "prime-theme-link";
const THEME_STORAGE_KEY = "athene-theme";
const OVERLAY_DELAY_MS = 180;
const ROOT_CROSSFADE_CLASS = "theme-crossfade-fallback";
const ROOT_CROSSFADE_MS = 240;

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
